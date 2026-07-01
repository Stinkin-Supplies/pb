/**
 * app/api/admin/canonical-matches/variant-candidates/route.ts
 *
 * GET  /api/admin/canonical-matches/variant-candidates?token=...&resolved=false
 *   List flagged variant-candidate groups (with product details joined in).
 *
 * POST /api/admin/canonical-matches/variant-candidates
 *   Body: { token, group_key, product_ids: number[], reason?, notes? }
 *   Flag a group as "these are variants, not duplicates — revisit later
 *   to build a proper variant group". Also rejects any pending
 *   canonical_match_proposals for this group_key, since they shouldn't
 *   be merged as canonical duplicates.
 *
 * PATCH /api/admin/canonical-matches/variant-candidates
 *   Body: { token, id, resolved: true }
 *   Mark a candidate as resolved (variant group built).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resolvedParam = req.nextUrl.searchParams.get('resolved');
  const resolved = resolvedParam === 'true' ? true : resolvedParam === 'false' ? false : null;

  const client = await pool.connect();
  try {
    const where = resolved === null ? '' : 'WHERE vc.resolved = $1';
    const params = resolved === null ? [] : [resolved];

    const { rows } = await client.query(`
      SELECT vc.*,
        (
          SELECT json_agg(json_build_object(
            'id', cu.id, 'name', cu.name, 'source_vendor', cu.source_vendor,
            'vendor_sku', cu.vendor_sku, 'brand', cu.brand, 'computed_price', cu.computed_price,
            'image_url', COALESCE(
              cu.image_url,
              (SELECT cm.url FROM catalog_media cm WHERE cm.product_id = cu.id ORDER BY cm.priority ASC LIMIT 1),
              cu.image_urls[1]
            ),
            'display_category', cu.display_category,
            'display_subcategory', cu.display_subcategory
          ) ORDER BY cu.source_vendor, cu.name)
          FROM catalog_unified cu
          WHERE cu.id = ANY(vc.product_ids)
        ) AS products
      FROM catalog_variant_candidates vc
      ${where}
      ORDER BY vc.created_at DESC
    `, params);

    return NextResponse.json({ candidates: rows });
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { group_key, product_ids, reason, notes } = body;
  if (!group_key || !Array.isArray(product_ids) || product_ids.length < 2) {
    return NextResponse.json({ error: 'group_key and product_ids (2+) required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [candidate] } = await client.query(`
      INSERT INTO catalog_variant_candidates (group_key, product_ids, reason, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (group_key) DO UPDATE
        SET product_ids = EXCLUDED.product_ids,
            reason = EXCLUDED.reason,
            notes = COALESCE(EXCLUDED.notes, catalog_variant_candidates.notes)
      RETURNING *
    `, [group_key, product_ids, reason ?? null, notes ?? null]);

    // Reject all non-applied proposals for this group — they're variants,
    // not canonical duplicates. This handles both pending AND already-rejected
    // proposals so flagging from the rejected tab also works.
    const { rowCount: rejectedByOem } = await client.query(`
      UPDATE canonical_match_proposals
      SET status = 'rejected', reviewed_by = 'flagged-as-variant', reviewed_at = NOW()
      WHERE shared_oem_number = $1 AND status != 'applied'
    `, [group_key]);

    // For __pair_* groups (no shared OEM number), match by product IDs instead
    const { rowCount: rejectedByProduct } = await client.query(`
      UPDATE canonical_match_proposals
      SET status = 'rejected', reviewed_by = 'flagged-as-variant', reviewed_at = NOW()
      WHERE shared_oem_number IS NULL
        AND status != 'applied'
        AND (product_id_a = ANY($1::int[]) OR product_id_b = ANY($1::int[]))
    `, [product_ids]);

    const rejected = (rejectedByOem ?? 0) + (rejectedByProduct ?? 0);

    await client.query('COMMIT');

    return NextResponse.json({ success: true, candidate, rejected_proposals: rejected ?? 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (body.token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, resolved, notes } = body;
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (resolved !== undefined) {
      sets.push(`resolved = $${i++}`);
      vals.push(resolved);
      sets.push(`resolved_at = ${resolved ? 'NOW()' : 'NULL'}`);
    }
    if (notes !== undefined) {
      sets.push(`notes = $${i++}`);
      vals.push(notes);
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }
    vals.push(id);

    const { rows: [updated] } = await client.query(`
      UPDATE catalog_variant_candidates SET ${sets.join(', ')} WHERE id = $${i} RETURNING *
    `, vals);

    return NextResponse.json({ success: true, candidate: updated });
  } finally {
    client.release();
  }
}
