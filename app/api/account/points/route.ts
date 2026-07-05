/**
 * app/api/account/points/route.ts
 *
 * GET /api/account/points?userId=<supabase-auth-uuid>
 *   Returns { pointsBalance } — 0 for guests or users who've never earned any.
 *   No auth check here beyond requiring a userId — fine for a demo-stage build,
 * but worth revisiting before real money is on the line: right now the client
 * supplies userId itself rather than it being derived from a verified session
 * token, so nothing stops a request for someone else's balance if the uuid
 * leaks. orders/create is the route that actually spends points, and it has
 * the same limitation — flagging both together rather than fixing only one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCatalogDb } from '@/lib/db/catalog';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ pointsBalance: 0 });
  }

  const db = getCatalogDb();
  const { rows } = await db.query(
    `SELECT points_balance FROM customer_points WHERE user_id = $1`,
    [userId]
  );

  return NextResponse.json({ pointsBalance: rows[0]?.points_balance ?? 0 });
}
