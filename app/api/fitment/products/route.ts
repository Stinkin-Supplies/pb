// app/api/admin/fitment/product/route.ts
// GET fitment rows for a specific product
import { NextRequest, NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ rows: [] });
  const db = getCatalogDb();
  try {
    const { rows } = await db.query(
      `SELECT
         product_id,
         family,
         model       AS model,
         model_code,
         year        AS year
       FROM catalog_fitment_readable
       WHERE product_id = $1
       ORDER BY family, model_code, year`,
      [parseInt(id)]
    );
    return NextResponse.json({ rows });
  } catch (err: any) {
    console.error("[fitment/product]", err.message);
    return NextResponse.json({ error: err.message, rows: [] }, { status: 500 });
  }
}
