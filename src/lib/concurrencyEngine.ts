import type { PoolClient, QueryResultRow } from 'pg';
import { escapeIdentifier } from 'pg';

import { getClient, getPool, query } from './postgres';
import type {
  OverbookingViolation,
  RebookWorkerResult,
  RebookWorkerStatus,
  StressTestOptions,
  StressTestTelemetry,
} from './types';

const REBOOKING_DB_ROLE = 'transit_admin';
const ACTIVE_BOOKING_STATUSES = `('CONFIRMED', 'REBOOKED')`;

interface EligiblePassenger extends QueryResultRow {
  reservation_id: number;
  passenger_id: number;
}

interface RebookFunctionRow extends QueryResultRow {
  success: boolean;
  original_reservation_id: number;
  new_reservation_id: number | null;
  passenger_id: number | null;
  target_trip_id: number;
  allocated_seat_id: number | null;
  seat_number: string | null;
  carriage_number: number | null;
  message: string;
}

function roundMillis(value: number): number {
  return Math.round(value * 100) / 100;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return roundMillis(values.reduce((total, value) => total + value, 0) / values.length);
}

function classifySuccess(
  row: RebookFunctionRow | undefined,
): RebookWorkerStatus {
  if (row?.success) {
    return 'REBOOKED';
  }
  if (row?.message && /no seats available|already/i.test(row.message)) {
    return 'WAITLISTED';
  }
  return 'FAILED';
}

async function countAvailableSeats(targetTripId: number): Promise<number> {
  const result = await query<{ available_seats: number }>(
    `SELECT COUNT(*)::INT AS available_seats
     FROM seats s
     JOIN carriages c ON s.carriage_id = c.carriage_id
     JOIN trains tr ON c.train_id = tr.train_id
     JOIN trips t ON tr.train_id = t.train_id
     WHERE t.trip_id = $1
       AND NOT EXISTS (
         SELECT 1
         FROM reservations r
         WHERE r.trip_id = $1
           AND r.seat_id = s.seat_id
           AND r.booking_status IN ${ACTIVE_BOOKING_STATUSES}
       )`,
    [targetTripId],
  );
  return result.rows[0]?.available_seats ?? 0;
}

async function findEligiblePassengers(
  originalTripId: number,
  limit: number,
): Promise<EligiblePassenger[]> {
  const result = await query<EligiblePassenger>(
    `SELECT r.reservation_id, r.passenger_id
     FROM reservations r
     WHERE r.trip_id = $1
       AND r.booking_status IN ('CONFIRMED', 'DISRUPTED')
     ORDER BY r.reservation_id ASC
     LIMIT $2`,
    [originalTripId, limit],
  );
  return result.rows;
}

async function runWorker(
  workerId: number,
  reservation: EligiblePassenger,
  targetTripId: number,
): Promise<RebookWorkerResult> {
  const workerStartedAt = performance.now();
  let client: PoolClient | undefined;

  try {
    client = await getClient();
    const transactionStartedAt = performance.now();
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${escapeIdentifier(REBOOKING_DB_ROLE)}`);

    const functionStartedAt = performance.now();
    const result = await client.query<RebookFunctionRow>(
      'SELECT * FROM fn_rebook_passenger_seat($1, $2)',
      [reservation.reservation_id, targetTripId],
    );
    const functionFinishedAt = performance.now();

    await client.query('COMMIT');
    const transactionFinishedAt = performance.now();
    const row = result.rows[0];
    const status = classifySuccess(row);

    return {
      workerId,
      reservationId: reservation.reservation_id,
      passengerId: row?.passenger_id ?? reservation.passenger_id,
      success: status === 'REBOOKED',
      status,
      allocatedSeatId: row?.allocated_seat_id ?? null,
      newReservationId: row?.new_reservation_id ?? null,
      seatNumber: row?.seat_number ?? null,
      carriageNumber: row?.carriage_number ?? null,
      message: row?.message ?? 'Rebooking function returned no rows',
      transactionMs: roundMillis(transactionFinishedAt - transactionStartedAt),
      lockWaitMs: roundMillis(functionFinishedAt - functionStartedAt),
    };
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK').catch(() => undefined);
    }
    return {
      workerId,
      reservationId: reservation.reservation_id,
      passengerId: reservation.passenger_id,
      success: false,
      status: 'FAILED',
      allocatedSeatId: null,
      newReservationId: null,
      seatNumber: null,
      carriageNumber: null,
      message: error instanceof Error ? error.message : String(error),
      transactionMs: roundMillis(performance.now() - workerStartedAt),
      lockWaitMs: 0,
    };
  } finally {
    client?.release();
  }
}

async function findOverbookingViolations(): Promise<OverbookingViolation[]> {
  const result = await query<OverbookingViolation>(
    `SELECT trip_id, seat_id, COUNT(*)::INT AS duplicate_count
     FROM reservations
     WHERE booking_status IN ${ACTIVE_BOOKING_STATUSES}
     GROUP BY trip_id, seat_id
     HAVING COUNT(*) > 1
     ORDER BY trip_id, seat_id`,
  );
  return result.rows;
}

export async function runStressTest(
  options: StressTestOptions = {},
): Promise<StressTestTelemetry> {
  const originalTripId = options.originalTripId ?? 1;
  const targetTripId = options.targetTripId ?? 2;
  const poolMax = getPool().options.max ?? 10;
  const requestedWorkers = Math.max(1, options.workerCount ?? 30);

  const startedAt = performance.now();
  const [targetSeatsAvailableBefore, eligible] = await Promise.all([
    countAvailableSeats(targetTripId),
    findEligiblePassengers(originalTripId, requestedWorkers),
  ]);

  const workersToRun = Math.min(requestedWorkers, eligible.length, poolMax);
  const selected = eligible.slice(0, workersToRun);

  const workers = await Promise.all(
    selected.map((reservation, index) =>
      runWorker(index + 1, reservation, targetTripId),
    ),
  );

  const violations = await findOverbookingViolations();
  const rebookedWorkers = workers.filter((worker) => worker.status === 'REBOOKED');
  const waitlistedWorkers = workers.filter(
    (worker) => worker.status === 'WAITLISTED',
  );
  const failedWorkers = workers.filter((worker) => worker.status === 'FAILED');
  const transactionTimes = workers.map((worker) => worker.transactionMs);
  const lockWaitTimes = workers.map((worker) => worker.lockWaitMs);

  return {
    originalTripId,
    targetTripId,
    requestedWorkers,
    eligiblePassengers: eligible.length,
    targetSeatsAvailableBefore,
    totalWorkers: workers.length,
    rebooked: rebookedWorkers.length,
    waitlisted: waitlistedWorkers.length,
    failed: failedWorkers.length,
    allocatedSeats: rebookedWorkers
      .map((worker) => worker.allocatedSeatId)
      .filter((seatId): seatId is number => seatId !== null),
    duplicateBookings: violations.length,
    violations,
    averageTransactionMs: mean(transactionTimes),
    maxTransactionMs:
      transactionTimes.length > 0 ? Math.max(...transactionTimes) : 0,
    averageLockWaitMs: mean(lockWaitTimes),
    totalDurationMs: roundMillis(performance.now() - startedAt),
    workers,
  };
}
