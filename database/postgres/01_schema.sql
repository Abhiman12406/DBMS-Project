-- ============================================================================
-- Public Transport Disruption Dependency Engine
-- File: 01_schema.sql
-- Description: 3NF Normalized Schema, Temporal Timetable Tracking & Constraints
-- Database: PostgreSQL 16
-- ============================================================================

-- Drop existing tables in reverse dependency order
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS passengers CASCADE;
DROP TABLE IF EXISTS timetable_stops CASCADE;
DROP TABLE IF EXISTS trips CASCADE;
DROP TABLE IF EXISTS seats CASCADE;
DROP TABLE IF EXISTS carriages CASCADE;
DROP TABLE IF EXISTS trains CASCADE;
DROP TABLE IF EXISTS station_connections CASCADE;
DROP TABLE IF EXISTS routes CASCADE;
DROP TABLE IF EXISTS lines CASCADE;
DROP TABLE IF EXISTS stations CASCADE;

-- ----------------------------------------------------------------------------
-- 1. STATIONS (Normalized 3NF Station Topology)
-- ----------------------------------------------------------------------------
CREATE TABLE stations (
    station_id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    zone INT NOT NULL DEFAULT 1 CHECK (zone > 0),
    platform_count INT NOT NULL DEFAULT 2 CHECK (platform_count > 0),
    transfer_hub_flag BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE stations IS 'Transit passenger stations with topological attributes and hub designations.';

-- ----------------------------------------------------------------------------
-- 2. LINES (Transit Service Lines)
-- ----------------------------------------------------------------------------
CREATE TABLE lines (
    line_id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    color_hex VARCHAR(7) NOT NULL CHECK (color_hex ~* '^#[0-9A-Fa-f]{6}$'),
    transit_type VARCHAR(30) NOT NULL CHECK (transit_type IN ('METRO', 'REGIONAL_RAIL', 'HIGH_SPEED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE lines IS 'Categorized transit lines with UI visualization color codes and transit types.';

-- ----------------------------------------------------------------------------
-- 3. ROUTES (Directed line journeys connecting origin and destination hubs)
-- ----------------------------------------------------------------------------
CREATE TABLE routes (
    route_id SERIAL PRIMARY KEY,
    line_id INT NOT NULL REFERENCES lines(line_id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('NORTHBOUND', 'SOUTHBOUND', 'EASTBOUND', 'WESTBOUND', 'INBOUND', 'OUTBOUND')),
    origin_station_id INT NOT NULL REFERENCES stations(station_id) ON DELETE RESTRICT,
    destination_station_id INT NOT NULL REFERENCES stations(station_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_route_stations_distinct CHECK (origin_station_id <> destination_station_id)
);

COMMENT ON TABLE routes IS 'Service route corridors for scheduled trips along a designated line.';

-- ----------------------------------------------------------------------------
-- 4. STATION CONNECTIONS (Topological Graph Adjacency with track distance/travel time)
-- ----------------------------------------------------------------------------
CREATE TABLE station_connections (
    connection_id SERIAL PRIMARY KEY,
    from_station_id INT NOT NULL REFERENCES stations(station_id) ON DELETE CASCADE,
    to_station_id INT NOT NULL REFERENCES stations(station_id) ON DELETE CASCADE,
    distance_km NUMERIC(5,2) NOT NULL CHECK (distance_km > 0),
    nominal_duration_min INT NOT NULL CHECK (nominal_duration_min > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_station_connection UNIQUE(from_station_id, to_station_id),
    CONSTRAINT chk_connection_stations_distinct CHECK (from_station_id <> to_station_id)
);

COMMENT ON TABLE station_connections IS 'Physical track segments and scheduled travel times between adjacent stations.';

-- ----------------------------------------------------------------------------
-- 5. TRAINS (Rolling stock inventory)
-- ----------------------------------------------------------------------------
CREATE TABLE trains (
    train_id SERIAL PRIMARY KEY,
    train_number VARCHAR(30) NOT NULL UNIQUE,
    model VARCHAR(50) NOT NULL,
    total_capacity INT NOT NULL CHECK (total_capacity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE trains IS 'Locomotive and train-set units serving network routes.';

-- ----------------------------------------------------------------------------
-- 6. CARRIAGES (Individual train coaches)
-- ----------------------------------------------------------------------------
CREATE TABLE carriages (
    carriage_id SERIAL PRIMARY KEY,
    train_id INT NOT NULL REFERENCES trains(train_id) ON DELETE CASCADE,
    carriage_number INT NOT NULL CHECK (carriage_number > 0),
    class_type VARCHAR(20) NOT NULL DEFAULT 'STANDARD' CHECK (class_type IN ('STANDARD', 'FIRST_CLASS', 'QUIET')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_train_carriage UNIQUE(train_id, carriage_number)
);

COMMENT ON TABLE carriages IS 'Individual train passenger cars linked to rolling stock.';

-- ----------------------------------------------------------------------------
-- 7. SEATS (Individual bookable passenger units)
-- ----------------------------------------------------------------------------
CREATE TABLE seats (
    seat_id SERIAL PRIMARY KEY,
    carriage_id INT NOT NULL REFERENCES carriages(carriage_id) ON DELETE CASCADE,
    seat_number VARCHAR(10) NOT NULL,
    seat_type VARCHAR(20) NOT NULL DEFAULT 'WINDOW' CHECK (seat_type IN ('WINDOW', 'AISLE', 'MIDDLE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_carriage_seat UNIQUE(carriage_id, seat_number)
);

COMMENT ON TABLE seats IS 'Physical seats used in ACID pessimistic locking and rebooking allocations.';

-- ----------------------------------------------------------------------------
-- 8. TRIPS (Scheduled train runs on a specific service date)
-- ----------------------------------------------------------------------------
CREATE TABLE trips (
    trip_id SERIAL PRIMARY KEY,
    route_id INT NOT NULL REFERENCES routes(route_id) ON DELETE RESTRICT,
    train_id INT NOT NULL REFERENCES trains(train_id) ON DELETE RESTRICT,
    service_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'ON_TIME', 'DELAYED', 'CANCELLED', 'REROUTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE trips IS 'Operational train trip instances executing route timetables.';

-- ----------------------------------------------------------------------------
-- 9. TIMETABLE STOPS (Temporal timetable tracking with valid-time windows)
-- ----------------------------------------------------------------------------
CREATE TABLE timetable_stops (
    stop_id SERIAL PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES trips(trip_id) ON DELETE CASCADE,
    station_id INT NOT NULL REFERENCES stations(station_id) ON DELETE RESTRICT,
    stop_sequence INT NOT NULL CHECK (stop_sequence > 0),
    scheduled_arrival TIMESTAMPTZ NOT NULL,
    scheduled_departure TIMESTAMPTZ NOT NULL,
    actual_arrival TIMESTAMPTZ,
    actual_departure TIMESTAMPTZ,
    delay_arrival_min INT NOT NULL DEFAULT 0 CHECK (delay_arrival_min >= 0),
    delay_departure_min INT NOT NULL DEFAULT 0 CHECK (delay_departure_min >= 0),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    effective_to TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59Z',
    version INT NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_trip_stop_sequence UNIQUE(trip_id, stop_sequence),
    CONSTRAINT chk_scheduled_order CHECK (scheduled_departure >= scheduled_arrival),
    CONSTRAINT chk_effective_window CHECK (effective_to > effective_from)
);

COMMENT ON TABLE timetable_stops IS 'Temporal timetable records tracking scheduled vs actual arrival/departure and versions.';

-- ----------------------------------------------------------------------------
-- 10. PASSENGERS (Customer identity directory)
-- ----------------------------------------------------------------------------
CREATE TABLE passengers (
    passenger_id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(30),
    db_user_role VARCHAR(30) NOT NULL DEFAULT 'passenger',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE passengers IS 'Registered transit passengers for itineraries and RLS security testing.';

-- ----------------------------------------------------------------------------
-- 11. RESERVATIONS (Passenger seat bookings, disruptions & rebooking lineage)
-- ----------------------------------------------------------------------------
CREATE TABLE reservations (
    reservation_id SERIAL PRIMARY KEY,
    passenger_id INT NOT NULL REFERENCES passengers(passenger_id) ON DELETE RESTRICT,
    trip_id INT NOT NULL REFERENCES trips(trip_id) ON DELETE RESTRICT,
    seat_id INT NOT NULL REFERENCES seats(seat_id) ON DELETE RESTRICT,
    origin_station_id INT NOT NULL REFERENCES stations(station_id) ON DELETE RESTRICT,
    destination_station_id INT NOT NULL REFERENCES stations(station_id) ON DELETE RESTRICT,
    booking_status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED' CHECK (booking_status IN ('CONFIRMED', 'DISRUPTED', 'REBOOKED', 'REFUNDED')),
    reassigned_from_reservation_id INT REFERENCES reservations(reservation_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_reservation_stations_distinct CHECK (origin_station_id <> destination_station_id)
);

COMMENT ON TABLE reservations IS 'Seat booking records supporting pessimistic lock reallocations and lineage tracking.';

-- ----------------------------------------------------------------------------
-- INDEXES (Performance optimization for FKs, cascades, and concurrency searches)
-- ----------------------------------------------------------------------------
-- Routes & Connections
CREATE INDEX idx_routes_line_id ON routes(line_id);
CREATE INDEX idx_routes_origin ON routes(origin_station_id);
CREATE INDEX idx_routes_destination ON routes(destination_station_id);
CREATE INDEX idx_station_connections_from ON station_connections(from_station_id);
CREATE INDEX idx_station_connections_to ON station_connections(to_station_id);

-- Rolling Stock & Seats
CREATE INDEX idx_carriages_train_id ON carriages(train_id);
CREATE INDEX idx_seats_carriage_id ON seats(carriage_id);

-- Trips
CREATE INDEX idx_trips_route_id ON trips(route_id);
CREATE INDEX idx_trips_train_id ON trips(train_id);
CREATE INDEX idx_trips_date_status ON trips(service_date, status);

-- Timetable Stops (Critical for Recursive Cascade & Transfer Lookup)
CREATE INDEX idx_timetable_stops_trip_id ON timetable_stops(trip_id);
CREATE INDEX idx_timetable_stops_station_id ON timetable_stops(station_id);
CREATE INDEX idx_timetable_stops_trip_station ON timetable_stops(trip_id, station_id);
CREATE INDEX idx_timetable_stops_station_scheduled_dep ON timetable_stops(station_id, scheduled_departure);
CREATE INDEX idx_timetable_stops_station_scheduled_arr ON timetable_stops(station_id, scheduled_arrival);

-- Reservations (Critical for Pessimistic Locking & Overbooking Audits)
CREATE INDEX idx_reservations_trip_seat ON reservations(trip_id, seat_id);
-- Database-level guarantee: an active reservation may occupy a seat only once per trip.
CREATE UNIQUE INDEX uq_reservations_active_seat
    ON reservations(trip_id, seat_id)
    WHERE booking_status IN ('CONFIRMED', 'REBOOKED');
CREATE INDEX idx_reservations_passenger_id ON reservations(passenger_id);
CREATE INDEX idx_reservations_booking_status ON reservations(booking_status);
CREATE INDEX idx_reservations_reassigned_from ON reservations(reassigned_from_reservation_id);
