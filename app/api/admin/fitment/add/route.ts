import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function POST(req: NextRequest) {
  const { product_id, family, model_code, year } = await req.json();
  if (!product_id || !family || !model_code || !year) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const db = getCatalogDb();
  try {
    const { rows: myRows } = await db.query(
      `SELECT hmy.id
       FROM harley_model_years hmy
       JOIN harley_models hm ON hm.id = hmy.model_id
       JOIN harley_families hf ON hf.id = hm.family_id
       WHERE hm.model_code = $1 AND hmy.year = $2
       LIMIT 1`,
      [model_code, parseInt(year)]
    );
    if (!myRows[0]) {
      return NextResponse.json(
        { error: `No model year found for ${model_code} ${year}` },
        { status: 404 }
      );
    }
    const model_year_id = myRows[0].id;
    const { rows: existing } = await db.query(
      `SELECT id FROM catalog_fitment_v2 WHERE product_id = $1 AND model_year_id = $2`,
      [product_id, model_year_id]
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: "Fitment row already exists" }, { status: 409 });
    }
    await db.query(
      `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source)
       VALUES ($1, $2, 'manual')`,
      [product_id, model_year_id]
    );
    return NextResponse.json({
      row: { family, model: model_code, model_code, year: parseInt(year) }
    });
  } catch (err: any) {
    console.error("[fitment/add]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
