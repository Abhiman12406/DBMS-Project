import { NextResponse } from 'next/server';

import type { PersonaContext, PersonaRole } from './types';

const PERSONA_ROLES: readonly PersonaRole[] = ['admin', 'dispatcher', 'passenger'];

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function jsonSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function jsonError(error: string, status = 500): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

function isPersonaRole(value: string): value is PersonaRole {
  return (PERSONA_ROLES as readonly string[]).includes(value);
}

export function parsePersona(request: Request): PersonaContext {
  const roleHeader = request.headers.get('x-persona-role')?.trim().toLowerCase();
  const role = roleHeader && roleHeader.length > 0 ? roleHeader : 'dispatcher';

  if (!isPersonaRole(role)) {
    throw new ApiError(
      400,
      `Unsupported X-Persona-Role '${role}'. Expected one of: ${PERSONA_ROLES.join(', ')}`,
    );
  }

  const passengerHeader = request.headers.get('x-passenger-id')?.trim();
  let passengerId: number | undefined;

  if (passengerHeader) {
    passengerId = Number(passengerHeader);
    if (!Number.isInteger(passengerId) || passengerId <= 0) {
      throw new ApiError(400, 'X-Passenger-Id header must be a positive integer');
    }
  }

  return { role, passengerId };
}

export function requirePassengerId(persona: PersonaContext): PersonaContext {
  if (persona.role === 'passenger' && !persona.passengerId) {
    throw new ApiError(
      400,
      'X-Passenger-Id header is required for the passenger persona',
    );
  }
  return persona;
}

export function requireRole(
  persona: PersonaContext,
  allowed: readonly PersonaRole[],
): void {
  if (!allowed.includes(persona.role)) {
    throw new ApiError(
      403,
      `The ${persona.role} persona is not permitted to perform this action`,
    );
  }
}

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Request body must be a JSON object');
  }

  return body as Record<string, unknown>;
}

export async function readOptionalJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const text = await request.text();

  if (text.trim() === '') {
    return {};
  }

  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
  }

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'Request body must be a JSON object');
  }

  return body as Record<string, unknown>;
}

export function requirePositiveInt(value: unknown, field: string): number {
  const parsed =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, `${field} must be a positive integer`);
  }

  return parsed;
}

export function optionalPositiveInt(
  value: unknown,
  field: string,
  fallback: number,
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return requirePositiveInt(value, field);
}

export function optionalString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(400, `${field} must be a non-empty string`);
  }
  return value.trim();
}

function statusForError(error: unknown): number {
  if (error instanceof ApiError) {
    return error.status;
  }

  const code = (error as { code?: unknown } | null)?.code;

  if (code === '42501') {
    return 403;
  }
  if (code === 11000) {
    return 409;
  }
  if (code === 121) {
    return 400;
  }
  if (code === '22P02' || code === '23502' || code === '23503' || code === '23514') {
    return 400;
  }

  return 500;
}

export function handleApiError(error: unknown): NextResponse {
  const status = statusForError(error);
  const message = error instanceof Error ? error.message : String(error);
  return jsonError(message, status);
}
