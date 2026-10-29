# Technical Specification: Public Transport Disruption Dependency Engine

## 1. Objective
Build an interactive, demonstrable full-stack web application that models a metropolitan transit network, ingests flexible disruption incidents into MongoDB, recursively calculates cascading downstream service impacts and affected passenger journeys in PostgreSQL, and executes transaction-safe seat rebooking under heavy concurrent contention.

The system serves as an academic and portfolio DBMS showcase demonstrating:
- **3NF/BCNF Relational Normalization** for transit network topologies.
- **PostgreSQL Recursive CTEs (`WITH RECURSIVE`)** for graph-based ripple delay and downstream transfer failure propagation.
- **Temporal Timetable Modeling** tracking scheduled vs actual trip status across effective valid-time windows.
- **Relational Views & Materialized Views** for live operational telemetry.
- **Polymorphic NoSQL Disruption Ingestion** in MongoDB for unstructured incident reports and audit trails.
- **ACID Concurrency & Pessimistic Locking** (`SELECT ... FOR UPDATE SKIP LOCKED`) guaranteeing zero double-allocations during emergency rebooking.
- **Database-Level Role Security (RBAC & RLS)** in both PostgreSQL (`GRANT`/`REVOKE`, Row-Level Security) and MongoDB user roles, demonstrated via an active UI Persona Switcher.

---

## 2. Tech Stack & Environment
- **Runtime**: Node.js v24.x, TypeScript 5.x
- **Frontend / Full-Stack Framework**: Next.js 14+ (App Router), Tailwind CSS, Lucide Icons, HTML5 Canvas / SVG Graph Renderer
- **Relational Database**: PostgreSQL 16 (via Docker)
- **Document Database**: MongoDB 7 (via Docker)
- **Database Drivers**: `pg` (PostgreSQL client with connection pooling) and `mongodb` (Official MongoDB Node.js driver)
- **Containerization**: `docker-compose.yml` orchestrating PostgreSQL and MongoDB with initialization scripts
- **Testing**: Vitest / Node test runner for concurrency race tests and SQL verification

---

## 3. Capability Map & Modules

| Module ID | Responsibility | Dependencies |
| :--- | :--- | :--- |
| `db-relational` | PostgreSQL schema, 3NF normalization, temporal timetables, views, recursive CTEs, and DB roles/RLS. | PostgreSQL 16 |
| `db-nosql` | MongoDB disruption event store, polymorphic schemas, incident indexing, and audit logging. | MongoDB 7 |
| `engine-cascade` | Hybrid execution engine: bridges MongoDB incidents to PostgreSQL timetable modifications and runs recursive downstream cascade queries. | `db-relational`, `db-nosql` |
| `engine-concurrency`| High-contention parallel rebooking worker runner with ACID transaction locks and zero double-booking proof. | `db-relational` |
| `ui-dashboard` | Next.js interactive web UI: Visual transit map, disruption injector, concurrency arena, and persona switcher. | `engine-cascade`, `engine-concurrency` |

---

## 4. Database Architecture & Schemas

### 4.1 PostgreSQL Relational Core (Normalized 3NF)
- **`stations`**: `station_id` (PK), `code`, `name`, `zone`, `platform_count`, `transfer_hub_flag`.
- **`lines`**: `line_id` (PK), `name`, `code`, `color_hex`, `transit_type` (METRO, REGIONAL_RAIL, HIGH_SPEED).
- **`routes`**: `route_id` (PK), `line_id` (FK), `direction`, `origin_station_id` (FK), `destination_station_id` (FK).
- **`station_connections`**: `connection_id` (PK), `from_station_id` (FK), `to_station_id` (FK), `distance_km`, `nominal_duration_min`.
- **`trains`**: `train_id` (PK), `train_number`, `model`, `total_capacity`.
- **`carriages`**: `carriage_id` (PK), `train_id` (FK), `carriage_number`, `class_type`.
- **`seats`**: `seat_id` (PK), `carriage_id` (FK), `seat_number`, `seat_type` (WINDOW, AISLE).
- **`trips`**: `trip_id` (PK), `route_id` (FK), `train_id` (FK), `service_date`, `status` (`SCHEDULED`, `ON_TIME`, `DELAYED`, `CANCELLED`, `REROUTED`).
- **`timetable_stops`** *(Temporal Data)*:
  - `stop_id` (PK), `trip_id` (FK), `station_id` (FK), `stop_sequence` (INT).
  - `scheduled_arrival`, `scheduled_departure`.
  - `actual_arrival`, `actual_departure`.
  - `delay_arrival_min`, `delay_departure_min`.
  - `effective_from` (TIMESTAMPTZ), `effective_to` (TIMESTAMPTZ), `version` (INT).
- **`passengers`**: `passenger_id` (PK), `full_name`, `email`, `phone`, `db_user_role`.
- **`reservations`**:
  - `reservation_id` (PK), `passenger_id` (FK), `trip_id` (FK), `seat_id` (FK).
  - `origin_station_id` (FK), `destination_station_id` (FK).
  - `booking_status` (`CONFIRMED`, `DISRUPTED`, `REBOOKED`, `REFUNDED`).
  - `reassigned_from_reservation_id` (Self FK for rebooking lineage).
  - `created_at`, `updated_at`.

### 4.2 Views & Materialized Views
- **`v_live_trip_monitor`**: View joining `trips`, `routes`, `lines`, and current delay metrics calculated from latest `timetable_stops`.
- **`v_station_hub_congestion`**: Materialized view aggregating incoming delays and transfer passenger volumes per hub.
- **`v_passenger_rebooking_lineage`**: View tracking original disrupted seats vs newly allocated replacement seats with timestamps.

### 4.3 Recursive CTE: Downstream Disruption Dependency Query
```sql
WITH RECURSIVE downstream_cascade AS (
    -- Anchor member: directly disrupted trip at source station
    SELECT 
        ts.trip_id,
        t.route_id,
        ts.station_id,
        ts.stop_sequence,
        ts.delay_departure_min AS propagated_delay,
        1 AS cascade_depth,
        ARRAY[ts.trip_id] AS trip_path
    FROM timetable_stops ts
    JOIN trips t ON ts.trip_id = t.trip_id
    WHERE ts.trip_id = $1 AND ts.station_id = $2
    
    UNION ALL
    
    -- Recursive member: connected trips awaiting transfer passengers or sharing track blocks
    SELECT 
        next_ts.trip_id,
        next_t.route_id,
        next_ts.station_id,
        next_ts.stop_sequence,
        GREATEST(0, (curr.propagated_delay - 
            EXTRACT(EPOCH FROM (next_ts.scheduled_departure - curr_ts.scheduled_arrival))/60)::INT) AS propagated_delay,
        curr.cascade_depth + 1,
        curr.trip_path || next_ts.trip_id
    FROM downstream_cascade curr
    JOIN timetable_stops curr_ts 
        ON curr.trip_id = curr_ts.trip_id AND curr.station_id = curr_ts.station_id
    JOIN timetable_stops next_ts 
        ON next_ts.station_id = curr.station_id 
       AND next_ts.trip_id != curr.trip_id
       AND next_ts.scheduled_departure BETWEEN curr_ts.scheduled_arrival AND curr_ts.scheduled_arrival + INTERVAL '45 minutes'
    JOIN trips next_t ON next_ts.trip_id = next_t.trip_id
    WHERE curr.cascade_depth < 6
      AND NOT (next_ts.trip_id = ANY(curr.trip_path))
      AND curr.propagated_delay > 15
)
SELECT DISTINCT * FROM downstream_cascade;
```

### 4.4 Transaction-Safe Rebooking (`SELECT ... FOR UPDATE SKIP LOCKED`)
```sql
-- Executed inside a single ACID transaction per rebooking worker:
BEGIN;

-- 1. Identify and lock an available seat on the target alternate trip
SELECT s.seat_id, s.carriage_id 
FROM seats s
WHERE s.carriage_id IN (
    SELECT c.carriage_id FROM carriages c WHERE c.train_id = (
        SELECT train_id FROM trips WHERE trip_id = $target_trip_id
    )
)
AND NOT EXISTS (
    SELECT 1 FROM reservations r 
    WHERE r.trip_id = $target_trip_id 
      AND r.seat_id = s.seat_id 
      AND r.booking_status IN ('CONFIRMED', 'REBOOKED')
)
ORDER BY s.seat_id
FOR UPDATE SKIP LOCKED
LIMIT 1;

-- 2. If seat found:
UPDATE reservations 
SET booking_status = 'REBOOKED',
    updated_at = NOW()
WHERE reservation_id = $original_reservation_id;

INSERT INTO reservations (
    passenger_id, trip_id, seat_id, origin_station_id, destination_station_id,
    booking_status, reassigned_from_reservation_id, created_at, updated_at
) VALUES (
    $passenger_id, $target_trip_id, $allocated_seat_id, $origin_id, $dest_id,
    'CONFIRMED', $original_reservation_id, NOW(), NOW()
);

COMMIT;
```

### 4.5 MongoDB Disruption Events Schema (Collection: `disruption_events`)
```json
{
  "_id": "ObjectId(...)",
  "incident_code": "DISR-2026-0891",
  "incident_type": "CATENARY_POWER_FAILURE",
  "severity": "CRITICAL",
  "reported_at": "2026-10-29T08:15:00Z",
  "source": "SCADA_SENSOR_GRID_NODE_4",
  "affected_scope": {
    "primary_line_code": "RED_LINE",
    "track_segment_ids": [104, 105],
    "stations_affected": ["STN_CENTRAL", "STN_NORTH"]
  },
  "temporal_window": {
    "estimated_start": "2026-10-29T08:15:00Z",
    "estimated_cleared": "2026-10-29T11:30:00Z"
  },
  "raw_telemetry": {
    "voltage_drop_pct": 87.4,
    "temperature_celsius": 41.2,
    "field_crew_assigned": "TEAM_BRAVO_ENGINEERING"
  },
  "postgres_sync": {
    "status": "APPLIED",
    "cascade_trips_affected": 8,
    "passengers_affected": 240,
    "applied_at": "2026-10-29T08:15:03Z"
  }
}
```

### 4.6 Database Security & Role-Based Access Control (RBAC)
- **`transit_admin`**: Full `ALL PRIVILEGES` on database, tables, views, and stored functions.
- **`dispatcher_role`**:
  - `GRANT SELECT, INSERT, UPDATE ON trips, timetable_stops, reservations TO dispatcher_role;`
  - `GRANT SELECT ON stations, lines, routes, trains, carriages, seats TO dispatcher_role;`
  - Cannot alter users or database catalog.
- **`passenger_role`**:
  - `GRANT SELECT ON v_live_trip_monitor, stations, lines TO passenger_role;`
  - Postgres Row-Level Security (RLS) on `reservations`:
    ```sql
    ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY passenger_isolation_policy ON reservations
    FOR SELECT USING (passenger_id = NULLIF(current_setting('app.current_passenger_id', true), '')::INT);
    ```

---

## 5. User Interface & Demonstration Flow

1. **Top Bar — Persona Switcher**:
   - `Dispatcher`: Can inject MongoDB incidents, trigger cascade recalculations, and alter timetables.
   - `Passenger`: Reads only personalized itinerary and sees automated rebooking alerts; cannot edit network.
   - `Auditor / Admin`: Inspects database connection roles, active locks, SQL query plans (`EXPLAIN ANALYZE`), and MongoDB raw documents.
2. **Left Panel — Interactive Transit Network Topology**:
   - Visual SVG/Canvas rendering of the 15-station, 4-line transit network.
   - Real-time node/edge status indicators (Green = Nominal, Yellow = Delayed, Red = Blocked).
   - Clicking a node/line reveals scheduled vs actual departure times.
3. **Right Panel 1 — Disruption Event Injector (MongoDB)**:
   - Form / Preset buttons: "Signal Glitch @ Central Hub", "Track Obstruction @ River Crossing", "Rolling Delays @ Peak Commute".
   - Shows live JSON payload inserted into MongoDB, immediately triggering PostgreSQL recursive CTE propagation.
4. **Right Panel 2 — Concurrency Arena & Rebooking Stress-Tester**:
   - Displays affected train passengers (e.g., 30 stranded passengers on cancelled Train #101).
   - Displays alternate service with finite seats (e.g., only 10 available seats on Train #205).
   - **"Run Concurrent Rebooking" Button**: Fires 30 parallel Node.js database worker promises simultaneously executing ACID transactions with `SELECT ... FOR UPDATE SKIP LOCKED`.
   - Live telemetry output:
     - Total worker requests: 30
     - Successfully booked: 10
     - Gracefully redirected/waitlisted: 20
     - Overbooking violations: **0** (Verified via `HAVING count(*) > 1` DB check)
     - Average lock contention wait time (ms).

---

## 6. Project Structure
```
DBMS Project/
├── docker-compose.yml             # Postgres 16 + Mongo 7 configuration
├── database/
│   ├── postgres/
│   │   ├── 01_schema.sql          # 3NF tables, constraints, temporal columns
│   │   ├── 02_views.sql           # Materialized & standard operational views
│   │   ├── 03_recursive_cte.sql   # Recursive delay propagation query functions
│   │   ├── 04_roles_rls.sql       # RBAC roles, grants, row-level security
│   │   └── 05_seed_network.sql    # 15 stations, 4 lines, routes, trips, seats, passengers
│   └── mongo/
│       ├── 01_init_mongo.js       # Collection setup, indexes, validator schemas
│       └── 02_seed_disruptions.js # Initial incident events
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout with theme and navigation
│   │   ├── page.tsx               # Main Dashboard with map, disruption injector & arena
│   │   └── api/
│   │       ├── network/route.ts   # Fetches live network topology & status
│   │       ├── disruptions/route.ts # Ingests Mongo disruption & triggers Postgres cascade
│   │       ├── rebook/route.ts    # Concurrency stress-test runner using parallel DB workers
│   │       └── audit/route.ts     # Role inspection, lock monitor, and SQL query plans
│   ├── components/
│   │   ├── TransitGraph.tsx       # SVG/Canvas interactive network visualization
│   │   ├── DisruptionPanel.tsx    # MongoDB incident creator & preset picker
│   │   ├── ConcurrencyArena.tsx   # Live transaction race tester & telemetry cards
│   │   ├── PersonaSwitcher.tsx    # Role switching header (Admin/Dispatcher/Passenger)
│   │   └── SqlExplainModal.tsx    # Displays raw SQL, recursive CTE execution plans
│   └── lib/
│       ├── postgres.ts            # pg.Pool connection manager with role-switching wrappers
│       ├── mongodb.ts             # MongoClient connection singleton
│       └── cascadeEngine.ts       # Delay propagation and affected reservation calculator
├── tests/
│   ├── recursive_cte.test.ts      # Verifies multi-hop downstream propagation logic
│   └── concurrency_rebook.test.ts # Fires 50 parallel workers to verify 0 double-booking
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── README.md                      # Step-by-step setup and presentation guide
```

---

## 7. Commands
- **Start Databases**: `docker compose up -d`
- **Stop Databases**: `docker compose down -v`
- **Install Dependencies**: `npm install`
- **Initialize & Seed DB**: `npm run db:seed`
- **Run Development Server**: `npm run dev`
- **Run Concurrency & SQL Tests**: `npm test`
- **Build Production**: `npm run build`

---

## 8. Code Style & Conventions
- **TypeScript**: Strict type checking (`noImplicitAny: true`).
- **SQL**: Standard PostgreSQL SQL syntax, keywords capitalized (`SELECT`, `JOIN`, `WITH RECURSIVE`, `FOR UPDATE`).
- **Transactions**: Explicit `client = await pool.connect(); try { await client.query('BEGIN'); ... await client.query('COMMIT'); } finally { client.release(); }`.
- **API Error Handling**: All API routes return `{ success: boolean, data?: any, error?: string }` with appropriate HTTP status codes.

---

## 9. Boundaries
- **Always**:
  - Run database operations through genuine connection pools.
  - Wrap rebooking operations inside explicit `BEGIN ... COMMIT` blocks with pessimistic locks.
  - Include verification queries proving zero seat overbooking after every concurrency run.
- **Ask First**:
  - Changing database ports away from standard 5432 / 27017.
  - Adding heavy external NPM UI packages beyond Lucide / Tailwind.
- **Never**:
  - Mock or fake concurrency in JavaScript memory without real database locks.
  - Store unencrypted passwords or hardcode production secrets.
  - Skip foreign key constraints or relational normalization rules.

---

## 10. Success Criteria (Verification Targets)
- [ ] `docker compose up -d` starts PostgreSQL 16 and MongoDB 7 cleanly without errors.
- [ ] Database initialization seeds a functional 15-station, 4-line network with 40+ scheduled trips and 100+ seats.
- [ ] Inserting a disruption event into MongoDB successfully records the polymorphic document and updates the PostgreSQL schedule.
- [ ] The recursive CTE correctly identifies downstream trips affected by transfers within <30ms execution time.
- [ ] Firing the Concurrency Arena with 30 simulated passenger threads competing for 10 seats produces:
  - Exactly 10 seats marked `REBOOKED`.
  - Zero double-booked seats (`SELECT seat_id, COUNT(*) FROM reservations WHERE booking_status = 'REBOOKED' GROUP BY seat_id HAVING COUNT(*) > 1` returns 0 rows).
- [ ] Switching personas to `Passenger` blocks unauthorized updates to timetables and restricts reservations to the active passenger via Row-Level Security.
- [ ] `npm test` passes all recursive CTE and concurrency race test suites.
