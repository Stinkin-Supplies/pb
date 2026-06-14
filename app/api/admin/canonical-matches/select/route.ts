/**
 * POST /api/admin/canonical-matches/select
 * Body: { token, proposal_ids: number[], action: 'confirm' | 'reject' }
 *
 * Acts on specific proposal IDs — used when the user wants to confirm
 * a subset of products within an OEM group rather than the whole group.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { proposal_ids, action } = body;
  if (!Array.isArray(proposal_ids) || proposal_ids.length === 0) {
    return NextResponse.json({ error: 'proposal_ids array required' }, { status: 400 });
  }
  if (!['confirm', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action must be confirm or reject' }, { status: 400 });
  }

  const status = action === 'confirm' ? 'confirmed' : 'rejected';

  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      UPDATE canonical_match_proposals
      SET status = $1, reviewed_by = 'admin-select', reviewed_at = NOW()
      WHERE id = ANY($2::int[])
        AND status = 'pending'
      RETURNING id
    `, [status, proposal_ids]);

    return NextResponse.json({ success: true, updated: rows.length });
  } finally {
    client.release();
  }
}
