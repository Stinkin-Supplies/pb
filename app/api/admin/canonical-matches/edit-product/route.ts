/**
 * app/api/admin/canonical-matches/edit-product/route.ts
 *
 * POST /api/admin/canonical-matches/edit-product
 * Body: {
 *   token,
 *   product_id: number,        // catalog_unified.id
 *   vendor_sku?: string,        // updates BOTH catalog_unified.vendor_sku
 *                                // AND product_vendors.vendor_sku (the one
 *                                // actually used for ordering)
 *   brand_part_number?: string,
 *   oem_numbers?: string[],     // replaces catalog_unified.oem_numbers array
 *   is_kit?: boolean,           // flags this product to be excluded from
 *                                // future OEM-based canonical matching
 * }
 *
 * Lets admins correct vendor SKUs / OEM numbers / mark kits directly from
 * the match review UI as they research against real vendor catalogs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { product_id, vendor_sku, brand_part_number, oem_numbers, is_kit } = body;

  if (!product_id) {
    return NextResponse.json({ error: 'product_id required' }, { status: 400 });
  }

  // At least one field must be provided
  if (
    vendor_sku === undefined &&
    brand_part_number === undefined &&
    oem_numbers === undefined &&
    is_kit === undefined
  ) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── catalog_unified updates ───────────────────────────────────────────────
    const cuSets: string[] = [];
    const cuVals: unknown[] = [];
    let i = 1;

    if (vendor_sku !== undefined) {
      cuSets.push(`vendor_sku = $${i++}`);
      cuVals.push(vendor_sku);
    }
    if (brand_part_number !== undefined) {
      cuSets.push(`brand_part_number = $${i++}`);
      cuVals.push(brand_part_number);
    }
    if (oem_numbers !== undefined) {
      cuSets.push(`oem_numbers = $${i++}`);
      cuVals.push(oem_numbers);
    }
    if (is_kit !== undefined) {
      cuSets.push(`is_kit = $${i++}`);
      cuVals.push(is_kit);
    }

    if (cuSets.length > 0) {
      cuSets.push(`updated_at = NOW()`);
      cuVals.push(product_id);
      await client.query(
        `UPDATE catalog_unified SET ${cuSets.join(', ')} WHERE id = $${i}`,
        cuVals
      );
    }

    // ── product_vendors.vendor_sku — the one actually used for ordering ────────
    if (vendor_sku !== undefined) {
      await client.query(`
        UPDATE product_vendors
        SET vendor_sku = $1
        WHERE catalog_unified_id = $2
      `, [vendor_sku, product_id]);
    }

    // ── If OEM numbers changed, clean up stale canonical_match_proposals ───────
    // Any pending proposal referencing this product whose shared_oem_number is
    // no longer in the product's oem_numbers array is now stale — reject it.
    if (oem_numbers !== undefined) {
      await client.query(`
        UPDATE canonical_match_proposals
        SET status = 'rejected', reviewed_by = 'auto-oem-edit', reviewed_at = NOW()
        WHERE status = 'pending'
          AND (product_id_a = $1 OR product_id_b = $1)
          AND shared_oem_number != ALL($2::text[])
      `, [product_id, oem_numbers]);
    }

    await client.query('COMMIT');

    const { rows: [updated] } = await client.query(`
      SELECT id, vendor_sku, brand_part_number, oem_numbers, is_kit
      FROM catalog_unified WHERE id = $1
    `, [product_id]);

    return NextResponse.json({ success: true, product: updated });

  } catch (err) {
    await client.query('ROLLBACK');
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
