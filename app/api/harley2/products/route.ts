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

  // Resolve UI category label/slug → DB category values
  let dbCategories: string[] | null = null;
  if (category) {
    const match = HARLEY_CATEGORIES.find(
      (c) => c.label === category || c.slug === category
    );
    dbCategories = match?.dbCategories ?? [category];
  }

  const db = getCatalogDb();

  // Build parameterized query
  // $1 = family (text)
  // $2 = year   (integer)
  // $3 = year   (integer, repeated for end check)
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
        cu.display_brand                                      AS brand,
        cu.category,
        COALESCE(cu.computed_price, cu.msrp, cu.cost, 0)     AS price,
        cu.msrp,
        cu.map_price,
        cu.description,
        cu.is_active,
        cu.image_url,
        cu.image_urls,
        cu.stock_quantity,
        cu.in_stock,
        cu.source_vendor,
        cu.is_harley_fitment

      FROM catalog_unified cu

      WHERE cu.is_active = true
        AND cu.category IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM catalog_fitment_v2 cfv
          JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
          JOIN harley_models hm      ON hm.id  = hmy.model_id
          JOIN harley_families hf    ON hf.id  = hm.family_id
          WHERE cfv.product_id = cu.id
            AND hf.name = $1
            AND hmy.year >= $2
            AND hmy.year <= $3
        )
        ${where}

      ORDER BY
        cu.in_stock DESC,
        cu.stock_quantity DESC,
        COALESCE(cu.computed_price, 0) DESC

      LIMIT $${idx}
      `,
      values
    );

    return NextResponse.json({
      products: rows.map(normalizeHarleyProductRow),
      count: rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[harley2/products]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
