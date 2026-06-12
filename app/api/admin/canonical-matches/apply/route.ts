/**
 * app/api/admin/canonical-matches/apply/route.ts
 *
 * POST /api/admin/canonical-matches/apply
 * Body: { token }
 *
 * Merges all 'confirmed' proposals:
 *   - Picks the lower canonical_id as the "keeper"
 *   - Moves the merged canonical's product_vendors row(s) onto the keeper
 *   - Repoints catalog_unified.canonical_product_id
 *   - Deactivates the merged canonical_products row
 *   - Sets match_confidence = 'oem' on the keeper
 *
 * Safe to run repeatedly — only acts on 'confirmed' rows, marks them
 * 'applied' when done so they're not reprocessed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  try {
    const { rows: confirmed } = await client.query(`
      SELECT cmp.id AS proposal_id,
             a.canonical_product_id AS cp_a,
             b.canonical_product_id AS cp_b
      FROM canonical_match_proposals cmp
      JOIN catalog_unified a ON a.id = cmp.product_id_a
      JOIN catalog_unified b ON b.id = cmp.product_id_b
      WHERE cmp.status = 'confirmed'
        AND a.canonical_product_id IS NOT NULL
        AND b.canonical_product_id IS NOT NULL
        AND a.canonical_product_id != b.canonical_product_id
    `);

    let merged = 0;
    const errors: string[] = [];

    for (const row of confirmed) {
      const keepId  = Math.min(row.cp_a, row.cp_b);
      const mergeId = Math.max(row.cp_a, row.cp_b);

      try {
        await client.query('BEGIN');

        // Move product_vendors rows that don't already exist on the keeper
        await client.query(`
          UPDATE product_vendors
          SET canonical_id = $1
          WHERE canonical_id = $2
            AND source_vendor NOT IN (
              SELECT source_vendor FROM product_vendors WHERE canonical_id = $1
            )
        `, [keepId, mergeId]);

        // Any product_vendors rows left on mergeId (duplicate vendor) get deleted
        await client.query(`
          DELETE FROM product_vendors WHERE canonical_id = $1
        `, [mergeId]);

        // Repoint catalog_unified
        await client.query(`
          UPDATE catalog_unified
          SET canonical_product_id = $1
          WHERE canonical_product_id = $2
        `, [keepId, mergeId]);

        // Mark keeper as oem-matched
        await client.query(`
          UPDATE canonical_products
          SET match_confidence = 'oem', updated_at = NOW()
          WHERE id = $1
        `, [keepId]);

        // Deactivate merged canonical
        await client.query(`
          UPDATE canonical_products
          SET is_active = false, updated_at = NOW()
          WHERE id = $1
        `, [mergeId]);

        // Mark proposal applied
        await client.query(`
          UPDATE canonical_match_proposals
          SET status = 'applied'
          WHERE id = $1
        `, [row.proposal_id]);

        await client.query('COMMIT');
        merged++;
      } catch (err) {
        await client.query('ROLLBACK');
        errors.push(`proposal ${row.proposal_id}: ${String(err)}`);
      }
    }

    // Any 'confirmed' proposals where both sides already point to the same
    // canonical (e.g. merged via a different pair already) — mark applied
    await client.query(`
      UPDATE canonical_match_proposals cmp
      SET status = 'applied'
      WHERE cmp.status = 'confirmed'
        AND EXISTS (
          SELECT 1 FROM catalog_unified a, catalog_unified b
          WHERE a.id = cmp.product_id_a AND b.id = cmp.product_id_b
            AND a.canonical_product_id = b.canonical_product_id
        )
    `);

    return NextResponse.json({ merged, errors, total_confirmed: confirmed.length });
  } finally {
    client.release();
  }
}
