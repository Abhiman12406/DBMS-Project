# Public Transport Disruption Dependency Engine

A full-stack DBMS showcase that models a metropolitan transit network, ingests polymorphic disruption incidents into MongoDB, propagates cascading service impacts through a PostgreSQL recursive CTE, and reallocates finite seats under heavy parallel contention with zero double-booking.

The project demonstrates seven database engineering areas in one runnable application:

1. 3NF/BCNF relational normalization
2. PostgreSQL recursive CTEs for graph traversal
3. Standard views and materialized views
4. Temporal timetable versioning
5. Polymorphic NoSQL incident storage
6. ACID transactions and pessimistic row locking
7. Database-level RBAC and row-level security

---

## 1. Tech Stack

| Layer | Technology |
| :--- | :--- |
| Runtime | Node.js 24.x, TypeScript 5.x |
| Framework | Next.js 15 (App Router), React 19 |
| Styling / Icons | Tailwind CSS, Lucide |
| Relational database | PostgreSQL 16 (Docker) |
| Document database | MongoDB 7 (Docker) |
| Drivers | `pg` connection pool, official `mongodb` driver |
| Testing | Vitest 5 (integration tests against live databases) |
| Containerization | Docker Compose |

---

## 2. Architecture

```mermaid
flowchart LR
    UI["Next.js Dashboard<br/>TransitGraph · DisruptionPanel · ConcurrencyArena"]
    API["App Router API<br/>/api/network · /api/disruptions · /api/rebook · /api/audit"]
    CASCADE["cascadeEngine<br/>Mongo ingestion + Postgres cascade"]
    CONCURRENCY["concurrencyEngine<br/>parallel ACID rebooking"]
    PG[("PostgreSQL 16<br/>topology · timetable · reservations")]
    MONGO[("MongoDB 7<br/>disruption_events")]

    UI --> API
    API --> CASCADE
    API --> CONCURRENCY
    API --> PG
    API --> MONGO
    CASCADE --> PG
    CASCADE --> MONGO
    CONCURRENCY --> PG
```

The two databases have deliberately different responsibilities:

- **PostgreSQL** is the authoritative source of truth for normalized topology, temporal timetables, and transactional seat allocations.
- **MongoDB** is the flexible incident/audit store. SCADA telemetry, weather advisories, and police orders have different shapes, so the document model stores a strict common envelope plus a polymorphic `raw_telemetry` object.

---

## 3. Quickstart

### Prerequisites

- Docker Desktop (engines must be running)
- Node.js 20+ (tested on Node 24)
- npm 10+
- Free host ports `5432` (PostgreSQL) and `27017` (MongoDB); override with `POSTGRES_PORT` / `MONGO_PORT` in `.env` if needed

### Start the databases

```bash
docker compose up -d
docker compose ps
```

Both containers should report `healthy`. On first startup, Docker automatically executes:

- `database/postgres/01_schema.sql` through `05_seed_network.sql`
- `database/mongo/01_init_mongo.js` and `02_seed_disruptions.js`

If the containers already existed but the schema is missing or stale, recreate the volumes:

```bash
docker compose down -v
docker compose up -d
```

### Install and run the application

```bash
npm install
npm run db:check     # confirms both database connections
npm run dev          # http://localhost:3000
```

### Run the automated tests

```bash
npm test
```

The test suites require live, seeded databases because they exercise the real SQL functions and real row locks. They do not mock the database.

### Other commands

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm run build        # production build
npm run db:check     # check DB connectivity and stats
npm run db:init      # idempotent schema/indexes/seed setup for hosted databases
npm run db:seed      # force re-creation and re-seeding
npm run test:watch   # Vitest watch mode
docker compose down  # stop containers, keep data
```

Environment variables are documented in `.env.example` and default to `transit_db`, `postgres` / `postgres`, `localhost:5432`, and `localhost:27017`.

---

## 4. Deployment to Render (Hosted Databases)

The application is pre-configured for deployment on [Render](https://render.com) with hosted databases (Render Managed PostgreSQL, Neon, Supabase, AWS RDS, and MongoDB Atlas).

### Architecture on Render

```mermaid
flowchart TD
    Browser["User Browser"] -->|HTTPS| RenderWeb["Render Web Service<br/>Next.js 15 App Router"]
    RenderWeb -->|TLS / DATABASE_URL| HostedPG[("Hosted PostgreSQL 16<br/>Render Postgres / Neon / Supabase")]
    RenderWeb -->|TLS / MONGODB_URI| HostedMongo[("Hosted MongoDB 7+<br/>MongoDB Atlas")]
```

### Option A: 1-Click Blueprint Deployment (`render.yaml`)

The repository includes a ready-to-use [`render.yaml`](file:///C:/Users/Asus/Desktop/DBMS%20Project/render.yaml) Blueprint:

1. Push your repository to GitHub or GitLab.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** > **Blueprint**.
3. Select this repository. Render automatically reads `render.yaml` and configures:
   - **Web Service**: Node 20+, `npm install && npm run build`, `npm start` on `0.0.0.0`.
   - **Pre-Deploy Command**: `npm run db:init` (automatically migrates and seeds schemas before live traffic).
   - **Health Check**: `/api/health`.
   - **PostgreSQL Database**: Free/Starter Render Postgres instance, auto-wiring `DATABASE_URL`.
4. Render will prompt you for the `MONGODB_URI` environment variable:
   - Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas).
   - In MongoDB Atlas, create a database named `transit_db`, a database user, and allow network access (`0.0.0.0/0`).
   - Paste the connection string: `mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/transit_db?retryWrites=true&w=majority`.
5. Click **Apply Blueprint**. Render builds the app, initializes both databases, and starts serving!

---

### Option B: Manual Web Service Setup (Render Dashboard)

If you already have existing hosted PostgreSQL (e.g. Supabase, Neon, AWS RDS) and MongoDB (Atlas):

1. **Create Web Service**: In Render Dashboard, click **New +** > **Web Service** and link your Git repository.
2. **Configure Service Details**:
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Pre-Deploy Command**: `npm run db:init` *(or append to Build Command: `npm install && npm run build && npm run db:init`)*
   - **Start Command**: `npm start`
   - **Health Check Path**: `/api/health`
3. **Configure Environment Variables**:
   | Key | Example Value | Description |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Production mode |
   | `PORT` | `10000` | Port assigned by Render (automatically bound to `0.0.0.0`) |
   | `DATABASE_URL` | `postgres://user:pass@host.render.com:5432/transit_db?sslmode=require` | Hosted PostgreSQL connection string |
   | `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/transit_db?retryWrites=true&w=majority` | Hosted MongoDB Atlas connection string |
   | `POSTGRES_SSL` | `true` | Enforces SSL with self-signed certificate acceptance |
   | `PG_POOL_MAX` | `20` | Max client pool size (recommended for cloud tiers) |
   | `MONGO_POOL_MAX`| `20` | Max Mongo pool size |
4. Click **Deploy Web Service**.

---

### Database Migration & Seed Automation

Because hosted databases start empty without Docker entrypoints, the included [`scripts/init-db.ts`](file:///C:/Users/Asus/Desktop/DBMS%20Project/scripts/init-db.ts) handles migrations and seeding:

- **Idempotent by default**: If tables and collections exist, `npm run db:init` updates SQL views, CTE functions, and roles safely without dropping data.
- **Auto-initialization**: If tables are missing, it executes `01_schema.sql` through `05_seed_network.sql`, establishes MongoDB JSON schemas, creates indexes, and inserts seed records.
- **Force re-seed**: Run `npm run db:seed` (or pass `--force`) to recreate all tables and collections from scratch.
- **Connection Diagnostics**: Run `npm run db:check` to inspect live latency and record counts.

---

### Repository Layout

```text
DBMS Project/
├── render.yaml                # Infrastructure-as-code Blueprint for Render
├── Dockerfile                 # Multi-stage production container for Render Docker
├── docker-compose.yml         # Local development orchestrator (Postgres 16 + Mongo 7)
├── database/
│   ├── postgres/
│   │   ├── 01_schema.sql          # 3NF tables, constraints, indexes
│   │   ├── 02_views.sql           # operational + materialized views
│   │   ├── 03_recursive_cte.sql   # cascade, delay application, rebooking functions
│   │   ├── 04_roles_rls.sql       # RBAC roles, grants, RLS policies
│   │   └── 05_seed_network.sql    # 15 stations, 4 lines, 24 trips, 120 seats
│   └── mongo/
│       ├── 01_init_mongo.js       # validator, unique/compound indexes
│       └── 02_seed_disruptions.js # seed incident documents
├── scripts/
│   ├── check-connections.ts   # CLI DB health diagnostics (Postgres + Mongo)
│   └── init-db.ts             # Idempotent migration & seed tool for hosted DBs
├── src/
│   ├── app/
│   │   ├── page.tsx               # dashboard composition
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── network/route.ts
│   │       ├── disruptions/route.ts
│   │       ├── rebook/route.ts
│   │       ├── audit/route.ts
│   │       └── health/route.ts    # /api/health check endpoint for Render
│   ├── components/
│   │   ├── TransitGraph.tsx
│   │   ├── DisruptionPanel.tsx
│   │   ├── ConcurrencyArena.tsx
│   │   ├── PersonaSwitcher.tsx
│   │   └── SqlExplainModal.tsx
│   └── lib/
│       ├── postgres.ts            # pg.Pool with DATABASE_URL & SSL support
│       ├── mongodb.ts             # MongoClient with MONGODB_URI & Atlas support
│       ├── cascadeEngine.ts       # hybrid incident propagation
│       ├── concurrencyEngine.ts   # parallel rebooking runner
│       └── types.ts
├── tests/
│   ├── recursive_cte.test.ts
│   └── concurrency_rebook.test.ts
├── vitest.config.mts
└── SPEC.md
```

---

## 5. Relational Schema and Normalization

### 5.1 Entity-relationship diagram

```mermaid
erDiagram
    LINES ||--o{ ROUTES : "operates"
    STATIONS ||--o{ ROUTES : "origin"
    STATIONS ||--o{ ROUTES : "destination"
    STATIONS ||--o{ STATION_CONNECTIONS : "from"
    STATIONS ||--o{ STATION_CONNECTIONS : "to"
    ROUTES ||--o{ TRIPS : "schedules"
    TRAINS ||--o{ TRIPS : "assigned_to"
    TRAINS ||--o{ CARRIAGES : "has"
    CARRIAGES ||--o{ SEATS : "contains"
    TRIPS ||--o{ TIMETABLE_STOPS : "visits"
    STATIONS ||--o{ TIMETABLE_STOPS : "served_at"
    PASSENGERS ||--o{ RESERVATIONS : "books"
    TRIPS ||--o{ RESERVATIONS : "reserved_on"
    SEATS ||--o{ RESERVATIONS : "assigned"
    STATIONS ||--o{ RESERVATIONS : "origin"
    STATIONS ||--o{ RESERVATIONS : "destination"
    RESERVATIONS ||--o| RESERVATIONS : "reassigned_from"

    STATIONS {
        int station_id PK
        varchar code UK
        varchar name
        int zone
        int platform_count
        boolean transfer_hub_flag
    }
    LINES {
        int line_id PK
        varchar code UK
        varchar name
        varchar color_hex
        varchar transit_type
    }
    ROUTES {
        int route_id PK
        int line_id FK
        varchar direction
        int origin_station_id FK
        int destination_station_id FK
    }
    STATION_CONNECTIONS {
        int connection_id PK
        int from_station_id FK
        int to_station_id FK
        numeric distance_km
        int nominal_duration_min
    }
    TRAINS {
        int train_id PK
        varchar train_number UK
        varchar model
        int total_capacity
    }
    CARRIAGES {
        int carriage_id PK
        int train_id FK
        int carriage_number
        varchar class_type
    }
    SEATS {
        int seat_id PK
        int carriage_id FK
        varchar seat_number
        varchar seat_type
    }
    TRIPS {
        int trip_id PK
        int route_id FK
        int train_id FK
        date service_date
        varchar status
    }
    TIMETABLE_STOPS {
        int stop_id PK
        int trip_id FK
        int station_id FK
        int stop_sequence
        timestamptz scheduled_arrival
        timestamptz scheduled_departure
        timestamptz actual_arrival
        timestamptz actual_departure
        int delay_arrival_min
        int delay_departure_min
        timestamptz effective_from
        timestamptz effective_to
        int version
    }
    PASSENGERS {
        int passenger_id PK
        varchar full_name
        varchar email UK
        varchar phone
        varchar db_user_role
    }
    RESERVATIONS {
        int reservation_id PK
        int passenger_id FK
        int trip_id FK
        int seat_id FK
        int origin_station_id FK
        int destination_station_id FK
        varchar booking_status
        int reassigned_from_reservation_id FK
        timestamptz created_at
        timestamptz updated_at
    }
```

### 5.2 Normalization breakdown

The schema is normalized to 3NF, with BCNF-level determinants in every table.

| Table | Functional dependencies | Why it is normalized |
| :--- | :--- | :--- |
| `stations` | `station_id -> code, name, zone, platform_count, transfer_hub_flag`; `code` is a candidate key | Station attributes are atomic and depend only on the station key. |
| `lines` | `line_id -> code, name, color_hex, transit_type`; `code` is a candidate key | Line metadata is stored once and referenced by routes. |
| `routes` | `route_id -> line_id, direction, origin_station_id, destination_station_id` | A reusable corridor is separated from a dated trip instance. |
| `station_connections` | `connection_id -> from_station_id, to_station_id, distance_km, nominal_duration_min`; `(from_station_id, to_station_id)` is unique | Edge attributes belong to the physical track segment, not to a train or trip. |
| `trains` | `train_id -> train_number, model, total_capacity`; `train_number` is unique | Rolling-stock facts are not repeated on every trip. |
| `carriages` | `carriage_id -> train_id, carriage_number, class_type`; `(train_id, carriage_number)` is unique | Coach identity is scoped to a train. |
| `seats` | `seat_id -> carriage_id, seat_number, seat_type`; `(carriage_id, seat_number)` is unique | Seat identity is scoped to a carriage. |
| `trips` | `trip_id -> route_id, train_id, service_date, status` | A dated service instance references route and train instead of duplicating their attributes. |
| `timetable_stops` | `stop_id -> trip_id, station_id, stop_sequence, scheduled/actual times, delays, validity, version`; `(trip_id, stop_sequence)` is unique | Stop observations depend on the trip/station pair, not on unrelated entities. |
| `passengers` | `passenger_id -> full_name, email, phone, db_user_role`; `email` is unique | Traveller identity has no repeated itinerary data. |
| `reservations` | `reservation_id -> passenger_id, trip_id, seat_id, origin, destination, status, lineage` | Each row is one booking fact. `(trip_id, seat_id)` is unique for active statuses. |

Normalization rules applied:

- **1NF**: every column is atomic (no arrays of passengers, seats, or station lists inside operational tables).
- **2NF**: no partial dependency on part of a composite key; `timetable_stops` is keyed by `stop_id` and guarded by a unique `(trip_id, stop_sequence)` constraint.
- **3NF**: no transitive dependencies. For example, `seats` does not store `train_id` or `line_id`; those are reachable through `carriages` and `routes`. `trips` does not store line names or station names.
- **BCNF**: every determinant is a candidate key. The active-seat rule is a conditional uniqueness invariant enforced by a partial unique index rather than duplicated columns.

The final concurrency invariant is enforced in the database itself:

```sql
CREATE UNIQUE INDEX uq_reservations_active_seat
    ON reservations(trip_id, seat_id)
    WHERE booking_status IN ('CONFIRMED', 'REBOOKED');
```

This makes double-booking impossible even if application code or concurrent workers contain a logic error.

---

## 6. Temporal Timetable Modeling

`timetable_stops` distinguishes planned time from observed time:

- `scheduled_arrival` / `scheduled_departure`: the timetable baseline.
- `actual_arrival` / `actual_departure`: what actually happened.
- `delay_arrival_min` / `delay_departure_min`: accumulated delay.
- `effective_from` / `effective_to`: valid-time window for the timetable version.
- `version`: increments whenever a disruption is applied.

`fn_apply_trip_delay(trip_id, station_id, delay_min, reason)` applies a delay from the incident stop onward, updates actual timestamps, increments `version`, updates the trip status, flags affected reservations as `DISRUPTED` for severe delays, and refreshes the congestion materialized view.

This gives the project both **valid-time history** (effective windows and versions) and **transaction-time auditability** (created/updated timestamps and the Mongo incident log).

---

## 7. Views and Materialized Views

| Object | Type | Purpose |
| :--- | :--- | :--- |
| `v_live_trip_monitor` | View | Joins trips, routes, lines, trains, stop delays, and active reservation counts into one live operational row per trip. |
| `v_station_hub_congestion` | Materialized view | Aggregates per-station delays, boarding/alighting demand, hub status, and a congestion score. Refreshed via `fn_refresh_station_hub_congestion()`. |
| `v_passenger_rebooking_lineage` | View | Shows each original disrupted/rebooked reservation next to its replacement seat, train, line, and timestamps. |
| `v_station_schedule` | View | Departure/arrival board per station with scheduled versus estimated departure. |

The congestion view has a unique index on `station_id`, enabling `REFRESH MATERIALIZED VIEW CONCURRENTLY` without blocking readers.

---

## 8. Recursive CTE: Downstream Disruption Cascade

Implemented in `database/postgres/03_recursive_cte.sql` as `fn_calculate_downstream_cascade(p_trip_id, p_station_id, p_delay_min)`.

```sql
WITH RECURSIVE downstream_cascade AS (
    -- Anchor: the directly disrupted trip at the incident station
    SELECT ts.trip_id, t.route_id, ts.station_id, ts.stop_sequence,
           ts.scheduled_arrival, ts.scheduled_departure,
           p_delay_min AS propagated_delay,
           1 AS cascade_depth,
           ARRAY[ts.trip_id] AS trip_path,
           'DIRECT_DISRUPTION' AS impact_type
    FROM timetable_stops ts
    JOIN trips t ON ts.trip_id = t.trip_id
    WHERE ts.trip_id = p_trip_id AND ts.station_id = p_station_id

    UNION ALL

    -- Recursive: next stop on the same trip, or a connecting trip
    SELECT next_ts.trip_id, next_t.route_id, next_ts.station_id, next_ts.stop_sequence,
           next_ts.scheduled_arrival, next_ts.scheduled_departure,
           CASE
             WHEN next_ts.trip_id = curr.trip_id THEN curr.propagated_delay
             ELSE GREATEST(0, curr.propagated_delay - transfer_minutes)
           END,
           curr.cascade_depth + 1,
           CASE
             WHEN next_ts.trip_id = curr.trip_id THEN curr.trip_path
             ELSE curr.trip_path || next_ts.trip_id
           END,
           CASE
             WHEN next_ts.trip_id = curr.trip_id THEN 'DOWNSTREAM_STOP'
             ELSE 'TRANSFER_CONNECTION'
           END
    FROM downstream_cascade curr
    JOIN timetable_stops curr_ts
      ON curr.trip_id = curr_ts.trip_id AND curr.station_id = curr_ts.station_id
    JOIN timetable_stops next_ts
      ON (next_ts.trip_id = curr.trip_id
          AND next_ts.stop_sequence = curr.stop_sequence + 1)
      OR (next_ts.station_id = curr.station_id
          AND next_ts.trip_id <> curr.trip_id
          AND next_ts.scheduled_departure > curr_ts.scheduled_arrival
          AND next_ts.scheduled_departure
              <= curr_ts.scheduled_arrival + INTERVAL '45 minutes')
    JOIN trips next_t ON next_ts.trip_id = next_t.trip_id
    WHERE curr.cascade_depth < 5
      AND (next_ts.trip_id = curr.trip_id AND curr.propagated_delay > 0
           OR next_ts.trip_id <> curr.trip_id
              AND NOT (next_ts.trip_id = ANY(curr.trip_path))
              AND curr.propagated_delay - transfer_minutes >= 10)
)
SELECT DISTINCT ON (trip_id, station_id, stop_sequence) ...
FROM downstream_cascade
ORDER BY trip_id, station_id, stop_sequence, cascade_depth, propagated_delay DESC;
```

Key mechanics:

- **Anchor member** starts at the disrupted trip and station.
- **Same-trip propagation** walks forward one `stop_sequence` at a time.
- **Transfer propagation** finds other trips departing the same station within a 45-minute horizon and only keeps them when at least 10 minutes of delay remains after the transfer buffer.
- **Cycle detection** uses `NOT (next_ts.trip_id = ANY(curr.trip_path))`, so a bi-directional network cannot loop forever.
- **Depth cap** `cascade_depth < 5` bounds pathological graphs.
- **Deduplication** keeps the shallowest, most severe observation per `(trip, station, stop)`.
- The result includes propagated delay, depth, impact type, traversal path, and affected passenger counts.

Manual check:

```bash
docker compose exec -T postgres psql -U postgres -d transit_db \
  -c "SELECT * FROM fn_calculate_downstream_cascade(1, 3, 45);"
```

With the seeded network, a 45-minute incident on Trip 1 at Central Station should reach downstream Red Line stops and transfer connections such as Trip 7 (Blue Line) and Trip 13 (Green Line) at depth 2.

---

## 9. MongoDB Polymorphic Incident Store

Collection: `disruption_events`.

The validator enforces a strict envelope:

- `incident_code` matching `DISR-YYYY-XXXX`
- `incident_type` from a fixed enum
- `severity` from `MINOR | MODERATE | SEVERE | CRITICAL`
- `reported_at`, `source`, and `affected_scope`

The variable part is intentionally open:

- `affected_scope.track_segment_ids` is optional
- `temporal_window` may contain start/clear estimates
- `raw_telemetry` is a free-form object for SCADA readings, weather measurements, police notes, and so on
- `postgres_sync` tracks `PENDING | APPLIED | FAILED` and cascade counts

Indexes:

- unique `incident_code`
- compound `(severity, reported_at)` for triage
- `affected_scope.primary_line_code`
- `postgres_sync.status` for reconciliation

Example document:

```json
{
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

The hybrid write flow is:

1. Insert the incident into MongoDB with `postgres_sync.status = PENDING`.
2. Call `fn_apply_trip_delay` in PostgreSQL inside a transaction.
3. Run the recursive cascade and passenger-impact query.
4. Commit PostgreSQL, then update the MongoDB document to `APPLIED` with cascade metrics.
5. If PostgreSQL fails, roll back and mark the document `FAILED` with the error.

---

## 10. Concurrency and ACID Rebooking

The critical operation is `fn_rebook_passenger_seat(original_reservation_id, target_trip_id)`.

Each worker executes one explicit transaction:

```text
BEGIN
  SELECT original reservation ... FOR UPDATE
  LOOP
    SELECT candidate seat
      ORDER BY seat_id
      FOR UPDATE OF s SKIP LOCKED
      LIMIT 1
    re-check availability under the held row lock
    exit when a free seat is found
  END LOOP
  UPDATE original reservation -> REBOOKED
  INSERT replacement reservation -> CONFIRMED
COMMIT
```

Why this is safe:

- **Row-level pessimistic locking** serializes competing workers on each candidate seat.
- **`SKIP LOCKED`** makes a worker skip seats already held by another transaction instead of waiting, eliminating deadlocks and thundering-herd stalls.
- **Deterministic `ORDER BY seat_id`** gives every worker the same lock acquisition order.
- **Re-check after the lock** is essential under `READ COMMITTED`: a `NOT EXISTS` predicate can be evaluated against a snapshot taken before a competitor committed, so the function re-validates the seat after it owns the row lock.
- **Original reservation lock** (`FOR UPDATE` on the reservation row) prevents the same passenger from being rebooked twice.
- **The partial unique index** on active `(trip_id, seat_id)` is a final database-level guarantee.

The application runner (`concurrencyEngine.runStressTest`) launches N parallel workers, records transaction time and lock wait time per worker, and then verifies the invariant:

```sql
SELECT trip_id, seat_id, COUNT(*) AS duplicate_count
FROM reservations
WHERE booking_status IN ('CONFIRMED', 'REBOOKED')
GROUP BY trip_id, seat_id
HAVING COUNT(*) > 1;
```

A zero-row result is displayed in the Concurrency Arena as `Double-booking violations: 0`.

With the seed data, Trip 1 has 20 stranded passengers and Trip 2 has exactly 10 intentionally free seats, which produces a clear 10 allocated / 10 waitlisted contention demo.

---

## 11. RBAC and Row-Level Security

Roles are created in `database/postgres/04_roles_rls.sql` as `NOLOGIN` roles. The API assumes them per request with `SET LOCAL ROLE` inside a transaction, so authorization is enforced by PostgreSQL rather than only by UI code.

| Role | Purpose | Allowed | Denied |
| :--- | :--- | :--- | :--- |
| `transit_admin` | Auditor / administrator | Full table, sequence, view, function access; all rows | Nothing at the database layer |
| `dispatcher_role` | Operations controller | Read topology and passengers; `SELECT/INSERT/UPDATE` on trips, timetable stops, reservations; execute cascade/rebooking functions | Role/catalog changes; no `DELETE` grants on operational tables; no privilege to alter roles |
| `passenger_role` | Traveller | Read public topology, `v_live_trip_monitor`, `v_station_schedule`; read own reservation and passenger row through RLS | Any write; other passengers' reservations or profiles |

RLS policies on `reservations` and `passengers`:

```sql
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations FORCE ROW LEVEL SECURITY;

CREATE POLICY p_reservations_passenger_isolation ON reservations
    FOR SELECT
    TO passenger_role
    USING (
        passenger_id =
        NULLIF(current_setting('app.current_passenger_id', true), '')::INT
    );
```

`src/lib/postgres.ts` sets `app.current_passenger_id` transaction-locally for the passenger persona. If the session variable is unset, the policy returns zero rows.

---

## 12. API Reference

All routes return `{ "success": true, "data": ... }` or `{ "success": false, "error": "..." }`.

| Method | Endpoint | Personas | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Any | PostgreSQL and MongoDB connectivity, latency, and document count. |
| `GET` | `/api/network` | Any | Lines, stations, routes, connections, trip monitor rows, station schedule. Passenger requests also return only the RLS-filtered profile and reservations. |
| `GET` | `/api/disruptions` | Any | Recent MongoDB incident documents, newest first. Supports `?limit=`. |
| `POST` | `/api/disruptions` | admin, dispatcher | Validates a polymorphic incident, inserts into MongoDB, applies the Postgres delay, runs the recursive cascade, and returns the cascade result. |
| `POST` | `/api/rebook` | admin, dispatcher | Runs N parallel rebooking workers and returns allocation, waitlist, timing, and duplicate-seat telemetry. |
| `GET` | `/api/audit` | admin | Current database identity, role catalog, `pg_locks` summary, and an `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` plan for the cascade function. |

Persona selection uses headers:

```bash
curl -H "X-Persona-Role: dispatcher" http://localhost:3000/api/network
curl -H "X-Persona-Role: passenger" -H "X-Passenger-Id: 3" \
  http://localhost:3000/api/network
```

The default persona when the header is absent is `dispatcher`.

Example disruption request:

```bash
curl -X POST http://localhost:3000/api/disruptions \
  -H "Content-Type: application/json" \
  -H "X-Persona-Role: dispatcher" \
  -d '{
    "incident_type": "CATENARY_POWER_FAILURE",
    "severity": "CRITICAL",
    "source": "SCADA_GRID_SENSOR_04",
    "affected_scope": {
      "primary_line_code": "RED_LINE",
      "stations_affected": ["STN_CENTRAL", "STN_FINANCE"],
      "track_segment_ids": [3, 4]
    },
    "raw_telemetry": {
      "feeder_voltage_kv": 0,
      "breaker_trip": "CB-19"
    },
    "tripId": 1,
    "stationId": 3,
    "delayMin": 45,
    "reason": "CATENARY_FAILURE_CASCADE"
  }'
```

Example rebooking request:

```bash
curl -X POST http://localhost:3000/api/rebook \
  -H "Content-Type: application/json" \
  -H "X-Persona-Role: dispatcher" \
  -d '{ "originalTripId": 1, "targetTripId": 2, "workerCount": 50 }'
```

---

## 13. Dashboard Features

- **TransitGraph**: SVG network map of 15 stations and 4 color-coded lines, with live trip status, delay indicators, station details, and cascade highlighting.
- **DisruptionPanel**: three incident presets plus an editable JSON payload. Shows the inserted Mongo `ObjectId`, sync status, affected trips, passenger counts, execution time, and raw document.
- **ConcurrencyArena**: worker slider (10-50), live worker cards (`REBOOKED`, `WAITLISTED`, `FAILED`), lock and transaction timings, and the zero-double-booking SQL verification.
- **PersonaSwitcher**: Dispatcher, Passenger, and Auditor modes. Passenger mode shows a personalized "My journey" banner and disables mutation controls; Auditor mode exposes role grants, locks, and explain plans.
- **SqlExplainModal**: raw recursive CTE, row-lock query, and `EXPLAIN ANALYZE` output.

---

## 14. Automated Tests

Run:

```bash
npm test
```

`tests/recursive_cte.test.ts` verifies:

- the cascade anchor is the correct trip/station at depth 1 with the requested delay;
- downstream stops on the same trip propagate the delay;
- transfer connections reach Blue Line Trip 7 and Green Line Trip 13 at depth 2;
- propagated transfer delay decays but remains at least 10 minutes;
- no traversal path contains a duplicate trip and depth never exceeds 5;
- an unknown trip/station returns an empty result.

`tests/concurrency_rebook.test.ts` creates an isolated fixture (two trains, two trips, 50 source reservations, 10 target seats), fires **50 real parallel transactions**, and verifies:

- exactly 10 workers acquire a seat;
- the other 40 are rejected with "No seats available";
- all 10 allocated seat IDs are distinct and belong to the target train;
- the duplicate-seat query returns zero rows;
- the target trip has exactly 10 active reservations on 10 distinct seats;
- the source trip ends with 10 `REBOOKED` and 40 `CONFIRMED` bookings.

The fixture is removed in `afterAll`, so repeated test runs do not pollute the demo dataset.

Expected result:

```text
Test Files  2 passed (2)
Tests       6 passed (6)
```

---

## 15. Rubric Coverage Map

| # | Rubric area | Primary evidence | Demo action |
| :--- | :--- | :--- | :--- |
| 1 | Normalization (3NF/BCNF) | `01_schema.sql`, section 5 above | Explain how seats, carriages, trains, trips, and routes avoid transitive dependencies. |
| 2 | Recursive CTE | `03_recursive_cte.sql`, `tests/recursive_cte.test.ts` | Inject a Central Hub catenary failure and show multi-hop affected trips. |
| 3 | Views / materialized views | `02_views.sql` | Show `v_live_trip_monitor` and refresh `v_station_hub_congestion`. |
| 4 | Temporal modeling | `timetable_stops`, `fn_apply_trip_delay` | Inject a delay and show `scheduled_*` versus `actual_*`, delay columns, and incremented `version`. |
| 5 | NoSQL / polymorphic store | `database/mongo/*`, `cascadeEngine.ts` | Use two presets with different `raw_telemetry` shapes and inspect the stored documents. |
| 6 | Concurrency / ACID | `fn_rebook_passenger_seat`, `concurrencyEngine.ts`, `tests/concurrency_rebook.test.ts` | Run 50 workers against 10 seats and show zero double bookings. |
| 7 | Roles / RLS | `04_roles_rls.sql`, `src/lib/postgres.ts` | Switch to Passenger and show only own reservations plus blocked mutation controls. |

---

## 16. Evaluator Walkthrough

1. **Start clean.**
   ```bash
   docker compose down -v
   docker compose up -d
   npm install
   npm run db:check
   npm run dev
   ```
2. **Open `http://localhost:3000`** in Dispatcher mode. Confirm the health pills show Postgres and MongoDB as connected.
3. **Inspect the topology.** Click Central Station in the network map and note the station schedule, lines, and current delays.
4. **Inject the catenary preset.** Select "Catenary Failure @ Central Hub" and click "Inject disruption & run cascade". Point out:
   - the Mongo `ObjectId` and `APPLIED` sync status;
   - the cascade execution time;
   - downstream trips on Red, Blue, Green, and Airport Express lines.
5. **Inspect the hybrid write.** Open the raw MongoDB document in the result panel. Note the strict incident envelope and the free-form `raw_telemetry`.
6. **Run the concurrency arena.** Set the slider to 50 workers and click "Execute concurrent rebooking". Point out 10 allocated seats, 40 waitlisted workers, lock/txn timings, and `Double-booking violations: 0`.
7. **Switch to Passenger.** Show the "My journey" banner and that the disruption and rebooking controls are disabled. Explain `SET LOCAL ROLE passenger_role` and the RLS session variable.
8. **Switch to Auditor.** Open "SQL & Explain". Show the current DB identity, the three roles, `pg_locks`, and the `EXPLAIN ANALYZE` plan for the recursive CTE.
9. **Run the database verification manually.**
   ```bash
   docker compose exec -T postgres psql -U postgres -d transit_db -c "
     SELECT trip_id, seat_id, COUNT(*) AS duplicate_count
     FROM reservations
     WHERE booking_status IN ('CONFIRMED', 'REBOOKED')
     GROUP BY trip_id, seat_id
     HAVING COUNT(*) > 1;"
   ```
   It returns zero rows.
10. **Run the tests.**
    ```bash
    npm test
    ```
    Both suites pass, including the 50-worker contention test.

---

## 17. Presentation Script (about 9 minutes)

**0:00 - Problem framing.** "A single power failure can strand passengers several hops away. The hard problems are graph traversal, flexible incident ingestion, and safe reallocation of finite seats under concurrency."

**0:45 - Architecture.** "PostgreSQL owns normalized topology and transactions. MongoDB owns polymorphic incident documents. The Next.js API orchestrates both."

**1:30 - Normalization.** Show the ER diagram and the `seats -> carriages -> trains -> trips` hierarchy. Explain that line names and station names are never duplicated into trip rows, and that the active-seat partial unique index enforces the final business invariant.

**2:30 - Temporal model.** Show `timetable_stops`. "Scheduled time is the plan; actual time is reality; delays and versions track each revision; effective windows preserve timetable validity."

**3:30 - Recursive cascade.** Inject the Central Hub catenary preset. "The anchor is Trip 1 at Central. The recursive member walks downstream stops and transfer trips within 45 minutes. The path array prevents cycles. Depth is capped at 5. The result includes decayed delay and passenger counts."

**5:00 - NoSQL.** Open the raw MongoDB document. "SCADA, weather, and police incidents have different telemetry shapes. The common envelope is validated, while `raw_telemetry` stays flexible. The document is synchronized back to `APPLIED` after PostgreSQL commits."

**6:00 - Concurrency arena.** Run 50 workers. "Each worker begins a transaction, locks the original reservation, probes seats with `FOR UPDATE SKIP LOCKED`, re-checks after acquiring the lock, then updates and inserts atomically. Ten seats, ten winners, forty graceful waitlists, zero double bookings."

**7:30 - RBAC and RLS.** Switch to Passenger, then Auditor. "The database engine enforces roles with `SET LOCAL ROLE`; the passenger policy filters reservations by `app.current_passenger_id`. This is not UI-only authorization."

**8:30 - Tests and close.** "`npm test` proves the cascade logic and runs 50 real parallel rebooking transactions against a 10-seat fixture. The duplicate-seat query returns zero rows. The project demonstrates all seven rubric areas end to end."

---

## 18. Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| `npm run db:check` cannot connect | Confirm Docker Desktop is running and `docker compose ps` shows both services healthy. |
| Tables or functions are missing | Reinitialize volumes: `docker compose down -v && docker compose up -d`. |
| Port 5432 or 27017 already in use | Set `POSTGRES_PORT` / `MONGO_PORT` in `.env` and restart Compose. |
| Tests fail on connection | Tests are integration tests and require the seeded databases. Start Compose first. |
| Concurrency test reports fewer than 10 successes | Check for leftover test rows or changed seed data; the fixture is isolated, but the database must accept 50 concurrent connections. |
| Passenger endpoint returns zero rows | Supply the `X-Passenger-Id` header and ensure the RLS session variable is set by the API. |
| Permission error after switching roles | Verify `04_roles_rls.sql` was applied and the API connects as a member of the three roles. |

---

## 19. Design Boundaries

- Every database operation goes through a real connection pool; there is no in-memory fake concurrency.
- Rebooking always uses explicit `BEGIN ... COMMIT` blocks and pessimistic locks.
- Zero-overbooking is verified with a SQL query after every concurrency run.
- Foreign keys, check constraints, and normalization rules are never bypassed for convenience.
- Secrets and credentials are read from environment variables and are not hardcoded for production use.
