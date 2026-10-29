import type { PoolClient, QueryResultRow } from 'pg';

import {
  handleApiError,
  jsonSuccess,
  optionalPositiveInt,
  parsePersona,
  requireRole,
} from '@/lib/api';
import { withPersona } from '@/lib/postgres';
import type { PersonaContext } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface IdentityRow extends QueryResultRow {
  current_user: string;
  current_database: string;
}

interface RoleRow extends QueryResultRow {
  rolname: string;
  rolsuper: boolean;
  rolcanlogin: boolean;
  rolinherit: boolean;
}

interface LockRow extends QueryResultRow {
  locktype: string;
  mode: string;
  granted: boolean;
  lock_count: number;
}

interface ExplainRow extends QueryResultRow {
  'QUERY PLAN': unknown;
}

interface SectionResult<T> {
  data: T | null;
  error: string | null;
}

async function runSection<T>(
  persona: PersonaContext,
  work: (client: PoolClient) => Promise<T>,
): Promise<SectionResult<T>> {
  try {
    return { data: await withPersona(persona, work), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(request: Request) {
  try {
    const persona = parsePersona(request);
    requireRole(persona, ['admin']);

    const url = new URL(request.url);
    const tripId = optionalPositiveInt(
      url.searchParams.get('tripId') ?? undefined,
      'tripId',
      1,
    );
    const stationId = optionalPositiveInt(
      url.searchParams.get('stationId') ?? undefined,
      'stationId',
      3,
    );
    const delayMin = optionalPositiveInt(
      url.searchParams.get('delayMin') ?? undefined,
      'delayMin',
      45,
    );

    const [identity, roles, locks, explain] = await Promise.all([
      runSection(persona, async (client) => {
        const result = await client.query<IdentityRow>(
          `SELECT current_user AS current_user,
                  current_database() AS current_database`,
        );
        return result.rows[0];
      }),
      runSection(persona, async (client) => {
        const result = await client.query<RoleRow>(
          `SELECT rolname, rolsuper, rolcanlogin, rolinherit
           FROM pg_roles
           WHERE rolname IN ('transit_admin', 'dispatcher_role', 'passenger_role')
           ORDER BY rolname`,
        );
        return result.rows;
      }),
      runSection(persona, async (client) => {
        const result = await client.query<LockRow>(
          `SELECT locktype, mode, granted, COUNT(*)::INT AS lock_count
           FROM pg_locks
           GROUP BY locktype, mode, granted
           ORDER BY locktype, mode, granted`,
        );
        return result.rows;
      }),
      runSection(persona, async (client) => {
        const result = await client.query<ExplainRow>(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
           SELECT * FROM fn_calculate_downstream_cascade($1, $2, $3)`,
          [tripId, stationId, delayMin],
        );
        return result.rows[0]?.['QUERY PLAN'] ?? null;
      }),
    ]);

    return jsonSuccess({
      persona,
      identity,
      roles,
      locks,
      explain: {
        query: 'SELECT * FROM fn_calculate_downstream_cascade($1, $2, $3)',
        parameters: { tripId, stationId, delayMin },
        plan: explain.data,
        error: explain.error,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
