/**
 * app/api/admin/canonical-matches/route.ts
 *
 * GET  /api/admin/canonical-matches?token=...&status=pending&limit=50&offset=0
 *      Returns proposals with full product details for both sides.
 *
 * POST /api/admin/canonical-matches
 *      Body: { token, id, action: 'confirm' | 'reject' }
 *      Updates a single proposal's status.
 *
 * POST /api/admin/canonical-matches/apply
 *      Body: { token }
 *      Applies all 'confirmed' proposals (merges canonical products).
 *      Separate route — see apply/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function checkAuth(req: NextRequest): boolean {
  const token = req.nextUrl.searchParams.get('token')
    ?? null;
  return token === process.env.ADMIN_SECRET;
}

// ── GET: list proposals with product details ──────────────────────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const limit  = Math.min(+(req.nextUrl.searchParams.get('limit') ?? 50), 200);
  const offset = +(req.nextUrl.searchParams.get('offset') ?? 0);

  const client = await pool.connect();
  try {
    const { rows: counts } = await client.query(`
      SELECT status, COUNT(*) AS n
      FROM canonical_match_proposals
      GROUP BY status
    `);

    const { rows } = await client.query(`
      SELECT
        cmp.id,
        cmp.match_reason,
        cmp.match_score,
        cmp.shared_oem_number,
        cmp.status,

        a.id            AS a_id,
        a.name          AS a_name,
        a.source_vendor AS a_vendor,
        a.internal_sku  AS a_sku,
        pva.vendor_sku  AS a_vendor_sku,
        a.brand_part_number AS a_brand_part,
        a.oem_numbers   AS a_oem_numbers,
        a.is_kit        AS a_is_kit,
        a.pack_qty      AS a_pack_qty,
        a.computed_price AS a_price,
        a.image_url     AS a_image,
        a.display_category AS a_category,
        a.display_subcategory AS a_subcategory,
        a.fits_all_models AS a_fits_all,
        cpa.canonical_sku AS a_canonical_sku,

        b.id            AS b_id,
        b.name          AS b_name,
        b.source_vendor AS b_vendor,
        b.internal_sku  AS b_sku,
        pvb.vendor_sku  AS b_vendor_sku,
        b.brand_part_number AS b_brand_part,
        b.oem_numbers   AS b_oem_numbers,
        b.is_kit        AS b_is_kit,
        b.pack_qty      AS b_pack_qty,
        b.computed_price AS b_price,
        b.image_url     AS b_image,
        b.display_category AS b_category,
        b.display_subcategory AS b_subcategory,
        b.fits_all_models AS b_fits_all,
        cpb.canonical_sku AS b_canonical_sku

      FROM canonical_match_proposals cmp
      JOIN catalog_unified a ON a.id = cmp.product_id_a
      JOIN catalog_unified b ON b.id = cmp.product_id_b
      LEFT JOIN canonical_products cpa ON cpa.id = a.canonical_product_id
      LEFT JOIN canonical_products cpb ON cpb.id = b.canonical_product_id
      LEFT JOIN product_vendors pva ON pva.catalog_unified_id = a.id
      LEFT JOIN product_vendors pvb ON pvb.catalog_unified_id = b.id
      WHERE cmp.status = $1
        AND a.is_active = true
        AND b.is_active = true
      ORDER BY cmp.match_score DESC, cmp.id
      LIMIT $2 OFFSET $3
    `, [status, limit, offset]);

    // ── Fitment summary for every product in this page of results ──────────────
    // year range + model codes per product, so reviewers can spot fitment gaps
    // between vendors at a glance.
    const productIds = [...new Set(rows.flatMap(r => [r.a_id, r.b_id]))];
    let fitmentMap: Record<number, { model_code: string; year_min: number; year_max: number; cnt: number }[]> = {};

    if (productIds.length > 0) {
      try {
        const { rows: fitRows } = await client.query(`
          SELECT
            cf.product_id,
            hm.model_code,
            MIN(hmy.year) AS year_min,
            MAX(hmy.year) AS year_max,
            COUNT(*) AS cnt
          FROM catalog_fitment_v2 cf
          JOIN harley_model_years hmy ON hmy.id = cf.model_year_id
          JOIN harley_models hm ON hm.id = hmy.model_id
          WHERE cf.product_id = ANY($1)
          GROUP BY cf.product_id, hm.model_code
          ORDER BY cf.product_id, year_min
        `, [productIds]);

        for (const f of fitRows) {
          fitmentMap[f.product_id] = fitmentMap[f.product_id] ?? [];
          fitmentMap[f.product_id].push({
            model_code: f.model_code,
            year_min: f.year_min,
            year_max: f.year_max,
            cnt: +f.cnt,
          });
        }
      } catch {
        // fitment table/columns unexpected — degrade gracefully, UI just won't show ranges
        fitmentMap = {};
      }
    }

    return NextResponse.json({
      proposals: rows,
      counts: counts.reduce((acc, r) => ({ ...acc, [r.status]: +r.n }), {}),
      fitment: fitmentMap,
      limit,
      offset,
    });
  } finally {
    client.release();
  }
}

// ── POST: confirm or reject a single proposal ─────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, action, reviewed_by } = body;

  if (!id || !['confirm', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id and action (confirm|reject) required' }, { status: 400 });
  }

  const status = action === 'confirm' ? 'confirmed' : 'rejected';

  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      UPDATE canonical_match_proposals
      SET status = $1, reviewed_by = $2, reviewed_at = NOW()
      WHERE id = $3
      RETURNING id, status
    `, [status, reviewed_by ?? 'admin', id]);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, proposal: rows[0] });
  } finally {
    client.release();
  }
}
