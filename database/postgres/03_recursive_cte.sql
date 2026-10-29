-- ============================================================================
-- Public Transport Disruption Dependency Engine
-- File: 03_recursive_cte.sql
-- Description: Recursive CTE Downstream Delay Cascade & ACID Rebooking Logic
-- Database: PostgreSQL 16
-- ============================================================================

-- Drop existing functions
DROP FUNCTION IF EXISTS fn_rebook_passenger_seat(INT, INT);
DROP FUNCTION IF EXISTS fn_apply_trip_delay(INT, INT, INT, VARCHAR);
DROP FUNCTION IF EXISTS fn_get_downstream_trips_summary(INT, INT, INT);
DROP FUNCTION IF EXISTS fn_calculate_downstream_cascade(INT, INT, INT);

-- ----------------------------------------------------------------------------
-- 1. fn_calculate_downstream_cascade
-- ----------------------------------------------------------------------------
-- Recursively computes cascading network delays starting at a disrupted trip
-- and station. Propagates along the same trip (downstream stops) and across
-- connecting trips sharing stations within a 45-minute departure horizon.
-- Uses array path tracking to detect and avoid topological cycles.
CREATE OR REPLACE FUNCTION fn_calculate_downstream_cascade(
    p_trip_id INT,
    p_station_id INT,
    p_delay_min INT
)
RETURNS TABLE (
    trip_id INT,
    route_id INT,
    line_name VARCHAR,
    line_code VARCHAR,
    color_hex VARCHAR,
    train_number VARCHAR,
    station_id INT,
    station_name VARCHAR,
    station_code VARCHAR,
    stop_sequence INT,
    scheduled_arrival TIMESTAMPTZ,
    scheduled_departure TIMESTAMPTZ,
    estimated_arrival TIMESTAMPTZ,
    estimated_departure TIMESTAMPTZ,
    propagated_delay_min INT,
    cascade_depth INT,
    impact_type VARCHAR,
    trip_path INT[],
    affected_passengers_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE downstream_cascade AS (
        -- Anchor member: directly disrupted trip at the incident station
        SELECT 
            ts.trip_id,
            t.route_id,
            ts.station_id,
            ts.stop_sequence,
            ts.scheduled_arrival,
            ts.scheduled_departure,
            p_delay_min AS propagated_delay,
            1 AS cascade_depth,
            ARRAY[ts.trip_id] AS trip_path,
            'DIRECT_DISRUPTION'::VARCHAR AS impact_type
        FROM timetable_stops ts
        JOIN trips t ON ts.trip_id = t.trip_id
        WHERE ts.trip_id = p_trip_id AND ts.station_id = p_station_id
        
        UNION ALL
        
        -- Recursive member: downstream stops on current trip OR connecting transfer trips
        SELECT 
            next_ts.trip_id,
            next_t.route_id,
            next_ts.station_id,
            next_ts.stop_sequence,
            next_ts.scheduled_arrival,
            next_ts.scheduled_departure,
            CASE 
                WHEN next_ts.trip_id = curr.trip_id THEN curr.propagated_delay
                ELSE GREATEST(0, (curr.propagated_delay - ROUND(EXTRACT(EPOCH FROM (next_ts.scheduled_departure - curr_ts.scheduled_arrival))/60))::INT)
            END AS propagated_delay,
            curr.cascade_depth + 1,
            CASE 
                WHEN next_ts.trip_id = curr.trip_id THEN curr.trip_path
                ELSE curr.trip_path || next_ts.trip_id
            END AS trip_path,
            CASE 
                WHEN next_ts.trip_id = curr.trip_id THEN 'DOWNSTREAM_STOP'::VARCHAR
                ELSE 'TRANSFER_CONNECTION'::VARCHAR
            END AS impact_type
        FROM downstream_cascade curr
        JOIN timetable_stops curr_ts 
            ON curr.trip_id = curr_ts.trip_id AND curr.station_id = curr_ts.station_id
        JOIN timetable_stops next_ts 
            ON (
                -- 1. Next stop along the same trip
                (next_ts.trip_id = curr.trip_id AND next_ts.stop_sequence = curr.stop_sequence + 1)
                OR
                -- 2. Connecting trips at the current station departing in the impact window
                (next_ts.station_id = curr.station_id 
                 AND next_ts.trip_id != curr.trip_id
                 AND next_ts.scheduled_departure > curr_ts.scheduled_arrival
                 AND next_ts.scheduled_departure <= curr_ts.scheduled_arrival + INTERVAL '45 minutes')
            )
        JOIN trips next_t ON next_ts.trip_id = next_t.trip_id
        WHERE curr.cascade_depth < 5
          AND (
              (next_ts.trip_id = curr.trip_id AND curr.propagated_delay > 0)
              OR
              (
                  next_ts.trip_id != curr.trip_id
                  AND NOT (next_ts.trip_id = ANY(curr.trip_path))
                  AND (curr.propagated_delay - ROUND(EXTRACT(EPOCH FROM (next_ts.scheduled_departure - curr_ts.scheduled_arrival))/60)) >= 10
              )
          )
    ),
    deduped_cascade AS (
        SELECT DISTINCT ON (c.trip_id, c.station_id, c.stop_sequence)
            c.trip_id,
            c.route_id,
            c.station_id,
            c.stop_sequence,
            c.scheduled_arrival,
            c.scheduled_departure,
            c.propagated_delay AS max_propagated_delay,
            c.cascade_depth AS min_cascade_depth,
            c.impact_type AS resolved_impact_type,
            c.trip_path AS resolved_trip_path
        FROM downstream_cascade c
        ORDER BY c.trip_id, c.station_id, c.stop_sequence, c.cascade_depth ASC, c.propagated_delay DESC
    )
    SELECT 
        dc.trip_id,
        dc.route_id,
        l.name::VARCHAR AS line_name,
        l.code::VARCHAR AS line_code,
        l.color_hex::VARCHAR AS color_hex,
        tr.train_number::VARCHAR AS train_number,
        dc.station_id,
        s.name::VARCHAR AS station_name,
        s.code::VARCHAR AS station_code,
        dc.stop_sequence,
        dc.scheduled_arrival,
        dc.scheduled_departure,
        (dc.scheduled_arrival + (dc.max_propagated_delay || ' minutes')::INTERVAL) AS estimated_arrival,
        (dc.scheduled_departure + (dc.max_propagated_delay || ' minutes')::INTERVAL) AS estimated_departure,
        dc.max_propagated_delay AS propagated_delay_min,
        dc.min_cascade_depth AS cascade_depth,
        dc.resolved_impact_type::VARCHAR AS impact_type,
        dc.resolved_trip_path AS trip_path,
        COALESCE(res.passenger_count, 0)::BIGINT AS affected_passengers_count
    FROM deduped_cascade dc
    JOIN routes r ON dc.route_id = r.route_id
    JOIN lines l ON r.line_id = l.line_id
    JOIN trips t ON dc.trip_id = t.trip_id
    JOIN trains tr ON t.train_id = tr.train_id
    JOIN stations s ON dc.station_id = s.station_id
    LEFT JOIN (
        SELECT 
            r_in.trip_id, 
            COUNT(DISTINCT r_in.reservation_id) AS passenger_count
        FROM reservations r_in
        WHERE r_in.booking_status IN ('CONFIRMED', 'REBOOKED', 'DISRUPTED')
        GROUP BY r_in.trip_id
    ) res ON dc.trip_id = res.trip_id
    ORDER BY dc.min_cascade_depth ASC, dc.max_propagated_delay DESC, dc.trip_id ASC, dc.stop_sequence ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_calculate_downstream_cascade(INT, INT, INT) 
IS 'Recursive CTE function calculating downstream ripple delays and affected passenger counts.';

-- ----------------------------------------------------------------------------
-- 2. fn_get_downstream_trips_summary
-- ----------------------------------------------------------------------------
-- Consolidated trip-level summary of the cascade for API and UI card display.
CREATE OR REPLACE FUNCTION fn_get_downstream_trips_summary(
    p_trip_id INT,
    p_station_id INT,
    p_delay_min INT
)
RETURNS TABLE (
    trip_id INT,
    line_name VARCHAR,
    color_hex VARCHAR,
    train_number VARCHAR,
    direction VARCHAR,
    origin_station VARCHAR,
    destination_station VARCHAR,
    max_delay_min INT,
    min_cascade_depth INT,
    impact_type VARCHAR,
    affected_stops_count BIGINT,
    affected_passengers_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH cascade_data AS (
        SELECT * FROM fn_calculate_downstream_cascade(p_trip_id, p_station_id, p_delay_min)
    )
    SELECT 
        c.trip_id,
        c.line_name,
        c.color_hex,
        c.train_number,
        r.direction::VARCHAR,
        st_orig.name::VARCHAR AS origin_station,
        st_dest.name::VARCHAR AS destination_station,
        MAX(c.propagated_delay_min)::INT AS max_delay_min,
        MIN(c.cascade_depth)::INT AS min_cascade_depth,
        MIN(c.impact_type)::VARCHAR AS impact_type,
        COUNT(c.stop_sequence)::BIGINT AS affected_stops_count,
        MAX(c.affected_passengers_count)::BIGINT AS affected_passengers_count
    FROM cascade_data c
    JOIN routes r ON c.route_id = r.route_id
    JOIN stations st_orig ON r.origin_station_id = st_orig.station_id
    JOIN stations st_dest ON r.destination_station_id = st_dest.station_id
    GROUP BY c.trip_id, c.line_name, c.color_hex, c.train_number, r.direction, st_orig.name, st_dest.name
    ORDER BY min_cascade_depth ASC, max_delay_min DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_get_downstream_trips_summary(INT, INT, INT)
IS 'Consolidated trip-level summary of cascade impact for UI dashboards.';

-- ----------------------------------------------------------------------------
-- 3. fn_apply_trip_delay
-- ----------------------------------------------------------------------------
-- Applies an operational disruption directly to the database:
-- - Adjusts timetable_stops delays from the incident station onward.
-- - Increments timetable version.
-- - Updates trip status (DELAYED or CANCELLED).
-- - Refreshes the station congestion materialized view.
CREATE OR REPLACE FUNCTION fn_apply_trip_delay(
    p_trip_id INT,
    p_station_id INT,
    p_delay_min INT,
    p_reason VARCHAR DEFAULT 'OPERATIONAL_DISRUPTION'
)
RETURNS TABLE (
    trip_id INT,
    updated_stops_count INT,
    new_trip_status VARCHAR,
    affected_passengers INT,
    refreshed_at TIMESTAMPTZ
) AS $$
DECLARE
    v_target_seq INT;
    v_updated_count INT;
    v_new_status VARCHAR;
    v_affected_pax INT;
    v_refreshed_time TIMESTAMPTZ;
BEGIN
    -- Determine sequence number of the incident station on this trip
    SELECT stop_sequence INTO v_target_seq
    FROM timetable_stops
    WHERE timetable_stops.trip_id = p_trip_id AND timetable_stops.station_id = p_station_id;

    IF v_target_seq IS NULL THEN
        RAISE EXCEPTION 'Station % is not part of trip %', p_station_id, p_trip_id;
    END IF;

    -- Update timetable stops from this stop sequence onward
    UPDATE timetable_stops ts
    SET 
        delay_arrival_min = ts.delay_arrival_min + p_delay_min,
        delay_departure_min = ts.delay_departure_min + p_delay_min,
        actual_arrival = ts.scheduled_arrival + ((ts.delay_arrival_min + p_delay_min) || ' minutes')::INTERVAL,
        actual_departure = ts.scheduled_departure + ((ts.delay_departure_min + p_delay_min) || ' minutes')::INTERVAL,
        version = ts.version + 1,
        effective_from = CURRENT_TIMESTAMP
    WHERE ts.trip_id = p_trip_id AND ts.stop_sequence >= v_target_seq;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Determine new status based on severity of delay
    IF p_delay_min >= 120 THEN
        v_new_status := 'CANCELLED';
    ELSE
        v_new_status := 'DELAYED';
    END IF;

    UPDATE trips
    SET status = v_new_status
    WHERE trips.trip_id = p_trip_id;

    -- Count active passenger reservations on this trip
    SELECT COUNT(*) INTO v_affected_pax
    FROM reservations r
    WHERE r.trip_id = p_trip_id AND r.booking_status IN ('CONFIRMED', 'REBOOKED');

    -- If cancelled or severely delayed, mark confirmed reservations as DISRUPTED
    IF v_new_status = 'CANCELLED' OR p_delay_min >= 60 THEN
        UPDATE reservations
        SET booking_status = 'DISRUPTED', updated_at = CURRENT_TIMESTAMP
        WHERE reservations.trip_id = p_trip_id AND reservations.booking_status = 'CONFIRMED';
    END IF;

    -- Refresh station congestion materialized view
    v_refreshed_time := fn_refresh_station_hub_congestion();

    RETURN QUERY SELECT 
        p_trip_id, 
        v_updated_count, 
        v_new_status, 
        v_affected_pax, 
        v_refreshed_time;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_apply_trip_delay(INT, INT, INT, VARCHAR)
IS 'Applies disruption delay to timetable stops, updates trip status, flags bookings, and refreshes views.';

-- ----------------------------------------------------------------------------
-- 4. fn_rebook_passenger_seat (ACID Pessimistic Lock Rebooking)
-- ----------------------------------------------------------------------------
-- Implements row-level pessimistic locking using SELECT ... FOR UPDATE SKIP LOCKED.
-- Locks exactly 1 available seat on the target trip, marks the old reservation
-- as REBOOKED, and creates the new replacement reservation in an atomic transaction.
CREATE OR REPLACE FUNCTION fn_rebook_passenger_seat(
    p_original_reservation_id INT,
    p_target_trip_id INT
)
RETURNS TABLE (
    success BOOLEAN,
    original_reservation_id INT,
    new_reservation_id INT,
    passenger_id INT,
    target_trip_id INT,
    allocated_seat_id INT,
    seat_number VARCHAR,
    carriage_number INT,
    message VARCHAR
) AS $$
DECLARE
    v_passenger_id INT;
    v_orig_status VARCHAR;
    v_origin_stn INT;
    v_dest_stn INT;
    v_target_seat_id INT;
    v_seat_num VARCHAR;
    v_carriage_num INT;
    v_new_res_id INT;
BEGIN
    -- 1. Verify original reservation exists
    SELECT 
        r.passenger_id, r.booking_status, r.origin_station_id, r.destination_station_id
    INTO 
        v_passenger_id, v_orig_status, v_origin_stn, v_dest_stn
    FROM reservations r
    WHERE r.reservation_id = p_original_reservation_id
    FOR UPDATE; -- Lock original reservation row to prevent concurrent double-rebook

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, p_original_reservation_id, NULL::INT, NULL::INT, p_target_trip_id, NULL::INT, NULL::VARCHAR, NULL::INT, 'Original reservation not found'::VARCHAR;
        RETURN;
    END IF;

    IF v_orig_status NOT IN ('CONFIRMED', 'DISRUPTED') THEN
        RETURN QUERY SELECT FALSE, p_original_reservation_id, NULL::INT, v_passenger_id, p_target_trip_id, NULL::INT, NULL::VARCHAR, NULL::INT, ('Reservation status is already ' || v_orig_status)::VARCHAR;
        RETURN;
    END IF;

    -- 2. Concurrency Core: identify and lock an available seat on the target trip.
    -- The seat row lock serialises competing workers. The NOT EXISTS predicate can
    -- be evaluated against a snapshot taken before a competitor committed, so each
    -- candidate is re-checked with a fresh statement after its row lock is held.
    LOOP
        v_target_seat_id := NULL;
        v_seat_num := NULL;
        v_carriage_num := NULL;

        SELECT 
            s.seat_id, s.seat_number, c.carriage_number
        INTO 
            v_target_seat_id, v_seat_num, v_carriage_num
        FROM seats s
        JOIN carriages c ON s.carriage_id = c.carriage_id
        JOIN trains tr ON c.train_id = tr.train_id
        JOIN trips t ON tr.train_id = t.train_id
        WHERE t.trip_id = p_target_trip_id
          AND NOT EXISTS (
              SELECT 1 
              FROM reservations res 
              WHERE res.trip_id = p_target_trip_id 
                AND res.seat_id = s.seat_id 
                AND res.booking_status IN ('CONFIRMED', 'REBOOKED')
          )
        ORDER BY s.seat_id ASC
        FOR UPDATE OF s SKIP LOCKED
        LIMIT 1;

        EXIT WHEN v_target_seat_id IS NULL;

        -- Re-check under a fresh snapshot now that the row lock is held.
        IF NOT EXISTS (
            SELECT 1
            FROM reservations res
            WHERE res.trip_id = p_target_trip_id
              AND res.seat_id = v_target_seat_id
              AND res.booking_status IN ('CONFIRMED', 'REBOOKED')
        ) THEN
            EXIT;
        END IF;

        -- The candidate was committed by a competitor while we waited; try the
        -- next free seat instead of allocating an occupied one.
    END LOOP;

    -- If no seats are left on the alternate trip
    IF v_target_seat_id IS NULL THEN
        RETURN QUERY SELECT FALSE, p_original_reservation_id, NULL::INT, v_passenger_id, p_target_trip_id, NULL::INT, NULL::VARCHAR, NULL::INT, 'No seats available on alternate trip'::VARCHAR;
        RETURN;
    END IF;

    -- 3. Update original reservation status to REBOOKED
    UPDATE reservations
    SET booking_status = 'REBOOKED', updated_at = CURRENT_TIMESTAMP
    WHERE reservations.reservation_id = p_original_reservation_id;

    -- 4. Insert new replacement reservation linked to original via lineage FK
    INSERT INTO reservations (
        passenger_id,
        trip_id,
        seat_id,
        origin_station_id,
        destination_station_id,
        booking_status,
        reassigned_from_reservation_id,
        created_at,
        updated_at
    ) VALUES (
        v_passenger_id,
        p_target_trip_id,
        v_target_seat_id,
        v_origin_stn,
        v_dest_stn,
        'CONFIRMED',
        p_original_reservation_id,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
    RETURNING reservations.reservation_id INTO v_new_res_id;

    RETURN QUERY SELECT 
        TRUE,
        p_original_reservation_id,
        v_new_res_id,
        v_passenger_id,
        p_target_trip_id,
        v_target_seat_id,
        v_seat_num,
        v_carriage_num,
        'Seat successfully allocated under ACID lock'::VARCHAR;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_rebook_passenger_seat(INT, INT)
IS 'ACID-safe rebooking procedure using FOR UPDATE SKIP LOCKED to prevent overbooking.';
