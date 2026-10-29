# Implementation Plan: Public Transport Disruption Dependency Engine

## Overview
This project implements an end-to-end transit disruption dependency engine demonstrating advanced relational and NoSQL database mechanics. The architecture couples a normalized PostgreSQL 16 database (topological transit graph, temporal timetable tracking, recursive cascade CTEs, operational views, and ACID pessimistic rebooking under concurrency) with MongoDB 7 (polymorphic incident event store). A full-stack Next.js dashboard provides interactive network visualization, live disruption injection, persona-based RBAC/RLS inspection, and a Concurrency Arena demonstrating zero double-booking under high-load parallel reassignments.

---

## Architecture & Design Decisions

### 1. Hybrid Relational + Document Partitioning
- **PostgreSQL 16**: Authoritative source of truth for normalized transit topology (3NF), stations, track connections, trains, seats, temporal timetable versions, passenger itineraries, and transactional seat reallocations.
- **MongoDB 7**: Ingestion buffer and audit log for polymorphic disruption incident documents. Different disruption types (SCADA electrical sensor alerts, police orders, weather advisories) have drastically different schemas. MongoDB stores these flexibly with indexes on `incident_code`, `reported_at`, and `severity`.

### 2. Recursive Downstream Cascade Traversal
- A PostgreSQL recursive CTE (`WITH RECURSIVE downstream_cascade`) models transit network propagation. 
- It starts at the directly impacted station/trip (Anchor Member) and recursively discovers downstream legs, connecting trains awaiting transfer passengers, and shared block sections within a 45-minute propagation horizon.
- Cycle detection (`ARRAY[trip_id]` path accumulation) prevents infinite loops in bi-directional transit graphs.

### 3. Concurrency Safety & Pessimistic Seat Locking
- During an emergency cancellation, dozens of passengers need immediate rebooking to finite alternate seats.
- We utilize PostgreSQL row-level pessimistic locking (`SELECT seat_id FROM seats ... FOR UPDATE SKIP LOCKED LIMIT 1`) inside explicit transactions with `READ COMMITTED` or `SERIALIZABLE` isolation.
- Parallel worker transactions contend simultaneously. `SKIP LOCKED` prevents deadlocks and starvation, while ACID guarantees that no seat is ever assigned to more than one passenger.

### 4. Database-Level Role Security (RBAC) & Row-Level Security (RLS)
- Native PostgreSQL roles:
  - `transit_admin`: Full database owner privileges.
  - `dispatcher_role`: Can modify trips, timetables, and reassignments; cannot access passenger billing data.
  - `passenger_role`: Restricted to viewing live transit views; can only access their own reservation records via Postgres RLS (`app.current_passenger_id`).
- Next.js API dynamically assumes connection contexts or sets session variables (`SET LOCAL ROLE ...`, `SET LOCAL app.current_passenger_id = ...`) to prove that security is enforced at the database engine level, not just in UI code.

---

## Dependency Graph & Implementation Sequence

```
Docker Compose (Postgres 16 + Mongo 7)
    │
    ├── PostgreSQL DDL (3NF Schema, Constraints, Temporal Columns)
    │       │
    │       ├── Seed Network (15 Stations, 4 Lines, Trips, Seats, Bookings)
    │       │       │
    │       │       ├── Views & Materialized Views (Operational Monitors)
    │       │       │
    │       │       ├── Recursive CTE Query (Downstream Propagation)
    │       │       │
    │       │       └── RBAC & RLS Policies (Admin, Dispatcher, Passenger)
    │       │
    ├── MongoDB Init (Collections, Schema Validators, Indexes, Seed Events)
    │
    ├── Next.js Application Scaffold & DB Connectors (pg.Pool, MongoClient)
    │       │
    │       ├── Cascade Engine & Concurrency Engine (Hybrid Services)
    │       │       │
    │       │       ├── REST API Endpoints (/network, /disruptions, /rebook, /audit)
    │       │       │       │
    │       │       │       └── Interactive UI Components (Graph, Disruption, Arena)
    │       │
    └── Concurrency Race Tests & Comprehensive Documentation
```

---

## Phase Breakdown

### Phase 1: Environment & Database Foundation
- Docker Compose configuration for Postgres 16 and Mongo 7.
- Normalized PostgreSQL 3NF schema with temporal timetable columns.
- MongoDB collections and polymorphic schema validators.
- Comprehensive seed dataset: 15 interconnected stations across 4 lines, 120 seats, 24 trips, and initial bookings.

### Phase 2: Advanced SQL Engines (Views, Recursive CTEs, ACID Rebooking, Roles)
- Operational and materialized monitoring views (`v_live_trip_monitor`, `v_station_hub_congestion`).
- Recursive CTE query procedure for cascading downstream delay propagation.
- Pessimistic locking rebooking function (`SELECT ... FOR UPDATE SKIP LOCKED`).
- Database roles (`transit_admin`, `dispatcher_role`, `passenger_role`) and RLS policies.

### Phase 3: Application Core & Hybrid Engines
- Next.js TypeScript project initialization with Tailwind CSS and Lucide icons.
- Connection managers for PostgreSQL (`pg.Pool`) and MongoDB (`MongoClient`).
- Hybrid `cascadeEngine` coordinating MongoDB incident ingestion and PostgreSQL timetable updates.
- Parallel worker `concurrencyEngine` orchestrating high-contention rebooking transactions.

### Phase 4: API Layer & Endpoints
- `/api/network`: Live topological graph and trip monitor.
- `/api/disruptions`: Ingest polymorphic incidents and run recursive cascade calculation.
- `/api/rebook`: Trigger multi-threaded rebooking stress test and collect ACID metrics.
- `/api/audit`: Query database roles, active locks, and `EXPLAIN ANALYZE` plans.

### Phase 5: Interactive Full-Stack Dashboard
- Interactive SVG Transit Network Map with real-time status highlights.
- Disruption Injector with customizable JSON payload editor and one-click presets.
- Concurrency Arena displaying live parallel worker cards, lock acquisitions, and 0-overbooking proof.
- Persona Switcher toggling between Dispatcher, Passenger, and Auditor roles.
- SQL & Explain modal showing raw queries and execution plans.

### Phase 6: Automated Testing & Presentation Guide
- Automated Vitest test suite verifying recursive CTE correctness and concurrency contention.
- Polished `README.md` with schema diagrams, grading walkthrough, and presentation script.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Port Conflicts on Host** | Medium | Use standard ports 5432 and 27017, with environment variables (`PGPORT`, `MONGOPORT`) allowing custom overrides if local services are already running. |
| **Cycle Traversal in Recursive CTE** | High | Enforce cycle detection using path array checks (`NOT (next_trip_id = ANY(trip_path))`) and a hard `cascade_depth < 6` cutoff. |
| **Rebooking Deadlocks Under Concurrency** | High | Use `FOR UPDATE SKIP LOCKED` and consistent seat ordering (`ORDER BY seat_id`) so parallel workers never block indefinitely or deadlock. |
| **Role Permissions Blocking Setup** | Medium | Run DDL and seeding as superuser (`postgres`), then configure granular grants and RLS for application personas. |
