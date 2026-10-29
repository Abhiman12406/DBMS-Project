-- ============================================================================
-- Public Transport Disruption Dependency Engine
-- File: 04_roles_rls.sql
-- Description: RBAC Roles, Privileges, Grants & Row-Level Security (RLS)
-- Database: PostgreSQL 16
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CLEANUP & ROLE RE-CREATION
-- ----------------------------------------------------------------------------
-- Revoke existing permissions and drop roles cleanly if re-run
DO $$
BEGIN
    -- Drop roles if they exist
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'passenger_role') THEN
        DROP ROLE passenger_role;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'dispatcher_role') THEN
        DROP ROLE dispatcher_role;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'transit_admin') THEN
        DROP ROLE transit_admin;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. CREATE DATABASE PERSONA ROLES
-- ----------------------------------------------------------------------------
-- transit_admin: Full operational administrator with catalog and DDL control
CREATE ROLE transit_admin WITH 
    NOLOGIN 
    INHERIT;

-- dispatcher_role: Operations controller able to manage trips, delays, and rebookings
CREATE ROLE dispatcher_role WITH 
    NOLOGIN 
    INHERIT;

-- passenger_role: End-consumer restricted to public monitors and self-itinerary
CREATE ROLE passenger_role WITH 
    NOLOGIN 
    INHERIT;

-- Grant role membership to current admin (postgres) so session can SET ROLE dynamically
GRANT transit_admin TO CURRENT_USER;
GRANT dispatcher_role TO CURRENT_USER;
GRANT passenger_role TO CURRENT_USER;

-- ----------------------------------------------------------------------------
-- 3. SCHEMA-LEVEL USAGE PERMISSIONS
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO transit_admin;
GRANT USAGE ON SCHEMA public TO dispatcher_role;
GRANT USAGE ON SCHEMA public TO passenger_role;

-- ----------------------------------------------------------------------------
-- 4. TABLE & VIEW PERMISSION GRANTS
-- ----------------------------------------------------------------------------

-- A. transit_admin: ALL PRIVILEGES across tables, sequences, views, and functions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO transit_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO transit_admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO transit_admin;

-- B. dispatcher_role:
-- Can read transit topology (stations, lines, routes, connections, trains, carriages, seats)
GRANT SELECT ON TABLE 
    stations, 
    lines, 
    routes, 
    station_connections, 
    trains, 
    carriages, 
    seats 
TO dispatcher_role;

-- Can read and update operational tables (trips, timetable_stops, reservations)
GRANT SELECT, INSERT, UPDATE ON TABLE 
    trips, 
    timetable_stops, 
    reservations 
TO dispatcher_role;

-- Can read passenger identity directory (for contacting / identifying stranded travellers)
GRANT SELECT ON TABLE passengers TO dispatcher_role;

-- Can access operational and audit views
GRANT SELECT ON TABLE 
    v_live_trip_monitor, 
    v_station_hub_congestion, 
    v_passenger_rebooking_lineage, 
    v_station_schedule 
TO dispatcher_role;

-- Can execute operational cascade calculation and rebooking procedures
GRANT EXECUTE ON FUNCTION 
    fn_calculate_downstream_cascade(INT, INT, INT),
    fn_get_downstream_trips_summary(INT, INT, INT),
    fn_apply_trip_delay(INT, INT, INT, VARCHAR),
    fn_rebook_passenger_seat(INT, INT),
    fn_refresh_station_hub_congestion() 
TO dispatcher_role;

-- Sequence usage for inserting new reservations during rebookings
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dispatcher_role;

-- C. passenger_role:
-- Can only view public transit topology
GRANT SELECT ON TABLE 
    stations, 
    lines, 
    routes 
TO passenger_role;

-- Can view live departure boards and operational trip status
GRANT SELECT ON TABLE 
    v_live_trip_monitor, 
    v_station_schedule 
TO passenger_role;

-- Can query reservations table (strictly filtered via Row-Level Security)
GRANT SELECT ON TABLE reservations TO passenger_role;

-- Can view their own passenger profile
GRANT SELECT ON TABLE passengers TO passenger_role;

-- ----------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
-- Enable Row-Level Security on the reservations table
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations FORCE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS p_reservations_passenger_isolation ON reservations;
DROP POLICY IF EXISTS p_reservations_dispatcher_access ON reservations;
DROP POLICY IF EXISTS p_reservations_admin_access ON reservations;

-- Policy 1: Passenger Isolation
-- When connected under passenger_role, users can ONLY read reservations
-- matching session variable 'app.current_passenger_id'. If variable is unset, 0 rows returned.
CREATE POLICY p_reservations_passenger_isolation ON reservations
    FOR SELECT
    TO passenger_role
    USING (
        passenger_id = NULLIF(current_setting('app.current_passenger_id', true), '')::INT
    );

-- Policy 2: Dispatcher Full Access
-- Dispatchers can read, insert, and update all reservations across the entire fleet
CREATE POLICY p_reservations_dispatcher_access ON reservations
    FOR ALL
    TO dispatcher_role
    USING (TRUE)
    WITH CHECK (TRUE);

-- Policy 3: Administrator Full Access
CREATE POLICY p_reservations_admin_access ON reservations
    FOR ALL
    TO transit_admin
    USING (TRUE)
    WITH CHECK (TRUE);

-- Enable RLS on passengers table as well to prevent passengers from inspecting other travellers
ALTER TABLE passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE passengers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_passengers_isolation ON passengers;
DROP POLICY IF EXISTS p_passengers_dispatcher_access ON passengers;
DROP POLICY IF EXISTS p_passengers_admin_access ON passengers;

CREATE POLICY p_passengers_isolation ON passengers
    FOR SELECT
    TO passenger_role
    USING (
        passenger_id = NULLIF(current_setting('app.current_passenger_id', true), '')::INT
    );

CREATE POLICY p_passengers_dispatcher_access ON passengers
    FOR ALL
    TO dispatcher_role
    USING (TRUE)
    WITH CHECK (TRUE);

CREATE POLICY p_passengers_admin_access ON passengers
    FOR ALL
    TO transit_admin
    USING (TRUE)
    WITH CHECK (TRUE);

-- ----------------------------------------------------------------------------
-- 6. VERIFICATION COMMENTARY
-- ----------------------------------------------------------------------------
COMMENT ON ROLE transit_admin IS 'Unrestricted operational administrator role.';
COMMENT ON ROLE dispatcher_role IS 'Transit operations controller with rights to manage trips, timetables, and reassignments.';
COMMENT ON ROLE passenger_role IS 'Public traveller role restricted to public views and self-owned reservation records via RLS.';
COMMENT ON POLICY p_reservations_passenger_isolation ON reservations IS 'Enforces per-passenger isolation using session variable app.current_passenger_id.';
