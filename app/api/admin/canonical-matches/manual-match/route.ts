/**
 * app/api/admin/canonical-matches/manual-match/route.ts
 *
 * POST /api/admin/canonical-matches/manual-match
 * Body: { token, product_ids: number[] }
 *
 * Creates pairwise canonical_match_proposals (match_reason='manual') for
 * every pair in product_ids. These show up in the review queue grouped
 * under their own "Manual match" group (one group per call to this route),
 * since they have no shared_oem_number.
 *
 * Use for matches the OEM-based scan missed entirely — e.g. same physical
 * part listed under different/no OEM numbers across vendors.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { product_ids } = body;
  if (!Array.isArray(product_ids) || product_ids.length < 2) {
    return NextResponse.json({ error: 'product_ids (array of 2+) required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Group key — shared across this batch so they render together in the UI
    const groupKey = `MANUAL-${Date.now()}-${product_ids.join('-')}`;

    let created = 0;
    const errors: string[] = [];

    for (let i = 0; i < product_ids.length - 1; i++) {
      for (let j = i + 1; j < product_ids.length; j++) {
        const a = Math.min(product_ids[i], product_ids[j]);
        const b = Math.max(product_ids[i], product_ids[j]);
        if (a === b) continue;

        try {
          const { rowCount } = await client.query(`
            INSERT INTO canonical_match_proposals
              (product_id_a, product_id_b, match_reason, match_score, shared_oem_number, status)
            VALUES ($1, $2, 'manual', 1.000, $3, 'pending')
            ON CONFLICT (product_id_a, product_id_b) DO NOTHING
          `, [a, b, groupKey]);
          if (rowCount && rowCount > 0) created++;
        } catch (err) {
          errors.push(`${a}-${b}: ${String(err)}`);
        }
      }
    }

    return NextResponse.json({ success: true, created, group_key: groupKey, errors });
  } finally {
    client.release();
  }
}
