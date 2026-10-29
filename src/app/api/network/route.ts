import {
  handleApiError,
  jsonSuccess,
  parsePersona,
  requirePassengerId,
} from '@/lib/api';
import { withPersona } from '@/lib/postgres';
import type {
  LiveTripMonitorRow,
  PassengerJourneyRow,
  PassengerProfile,
  StationScheduleRow,
  TransitConnection,
  TransitLine,
  TransitRoute,
  TransitStation,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const persona = requirePassengerId(parsePersona(request));

    const snapshot = await withPersona(persona, async (client) => {
      const lines = await client.query<TransitLine>(
        `SELECT line_id, name, code, color_hex, transit_type
         FROM lines
         ORDER BY line_id`,
      );
      const stations = await client.query<TransitStation>(
        `SELECT station_id, code, name, zone, platform_count, transfer_hub_flag
         FROM stations
         ORDER BY station_id`,
      );
      const routes = await client.query<TransitRoute>(
        `SELECT route_id, line_id, direction, origin_station_id, destination_station_id
         FROM routes
         ORDER BY route_id`,
      );
      const trips = await client.query<LiveTripMonitorRow>(
        `SELECT *
         FROM v_live_trip_monitor
         ORDER BY trip_id`,
      );
      const stationSchedule = await client.query<StationScheduleRow>(
        `SELECT *
         FROM v_station_schedule
         ORDER BY station_id, scheduled_departure, trip_id`,
      );

      let connections: TransitConnection[] = [];

      if (persona.role !== 'passenger') {
        const connectionResult = await client.query<TransitConnection>(
          `SELECT connection_id, from_station_id, to_station_id, distance_km, nominal_duration_min
           FROM station_connections
           ORDER BY connection_id`,
        );
        connections = connectionResult.rows;
      }

      if (persona.role === 'passenger') {
        const profile = await client.query<PassengerProfile>(
          `SELECT passenger_id, full_name, email
           FROM passengers
           WHERE passenger_id = $1`,
          [persona.passengerId],
        );
        const journey = await client.query<PassengerJourneyRow>(
          `SELECT r.reservation_id,
                  r.trip_id,
                  r.booking_status,
                  r.origin_station_id,
                  origin.name AS origin_station_name,
                  r.destination_station_id,
                  destination.name AS destination_station_name,
                  monitor.line_code,
                  monitor.line_name,
                  monitor.color_hex,
                  monitor.train_number,
                  monitor.trip_status,
                  monitor.max_delay_min,
                  monitor.scheduled_start,
                  monitor.scheduled_end
           FROM reservations r
           JOIN stations origin ON origin.station_id = r.origin_station_id
           JOIN stations destination ON destination.station_id = r.destination_station_id
           LEFT JOIN v_live_trip_monitor monitor ON monitor.trip_id = r.trip_id
           ORDER BY r.trip_id, r.reservation_id`,
        );

        return {
          lines: lines.rows,
          stations: stations.rows,
          routes: routes.rows,
          connections,
          trips: trips.rows,
          stationSchedule: stationSchedule.rows,
          passengerProfile: profile.rows[0] ?? null,
          myReservations: journey.rows,
        };
      }

      return {
        lines: lines.rows,
        stations: stations.rows,
        routes: routes.rows,
        connections,
        trips: trips.rows,
        stationSchedule: stationSchedule.rows,
      };
    });

    return jsonSuccess({
      persona,
      ...snapshot,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
