import type { QueryResultRow } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminQuery, closePostgres } from '../src/lib/postgres';

interface CascadeRow extends QueryResultRow {
  trip_id: number;
  route_id: number;
  line_name: string;
  line_code: string;
  station_id: number;
  station_name: string;
  stop_sequence: number;
  scheduled_arrival: string | Date;
  scheduled_departure: string | Date;
  estimated_arrival: string | Date;
  estimated_departure: string | Date;
  propagated_delay_min: number;
  cascade_depth: number;
  impact_type: string;
  trip_path: number[];
  affected_passengers_count: string | number;
}

const DISRUPTED_TRIP_ID = 1;
const INCIDENT_STATION_ID = 3;
const INCIDENT_DELAY_MIN = 45;

describe('recursive CTE downstream cascade', () => {
  let rows: CascadeRow[];

  beforeAll(async () => {
    const counters = await adminQuery<{ trip_count: number }>(
      'SELECT COUNT(*)::INT AS trip_count FROM trips',
    );
    if ((counters[0]?.trip_count ?? 0) < 24) {
      throw new Error(
        'Seed data is missing. Run "docker compose down -v && docker compose up -d" before testing.',
      );
    }

    rows = await adminQuery<CascadeRow>(
      'SELECT * FROM fn_calculate_downstream_cascade($1, $2, $3)',
      [DISRUPTED_TRIP_ID, INCIDENT_STATION_ID, INCIDENT_DELAY_MIN],
    );
  });

  afterAll(async () => {
    await closePostgres();
  });

  it('anchors the cascade at the directly disrupted trip and station', () => {
    const anchor = rows.find(
      (row) =>
        row.trip_id === DISRUPTED_TRIP_ID &&
        row.station_id === INCIDENT_STATION_ID,
    );

    expect(anchor).toBeDefined();
    expect(anchor?.impact_type).toBe('DIRECT_DISRUPTION');
    expect(anchor?.cascade_depth).toBe(1);
    expect(anchor?.propagated_delay_min).toBe(INCIDENT_DELAY_MIN);
    expect(anchor?.trip_path).toEqual([DISRUPTED_TRIP_ID]);
  });

  it('propagates the delay to downstream stops on the same trip', () => {
    const downstreamStops = rows.filter(
      (row) =>
        row.trip_id === DISRUPTED_TRIP_ID &&
        row.impact_type === 'DOWNSTREAM_STOP' &&
        row.cascade_depth > 1,
    );

    expect(downstreamStops.length).toBeGreaterThan(0);
    for (const stop of downstreamStops) {
      expect(stop.stop_sequence).toBeGreaterThan(3);
      expect(stop.propagated_delay_min).toBe(INCIDENT_DELAY_MIN);
    }
  });

  it('follows multi-hop transfer connections at the incident hub', () => {
    const transferRows = rows.filter(
      (row) => row.impact_type === 'TRANSFER_CONNECTION',
    );
    const transferTripIds = new Set(transferRows.map((row) => row.trip_id));

    expect(transferTripIds.has(7)).toBe(true);
    expect(transferTripIds.has(13)).toBe(true);

    for (const tripId of [7, 13]) {
      const transfer = transferRows.find((row) => row.trip_id === tripId);
      expect(transfer?.cascade_depth).toBe(2);
      expect(transfer?.trip_path).toEqual([DISRUPTED_TRIP_ID, tripId]);
      expect(transfer?.propagated_delay_min).toBeGreaterThanOrEqual(10);
      expect(transfer?.propagated_delay_min).toBeLessThan(
        INCIDENT_DELAY_MIN,
      );
    }
  });

  it('never revisits a trip already present in its traversal path', () => {
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.cascade_depth).toBeLessThanOrEqual(5);
      expect(new Set(row.trip_path).size).toBe(row.trip_path.length);
      expect(row.trip_path[0]).toBe(DISRUPTED_TRIP_ID);
    }
  });

  it('returns no cascade rows for an unknown trip and station', async () => {
    const empty = await adminQuery<CascadeRow>(
      'SELECT * FROM fn_calculate_downstream_cascade($1, $2, $3)',
      [9_999_999, 9_999_999, INCIDENT_DELAY_MIN],
    );

    expect(empty).toHaveLength(0);
  });
});
