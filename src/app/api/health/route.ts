import { NextResponse } from 'next/server';

import { checkMongoHealth } from '@/lib/mongodb';
import { checkPostgresHealth } from '@/lib/postgres';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const [postgres, mongodb] = await Promise.all([
    checkPostgresHealth(),
    checkMongoHealth(),
  ]);

  const healthy = postgres.connected && mongodb.connected;

  return NextResponse.json(
    {
      success: healthy,
      data: {
        postgres,
        mongodb,
        checkedAt: new Date().toISOString(),
      },
      ...(healthy ? {} : { error: 'One or more database engines are unreachable' }),
    },
    { status: healthy ? 200 : 503 },
  );
}
