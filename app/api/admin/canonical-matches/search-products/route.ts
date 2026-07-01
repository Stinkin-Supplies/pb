/**
 * app/api/admin/canonical-matches/search-products/route.ts
 *
 * GET /api/admin/canonical-matches/search-products?token=...&q=...&limit=20
 *
 * Free-text search across name, vendor SKU, brand part number, and internal SKU.
 * Used by the manual-match tool to find products the OEM-based scan missed,
 * and by the variant-candidates "attach product" tool.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q     = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const limit = Math.min(+(req.nextUrl.searchParams.get('limit') ?? 20), 50);

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        cu.id, cu.name, cu.source_vendor, cu.internal_sku, cu.brand,
        cu.brand_part_number, cu.computed_price, cu.image_url,
        cu.display_category, cu.display_subcategory, cu.is_kit,
        cu.oem_numbers, cu.canonical_product_id,
        pv.vendor_sku,
        cp.canonical_sku, cp.match_confidence
      FROM catalog_unified cu
      LEFT JOIN product_vendors pv ON pv.catalog_unified_id = cu.id
      LEFT JOIN canonical_products cp ON cp.id = cu.canonical_product_id
      WHERE cu.is_active = true
        AND (
          cu.name ILIKE $1
          OR cu.internal_sku ILIKE $1
          OR cu.brand_part_number ILIKE $1
          OR pv.vendor_sku ILIKE $1
          OR cu.sku ILIKE $1
        )
      ORDER BY
        CASE WHEN cu.name ILIKE $2 THEN 0 ELSE 1 END,
        cu.name
      LIMIT $3
    `, [`%${q}%`, `${q}%`, limit]);

    return NextResponse.json({ results: rows });
  } finally {
    client.release();
  }
}
