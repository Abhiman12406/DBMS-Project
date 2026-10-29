import {
  Pool,
  type PoolClient,
  type PoolConfig,
  type QueryResult,
  type QueryResultRow,
  escapeIdentifier,
} from 'pg';

import type {
  PersonaContext,
  PersonaRole,
  PostgresHealth,
} from './types';

const PERSONA_DB_ROLE: Record<PersonaRole, string> = {
  admin: 'transit_admin',
  dispatcher: 'dispatcher_role',
  passenger: 'passenger_role',
};

const poolCache = globalThis as unknown as {
  __transitPgPool?: Pool;
};

export function getPostgresPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  const isLocal =
    (!connectionString &&
      (process.env.POSTGRES_HOST === 'localhost' ||
        process.env.POSTGRES_HOST === '127.0.0.1' ||
        !process.env.POSTGRES_HOST)) ||
    Boolean(
      connectionString &&
        (connectionString.includes('localhost') ||
          connectionString.includes('127.0.0.1')),
    );

  const sslDisabled =
    process.env.POSTGRES_SSL === 'false' || process.env.PGSSLMODE === 'disable';
  const sslEnabled =
    process.env.POSTGRES_SSL === 'true' || (!sslDisabled && !isLocal);

  const ssl = sslEnabled ? { rejectUnauthorized: false } : undefined;
  const max = Number(process.env.PG_POOL_MAX ?? (isLocal ? 50 : 20));

  if (connectionString) {
    return {
      connectionString,
      ssl,
      max,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    };
  }

  return {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD ?? 'postgres',
    database: process.env.POSTGRES_DB ?? 'transit_db',
    ssl,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

export function getPool(): Pool {
  if (!poolCache.__transitPgPool) {
    poolCache.__transitPgPool = new Pool(getPostgresPoolConfig());
  }
  return poolCache.__transitPgPool;
}

export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[]);
}

export async function withPersona<T>(
  persona: PersonaContext,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (process.env.DISABLE_DB_ROLES !== 'true') {
      const dbRole = PERSONA_DB_ROLE[persona.role];
      await client.query(`SET LOCAL ROLE ${escapeIdentifier(dbRole)}`);
    }

    if (persona.role === 'passenger') {
      if (!persona.passengerId) {
        throw new Error('passengerId is required for the passenger persona');
      }
      await client.query(`SELECT set_config('app.current_passenger_id', $1, true)`, [
        String(persona.passengerId),
      ]);
    }

    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function queryAs<T extends QueryResultRow = QueryResultRow>(
  persona: PersonaContext,
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  return withPersona(persona, async (client) => {
    const result = await client.query<T>(text, params as unknown[]);
    return result.rows;
  });
}

export async function adminQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  return queryAs<T>({ role: 'admin' }, text, params);
}

export async function dispatcherQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  return queryAs<T>({ role: 'dispatcher' }, text, params);
}

export async function passengerQuery<T extends QueryResultRow = QueryResultRow>(
  passengerId: number,
  text: string,
  params: readonly unknown[] = [],
): Promise<T[]> {
  return queryAs<T>({ role: 'passenger', passengerId }, text, params);
}

export async function checkPostgresHealth(): Promise<PostgresHealth> {
  const startedAt = performance.now();
  try {
    const result = await getPool().query<{
      database: string;
      username: string;
      server_version: string;
    }>(
      `SELECT current_database() AS database,
              current_user AS username,
              current_setting('server_version') AS server_version`,
    );
    const row = result.rows[0];
    return {
      connected: true,
      database: row.database,
      user: row.username,
      serverVersion: row.server_version,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function closePostgres(): Promise<void> {
  if (poolCache.__transitPgPool) {
    await poolCache.__transitPgPool.end();
    poolCache.__transitPgPool = undefined;
  }
}
