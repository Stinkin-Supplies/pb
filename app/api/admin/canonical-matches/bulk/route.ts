/**
 * app/api/admin/canonical-matches/bulk/route.ts
 *
 * POST /api/admin/canonical-matches/bulk
 * Body: { token, shared_oem_number, action: 'confirm' | 'reject' }
 *
 * Acts on every pending proposal sharing the given OEM number at once —
 * since all pairs under one OEM number are almost always the same
 * real-world part, reviewing by OEM group is much faster than by pair.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { shared_oem_number, action } = body;
  if (!shared_oem_number || !['confirm', 'reject', 'reopen'].includes(action)) {
    return NextResponse.json({ error: 'shared_oem_number and action (confirm|reject|reopen) required' }, { status: 400 });
  }

  const status = action === 'confirm' ? 'confirmed' : action === 'reopen' ? 'pending' : 'rejected';

  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      UPDATE canonical_match_proposals
      SET status = $1, reviewed_by = 'admin-bulk', reviewed_at = NOW()
      WHERE shared_oem_number = $2
      RETURNING id
    `, [status, shared_oem_number]);

    return NextResponse.json({ success: true, updated: rows.length });
  } finally {
    client.release();
  }
}
