// ============================================================
// app/api/admin/fitment/oem/route.ts  — GET oem rows by sku
// ============================================================
// PUT THIS FILE AT: app/api/admin/fitment/oem/route.ts

import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

export async function GET(req: NextRequest) {
  const sku = req.nextUrl.searchParams.get("sku");
  if (!sku) return NextResponse.json({ rows: [] });
  const db = getCatalogDb();
  const { rows } = await db.query(
    `SELECT id, sku, oem_number, oem_manufacturer, page_reference, source_file, created_at
     FROM catalog_oem_crossref
     WHERE sku = $1
     ORDER BY created_at ASC`,
    [sku]
  );
  return NextResponse.json({ rows });
}
