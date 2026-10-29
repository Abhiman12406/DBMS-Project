import type { QueryResultRow } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  closePostgres,
  getClient,
  query,
} from '../src/lib/postgres';

interface IdRow extends QueryResultRow {
  id: number;
}

interface TripRow extends QueryResultRow {
  trip_id: number;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface DuplicateRow extends QueryResultRow {
  trip_id: number;
  seat_id: number;
  duplicate_count: number;
}

interface RebookRow extends QueryResultRow {
  success: boolean;
  original_reservation_id: number;
  new_reservation_id: number | null;
  allocated_seat_id: number | null;
  message: string;
}

const WORKER_COUNT = 50;
const TARGET_SEAT_COUNT = 10;

async function attemptRebook(
  reservationId: number,
  targetTripId: number,
): Promise<RebookRow> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await client.query<RebookRow>(
      'SELECT * FROM fn_rebook_passenger_seat($1, $2)',
      [reservationId, targetTripId],
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

describe('ACID concurrent rebooking', () => {
  const suffix = `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const passengerEmailPrefix = `concurrency-${suffix}`;

  let sourceTrainId: number | undefined;
  let targetTrainId: number | undefined;
  let sourceTripId: number | undefined;
  let targetTripId: number | undefined;

  beforeAll(async () => {
    const sourceTrain = await query<TripRow>(
      `INSERT INTO trains (train_number, model, total_capacity)
       VALUES ($1, 'Concurrency Fixture Source', 50)
       RETURNING train_id`,
      [`TEST-SRC-${suffix}`],
    );
    sourceTrainId = sourceTrain.rows[0].train_id;

    const targetTrain = await query<TripRow>(
      `INSERT INTO trains (train_number, model, total_capacity)
       VALUES ($1, 'Concurrency Fixture Target', 10)
       RETURNING train_id`,
      [`TEST-DST-${suffix}`],
    );
    targetTrainId = targetTrain.rows[0].train_id;

    const sourceCarriage = await query<IdRow>(
      `INSERT INTO carriages (train_id, carriage_number, class_type)
       VALUES ($1, 1, 'STANDARD')
       RETURNING carriage_id AS id`,
      [sourceTrainId],
    );
    const targetCarriage = await query<IdRow>(
      `INSERT INTO carriages (train_id, carriage_number, class_type)
       VALUES ($1, 1, 'STANDARD')
       RETURNING carriage_id AS id`,
      [targetTrainId],
    );

    const sourceSeats = await query<IdRow>(
      `INSERT INTO seats (carriage_id, seat_number, seat_type)
       SELECT $1, 'SRC-' || g,
              CASE WHEN g % 2 = 1 THEN 'WINDOW' ELSE 'AISLE' END
       FROM generate_series(1, $2) AS g
       RETURNING seat_id AS id`,
      [sourceCarriage.rows[0].id, WORKER_COUNT],
    );

    const targetSeats = await query<IdRow>(
      `INSERT INTO seats (carriage_id, seat_number, seat_type)
       SELECT $1, 'DST-' || g,
              CASE WHEN g % 2 = 1 THEN 'WINDOW' ELSE 'AISLE' END
       FROM generate_series(1, $2) AS g
       RETURNING seat_id AS id`,
      [targetCarriage.rows[0].id, TARGET_SEAT_COUNT],
    );

    const sourceTrip = await query<TripRow>(
      `INSERT INTO trips (route_id, train_id, service_date, status)
       VALUES (1, $1, '2026-10-29', 'SCHEDULED')
       RETURNING trip_id`,
      [sourceTrainId],
    );
    sourceTripId = sourceTrip.rows[0].trip_id;

    const targetTrip = await query<TripRow>(
      `INSERT INTO trips (route_id, train_id, service_date, status)
       VALUES (1, $1, '2026-10-29', 'SCHEDULED')
       RETURNING trip_id`,
      [targetTrainId],
    );
    targetTripId = targetTrip.rows[0].trip_id;

    const passengers = await query<IdRow>(
      `INSERT INTO passengers (full_name, email, phone)
       SELECT 'Concurrency Fixture ' || g, $1 || '-' || g || '@test.local', NULL
       FROM generate_series(1, $2) AS g
       RETURNING passenger_id AS id`,
      [passengerEmailPrefix, WORKER_COUNT],
    );

    await query(
      `INSERT INTO reservations (
         passenger_id, trip_id, seat_id, origin_station_id,
         destination_station_id, booking_status
       )
       SELECT p_id, $1, s_id, 1, 5, 'CONFIRMED'
       FROM unnest($2::INT[], $3::INT[]) AS fixture(p_id, s_id)`,
      [
        sourceTripId,
        passengers.rows.map((row) => row.id),
        sourceSeats.rows.map((row) => row.id),
      ],
    );
  });

  afterAll(async () => {
    const testTripIds = [sourceTripId, targetTripId].filter(
      (id): id is number => id !== undefined,
    );
    const testTrainIds = [sourceTrainId, targetTrainId].filter(
      (id): id is number => id !== undefined,
    );

    if (testTripIds.length > 0) {
      await query(
        'DELETE FROM reservations WHERE trip_id = ANY($1::INT[])',
        [testTripIds],
      );
      await query('DELETE FROM trips WHERE trip_id = ANY($1::INT[])', [
        testTripIds,
      ]);
    }

    await query('DELETE FROM passengers WHERE email LIKE $1', [
      `${passengerEmailPrefix}-%`,
    ]);

    if (testTrainIds.length > 0) {
      await query('DELETE FROM trains WHERE train_id = ANY($1::INT[])', [
        testTrainIds,
      ]);
    }

    await closePostgres();
  });

  it('serialises 50 workers onto 10 seats with zero double bookings', async () => {
    if (
      sourceTripId === undefined ||
      targetTripId === undefined ||
      targetTrainId === undefined
    ) {
      throw new Error('Fixture was not initialised');
    }

    const resolvedSourceTripId = sourceTripId;
    const resolvedTargetTripId = targetTripId;
    const resolvedTargetTrainId = targetTrainId;

    const targetSeats = await query<IdRow>(
      `SELECT s.seat_id AS id
       FROM seats s
       JOIN carriages c ON s.carriage_id = c.carriage_id
       WHERE c.train_id = $1
       ORDER BY s.seat_id`,
      [resolvedTargetTrainId],
    );
    expect(targetSeats.rows).toHaveLength(TARGET_SEAT_COUNT);

    const reservations = await query<IdRow>(
      `SELECT reservation_id AS id
       FROM reservations
       WHERE trip_id = $1
       ORDER BY reservation_id`,
      [resolvedSourceTripId],
    );
    expect(reservations.rows).toHaveLength(WORKER_COUNT);

    const workers = reservations.rows.map((row) =>
      attemptRebook(row.id, resolvedTargetTripId),
    );
    const results = await Promise.all(workers);

    const successful = results.filter((row) => row.success);
    const rejected = results.filter((row) => !row.success);
    const allocatedSeatIds = successful
      .map((row) => row.allocated_seat_id)
      .filter((seatId): seatId is number => seatId !== null);

    expect(successful).toHaveLength(TARGET_SEAT_COUNT);
    expect(rejected).toHaveLength(WORKER_COUNT - TARGET_SEAT_COUNT);
    expect(new Set(allocatedSeatIds).size).toBe(TARGET_SEAT_COUNT);
    for (const seatId of allocatedSeatIds) {
      expect(targetSeats.rows.some((seat) => seat.id === seatId)).toBe(true);
    }
    for (const row of rejected) {
      expect(row.message).toMatch(/No seats available/i);
    }

    const duplicates = await query<DuplicateRow>(
      `SELECT trip_id, seat_id, COUNT(*)::INT AS duplicate_count
       FROM reservations
       WHERE booking_status IN ('CONFIRMED', 'REBOOKED')
       GROUP BY trip_id, seat_id
       HAVING COUNT(*) > 1`,
    );
    expect(duplicates.rows).toHaveLength(0);

    const activeOnTarget = await query<CountRow>(
      `SELECT COUNT(*)::INT AS count
       FROM reservations
       WHERE trip_id = $1
         AND booking_status IN ('CONFIRMED', 'REBOOKED')`,
      [resolvedTargetTripId],
    );
    expect(activeOnTarget.rows[0].count).toBe(TARGET_SEAT_COUNT);

    const distinctTargetSeats = await query<CountRow>(
      `SELECT COUNT(DISTINCT seat_id)::INT AS count
       FROM reservations
       WHERE trip_id = $1
         AND booking_status IN ('CONFIRMED', 'REBOOKED')`,
      [resolvedTargetTripId],
    );
    expect(distinctTargetSeats.rows[0].count).toBe(TARGET_SEAT_COUNT);

    const originalStatuses = await query<{ booking_status: string; count: number }>(
      `SELECT booking_status, COUNT(*)::INT AS count
       FROM reservations
       WHERE trip_id = $1
       GROUP BY booking_status`,
      [resolvedSourceTripId],
    );
    const statusCounts = Object.fromEntries(
      originalStatuses.rows.map((row) => [row.booking_status, row.count]),
    );
    expect(statusCounts.REBOOKED).toBe(TARGET_SEAT_COUNT);
    expect(statusCounts.CONFIRMED).toBe(WORKER_COUNT - TARGET_SEAT_COUNT);
  });
});
