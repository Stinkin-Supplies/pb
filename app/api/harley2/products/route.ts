import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";
import { normalizeHarleyProductRow } from "@/lib/harley/catalog";
import { HARLEY_CATEGORIES } from "@/lib/harley/config";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const family   = searchParams.get("family")?.trim();
  const year     = Number(searchParams.get("year") || "0");
  const category = searchParams.get("category")?.trim() || null;
  const limit    = Math.min(Number(searchParams.get("limit") || "24"), 48);

  if (!family || !year) {
    return NextResponse.json({ error: "Missing family or year" }, { status: 400 });
  }

  // Resolve category label → DB category values
  let dbCategories: string[] | null = null;
  if (category) {
    const match = HARLEY_CATEGORIES.find(
      c => c.label === category || c.slug === category
    );
    dbCategories = match?.dbCategories ?? [category];
  }

  const db = getCatalogDb();
  const values: Array<string | number | string[]> = [family, year, year];
  let idx = 4;
  const extraConditions: string[] = [];

  if (dbCategories) {
    extraConditions.push(`cu.category = ANY($${idx}::text[])`);
    values.push(dbCategories);
    idx++;
  }

  values.push(limit);

  const where = extraConditions.length
    ? "AND " + extraConditions.join(" AND ")
    : "";

  try {
    const { rows } = await db.query(
      `
      SELECT
        cu.id,
        cu.sku,
        cu.internal_sku,
        cu.slug,
        cu.name,
        cu.display_brand          AS brand,
        cu.category,
        COALESCE(cu.computed_price, cu.msrp, cu.cost, 0) AS price,
        cu.msrp,
        cu.map_price,
        cu.description,
        cu.is_active,
        cu.image_url,
        cu.image_urls,
        cu.stock_quantity,
        cu.in_stock,
        cu.source_vendor,
        cu.is_harley_fitment,
        cu.fitment_year_start,
        cu.fitment_year_end,
        cu.fitment_hd_families,
        cu.fitment_hd_models
      FROM catalog_unified cu
      WHERE cu.is_harley_fitment = true
        AND cu.is_active = true
        AND cu.category IS NOT NULL
        AND $1 = ANY(cu.fitment_hd_families)
        AND (cu.fitment_year_start IS NULL OR cu.fitment_year_start <= $2)
        AND (cu.fitment_year_end   IS NULL OR cu.fitment_year_end   >= $3)
        ${where}
      ORDER BY cu.in_stock DESC, cu.stock_quantity DESC, cu.computed_price DESC
      LIMIT $${idx}
      `,
      values
    );

    return NextResponse.json({ products: rows.map(normalizeHarleyProductRow) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}