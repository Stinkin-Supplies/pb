// app/api/admin/fitment/product/route.ts
// GET fitment rows for a specific product
import { NextRequest, NextResponse } from "next/server";
import { getCatalogDb } from "@/lib/db/catalog";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ rows: [] });
  const db = getCatalogDb();
  const { rows } = await db.query(
    `SELECT cf.id, cf.family, cf.model_code, cf.year,
            hm.model_name AS model
     FROM catalog_fitment_v2 cf
     LEFT JOIN hd_models hm ON hm.model_code = cf.model_code
     WHERE cf.product_id = $1
     ORDER BY cf.family, cf.model_code, cf.year`,
    [parseInt(id)]
  );
  return NextResponse.json({ rows });
}
