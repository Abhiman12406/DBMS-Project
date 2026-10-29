-- ============================================================================
-- Public Transport Disruption Dependency Engine
-- File: 02_views.sql
-- Description: Operational Views, Materialized Congestion Hubs & Rebooking Lineage
-- Database: PostgreSQL 16
-- ============================================================================

-- Drop views if they already exist
DROP VIEW IF EXISTS v_passenger_rebooking_lineage CASCADE;
DROP VIEW IF EXISTS v_station_schedule CASCADE;
DROP VIEW IF EXISTS v_live_trip_monitor CASCADE;
DROP MATERIALIZED VIEW IF EXISTS v_station_hub_congestion CASCADE;

-- ----------------------------------------------------------------------------
-- 1. v_live_trip_monitor (Real-Time Transit Line & Trip Health Monitor)
-- ----------------------------------------------------------------------------
-- Aggregates real-time trip status, route corridor, timetable stop windows,
-- current delays, seat capacities, and active reservations.
CREATE OR REPLACE VIEW v_live_trip_monitor AS
SELECT 
    t.trip_id,
    t.service_date,
    t.status AS trip_status,
    l.line_id,
    l.code AS line_code,
    l.name AS line_name,
    l.color_hex,
    l.transit_type,
    r.route_id,
    r.direction,
    st_orig.station_id AS origin_station_id,
    st_orig.name AS origin_station_name,
    st_orig.code AS origin_station_code,
    st_dest.station_id AS destination_station_id,
    st_dest.name AS destination_station_name,
    st_dest.code AS destination_station_code,
    tr.train_id,
    tr.train_number,
    tr.model AS train_model,
    tr.total_capacity,
    COALESCE(stop_stats.total_stops, 0) AS total_stops,
    stop_stats.scheduled_start,
    stop_stats.scheduled_end,
    COALESCE(stop_stats.max_delay_arrival_min, 0) AS max_delay_arrival_min,
    COALESCE(stop_stats.max_delay_departure_min, 0) AS max_delay_departure_min,
    COALESCE(stop_stats.max_delay_min, 0) AS max_delay_min,
    COALESCE(res_stats.confirmed_reservations, 0) AS booked_seats,
    GREATEST(0, tr.total_capacity - COALESCE(res_stats.confirmed_reservations, 0)) AS available_seats
FROM trips t
JOIN routes r ON t.route_id = r.route_id
JOIN lines l ON r.line_id = l.line_id
JOIN stations st_orig ON r.origin_station_id = st_orig.station_id
JOIN stations st_dest ON r.destination_station_id = st_dest.station_id
JOIN trains tr ON t.train_id = tr.train_id
LEFT JOIN (
    SELECT 
        ts.trip_id,
        COUNT(*) AS total_stops,
        MIN(ts.scheduled_departure) AS scheduled_start,
        MAX(ts.scheduled_arrival) AS scheduled_end,
        MAX(ts.delay_arrival_min) AS max_delay_arrival_min,
        MAX(ts.delay_departure_min) AS max_delay_departure_min,
        MAX(GREATEST(ts.delay_arrival_min, ts.delay_departure_min)) AS max_delay_min
    FROM timetable_stops ts
    GROUP BY ts.trip_id
) stop_stats ON t.trip_id = stop_stats.trip_id
LEFT JOIN (
    SELECT 
        r.trip_id,
        COUNT(*) AS confirmed_reservations
    FROM reservations r
    WHERE r.booking_status IN ('CONFIRMED', 'REBOOKED')
    GROUP BY r.trip_id
) res_stats ON t.trip_id = res_stats.trip_id;

COMMENT ON VIEW v_live_trip_monitor IS 'Real-time operational view joining trips, route corridors, rolling stock, delays, and capacity.';

-- ----------------------------------------------------------------------------
-- 2. v_station_hub_congestion (Materialized View for Congestion & Passenger Density)
-- ----------------------------------------------------------------------------
-- Aggregates arrival/departure delays, platform count, hub classification, and
-- boardings/alightings to derive a real-time Station Congestion Score.
CREATE MATERIALIZED VIEW v_station_hub_congestion AS
SELECT 
    s.station_id,
    s.code AS station_code,
    s.name AS station_name,
    s.zone,
    s.platform_count,
    s.transfer_hub_flag,
    COUNT(DISTINCT ts.trip_id) AS scheduled_trips_count,
    COUNT(ts.stop_id) AS scheduled_stops_count,
    COUNT(CASE WHEN ts.delay_arrival_min > 0 OR ts.delay_departure_min > 0 THEN 1 END) AS delayed_stops_count,
    ROUND(COALESCE(AVG(ts.delay_arrival_min), 0), 2) AS avg_arrival_delay_min,
    COALESCE(MAX(ts.delay_arrival_min), 0) AS max_arrival_delay_min,
    COALESCE(traffic.origin_passenger_count, 0) AS boarding_passengers,
    COALESCE(traffic.dest_passenger_count, 0) AS alighting_passengers,
    ROUND(
        (COALESCE(AVG(ts.delay_arrival_min), 0) * 1.5) +
        (COUNT(CASE WHEN ts.delay_arrival_min > 5 THEN 1 END) * 2.0) +
        (CASE WHEN s.transfer_hub_flag THEN 5.0 ELSE 0.0 END) +
        (COALESCE(traffic.origin_passenger_count, 0) * 0.25)
    , 2) AS congestion_score,
    CURRENT_TIMESTAMP AS last_refreshed_at
FROM stations s
LEFT JOIN timetable_stops ts ON s.station_id = ts.station_id
LEFT JOIN (
    SELECT 
        s_inner.station_id,
        COUNT(DISTINCT CASE WHEN res.origin_station_id = s_inner.station_id THEN res.reservation_id END) AS origin_passenger_count,
        COUNT(DISTINCT CASE WHEN res.destination_station_id = s_inner.station_id THEN res.reservation_id END) AS dest_passenger_count
    FROM stations s_inner
    LEFT JOIN reservations res ON (res.origin_station_id = s_inner.station_id OR res.destination_station_id = s_inner.station_id)
        AND res.booking_status IN ('CONFIRMED', 'REBOOKED')
    GROUP BY s_inner.station_id
) traffic ON s.station_id = traffic.station_id
GROUP BY 
    s.station_id, s.code, s.name, s.zone, s.platform_count, s.transfer_hub_flag,
    traffic.origin_passenger_count, traffic.dest_passenger_count;

-- Create unique index to allow CONCURRENT refreshes
CREATE UNIQUE INDEX idx_v_station_hub_congestion_station_id 
    ON v_station_hub_congestion(station_id);

COMMENT ON MATERIALIZED VIEW v_station_hub_congestion IS 'Materialized aggregate view of station congestion, delays, and transfer density.';

-- Refresh helper procedure
CREATE OR REPLACE FUNCTION fn_refresh_station_hub_congestion()
RETURNS TIMESTAMPTZ AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY v_station_hub_congestion;
    RETURN CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_refresh_station_hub_congestion() IS 'Concurrent refresh procedure for v_station_hub_congestion.';

-- ----------------------------------------------------------------------------
-- 3. v_passenger_rebooking_lineage (Audit View for Reassigned Reservations)
-- ----------------------------------------------------------------------------
-- Shows the lineage from original disrupted bookings to new replacement seats.
CREATE OR REPLACE VIEW v_passenger_rebooking_lineage AS
SELECT 
    p.passenger_id,
    p.full_name AS passenger_name,
    p.email AS passenger_email,
    -- Original reservation info
    orig_res.reservation_id AS original_reservation_id,
    orig_res.trip_id AS original_trip_id,
    orig_tr.train_number AS original_train_number,
    orig_l.name AS original_line_name,
    orig_s.seat_number AS original_seat_number,
    orig_res.booking_status AS original_booking_status,
    orig_res.created_at AS original_booked_at,
    -- Replacement reservation info
    new_res.reservation_id AS replacement_reservation_id,
    new_res.trip_id AS replacement_trip_id,
    new_tr.train_number AS replacement_train_number,
    new_l.name AS replacement_line_name,
    new_s.seat_number AS replacement_seat_number,
    new_res.booking_status AS replacement_booking_status,
    new_res.created_at AS rebooked_at,
    -- Journey details
    st_orig.name AS journey_origin,
    st_dest.name AS journey_destination
FROM reservations orig_res
JOIN passengers p ON orig_res.passenger_id = p.passenger_id
JOIN trips orig_t ON orig_res.trip_id = orig_t.trip_id
JOIN routes orig_r ON orig_t.route_id = orig_r.route_id
JOIN lines orig_l ON orig_r.line_id = orig_l.line_id
JOIN trains orig_tr ON orig_t.train_id = orig_tr.train_id
JOIN seats orig_s ON orig_res.seat_id = orig_s.seat_id
JOIN stations st_orig ON orig_res.origin_station_id = st_orig.station_id
JOIN stations st_dest ON orig_res.destination_station_id = st_dest.station_id
LEFT JOIN reservations new_res ON new_res.reassigned_from_reservation_id = orig_res.reservation_id
LEFT JOIN trips new_t ON new_res.trip_id = new_t.trip_id
LEFT JOIN routes new_r ON new_t.route_id = new_r.route_id
LEFT JOIN lines new_l ON new_r.line_id = new_l.line_id
LEFT JOIN trains new_tr ON new_t.train_id = new_tr.train_id
LEFT JOIN seats new_s ON new_res.seat_id = new_s.seat_id
WHERE orig_res.booking_status IN ('DISRUPTED', 'REBOOKED') OR new_res.reservation_id IS NOT NULL;

COMMENT ON VIEW v_passenger_rebooking_lineage IS 'Lineage tracking linking original disrupted bookings to rebooked alternate seats.';

-- ----------------------------------------------------------------------------
-- 4. v_station_schedule (Live Station Departure and Arrival Board)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_station_schedule AS
SELECT 
    ts.stop_id,
    s.station_id,
    s.code AS station_code,
    s.name AS station_name,
    t.trip_id,
    t.status AS trip_status,
    l.code AS line_code,
    l.name AS line_name,
    l.color_hex,
    tr.train_number,
    r.direction,
    st_dest.name AS destination_name,
    ts.stop_sequence,
    ts.scheduled_arrival,
    ts.scheduled_departure,
    ts.actual_arrival,
    ts.actual_departure,
    ts.delay_arrival_min,
    ts.delay_departure_min,
    (ts.scheduled_departure + (ts.delay_departure_min || ' minutes')::INTERVAL) AS estimated_departure
FROM timetable_stops ts
JOIN stations s ON ts.station_id = s.station_id
JOIN trips t ON ts.trip_id = t.trip_id
JOIN routes r ON t.route_id = r.route_id
JOIN lines l ON r.line_id = l.line_id
JOIN trains tr ON t.train_id = tr.train_id
JOIN stations st_dest ON r.destination_station_id = st_dest.station_id;

COMMENT ON VIEW v_station_schedule IS 'Departure and arrival schedule board per station.';
