// app/api/admin/fitment/add/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

export async function POST(req: NextRequest) {
  const { product_id, family, model_code, year } = await req.json();
  if (!product_id || !family || !model_code || !year) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const db = getCatalogDb();

  try {
    // Look up the model_year_id from harley_model_years via the join chain
    const { rows: myRows } = await db.query(
      `SELECT hmy.id
       FROM harley_model_years hmy
       JOIN harley_models hm ON hm.id = hmy.model_id
       JOIN harley_families hf ON hf.id = hm.family_id
       WHERE hm.model_code = $1
         AND hmy.year = $2
       LIMIT 1`,
      [model_code, parseInt(year)]
    );

    if (!myRows[0]) {
      return NextResponse.json(
        { error: `No model year found for ${model_code} ${year}. Check that the model code and year exist in harley_model_years.` },
        { status: 404 }
      );
    }

    const model_year_id = myRows[0].id;

    // Check for duplicate
    const { rows: existing } = await db.query(
      `SELECT id FROM catalog_fitment_v2
       WHERE product_id = $1 AND model_year_id = $2`,
      [product_id, model_year_id]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: "Fitment row already exists for this product + year/model" }, { status: 409 });
    }

    // Insert
    const { rows } = await db.query(
      `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source)
       VALUES ($1, $2, 'manual')
       RETURNING id`,
      [product_id, model_year_id]
    );

    // Return in the same shape as catalog_fitment_readable
    return NextResponse.json({
      row: {
        id:         rows[0].id,
        family,
        model:      model_code, // will be replaced by readable name on next load
        model_code,
        year:       parseInt(year),
      }
    });
  } catch (err: any) {
    console.error("[fitment/add]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
