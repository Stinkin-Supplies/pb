/**
 * app/api/admin/canonical-matches/sync-fitment/route.ts
 *
 * POST /api/admin/canonical-matches/sync-fitment
 * Body: { token, product_ids: number[] }
 *
 * Given a set of catalog_unified product ids that represent the SAME
 * real-world part across vendors, computes the UNION of their fitment
 * (model_year_id) coverage and inserts any missing rows for each product
 * so all vendor listings end up with identical, complete fitment data.
 *
 * Inserted rows are tagged source='canonical_merge_sync' so they can be
 * audited or rolled back later.
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
    // Before: how many fitment rows does each product currently have?
    const { rows: before } = await client.query(`
      SELECT product_id, COUNT(*) AS cnt
      FROM catalog_fitment_v2
      WHERE product_id = ANY($1)
      GROUP BY product_id
    `, [product_ids]);

    // Insert missing rows — union of all model_year_ids across the group,
    // applied to every product that doesn't already have that model_year_id.
    const { rows: inserted } = await client.query(`
      WITH all_fitment AS (
        SELECT DISTINCT model_year_id
        FROM catalog_fitment_v2
        WHERE product_id = ANY($1)
      ),
      targets AS (
        SELECT p AS product_id, af.model_year_id
        FROM unnest($1::int[]) AS p
        CROSS JOIN all_fitment af
      ),
      missing AS (
        SELECT t.product_id, t.model_year_id
        FROM targets t
        WHERE NOT EXISTS (
          SELECT 1 FROM catalog_fitment_v2 cf
          WHERE cf.product_id = t.product_id
            AND cf.model_year_id = t.model_year_id
        )
      )
      INSERT INTO catalog_fitment_v2 (product_id, model_year_id, confidence, source)
      SELECT product_id, model_year_id, 0.90, 'canonical_merge_sync'
      FROM missing
      RETURNING product_id
    `, [product_ids]);

    // After counts
    const { rows: after } = await client.query(`
      SELECT product_id, COUNT(*) AS cnt
      FROM catalog_fitment_v2
      WHERE product_id = ANY($1)
      GROUP BY product_id
    `, [product_ids]);

    const beforeMap = Object.fromEntries(before.map(r => [r.product_id, +r.cnt]));
    const afterMap  = Object.fromEntries(after.map(r => [r.product_id, +r.cnt]));

    const perProduct = product_ids.map((id: number) => ({
      product_id: id,
      before: beforeMap[id] ?? 0,
      after: afterMap[id] ?? 0,
      added: (afterMap[id] ?? 0) - (beforeMap[id] ?? 0),
    }));

    return NextResponse.json({
      success: true,
      total_added: inserted.length,
      per_product: perProduct,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
