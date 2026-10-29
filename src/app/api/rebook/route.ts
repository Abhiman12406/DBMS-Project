import {
  handleApiError,
  jsonSuccess,
  optionalPositiveInt,
  parsePersona,
  readOptionalJsonBody,
  requireRole,
} from '@/lib/api';
import { runStressTest } from '@/lib/concurrencyEngine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const persona = parsePersona(request);
    requireRole(persona, ['admin', 'dispatcher']);

    const body = await readOptionalJsonBody(request);

    const originalTripId = optionalPositiveInt(
      body.originalTripId ?? body.original_trip_id,
      'originalTripId',
      1,
    );
    const targetTripId = optionalPositiveInt(
      body.targetTripId ?? body.target_trip_id,
      'targetTripId',
      2,
    );
    const workerCount = optionalPositiveInt(
      body.workerCount ?? body.worker_count,
      'workerCount',
      30,
    );

    const telemetry = await runStressTest({
      originalTripId,
      targetTripId,
      workerCount,
    });

    return jsonSuccess({ persona, ...telemetry });
  } catch (error) {
    return handleApiError(error);
  }
}
