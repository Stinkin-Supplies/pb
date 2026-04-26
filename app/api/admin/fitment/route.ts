/**
 * app/api/admin/fitment/route.ts
 * GET  — list fitment for a product
 * POST — assign fitment rows to a product
 * DELETE — remove fitment rows from a product
 */

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

// GET /api/admin/fitment?productId=123
export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `SELECT
         cfv.id,
         hf.name   AS family,
         hm.name   AS model,
         hm.model_code,
         hmy.year
       FROM catalog_fitment_v2 cfv
       JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
       JOIN harley_models hm       ON hm.id  = hmy.model_id
       JOIN harley_families hf     ON hf.id  = hm.family_id
       WHERE cfv.product_id = $1
       ORDER BY hf.name, hm.name, hmy.year`,
      [productId]
    );

    // Group by family → model → years for easier rendering
    const grouped: Record<string, Record<string, number[]>> = {};
    for (const row of rows) {
      if (!grouped[row.family]) grouped[row.family] = {};
      if (!grouped[row.family][row.model]) grouped[row.family][row.model] = [];
      grouped[row.family][row.model].push(row.year);
    }

    return NextResponse.json({ rows, grouped, total: rows.length });
  } catch (err: any) {
    console.error("Admin fitment GET error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/admin/fitment
// Body: { productId, modelYearIds: number[] }
// OR:   { productId, familyId, modelId, years: number[] }  (bulk by family+model)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, modelYearIds } = body;

  if (!productId || !Array.isArray(modelYearIds) || modelYearIds.length === 0) {
    return NextResponse.json({ error: "productId and modelYearIds[] required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let inserted = 0;
    let skipped = 0;

    for (const myId of modelYearIds) {
      const result = await client.query(
        `INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
         VALUES ($1, $2)
         ON CONFLICT (product_id, model_year_id) DO NOTHING`,
        [productId, myId]
      );
      if (result.rowCount && result.rowCount > 0) inserted++;
      else skipped++;
    }

    // Keep is_harley_fitment flag in sync on catalog_unified
    await client.query(
      `UPDATE catalog_unified
       SET is_harley_fitment = true
       WHERE id = $1 AND is_harley_fitment = false`,
      [productId]
    );

    await client.query("COMMIT");
    return NextResponse.json({ inserted, skipped });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Admin fitment POST error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// DELETE /api/admin/fitment
// Body: { productId, modelYearIds: number[] } — remove specific rows
// OR:   { productId, all: true }              — remove ALL fitment for product
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { productId, modelYearIds, all } = body;

  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let deleted = 0;

    if (all) {
      const result = await client.query(
        `DELETE FROM catalog_fitment_v2 WHERE product_id = $1`,
        [productId]
      );
      deleted = result.rowCount ?? 0;
    } else if (Array.isArray(modelYearIds) && modelYearIds.length > 0) {
      const result = await client.query(
        `DELETE FROM catalog_fitment_v2
         WHERE product_id = $1
           AND model_year_id = ANY($2::int[])`,
        [productId, modelYearIds]
      );
      deleted = result.rowCount ?? 0;
    } else {
      return NextResponse.json({ error: "modelYearIds[] or all:true required" }, { status: 400 });
    }

    // If no fitment rows remain, clear is_harley_fitment flag
    const { rows: remaining } = await client.query(
      `SELECT 1 FROM catalog_fitment_v2 WHERE product_id = $1 LIMIT 1`,
      [productId]
    );
    if (remaining.length === 0) {
      await client.query(
        `UPDATE catalog_unified SET is_harley_fitment = false WHERE id = $1`,
        [productId]
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ deleted });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Admin fitment DELETE error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}