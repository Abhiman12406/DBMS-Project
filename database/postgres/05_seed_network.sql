-- ============================================================================
-- Public Transport Disruption Dependency Engine
-- File: 05_seed_network.sql
-- Description: Comprehensive Seed Data: 15 Stations, 4 Lines, 8 Routes,
--              Physical Connections, 6 Trains, 12 Carriages, 120 Seats,
--              24 Scheduled Trips, Timetable Stops, 40 Passengers & Bookings
-- Database: PostgreSQL 16
-- ============================================================================

-- Clean existing data to ensure idempotent seeding
TRUNCATE TABLE reservations, passengers, timetable_stops, trips, seats, 
               carriages, trains, station_connections, routes, lines, stations 
RESTART IDENTITY CASCADE;

-- ----------------------------------------------------------------------------
-- 1. SEED STATIONS (15 Stations across 3 Zones with Central Hub)
-- ----------------------------------------------------------------------------
INSERT INTO stations (station_id, code, name, zone, platform_count, transfer_hub_flag) VALUES
-- Red Line Stations (North to South)
(1,  'STN_NORTH',   'North Terminal',        1, 4,  FALSE),
(2,  'STN_GRAND',   'Grand Avenue',          1, 2,  FALSE),
(3,  'STN_CENTRAL', 'Central Station',       1, 10, TRUE),   -- Master intersecting hub for all 4 lines
(4,  'STN_FINANCE', 'Financial District',    1, 4,  FALSE),
(5,  'STN_SOUTH',   'South Station',         2, 4,  TRUE),   -- Southern transfer interchange
-- Blue Line Stations (West to East)
(6,  'STN_WEST',    'West End Pier',         2, 2,  FALSE),
(7,  'STN_RIVER',   'Riverfront Crossing',   1, 4,  FALSE),
-- STN_CENTRAL (3) is the middle connection
(8,  'STN_HARBOR',  'East Harbor',           1, 4,  FALSE),
(9,  'STN_COAST',   'Coastal Point',         2, 2,  FALSE),
-- Green Line Stations (Northwest to Southeast)
(10, 'STN_UNIV',    'University Hills',      2, 2,  FALSE),
(11, 'STN_TECH',    'Tech Park Innovation',  2, 4,  TRUE),   -- Secondary tech corridor hub
-- STN_CENTRAL (3) is the middle connection
(12, 'STN_OLD',     'Old Town Heritage',     1, 2,  FALSE),
(13, 'STN_MEADOW',  'Meadow Valley',         3, 2,  FALSE),
-- Airport Express Stations (Central to International Airport)
(14, 'STN_GATE',    'Gateway Interchange',   2, 4,  TRUE),   -- Highway / Airport link
(15, 'STN_AIRPORT', 'Airport Terminal 1 & 2',3, 4,  FALSE);

SELECT setval('stations_station_id_seq', (SELECT MAX(station_id) FROM stations));

-- ----------------------------------------------------------------------------
-- 2. SEED LINES (4 Categorized Lines)
-- ----------------------------------------------------------------------------
INSERT INTO lines (line_id, name, code, color_hex, transit_type) VALUES
(1, 'Metro Red Line',        'RED_LINE',        '#EF4444', 'METRO'),
(2, 'Metro Blue Line',       'BLUE_LINE',       '#3B82F6', 'METRO'),
(3, 'Regional Green Line',   'GREEN_LINE',      '#10B981', 'REGIONAL_RAIL'),
(4, 'Airport Express Line',  'AIRPORT_EXPRESS', '#F59E0B', 'HIGH_SPEED');

SELECT setval('lines_line_id_seq', (SELECT MAX(line_id) FROM lines));

-- ----------------------------------------------------------------------------
-- 3. SEED ROUTES (Bi-directional Corridors for each Line = 8 Routes)
-- ----------------------------------------------------------------------------
INSERT INTO routes (route_id, line_id, direction, origin_station_id, destination_station_id) VALUES
(1, 1, 'SOUTHBOUND', 1,  5),  -- Red Line: North Terminal -> South Station
(2, 1, 'NORTHBOUND', 5,  1),  -- Red Line: South Station -> North Terminal
(3, 2, 'EASTBOUND',  6,  9),  -- Blue Line: West End -> Coastal Point
(4, 2, 'WESTBOUND',  9,  6),  -- Blue Line: Coastal Point -> West End
(5, 3, 'SOUTHBOUND', 10, 13), -- Green Line: University -> Meadow Valley
(6, 3, 'NORTHBOUND', 13, 10), -- Green Line: Meadow Valley -> University
(7, 4, 'OUTBOUND',   3,  15), -- Airport Express: Central -> Airport
(8, 4, 'INBOUND',    15, 3);  -- Airport Express: Airport -> Central

SELECT setval('routes_route_id_seq', (SELECT MAX(route_id) FROM routes));

-- ----------------------------------------------------------------------------
-- 4. SEED STATION CONNECTIONS (Physical Track Adjacencies)
-- ----------------------------------------------------------------------------
INSERT INTO station_connections (from_station_id, to_station_id, distance_km, nominal_duration_min) VALUES
-- Red Line Segments (Bi-directional)
(1, 2, 3.20, 5), (2, 1, 3.20, 5),
(2, 3, 2.80, 4), (3, 2, 2.80, 4),
(3, 4, 2.10, 3), (4, 3, 2.10, 3),
(4, 5, 4.50, 6), (5, 4, 4.50, 6),

-- Blue Line Segments (Bi-directional)
(6, 7, 3.80, 5), (7, 6, 3.80, 5),
(7, 3, 2.50, 4), (3, 7, 2.50, 4),
(3, 8, 3.00, 4), (8, 3, 3.00, 4),
(8, 9, 4.20, 6), (9, 8, 4.20, 6),

-- Green Line Segments (Bi-directional)
(10, 11, 5.10, 7), (11, 10, 5.10, 7),
(11, 3,  6.40, 8), (3,  11, 6.40, 8),
(3,  12, 3.50, 5), (12, 3,  3.50, 5),
(12, 13, 7.80, 10), (13, 12, 7.80, 10),

-- Airport Express Segments (Bi-directional)
(3,  14, 12.00, 11), (14, 3,  12.00, 11),
(14, 15, 8.50,  8),  (15, 14, 8.50,  8);

-- ----------------------------------------------------------------------------
-- 5. SEED TRAINS (6 Rolling Stock Sets)
-- ----------------------------------------------------------------------------
INSERT INTO trains (train_id, train_number, model, total_capacity) VALUES
(1, 'TR-RED-101',    'Alstom Metropolis 200', 20),
(2, 'TR-RED-102',    'Alstom Metropolis 200', 20),
(3, 'TR-BLUE-201',   'Siemens Inspiro Metro', 20),
(4, 'TR-BLUE-202',   'Siemens Inspiro Metro', 20),
(5, 'TR-GREEN-301',  'Bombardier Talent 3',   20),
(6, 'TR-AERO-401',   'Hitachi Class 800 Express', 20);

SELECT setval('trains_train_id_seq', (SELECT MAX(train_id) FROM trains));

-- ----------------------------------------------------------------------------
-- 6. SEED CARRIAGES (2 Carriages per Train = 12 Carriages)
-- ----------------------------------------------------------------------------
INSERT INTO carriages (carriage_id, train_id, carriage_number, class_type) VALUES
(1,  1, 1, 'STANDARD'),    (2,  1, 2, 'STANDARD'),
(3,  2, 1, 'STANDARD'),    (4,  2, 2, 'STANDARD'),
(5,  3, 1, 'STANDARD'),    (6,  3, 2, 'STANDARD'),
(7,  4, 1, 'STANDARD'),    (8,  4, 2, 'STANDARD'),
(9,  5, 1, 'STANDARD'),    (10, 5, 2, 'STANDARD'),
(11, 6, 1, 'FIRST_CLASS'), (12, 6, 2, 'STANDARD');

SELECT setval('carriages_carriage_id_seq', (SELECT MAX(carriage_id) FROM carriages));

-- ----------------------------------------------------------------------------
-- 7. SEED SEATS (10 Seats per Carriage * 12 Carriages = 120 Total Seats)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    c_id INT;
    s_idx INT;
    s_type VARCHAR(20);
    s_num VARCHAR(10);
BEGIN
    FOR c_id IN 1..12 LOOP
        FOR s_idx IN 1..10 LOOP
            IF s_idx % 2 = 1 THEN
                s_type := 'WINDOW';
            ELSE
                s_type := 'AISLE';
            END IF;
            s_num := 'C' || c_id || '-' || LPAD(s_idx::TEXT, 2, '0');
            INSERT INTO seats (carriage_id, seat_number, seat_type)
            VALUES (c_id, s_num, s_type);
        END LOOP;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8. SEED TRIPS (24 Scheduled Trips for 2026-10-29)
-- ----------------------------------------------------------------------------
INSERT INTO trips (trip_id, route_id, train_id, service_date, status) VALUES
-- Red Line Southbound (Route 1, Train 1 & 2)
(1,  1, 1, '2026-10-29', 'SCHEDULED'), -- Primary Disruption Subject (08:00 AM)
(2,  1, 2, '2026-10-29', 'SCHEDULED'), -- Alternate Rescue Service (08:30 AM)
(3,  1, 1, '2026-10-29', 'SCHEDULED'), -- Subsequent Service (09:00 AM)

-- Red Line Northbound (Route 2, Train 2 & 1)
(4,  2, 2, '2026-10-29', 'SCHEDULED'), -- 08:10 AM
(5,  2, 1, '2026-10-29', 'SCHEDULED'), -- 08:40 AM
(6,  2, 2, '2026-10-29', 'SCHEDULED'), -- 09:10 AM

-- Blue Line Eastbound (Route 3, Train 3 & 4)
(7,  3, 3, '2026-10-29', 'SCHEDULED'), -- Connects at STN_CENTRAL @ 08:24 AM
(8,  3, 4, '2026-10-29', 'SCHEDULED'), -- 08:50 AM
(9,  3, 3, '2026-10-29', 'SCHEDULED'), -- 09:20 AM

-- Blue Line Westbound (Route 4, Train 4 & 3)
(10, 4, 4, '2026-10-29', 'SCHEDULED'), -- 08:30 AM
(11, 4, 3, '2026-10-29', 'SCHEDULED'), -- 09:00 AM
(12, 4, 4, '2026-10-29', 'SCHEDULED'), -- 09:30 AM

-- Green Line Southbound (Route 5, Train 5)
(13, 5, 5, '2026-10-29', 'SCHEDULED'), -- Connects at STN_CENTRAL @ 08:22 AM
(14, 5, 5, '2026-10-29', 'SCHEDULED'), -- 08:48 AM
(15, 5, 5, '2026-10-29', 'SCHEDULED'), -- 09:18 AM

-- Green Line Northbound (Route 6, Train 5)
(16, 6, 5, '2026-10-29', 'SCHEDULED'), -- 08:23 AM
(17, 6, 5, '2026-10-29', 'SCHEDULED'), -- 08:53 AM
(18, 6, 5, '2026-10-29', 'SCHEDULED'), -- 09:23 AM

-- Airport Express Outbound (Route 7, Train 6)
(19, 7, 6, '2026-10-29', 'SCHEDULED'), -- Departs STN_CENTRAL @ 08:28 AM (Tight transfer from Trip 1)
(20, 7, 6, '2026-10-29', 'SCHEDULED'), -- 08:58 AM
(21, 7, 6, '2026-10-29', 'SCHEDULED'), -- 09:28 AM

-- Airport Express Inbound (Route 8, Train 6)
(22, 8, 6, '2026-10-29', 'SCHEDULED'), -- 08:22 AM
(23, 8, 6, '2026-10-29', 'SCHEDULED'), -- 08:52 AM
(24, 8, 6, '2026-10-29', 'SCHEDULED'); -- 09:22 AM

SELECT setval('trips_trip_id_seq', (SELECT MAX(trip_id) FROM trips));

-- ----------------------------------------------------------------------------
-- 9. SEED TIMETABLE STOPS (Temporal Timetable with Scheduled / Actual Windows)
-- ----------------------------------------------------------------------------
-- Trip 1: Red Line Southbound (08:00 - 08:30)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(1, 1, 1, '2026-10-29 08:00:00+00', '2026-10-29 08:00:00+00', '2026-10-29 08:00:00+00', '2026-10-29 08:00:00+00', 0, 0),
(1, 2, 2, '2026-10-29 08:05:00+00', '2026-10-29 08:06:00+00', '2026-10-29 08:05:00+00', '2026-10-29 08:06:00+00', 0, 0),
(1, 3, 3, '2026-10-29 08:15:00+00', '2026-10-29 08:17:00+00', '2026-10-29 08:15:00+00', '2026-10-29 08:17:00+00', 0, 0),
(1, 4, 4, '2026-10-29 08:21:00+00', '2026-10-29 08:22:00+00', '2026-10-29 08:21:00+00', '2026-10-29 08:22:00+00', 0, 0),
(1, 5, 5, '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', 0, 0);

-- Trip 2: Red Line Southbound (08:30 - 09:00, Alternate Target for Rebooking)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(2, 1, 1, '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', 0, 0),
(2, 2, 2, '2026-10-29 08:35:00+00', '2026-10-29 08:36:00+00', '2026-10-29 08:35:00+00', '2026-10-29 08:36:00+00', 0, 0),
(2, 3, 3, '2026-10-29 08:45:00+00', '2026-10-29 08:47:00+00', '2026-10-29 08:45:00+00', '2026-10-29 08:47:00+00', 0, 0),
(2, 4, 4, '2026-10-29 08:51:00+00', '2026-10-29 08:52:00+00', '2026-10-29 08:51:00+00', '2026-10-29 08:52:00+00', 0, 0),
(2, 5, 5, '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', 0, 0);

-- Trip 3: Red Line Southbound (09:00 - 09:30)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(3, 1, 1, '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', 0, 0),
(3, 2, 2, '2026-10-29 09:05:00+00', '2026-10-29 09:06:00+00', '2026-10-29 09:05:00+00', '2026-10-29 09:06:00+00', 0, 0),
(3, 3, 3, '2026-10-29 09:15:00+00', '2026-10-29 09:17:00+00', '2026-10-29 09:15:00+00', '2026-10-29 09:17:00+00', 0, 0),
(3, 4, 4, '2026-10-29 09:21:00+00', '2026-10-29 09:22:00+00', '2026-10-29 09:21:00+00', '2026-10-29 09:22:00+00', 0, 0),
(3, 5, 5, '2026-10-29 09:30:00+00', '2026-10-29 09:30:00+00', '2026-10-29 09:30:00+00', '2026-10-29 09:30:00+00', 0, 0);

-- Trip 4: Red Line Northbound (08:10 - 08:40)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(4, 5, 1, '2026-10-29 08:10:00+00', '2026-10-29 08:10:00+00', '2026-10-29 08:10:00+00', '2026-10-29 08:10:00+00', 0, 0),
(4, 4, 2, '2026-10-29 08:18:00+00', '2026-10-29 08:19:00+00', '2026-10-29 08:18:00+00', '2026-10-29 08:19:00+00', 0, 0),
(4, 3, 3, '2026-10-29 08:25:00+00', '2026-10-29 08:27:00+00', '2026-10-29 08:25:00+00', '2026-10-29 08:27:00+00', 0, 0),
(4, 2, 4, '2026-10-29 08:34:00+00', '2026-10-29 08:35:00+00', '2026-10-29 08:34:00+00', '2026-10-29 08:35:00+00', 0, 0),
(4, 1, 5, '2026-10-29 08:40:00+00', '2026-10-29 08:40:00+00', '2026-10-29 08:40:00+00', '2026-10-29 08:40:00+00', 0, 0);

-- Trip 5: Red Line Northbound (08:40 - 09:10)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(5, 5, 1, '2026-10-29 08:40:00+00', '2026-10-29 08:40:00+00', '2026-10-29 08:40:00+00', '2026-10-29 08:40:00+00', 0, 0),
(5, 4, 2, '2026-10-29 08:48:00+00', '2026-10-29 08:49:00+00', '2026-10-29 08:48:00+00', '2026-10-29 08:49:00+00', 0, 0),
(5, 3, 3, '2026-10-29 08:55:00+00', '2026-10-29 08:57:00+00', '2026-10-29 08:55:00+00', '2026-10-29 08:57:00+00', 0, 0),
(5, 2, 4, '2026-10-29 09:04:00+00', '2026-10-29 09:05:00+00', '2026-10-29 09:04:00+00', '2026-10-29 09:05:00+00', 0, 0),
(5, 1, 5, '2026-10-29 09:10:00+00', '2026-10-29 09:10:00+00', '2026-10-29 09:10:00+00', '2026-10-29 09:10:00+00', 0, 0);

-- Trip 6: Red Line Northbound (09:10 - 09:40)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(6, 5, 1, '2026-10-29 09:10:00+00', '2026-10-29 09:10:00+00', '2026-10-29 09:10:00+00', '2026-10-29 09:10:00+00', 0, 0),
(6, 4, 2, '2026-10-29 09:18:00+00', '2026-10-29 09:19:00+00', '2026-10-29 09:18:00+00', '2026-10-29 09:19:00+00', 0, 0),
(6, 3, 3, '2026-10-29 09:25:00+00', '2026-10-29 09:27:00+00', '2026-10-29 09:25:00+00', '2026-10-29 09:27:00+00', 0, 0),
(6, 2, 4, '2026-10-29 09:34:00+00', '2026-10-29 09:35:00+00', '2026-10-29 09:34:00+00', '2026-10-29 09:35:00+00', 0, 0),
(6, 1, 5, '2026-10-29 09:40:00+00', '2026-10-29 09:40:00+00', '2026-10-29 09:40:00+00', '2026-10-29 09:40:00+00', 0, 0);

-- Trip 7: Blue Line Eastbound (West End -> Coastal Point, arrives STN_CENTRAL @ 08:20, departs 08:24)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(7, 6, 1, '2026-10-29 08:05:00+00', '2026-10-29 08:05:00+00', '2026-10-29 08:05:00+00', '2026-10-29 08:05:00+00', 0, 0),
(7, 7, 2, '2026-10-29 08:12:00+00', '2026-10-29 08:13:00+00', '2026-10-29 08:12:00+00', '2026-10-29 08:13:00+00', 0, 0),
(7, 3, 3, '2026-10-29 08:20:00+00', '2026-10-29 08:24:00+00', '2026-10-29 08:20:00+00', '2026-10-29 08:24:00+00', 0, 0),
(7, 8, 4, '2026-10-29 08:31:00+00', '2026-10-29 08:32:00+00', '2026-10-29 08:31:00+00', '2026-10-29 08:32:00+00', 0, 0),
(7, 9, 5, '2026-10-29 08:40:00+00', '2026-10-29 08:40:00+00', '2026-10-29 08:40:00+00', '2026-10-29 08:40:00+00', 0, 0);

-- Trip 8: Blue Line Eastbound (08:35 - 09:10)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(8, 6, 1, '2026-10-29 08:35:00+00', '2026-10-29 08:35:00+00', '2026-10-29 08:35:00+00', '2026-10-29 08:35:00+00', 0, 0),
(8, 7, 2, '2026-10-29 08:42:00+00', '2026-10-29 08:43:00+00', '2026-10-29 08:42:00+00', '2026-10-29 08:43:00+00', 0, 0),
(8, 3, 3, '2026-10-29 08:50:00+00', '2026-10-29 08:54:00+00', '2026-10-29 08:50:00+00', '2026-10-29 08:54:00+00', 0, 0),
(8, 8, 4, '2026-10-29 09:01:00+00', '2026-10-29 09:02:00+00', '2026-10-29 09:01:00+00', '2026-10-29 09:02:00+00', 0, 0),
(8, 9, 5, '2026-10-29 09:10:00+00', '2026-10-29 09:10:00+00', '2026-10-29 09:10:00+00', '2026-10-29 09:10:00+00', 0, 0);

-- Trip 9: Blue Line Eastbound (09:05 - 09:40)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(9, 6, 1, '2026-10-29 09:05:00+00', '2026-10-29 09:05:00+00', '2026-10-29 09:05:00+00', '2026-10-29 09:05:00+00', 0, 0),
(9, 7, 2, '2026-10-29 09:12:00+00', '2026-10-29 09:13:00+00', '2026-10-29 09:12:00+00', '2026-10-29 09:13:00+00', 0, 0),
(9, 3, 3, '2026-10-29 09:20:00+00', '2026-10-29 09:24:00+00', '2026-10-29 09:20:00+00', '2026-10-29 09:24:00+00', 0, 0),
(9, 8, 4, '2026-10-29 09:31:00+00', '2026-10-29 09:32:00+00', '2026-10-29 09:31:00+00', '2026-10-29 09:32:00+00', 0, 0),
(9, 9, 5, '2026-10-29 09:40:00+00', '2026-10-29 09:40:00+00', '2026-10-29 09:40:00+00', '2026-10-29 09:40:00+00', 0, 0);

-- Trip 10: Blue Line Westbound (08:15 - 08:50)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(10, 9, 1, '2026-10-29 08:15:00+00', '2026-10-29 08:15:00+00', '2026-10-29 08:15:00+00', '2026-10-29 08:15:00+00', 0, 0),
(10, 8, 2, '2026-10-29 08:23:00+00', '2026-10-29 08:24:00+00', '2026-10-29 08:23:00+00', '2026-10-29 08:24:00+00', 0, 0),
(10, 3, 3, '2026-10-29 08:30:00+00', '2026-10-29 08:34:00+00', '2026-10-29 08:30:00+00', '2026-10-29 08:34:00+00', 0, 0),
(10, 7, 4, '2026-10-29 08:41:00+00', '2026-10-29 08:42:00+00', '2026-10-29 08:41:00+00', '2026-10-29 08:42:00+00', 0, 0),
(10, 6, 5, '2026-10-29 08:50:00+00', '2026-10-29 08:50:00+00', '2026-10-29 08:50:00+00', '2026-10-29 08:50:00+00', 0, 0);

-- Trip 11: Blue Line Westbound (08:45 - 09:20)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(11, 9, 1, '2026-10-29 08:45:00+00', '2026-10-29 08:45:00+00', '2026-10-29 08:45:00+00', '2026-10-29 08:45:00+00', 0, 0),
(11, 8, 2, '2026-10-29 08:53:00+00', '2026-10-29 08:54:00+00', '2026-10-29 08:53:00+00', '2026-10-29 08:54:00+00', 0, 0),
(11, 3, 3, '2026-10-29 09:00:00+00', '2026-10-29 09:04:00+00', '2026-10-29 09:00:00+00', '2026-10-29 09:04:00+00', 0, 0),
(11, 7, 4, '2026-10-29 09:11:00+00', '2026-10-29 09:12:00+00', '2026-10-29 09:11:00+00', '2026-10-29 09:12:00+00', 0, 0),
(11, 6, 5, '2026-10-29 09:20:00+00', '2026-10-29 09:20:00+00', '2026-10-29 09:20:00+00', '2026-10-29 09:20:00+00', 0, 0);

-- Trip 12: Blue Line Westbound (09:15 - 09:50)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(12, 9, 1, '2026-10-29 09:15:00+00', '2026-10-29 09:15:00+00', '2026-10-29 09:15:00+00', '2026-10-29 09:15:00+00', 0, 0),
(12, 8, 2, '2026-10-29 09:23:00+00', '2026-10-29 09:24:00+00', '2026-10-29 09:23:00+00', '2026-10-29 09:24:00+00', 0, 0),
(12, 3, 3, '2026-10-29 09:30:00+00', '2026-10-29 09:34:00+00', '2026-10-29 09:30:00+00', '2026-10-29 09:34:00+00', 0, 0),
(12, 7, 4, '2026-10-29 09:41:00+00', '2026-10-29 09:42:00+00', '2026-10-29 09:41:00+00', '2026-10-29 09:42:00+00', 0, 0),
(12, 6, 5, '2026-10-29 09:50:00+00', '2026-10-29 09:50:00+00', '2026-10-29 09:50:00+00', '2026-10-29 09:50:00+00', 0, 0);

-- Trip 13: Green Line Southbound (Univ -> Meadow, arrives STN_CENTRAL @ 08:18, departs 08:22)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(13, 10, 1, '2026-10-29 07:55:00+00', '2026-10-29 07:55:00+00', '2026-10-29 07:55:00+00', '2026-10-29 07:55:00+00', 0, 0),
(13, 11, 2, '2026-10-29 08:04:00+00', '2026-10-29 08:06:00+00', '2026-10-29 08:04:00+00', '2026-10-29 08:06:00+00', 0, 0),
(13, 3,  3, '2026-10-29 08:18:00+00', '2026-10-29 08:22:00+00', '2026-10-29 08:18:00+00', '2026-10-29 08:22:00+00', 0, 0),
(13, 12, 4, '2026-10-29 08:30:00+00', '2026-10-29 08:31:00+00', '2026-10-29 08:30:00+00', '2026-10-29 08:31:00+00', 0, 0),
(13, 13, 5, '2026-10-29 08:45:00+00', '2026-10-29 08:45:00+00', '2026-10-29 08:45:00+00', '2026-10-29 08:45:00+00', 0, 0);

-- Trip 14: Green Line Southbound (08:25 - 09:15)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(14, 10, 1, '2026-10-29 08:25:00+00', '2026-10-29 08:25:00+00', '2026-10-29 08:25:00+00', '2026-10-29 08:25:00+00', 0, 0),
(14, 11, 2, '2026-10-29 08:34:00+00', '2026-10-29 08:36:00+00', '2026-10-29 08:34:00+00', '2026-10-29 08:36:00+00', 0, 0),
(14, 3,  3, '2026-10-29 08:48:00+00', '2026-10-29 08:52:00+00', '2026-10-29 08:48:00+00', '2026-10-29 08:52:00+00', 0, 0),
(14, 12, 4, '2026-10-29 09:00:00+00', '2026-10-29 09:01:00+00', '2026-10-29 09:00:00+00', '2026-10-29 09:01:00+00', 0, 0),
(14, 13, 5, '2026-10-29 09:15:00+00', '2026-10-29 09:15:00+00', '2026-10-29 09:15:00+00', '2026-10-29 09:15:00+00', 0, 0);

-- Trip 15: Green Line Southbound (08:55 - 09:45)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(15, 10, 1, '2026-10-29 08:55:00+00', '2026-10-29 08:55:00+00', '2026-10-29 08:55:00+00', '2026-10-29 08:55:00+00', 0, 0),
(15, 11, 2, '2026-10-29 09:04:00+00', '2026-10-29 09:06:00+00', '2026-10-29 09:04:00+00', '2026-10-29 09:06:00+00', 0, 0),
(15, 3,  3, '2026-10-29 09:18:00+00', '2026-10-29 09:22:00+00', '2026-10-29 09:18:00+00', '2026-10-29 09:22:00+00', 0, 0),
(15, 12, 4, '2026-10-29 09:30:00+00', '2026-10-29 09:31:00+00', '2026-10-29 09:30:00+00', '2026-10-29 09:31:00+00', 0, 0),
(15, 13, 5, '2026-10-29 09:45:00+00', '2026-10-29 09:45:00+00', '2026-10-29 09:45:00+00', '2026-10-29 09:45:00+00', 0, 0);

-- Trip 16: Green Line Northbound (08:00 - 08:50)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(16, 13, 1, '2026-10-29 08:00:00+00', '2026-10-29 08:00:00+00', '2026-10-29 08:00:00+00', '2026-10-29 08:00:00+00', 0, 0),
(16, 12, 2, '2026-10-29 08:14:00+00', '2026-10-29 08:15:00+00', '2026-10-29 08:14:00+00', '2026-10-29 08:15:00+00', 0, 0),
(16, 3,  3, '2026-10-29 08:23:00+00', '2026-10-29 08:26:00+00', '2026-10-29 08:23:00+00', '2026-10-29 08:26:00+00', 0, 0),
(16, 11, 4, '2026-10-29 08:38:00+00', '2026-10-29 08:40:00+00', '2026-10-29 08:38:00+00', '2026-10-29 08:40:00+00', 0, 0),
(16, 10, 5, '2026-10-29 08:50:00+00', '2026-10-29 08:50:00+00', '2026-10-29 08:50:00+00', '2026-10-29 08:50:00+00', 0, 0);

-- Trip 17: Green Line Northbound (08:30 - 09:20)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(17, 13, 1, '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', 0, 0),
(17, 12, 2, '2026-10-29 08:44:00+00', '2026-10-29 08:45:00+00', '2026-10-29 08:44:00+00', '2026-10-29 08:45:00+00', 0, 0),
(17, 3,  3, '2026-10-29 08:53:00+00', '2026-10-29 08:56:00+00', '2026-10-29 08:53:00+00', '2026-10-29 08:56:00+00', 0, 0),
(17, 11, 4, '2026-10-29 09:08:00+00', '2026-10-29 09:10:00+00', '2026-10-29 09:08:00+00', '2026-10-29 09:10:00+00', 0, 0),
(17, 10, 5, '2026-10-29 09:20:00+00', '2026-10-29 09:20:00+00', '2026-10-29 09:20:00+00', '2026-10-29 09:20:00+00', 0, 0);

-- Trip 18: Green Line Northbound (09:00 - 09:50)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(18, 13, 1, '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', 0, 0),
(18, 12, 2, '2026-10-29 09:14:00+00', '2026-10-29 09:15:00+00', '2026-10-29 09:14:00+00', '2026-10-29 09:15:00+00', 0, 0),
(18, 3,  3, '2026-10-29 09:23:00+00', '2026-10-29 09:26:00+00', '2026-10-29 09:23:00+00', '2026-10-29 09:26:00+00', 0, 0),
(18, 11, 4, '2026-10-29 09:38:00+00', '2026-10-29 09:40:00+00', '2026-10-29 09:38:00+00', '2026-10-29 09:40:00+00', 0, 0),
(18, 10, 5, '2026-10-29 09:50:00+00', '2026-10-29 09:50:00+00', '2026-10-29 09:50:00+00', '2026-10-29 09:50:00+00', 0, 0);

-- Trip 19: Airport Express Outbound (Departs STN_CENTRAL @ 08:28, connects from Trip 1's 08:15 arrival)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(19, 3,  1, '2026-10-29 08:28:00+00', '2026-10-29 08:28:00+00', '2026-10-29 08:28:00+00', '2026-10-29 08:28:00+00', 0, 0),
(19, 14, 2, '2026-10-29 08:40:00+00', '2026-10-29 08:42:00+00', '2026-10-29 08:40:00+00', '2026-10-29 08:42:00+00', 0, 0),
(19, 15, 3, '2026-10-29 08:52:00+00', '2026-10-29 08:52:00+00', '2026-10-29 08:52:00+00', '2026-10-29 08:52:00+00', 0, 0);

-- Trip 20: Airport Express Outbound (08:58 - 09:22)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(20, 3,  1, '2026-10-29 08:58:00+00', '2026-10-29 08:58:00+00', '2026-10-29 08:58:00+00', '2026-10-29 08:58:00+00', 0, 0),
(20, 14, 2, '2026-10-29 09:10:00+00', '2026-10-29 09:12:00+00', '2026-10-29 09:10:00+00', '2026-10-29 09:12:00+00', 0, 0),
(20, 15, 3, '2026-10-29 09:22:00+00', '2026-10-29 09:22:00+00', '2026-10-29 09:22:00+00', '2026-10-29 09:22:00+00', 0, 0);

-- Trip 21: Airport Express Outbound (09:28 - 09:52)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(21, 3,  1, '2026-10-29 09:28:00+00', '2026-10-29 09:28:00+00', '2026-10-29 09:28:00+00', '2026-10-29 09:28:00+00', 0, 0),
(21, 14, 2, '2026-10-29 09:40:00+00', '2026-10-29 09:42:00+00', '2026-10-29 09:40:00+00', '2026-10-29 09:42:00+00', 0, 0),
(21, 15, 3, '2026-10-29 09:52:00+00', '2026-10-29 09:52:00+00', '2026-10-29 09:52:00+00', '2026-10-29 09:52:00+00', 0, 0);

-- Trip 22: Airport Express Inbound (08:00 - 08:24)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(22, 15, 1, '2026-10-29 08:00:00+00', '2026-10-29 08:00:00+00', '2026-10-29 08:00:00+00', '2026-10-29 08:00:00+00', 0, 0),
(22, 14, 2, '2026-10-29 08:11:00+00', '2026-10-29 08:13:00+00', '2026-10-29 08:11:00+00', '2026-10-29 08:13:00+00', 0, 0),
(22, 3,  3, '2026-10-29 08:24:00+00', '2026-10-29 08:24:00+00', '2026-10-29 08:24:00+00', '2026-10-29 08:24:00+00', 0, 0);

-- Trip 23: Airport Express Inbound (08:30 - 08:54)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(23, 15, 1, '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', '2026-10-29 08:30:00+00', 0, 0),
(23, 14, 2, '2026-10-29 08:41:00+00', '2026-10-29 08:43:00+00', '2026-10-29 08:41:00+00', '2026-10-29 08:43:00+00', 0, 0),
(23, 3,  3, '2026-10-29 08:54:00+00', '2026-10-29 08:54:00+00', '2026-10-29 08:54:00+00', '2026-10-29 08:54:00+00', 0, 0);

-- Trip 24: Airport Express Inbound (09:00 - 09:24)
INSERT INTO timetable_stops (trip_id, station_id, stop_sequence, scheduled_arrival, scheduled_departure, actual_arrival, actual_departure, delay_arrival_min, delay_departure_min) VALUES
(24, 15, 1, '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', '2026-10-29 09:00:00+00', 0, 0),
(24, 14, 2, '2026-10-29 09:11:00+00', '2026-10-29 09:13:00+00', '2026-10-29 09:11:00+00', '2026-10-29 09:13:00+00', 0, 0),
(24, 3,  3, '2026-10-29 09:24:00+00', '2026-10-29 09:24:00+00', '2026-10-29 09:24:00+00', '2026-10-29 09:24:00+00', 0, 0);

-- ----------------------------------------------------------------------------
-- 10. SEED PASSENGERS (40 Passengers)
-- ----------------------------------------------------------------------------
INSERT INTO passengers (passenger_id, full_name, email, phone, db_user_role) VALUES
(1,  'Alice Walker',       'alice.walker@example.com',      '+1-555-0101', 'passenger'),
(2,  'Bob Martinez',       'bob.martinez@example.com',      '+1-555-0102', 'passenger'),
(3,  'Charlie Chen',       'charlie.chen@example.com',      '+1-555-0103', 'passenger'),
(4,  'Diana Prince',       'diana.prince@example.com',      '+1-555-0104', 'passenger'),
(5,  'Evan Wright',        'evan.wright@example.com',       '+1-555-0105', 'passenger'),
(6,  'Fiona Gallagher',    'fiona.gallagher@example.com',   '+1-555-0106', 'passenger'),
(7,  'George Clark',       'george.clark@example.com',      '+1-555-0107', 'passenger'),
(8,  'Hannah Abbott',      'hannah.abbott@example.com',     '+1-555-0108', 'passenger'),
(9,  'Ian Malcolm',        'ian.malcolm@example.com',       '+1-555-0109', 'passenger'),
(10, 'Julia Roberts',      'julia.roberts@example.com',     '+1-555-0110', 'passenger'),
(11, 'Kevin Bacon',        'kevin.bacon@example.com',       '+1-555-0111', 'passenger'),
(12, 'Laura Croft',        'laura.croft@example.com',       '+1-555-0112', 'passenger'),
(13, 'Marcus Aurelius',    'marcus.aurelius@example.com',   '+1-555-0113', 'passenger'),
(14, 'Nadia Comaneci',     'nadia.comaneci@example.com',    '+1-555-0114', 'passenger'),
(15, 'Oscar Isaac',        'oscar.isaac@example.com',       '+1-555-0115', 'passenger'),
(16, 'Penelope Cruz',      'penelope.cruz@example.com',     '+1-555-0116', 'passenger'),
(17, 'Quincy Adams',       'quincy.adams@example.com',      '+1-555-0117', 'passenger'),
(18, 'Rachel Green',       'rachel.green@example.com',      '+1-555-0118', 'passenger'),
(19, 'Steve Rogers',       'steve.rogers@example.com',      '+1-555-0119', 'passenger'),
(20, 'Tina Fey',           'tina.fey@example.com',          '+1-555-0120', 'passenger'),
(21, 'Ulysses Grant',      'ulysses.grant@example.com',     '+1-555-0121', 'passenger'),
(22, 'Victor Hugo',        'victor.hugo@example.com',       '+1-555-0122', 'passenger'),
(23, 'Wanda Maximoff',     'wanda.maximoff@example.com',    '+1-555-0123', 'passenger'),
(24, 'Xavier Charles',     'xavier.charles@example.com',    '+1-555-0124', 'passenger'),
(25, 'Yvonne Strahovski',  'yvonne.strahovski@example.com', '+1-555-0125', 'passenger'),
(26, 'Zachary Levi',       'zachary.levi@example.com',      '+1-555-0126', 'passenger'),
(27, 'Amber Heard',        'amber.heard@example.com',       '+1-555-0127', 'passenger'),
(28, 'Brian May',          'brian.may@example.com',         '+1-555-0128', 'passenger'),
(29, 'Chloe Bennett',      'chloe.bennett@example.com',     '+1-555-0129', 'passenger'),
(30, 'Daniel Craig',       'daniel.craig@example.com',      '+1-555-0130', 'passenger'),
(31, 'Emma Watson',        'emma.watson@example.com',       '+1-555-0131', 'passenger'),
(32, 'Franklin Richards',  'franklin.richards@example.com', '+1-555-0132', 'passenger'),
(33, 'Grace Hopper',       'grace.hopper@example.com',      '+1-555-0133', 'passenger'),
(34, 'Harry Potter',       'harry.potter@example.com',      '+1-555-0134', 'passenger'),
(35, 'Iris West',          'iris.west@example.com',         '+1-555-0135', 'passenger'),
(36, 'Jack Reacher',       'jack.reacher@example.com',      '+1-555-0136', 'passenger'),
(37, 'Kate Bishop',        'kate.bishop@example.com',       '+1-555-0137', 'passenger'),
(38, 'Luke Skywalker',     'luke.skywalker@example.com',    '+1-555-0138', 'passenger'),
(39, 'Miles Morales',      'miles.morales@example.com',     '+1-555-0139', 'passenger'),
(40, 'Natasha Romanoff',   'natasha.romanoff@example.com',  '+1-555-0140', 'passenger');

SELECT setval('passengers_passenger_id_seq', (SELECT MAX(passenger_id) FROM passengers));

-- ----------------------------------------------------------------------------
-- 11. SEED RESERVATIONS (40 Initial Reservations with Multi-Leg Transfers & Target Alternates)
-- ----------------------------------------------------------------------------
-- 20 Passengers on Trip 1 (Train 1, Seats 1..20) - Direct Disruption Impact Group
INSERT INTO reservations (passenger_id, trip_id, seat_id, origin_station_id, destination_station_id, booking_status) VALUES
(1,  1, 1,  1, 5, 'CONFIRMED'),
(2,  1, 2,  1, 5, 'CONFIRMED'),
(3,  1, 3,  1, 3, 'CONFIRMED'), -- Multi-leg transfer passenger 1 -> 3, transfers to Airport Express (Trip 19)
(4,  1, 4,  1, 3, 'CONFIRMED'), -- Multi-leg transfer passenger 1 -> 3, transfers to Blue Line (Trip 7)
(5,  1, 5,  1, 5, 'CONFIRMED'),
(6,  1, 6,  2, 5, 'CONFIRMED'),
(7,  1, 7,  2, 5, 'CONFIRMED'),
(8,  1, 8,  1, 3, 'CONFIRMED'), -- Multi-leg transfer passenger 1 -> 3, transfers to Green Line (Trip 13)
(9,  1, 9,  1, 5, 'CONFIRMED'),
(10, 1, 10, 1, 5, 'CONFIRMED'),
(11, 1, 11, 2, 4, 'CONFIRMED'),
(12, 1, 12, 2, 5, 'CONFIRMED'),
(13, 1, 13, 1, 5, 'CONFIRMED'),
(14, 1, 14, 1, 5, 'CONFIRMED'),
(15, 1, 15, 1, 5, 'CONFIRMED'),
(16, 1, 16, 2, 5, 'CONFIRMED'),
(17, 1, 17, 1, 4, 'CONFIRMED'),
(18, 1, 18, 1, 5, 'CONFIRMED'),
(19, 1, 19, 1, 5, 'CONFIRMED'),
(20, 1, 20, 1, 5, 'CONFIRMED');

-- 10 Passengers on Trip 2 (Train 2, Seats 21..30)
-- NOTE: Seats 31..40 on Train 2 (Trip 2) are intentionally kept UNRESERVED!
-- This provides EXACTLY 10 FREE SEATS for the Concurrency Arena Rebooking Test.
INSERT INTO reservations (passenger_id, trip_id, seat_id, origin_station_id, destination_station_id, booking_status) VALUES
(21, 2, 21, 1, 5, 'CONFIRMED'),
(22, 2, 22, 1, 5, 'CONFIRMED'),
(23, 2, 23, 2, 5, 'CONFIRMED'),
(24, 2, 24, 1, 5, 'CONFIRMED'),
(25, 2, 25, 1, 4, 'CONFIRMED'),
(26, 2, 26, 1, 5, 'CONFIRMED'),
(27, 2, 27, 2, 5, 'CONFIRMED'),
(28, 2, 28, 1, 5, 'CONFIRMED'),
(29, 2, 29, 1, 5, 'CONFIRMED'),
(30, 2, 30, 2, 5, 'CONFIRMED');

-- 4 Connecting Leg Reservations on Blue Line Trip 7 (Train 3, Seats 41..44)
INSERT INTO reservations (passenger_id, trip_id, seat_id, origin_station_id, destination_station_id, booking_status) VALUES
(4,  7, 41, 3, 9, 'CONFIRMED'), -- Passenger 4 leg 2 (Central -> Coastal Point, transferred from Trip 1)
(31, 7, 42, 6, 9, 'CONFIRMED'),
(32, 7, 43, 6, 8, 'CONFIRMED'),
(33, 7, 44, 7, 9, 'CONFIRMED');

-- 3 Connecting Leg Reservations on Green Line Trip 13 (Train 5, Seats 81..83)
INSERT INTO reservations (passenger_id, trip_id, seat_id, origin_station_id, destination_station_id, booking_status) VALUES
(8,  13, 81, 3, 13, 'CONFIRMED'), -- Passenger 8 leg 2 (Central -> Meadow Valley, transferred from Trip 1)
(34, 13, 82, 10, 13, 'CONFIRMED'),
(35, 13, 83, 11, 13, 'CONFIRMED');

-- 3 Connecting Leg Reservations on Airport Express Trip 19 (Train 6, Seats 101..103)
INSERT INTO reservations (passenger_id, trip_id, seat_id, origin_station_id, destination_station_id, booking_status) VALUES
(3,  19, 101, 3, 15, 'CONFIRMED'), -- Passenger 3 leg 2 (Central -> Airport, transferred from Trip 1)
(36, 19, 102, 3, 15, 'CONFIRMED'),
(37, 19, 103, 3, 15, 'CONFIRMED');

SELECT setval('reservations_reservation_id_seq', (SELECT MAX(reservation_id) FROM reservations));
