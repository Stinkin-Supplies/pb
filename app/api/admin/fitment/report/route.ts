// ============================================================
// app/api/admin/fitment/report/route.ts
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const db   = getCatalogDb();

  let rows: any[] = [];

  if (type === "missing_fitment") {
    const res = await db.query(`
      SELECT cu.id, cu.sku, cu.internal_sku, cu.name, cu.brand, cu.source_vendor, cu.category
      FROM catalog_unified cu
      WHERE cu.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM catalog_fitment_v2 cf WHERE cf.product_id = cu.id
        )
      ORDER BY cu.brand, cu.name
      LIMIT 2000
    `);
    rows = res.rows;
  }

  else if (type === "missing_oem") {
    const res = await db.query(`
      SELECT cu.id, cu.sku, cu.internal_sku, cu.name, cu.brand, cu.source_vendor, cu.category
      FROM catalog_unified cu
      WHERE cu.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM catalog_oem_crossref oc WHERE oc.sku = cu.sku
        )
      ORDER BY cu.brand, cu.name
      LIMIT 2000
    `);
    rows = res.rows;
  }

  else if (type === "flag_mismatch") {
    const res = await db.query(`
      SELECT
        cu.id, cu.sku, cu.internal_sku, cu.name, cu.brand,
        cu.source_vendor, cu.category, cu.is_harley_fitment,
        (SELECT COUNT(*)::int FROM catalog_fitment_v2 cf WHERE cf.product_id = cu.id) AS fitment_count
      FROM catalog_unified cu
      WHERE cu.is_active = true
        AND (
          -- Flagged HD but no fitment rows
          (cu.is_harley_fitment = true AND NOT EXISTS (
            SELECT 1 FROM catalog_fitment_v2 cf WHERE cf.product_id = cu.id
          ))
          OR
          -- Has fitment rows but not flagged HD
          (cu.is_harley_fitment = false AND EXISTS (
            SELECT 1 FROM catalog_fitment_v2 cf WHERE cf.product_id = cu.id
          ))
        )
      ORDER BY cu.is_harley_fitment DESC, cu.brand, cu.name
      LIMIT 2000
    `);
    rows = res.rows;
  }

  return NextResponse.json({ rows });
}
