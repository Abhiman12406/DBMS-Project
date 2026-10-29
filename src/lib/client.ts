import type {
  LiveTripMonitorRow,
  PassengerJourneyRow,
  PassengerProfile,
  PersonaContext,
  PersonaRole,
  StationScheduleRow,
  TransitConnection,
  TransitLine,
  TransitRoute,
  TransitStation,
} from './types';

export interface NetworkSnapshot {
  persona: PersonaContext;
  lines: TransitLine[];
  stations: TransitStation[];
  routes: TransitRoute[];
  connections: TransitConnection[];
  trips: LiveTripMonitorRow[];
  stationSchedule: StationScheduleRow[];
  passengerProfile?: PassengerProfile | null;
  myReservations?: PassengerJourneyRow[];
  generatedAt: string;
}

export interface AuditRoleRow {
  rolname: string;
  rolsuper: boolean;
  rolcanlogin: boolean;
  rolinherit: boolean;
}

export interface AuditLockRow {
  locktype: string;
  mode: string;
  granted: boolean;
  lock_count: number;
}

export interface AuditSection<T> {
  data: T | null;
  error: string | null;
}

export interface AuditPayload {
  persona: PersonaContext;
  identity: AuditSection<{ current_user: string; current_database: string }>;
  roles: AuditSection<AuditRoleRow[]>;
  locks: AuditSection<AuditLockRow[]>;
  explain: {
    query: string;
    parameters: { tripId: number; stationId: number; delayMin: number };
    plan: unknown;
    error: string | null;
  };
  generatedAt: string;
}

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST';
  role: PersonaRole;
  passengerId?: number;
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    'X-Persona-Role': options.role,
  };

  if (options.passengerId !== undefined) {
    headers['X-Passenger-Id'] = String(options.passengerId);
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
    signal: options.signal,
  });

  let envelope: ApiEnvelope<T> | null = null;

  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = null;
  }

  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    throw new ApiRequestError(
      response.status,
      envelope?.error ?? `Request failed with HTTP ${response.status}`,
    );
  }

  return envelope.data;
}
