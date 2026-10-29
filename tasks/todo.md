# Task List: Public Transport Disruption Dependency Engine

## Phase 1: Environment & Hybrid Database Core

- [x] **Task 1: Orchestrate Containerized Environment (`docker-compose.yml`)**
  - **Description**: Configure Docker Compose to spin up PostgreSQL 16 and MongoDB 7 with persistent volume mounts, exposed ports, healthchecks, and auto-executing initialization scripts.
  - **Acceptance criteria**:
    - `docker-compose.yml` launches `postgres` (port 5432) and `mongo` (port 27017).
    - Healthchecks report healthy status for both database engines.
    - Credentials and database names match specification (`transit_db`).
  - **Verification**: `docker compose up -d && docker compose ps` shows both services running and healthy.
  - **Dependencies**: None
  - **Files likely touched**:
    - `docker-compose.yml`
    - `.env.example`
  - **Estimated scope**: S (2 files)

- [x] **Task 2: Implement Normalized PostgreSQL 3NF Schema & Constraints**
  - **Description**: Write `database/postgres/01_schema.sql` defining 3NF normalized tables: `stations`, `lines`, `routes`, `station_connections`, `trains`, `carriages`, `seats`, `trips`, `timetable_stops`, `passengers`, and `reservations`.
  - **Acceptance criteria**:
    - Full primary and foreign key constraints, check constraints (e.g., `status IN ('ON_TIME', 'DELAYED', 'CANCELLED')`).
    - Temporal timetable columns: `scheduled_arrival`, `actual_arrival`, `delay_arrival_min`, `effective_from`, `effective_to`, `version`.
    - Proper B-tree indexes on foreign keys, `(trip_id, station_id)`, and `(service_date, status)`.
  - **Verification**: Execute `psql -f database/postgres/01_schema.sql` without errors.
  - **Dependencies**: Task 1
  - **Files likely touched**:
    - `database/postgres/01_schema.sql`
  - **Estimated scope**: S (1 file)

- [x] **Task 3: Seed Transit Topology, Timetables, and Reservations**
  - **Description**: Write `database/postgres/05_seed_network.sql` populating a realistic 15-station transit network spanning 4 lines (Red Line, Blue Line, Green Line, Airport Express Line), 24 scheduled trips, 120 seats, and 40 initial passenger reservations.
  - **Acceptance criteria**:
    - Intersecting transfer hubs (e.g., Central Station connecting all 4 lines).
    - Multi-leg passenger itineraries with tight transfer windows (10–25 minutes).
    - Pre-configured target alternate trips with available seats for rebooking tests.
  - **Verification**: Query row counts across all 11 tables confirming expected seed volume.
  - **Dependencies**: Task 2
  - **Files likely touched**:
    - `database/postgres/05_seed_network.sql`
  - **Estimated scope**: S (1 file)

- [x] **Task 4: Implement MongoDB Disruption Event Schema & Seeds**
  - **Description**: Write `database/mongo/01_init_mongo.js` and `02_seed_disruptions.js` defining the `disruption_events` collection with JSON Schema validation, polymorphic payload support, indexes on `incident_code` and `reported_at`, and initial incident records.
  - **Acceptance criteria**:
    - Collection accepts polymorphic payloads (e.g. SCADA telemetry vs weather advisories vs police orders).
    - Unique index on `incident_code` and compound index on `(severity, reported_at)`.
    - Sample documents successfully inserted on startup.
  - **Verification**: Query MongoDB via `mongosh` verifying document count and schema validation.
  - **Dependencies**: Task 1
  - **Files likely touched**:
    - `database/mongo/01_init_mongo.js`
    - `database/mongo/02_seed_disruptions.js`
  - **Estimated scope**: S (2 files)

---

### Checkpoint 1: Database Foundation
- [x] Both PostgreSQL and MongoDB containers run cleanly.
- [x] Tables, indexes, constraints, and seed records exist and pass relational integrity checks.
- [x] MongoDB validates and stores polymorphic disruption documents.

---

## Phase 2: Advanced SQL Mechanics & RBAC

- [x] **Task 5: Implement Operational Views and Materialized Views**
  - **Description**: Write `database/postgres/02_views.sql` defining `v_live_trip_monitor` (real-time trip status, route info, calculated current delays), `v_station_hub_congestion` (materialized view aggregating incoming delays and passenger flows), and `v_passenger_rebooking_lineage`.
  - **Acceptance criteria**:
    - `v_live_trip_monitor` aggregates timetable stops and presents real-time line health.
    - `v_station_hub_congestion` includes a refresh procedure `REFRESH MATERIALIZED VIEW`.
    - `v_passenger_rebooking_lineage` displays original vs reassigned seat history.
  - **Verification**: Run `SELECT * FROM v_live_trip_monitor;` and verify column outputs.
  - **Dependencies**: Task 3
  - **Files likely touched**:
    - `database/postgres/02_views.sql`
  - **Estimated scope**: S (1 file)

- [x] **Task 6: Implement PostgreSQL Recursive CTE Disruption Dependency Engine**
  - **Description**: Write `database/postgres/03_recursive_cte.sql` implementing `fn_calculate_downstream_cascade(p_trip_id, p_station_id, p_delay_min)` using `WITH RECURSIVE` with cycle detection to compute downstream delayed trips and stranded transfer passengers.
  - **Acceptance criteria**:
    - Anchor member starts at disrupted trip and station.
    - Recursive member traverses connecting trips sharing track sections or scheduled passenger transfers within a 45-minute propagation horizon.
    - Cycle detection prevents infinite recursion (`NOT (next_trip_id = ANY(trip_path))`).
    - Returns affected trip IDs, arrival delays, cascade depth, and affected passenger reservation counts.
  - **Verification**: Execute `SELECT * FROM fn_calculate_downstream_cascade(1, 3, 45);` and verify multi-hop ripple results.
  - **Dependencies**: Task 5
  - **Files likely touched**:
    - `database/postgres/03_recursive_cte.sql`
  - **Estimated scope**: S (1 file)

- [x] **Task 7: Implement Database RBAC Roles & Row-Level Security (RLS)**
  - **Description**: Write `database/postgres/04_roles_rls.sql` configuring `transit_admin`, `dispatcher_role`, and `passenger_role`. Configure table grants and enable Row-Level Security on `reservations` using session setting `app.current_passenger_id`.
  - **Acceptance criteria**:
    - `dispatcher_role` can update trips, timetables, and reassignments, but cannot alter database roles.
    - `passenger_role` can only SELECT operational views and its own reservations via RLS.
    - Switching roles via `SET ROLE passenger_role` blocks unauthorized table updates.
  - **Verification**: Run permission test script switching between roles to verify access grants and RLS isolation.
  - **Dependencies**: Task 6
  - **Files likely touched**:
    - `database/postgres/04_roles_rls.sql`
  - **Estimated scope**: S (1 file)

---

### Checkpoint 2: Database Engine Logic
- [x] Views output consistent real-time operational metrics.
- [x] Recursive CTE executes in <25ms, traversing multiple downstream transfer hops.
- [x] RBAC roles and RLS restrict unauthorized queries at the database engine level.

---

## Phase 3: Application Core & Hybrid Services

- [ ] **Task 8: Initialize Next.js Project & Configure Database Connectors**
  - **Description**: Scaffold Next.js TypeScript app with Tailwind CSS, Lucide icons, and database connection pools (`src/lib/postgres.ts` using `pg.Pool` with role switching support, and `src/lib/mongodb.ts` using `MongoClient`).
  - **Acceptance criteria**:
    - `src/lib/postgres.ts` exposes query helpers for default admin, dispatcher, and passenger personas.
    - `src/lib/mongodb.ts` provides connected singleton client for `transit_db`.
    - Healthcheck verifies simultaneous connectivity to both PostgreSQL and MongoDB.
  - **Verification**: Run diagnostic script or ping endpoint returning connection status for both databases.
  - **Dependencies**: Checkpoint 2
  - **Files likely touched**:
    - `package.json`
    - `tsconfig.json`
    - `tailwind.config.js`
    - `src/lib/postgres.ts`
    - `src/lib/mongodb.ts`
  - **Estimated scope**: M (5 files)

- [ ] **Task 9: Implement Hybrid Cascade & Rebooking Engines**
  - **Description**: Create `src/lib/cascadeEngine.ts` (ingests Mongo disruption event, applies temporal delay to PostgreSQL `timetable_stops`, calls recursive CTE) and `src/lib/concurrencyEngine.ts` (parallel worker rebooking runner executing `SELECT ... FOR UPDATE SKIP LOCKED` inside explicit ACID transactions).
  - **Acceptance criteria**:
    - `cascadeEngine.propagateDisruption(...)` atomically synchronizes Mongo document status with Postgres timetable adjustments.
    - `concurrencyEngine.runStressTest(...)` dispatches N parallel workers attempting to reassign M stranded passengers to K replacement seats.
    - Full telemetry returned: transaction execution times, locked seat IDs, commits, rollbacks, and zero overbooking verification.
  - **Verification**: Unit test running 20 concurrent rebooking workers against 5 seats proving exactly 5 rebooked and 0 double-booked.
  - **Dependencies**: Task 8
  - **Files likely touched**:
    - `src/lib/cascadeEngine.ts`
    - `src/lib/concurrencyEngine.ts`
    - `src/lib/types.ts`
  - **Estimated scope**: M (3 files)

---

### Checkpoint 3: Hybrid Services & Engine Logic
- [ ] Disruption events sync cleanly from MongoDB into PostgreSQL timetables.
- [ ] Concurrent rebooking worker reliably executes row-level pessimistic locking without deadlocks.

---

## Phase 4: API Routes & Persona Context

- [ ] **Task 10: Implement REST API Endpoints**
  - **Description**: Build App Router API routes:
    - `GET /api/network`: Returns transit lines, stations, connections, and live trip status.
    - `POST /api/disruptions`: Ingests incident into MongoDB, updates PostgreSQL, and runs recursive cascade query.
    - `GET /api/disruptions`: Fetches recent MongoDB incident documents.
    - `POST /api/rebook`: Triggers the concurrency stress-test runner.
    - `GET /api/audit`: Returns database roles, active locks (`pg_locks`), and `EXPLAIN ANALYZE` plans.
  - **Acceptance criteria**:
    - Endpoints accept role header (`X-Persona-Role`) to execute queries under the requested database persona.
    - Standardized JSON responses with HTTP status codes and error handling.
  - **Verification**: `curl` or automated fetch calls to each endpoint verifying valid JSON payloads.
  - **Dependencies**: Task 9
  - **Files likely touched**:
    - `src/app/api/network/route.ts`
    - `src/app/api/disruptions/route.ts`
    - `src/app/api/rebook/route.ts`
    - `src/app/api/audit/route.ts`
  - **Estimated scope**: M (4 files)

---

### Checkpoint 4: API Layer
- [ ] All API endpoints respond with correct database telemetry.
- [ ] Role-restricted queries appropriately succeed or throw permission errors depending on persona.

---

## Phase 5: Interactive Full-Stack Dashboard

- [ ] **Task 11: Build Network Topology Visualizer (`TransitGraph.tsx`)**
  - **Description**: Build an interactive SVG rail network graph displaying 15 stations and 4 color-coded lines, with live status indicators (Green/Yellow/Red), active train icons, and clickable nodes displaying scheduled vs actual timetable data.
  - **Acceptance criteria**:
    - Renders topological layout with clear line paths and transfer hub markers.
    - Updates dynamically when disruptions are injected (affected stations and edges pulse yellow/red).
    - Station tooltip displays incoming/outgoing trips and current delays.
  - **Verification**: Visual verification on browser at `http://localhost:3000`.
  - **Dependencies**: Task 10
  - **Files likely touched**:
    - `src/components/TransitGraph.tsx`
  - **Estimated scope**: S (1 file)

- [ ] **Task 12: Build Disruption Control Panel & Presets (`DisruptionPanel.tsx`)**
  - **Description**: Create the Disruption Panel featuring 1-click incident presets ("Catenary Failure @ Central Hub", "Signal Glitch @ West Junction", "Track Maintenance Delay") plus a custom JSON editor for MongoDB incident payloads.
  - **Acceptance criteria**:
    - One-click trigger inserts document into MongoDB and immediately triggers visual cascade on the graph.
    - Displays raw MongoDB `ObjectId` and payload attributes.
    - Displays recursive cascade downstream results: list of affected downstream trips, delay minutes, and passenger count.
  - **Verification**: Click preset button and verify immediate UI update and cascade list.
  - **Dependencies**: Task 11
  - **Files likely touched**:
    - `src/components/DisruptionPanel.tsx`
  - **Estimated scope**: S (1 file)

- [ ] **Task 13: Build Concurrency Arena & Stress-Tester (`ConcurrencyArena.tsx`)**
  - **Description**: Implement the Concurrency Arena component showing stranded passengers, available replacement seats, a configurable worker slider (10–50 parallel transactions), and a live "Execute Concurrent Rebooking" action.
  - **Acceptance criteria**:
    - Displays live transaction worker cards with status (Locking, Rebooked, Waitlisted).
    - Metrics banner showing: Total Workers, Allocated Seats, Waitlisted, Lock Contention Time, and **Double-Booking Violations: 0**.
    - Live SQL verification query display proving zero duplicate seat assignments in the database.
  - **Verification**: Run a 30-worker stress test in the UI; verify telemetry cards update in real-time.
  - **Dependencies**: Task 12
  - **Files likely touched**:
    - `src/components/ConcurrencyArena.tsx`
  - **Estimated scope**: S (1 file)

- [ ] **Task 14: Implement Persona Switcher, Audit Modal & Main Page Layout**
  - **Description**: Assemble `src/app/page.tsx` integrating `TransitGraph`, `DisruptionPanel`, `ConcurrencyArena`, `PersonaSwitcher` (Dispatcher, Passenger, Auditor), and `SqlExplainModal` (showing raw recursive CTE, locks, and views).
  - **Acceptance criteria**:
    - Switching to `Passenger` shows a personalized "My Journey" ticket banner and disables dispatcher controls.
    - Switching to `Auditor` reveals database role grants, active `pg_locks`, and `EXPLAIN ANALYZE` plans.
    - Responsive, dark-themed UI built with Tailwind CSS.
  - **Verification**: Switch between all 3 personas on the web UI and verify interface reactivity.
  - **Dependencies**: Task 13
  - **Files likely touched**:
    - `src/app/page.tsx`
    - `src/app/layout.tsx`
    - `src/components/PersonaSwitcher.tsx`
    - `src/components/SqlExplainModal.tsx`
  - **Estimated scope**: M (4 files)

---

### Checkpoint 5: Complete Interactive UI
- [ ] Dashboard is visually compelling, responsive, and intuitive.
- [ ] Disruption injection, recursive cascade visualization, and concurrency arena work seamlessly from the browser.
- [ ] Persona switching visibly demonstrates database security boundaries.

---

## Phase 6: Automated Testing & Verification Suite

- [ ] **Task 15: Automated Concurrency & Recursive CTE Test Suites**
  - **Description**: Write automated tests in `tests/` verifying the recursive CTE query accuracy, cycle prevention, and executing a headless 50-worker concurrent rebooking test against limited seats.
  - **Acceptance criteria**:
    - `tests/recursive_cte.test.ts` validates multi-leg delay propagation.
    - `tests/concurrency_rebook.test.ts` fires 50 concurrent transactions; asserts zero duplicate seats in PostgreSQL.
    - `npm test` runs all suites and exits with code 0.
  - **Verification**: Run `npm test` in the terminal.
  - **Dependencies**: Task 14
  - **Files likely touched**:
    - `tests/recursive_cte.test.ts`
    - `tests/concurrency_rebook.test.ts`
  - **Estimated scope**: S (2 files)

- [ ] **Task 16: Project Documentation & Presentation Guide**
  - **Description**: Write a comprehensive `README.md` containing database ER diagrams (Mermaid), schema normalization breakdown, recursive CTE explanation, concurrency locking analysis, role configuration, and a step-by-step presentation script for demo day.
  - **Acceptance criteria**:
    - Clear quickstart commands (`docker compose up -d`, `npm install`, `npm run dev`).
    - Detailed documentation of all 7 rubric areas (Normalization, Recursive CTE, Views, Temporal, NoSQL, Concurrency, Roles).
    - Step-by-step evaluator walkthrough.
  - **Verification**: Read and verify markdown formatting in `README.md`.
  - **Dependencies**: Task 15
  - **Files likely touched**:
    - `README.md`
  - **Estimated scope**: S (1 file)

---

### Final Checkpoint: Project Ready for Demonstration
- [ ] `docker compose up -d` & `npm run dev` start cleanly.
- [ ] All automated tests pass (`npm test`).
- [ ] Full end-to-end demo flow runs without glitches.
