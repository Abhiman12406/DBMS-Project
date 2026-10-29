import { ObjectId, type WithId, type Document } from 'mongodb';

import { getMongoDb } from './mongodb';
import { getClient } from './postgres';
import type {
  AppliedTripDelay,
  CascadeResult,
  CascadeStopRow,
  DisruptionEventDocument,
  DownstreamTripSummary,
  PropagateDisruptionInput,
} from './types';

const COLLECTION = 'disruption_events';

function generateIncidentCode(): string {
  const year = new Date().getUTCFullYear();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `DISR-${year}-${suffix}`;
}

function serializeDocument(
  doc: WithId<Document> & Record<string, unknown>,
): DisruptionEventDocument {
  const serialized = { ...doc, _id: doc._id.toHexString() };
  return serialized as unknown as DisruptionEventDocument;
}

export async function ingestDisruption(
  input: PropagateDisruptionInput,
): Promise<DisruptionEventDocument> {
  const db = await getMongoDb();
  const reportedAt = input.reported_at ? new Date(input.reported_at) : new Date();

  const document = {
    incident_code: input.incident_code ?? generateIncidentCode(),
    incident_type: input.incident_type,
    severity: input.severity,
    reported_at: reportedAt,
    source: input.source,
    affected_scope: input.affected_scope,
    temporal_window: input.temporal_window ?? {},
    raw_telemetry: input.raw_telemetry ?? {},
    postgres_sync: {
      status: 'PENDING' as const,
      cascade_trips_affected: 0,
      passengers_affected: 0,
      applied_at: null,
    },
    created_at: new Date(),
  };

  const result = await db.collection(COLLECTION).insertOne(document);
  const stored = await db
    .collection(COLLECTION)
    .findOne({ _id: result.insertedId });

  if (!stored) {
    throw new Error('Disruption document was inserted but could not be read back');
  }

  return serializeDocument(stored);
}

async function markSyncFailed(incidentId: string, message: string): Promise<void> {
  const db = await getMongoDb();
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(incidentId) },
    {
      $set: {
        'postgres_sync.status': 'FAILED',
        'postgres_sync.error': message,
        'postgres_sync.applied_at': null,
      },
    },
  );
}

export async function propagateDisruption(
  input: PropagateDisruptionInput,
): Promise<CascadeResult> {
  if (!Number.isInteger(input.tripId) || input.tripId <= 0) {
    throw new Error('tripId must be a positive integer');
  }
  if (!Number.isInteger(input.stationId) || input.stationId <= 0) {
    throw new Error('stationId must be a positive integer');
  }
  if (!Number.isInteger(input.delayMin) || input.delayMin <= 0) {
    throw new Error('delayMin must be a positive integer');
  }

  const incident = await ingestDisruption(input);
  const incidentId = incident._id as string;
  const startedAt = performance.now();
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const appliedResult = await client.query<AppliedTripDelay>(
      'SELECT * FROM fn_apply_trip_delay($1, $2, $3, $4)',
      [
        input.tripId,
        input.stationId,
        input.delayMin,
        input.reason ?? 'OPERATIONAL_DISRUPTION',
      ],
    );

    const summaryResult = await client.query<DownstreamTripSummary>(
      'SELECT * FROM fn_get_downstream_trips_summary($1, $2, $3)',
      [input.tripId, input.stationId, input.delayMin],
    );

    const cascadeResult = await client.query<CascadeStopRow>(
      'SELECT * FROM fn_calculate_downstream_cascade($1, $2, $3)',
      [input.tripId, input.stationId, input.delayMin],
    );

    const affectedTripIds = summaryResult.rows.map((row) => row.trip_id);
    const passengerResult = await client.query<{ count: number }>(
      `SELECT COUNT(DISTINCT r.reservation_id)::INT AS count
       FROM reservations r
       WHERE r.trip_id = ANY($1::INT[])
         AND r.booking_status IN ('CONFIRMED', 'REBOOKED', 'DISRUPTED')`,
      [affectedTripIds],
    );

    await client.query('COMMIT');

    const executionTimeMs =
      Math.round((performance.now() - startedAt) * 100) / 100;
    const affectedPassengerCount = passengerResult.rows[0]?.count ?? 0;

    const db = await getMongoDb();
    await db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(incidentId) },
      {
        $set: {
          'postgres_sync.status': 'APPLIED',
          'postgres_sync.cascade_trips_affected': summaryResult.rows.length,
          'postgres_sync.passengers_affected': affectedPassengerCount,
          'postgres_sync.applied_at': new Date(),
        },
        $unset: { 'postgres_sync.error': '' },
      },
    );

    const applied =
      appliedResult.rows[0] ??
      ({
        trip_id: input.tripId,
        updated_stops_count: 0,
        new_trip_status: 'UNKNOWN',
        affected_passengers: 0,
        refreshed_at: new Date(),
      } satisfies AppliedTripDelay);

    return {
      incident: {
        ...incident,
        postgres_sync: {
          status: 'APPLIED',
          cascade_trips_affected: summaryResult.rows.length,
          passengers_affected: affectedPassengerCount,
          applied_at: new Date(),
        },
      },
      applied,
      affectedTripCount: summaryResult.rows.length,
      affectedPassengerCount,
      downstreamTrips: summaryResult.rows,
      cascadeStops: cascadeResult.rows,
      executionTimeMs,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : String(error);
    await markSyncFailed(incidentId, message);
    throw error;
  } finally {
    client.release();
  }
}
