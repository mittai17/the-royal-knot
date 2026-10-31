import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Container liveness probe: intentionally has no dependency on the backend. */
export function GET() {
  return NextResponse.json({ status: 'ok', service: 'frontend', time: new Date().toISOString() });
}
