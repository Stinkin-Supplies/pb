/**
 * app/api/admin/fitment/bulk/route.ts
 * Bulk-assign fitment: given a productId + familyId + optional modelId,
 * insert all matching model_year rows into catalog_fitment_v2.
 */

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

// POST /api/admin/fitment/bulk
// Body: { productId, familyId, modelId?, yearStart?, yearEnd? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { productId, familyId, modelId, yearStart, yearEnd } = body;

  if (!productId || !familyId) {
    return NextResponse.json({ error: "productId and familyId required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Build the model_year_ids to assign
    let queryText = `
      SELECT hmy.id
      FROM harley_model_years hmy
      JOIN harley_models hm ON hm.id = hmy.model_id
      WHERE hm.family_id = $1
    `;
    const params: (number | undefined)[] = [familyId];

    if (modelId) {
      params.push(modelId);
      queryText += ` AND hm.id = $${params.length}`;
    }
    if (yearStart) {
      params.push(yearStart);
      queryText += ` AND hmy.year >= $${params.length}`;
    }
    if (yearEnd) {
      params.push(yearEnd);
      queryText += ` AND hmy.year <= $${params.length}`;
    }

    const { rows: myRows } = await client.query(queryText, params);
    const modelYearIds = myRows.map((r: any) => r.id);

    if (modelYearIds.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ inserted: 0, skipped: 0, message: "No matching model-year rows found" });
    }

    // Bulk insert via unnest
    const result = await client.query(
      `INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
       SELECT $1, unnest($2::int[])
       ON CONFLICT (product_id, model_year_id) DO NOTHING`,
      [productId, modelYearIds]
    );

    const inserted = result.rowCount ?? 0;
    const skipped = modelYearIds.length - inserted;

    // Sync is_harley_fitment flag
    await client.query(
      `UPDATE catalog_unified SET is_harley_fitment = true WHERE id = $1`,
      [productId]
    );

    await client.query("COMMIT");
    return NextResponse.json({ inserted, skipped, total: modelYearIds.length });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Admin fitment bulk POST error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}
