import type { WithId, Document } from 'mongodb';

import {
  ApiError,
  handleApiError,
  jsonSuccess,
  optionalPositiveInt,
  optionalString,
  parsePersona,
  readJsonBody,
  requirePositiveInt,
  requireRole,
} from '@/lib/api';
import { propagateDisruption } from '@/lib/cascadeEngine';
import { getMongoDb } from '@/lib/mongodb';
import type {
  DisruptionScope,
  IncidentSeverity,
  IncidentType,
  PropagateDisruptionInput,
  TemporalWindow,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COLLECTION = 'disruption_events';

const INCIDENT_TYPES: readonly IncidentType[] = [
  'CATENARY_POWER_FAILURE',
  'SIGNAL_SYSTEM_FAULT',
  'TRACK_OBSTRUCTION',
  'ROLLING_STOCK_DEFECT',
  'SEVERE_WEATHER_ALERT',
  'POLICE_INVESTIGATION',
];

const SEVERITIES: readonly IncidentSeverity[] = [
  'MINOR',
  'MODERATE',
  'SEVERE',
  'CRITICAL',
];

function isIncidentType(value: unknown): value is IncidentType {
  return (
    typeof value === 'string' &&
    (INCIDENT_TYPES as readonly string[]).includes(value)
  );
}

function isSeverity(value: unknown): value is IncidentSeverity {
  return (
    typeof value === 'string' &&
    (SEVERITIES as readonly string[]).includes(value)
  );
}

function requireObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, `${field} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function parseScope(value: unknown): DisruptionScope {
  const scope = requireObject(value, 'affected_scope');
  const lineCode = optionalString(
    scope.primary_line_code,
    'affected_scope.primary_line_code',
  );

  if (!lineCode) {
    throw new ApiError(
      400,
      'affected_scope.primary_line_code is required',
    );
  }

  const stations = scope.stations_affected;

  if (
    !Array.isArray(stations) ||
    stations.length === 0 ||
    !stations.every(
      (station) => typeof station === 'string' && station.trim() !== '',
    )
  ) {
    throw new ApiError(
      400,
      'affected_scope.stations_affected must be a non-empty array of station codes',
    );
  }

  const segmentIds = scope.track_segment_ids;

  if (
    segmentIds !== undefined &&
    (!Array.isArray(segmentIds) ||
      !segmentIds.every(
        (segmentId) =>
          typeof segmentId === 'number' && Number.isInteger(segmentId),
      ))
  ) {
    throw new ApiError(
      400,
      'affected_scope.track_segment_ids must be an array of integers',
    );
  }

  return {
    primary_line_code: lineCode,
    stations_affected: stations.map((station) => station.trim()),
    ...(segmentIds ? { track_segment_ids: segmentIds as number[] } : {}),
  };
}

function parseTemporalWindow(value: unknown): TemporalWindow | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const window = requireObject(value, 'temporal_window');
  const result: TemporalWindow = {};

  for (const key of ['estimated_start', 'estimated_cleared'] as const) {
    const raw = window[key];

    if (raw === undefined || raw === null) {
      result[key] = null;
      continue;
    }

    if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
      throw new ApiError(
        400,
        `temporal_window.${key} must be a valid ISO timestamp or null`,
      );
    }

    result[key] = raw;
  }

  return result;
}

function parseReportedAt(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new ApiError(400, 'reported_at must be a valid ISO timestamp');
  }

  return value;
}

export async function GET(request: Request) {
  try {
    const persona = parsePersona(request);
    const url = new URL(request.url);
    const limit = Math.min(
      optionalPositiveInt(
        url.searchParams.get('limit') ?? undefined,
        'limit',
        20,
      ),
      100,
    );

    const db = await getMongoDb();
    const documents = await db
      .collection(COLLECTION)
      .find({})
      .sort({ reported_at: -1, _id: -1 })
      .limit(limit)
      .toArray();

    const incidents = documents.map((document: WithId<Document>) => ({
      ...document,
      _id: document._id.toHexString(),
    }));

    return jsonSuccess({
      persona,
      incidents,
      count: incidents.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const persona = parsePersona(request);
    requireRole(persona, ['admin', 'dispatcher']);

    const body = await readJsonBody(request);

    const incidentType = body.incident_type;
    const severity = body.severity;

    if (!isIncidentType(incidentType)) {
      throw new ApiError(
        400,
        `incident_type must be one of: ${INCIDENT_TYPES.join(', ')}`,
      );
    }

    if (!isSeverity(severity)) {
      throw new ApiError(
        400,
        `severity must be one of: ${SEVERITIES.join(', ')}`,
      );
    }

    const source = optionalString(body.source, 'source');

    if (!source) {
      throw new ApiError(400, 'source is required');
    }

    const incidentCode = optionalString(body.incident_code, 'incident_code');

    if (incidentCode && !/^DISR-\d{4}-\d{4}$/.test(incidentCode)) {
      throw new ApiError(
        400,
        'incident_code must match the DISR-YYYY-XXXX pattern',
      );
    }

    const rawTelemetry =
      body.raw_telemetry === undefined
        ? undefined
        : requireObject(body.raw_telemetry, 'raw_telemetry');

    const input: PropagateDisruptionInput = {
      incident_code: incidentCode,
      incident_type: incidentType,
      severity,
      reported_at: parseReportedAt(body.reported_at),
      source,
      affected_scope: parseScope(body.affected_scope),
      temporal_window: parseTemporalWindow(body.temporal_window),
      raw_telemetry: rawTelemetry,
      tripId: requirePositiveInt(body.tripId ?? body.trip_id, 'tripId'),
      stationId: requirePositiveInt(
        body.stationId ?? body.station_id,
        'stationId',
      ),
      delayMin: requirePositiveInt(
        body.delayMin ?? body.delay_min,
        'delayMin',
      ),
      reason: optionalString(body.reason, 'reason'),
    };

    const result = await propagateDisruption(input);

    return jsonSuccess({ persona, ...result }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
