/**
 * app/api/admin/products/search/route.ts
 * Search catalog_unified by SKU or name keyword for admin fitment UI
 */

import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Match by SKU (exact prefix) OR name (ilike)
    const { rows } = await pool.query(
      `SELECT
         id,
         sku,
         name,
         brand,
         category,
         subcategory,
         source_vendor,
         computed_price,
         image_url,
         is_harley_fitment,
         fits_all_models
       FROM catalog_unified
       WHERE sku ILIKE $1
          OR name ILIKE $2
       ORDER BY
         CASE WHEN sku ILIKE $1 THEN 0 ELSE 1 END,
         name
       LIMIT 20`,
      [`${q}%`, `%${q}%`]
    );

    return NextResponse.json({ results: rows });
  } catch (err: any) {
    console.error("Admin product search error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
