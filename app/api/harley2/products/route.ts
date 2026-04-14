import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";
import { normalizeHarleyProductRow } from "@/lib/harley/catalog";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const generic = searchParams.get("generic")?.trim();
  const year = Number(searchParams.get("year") || "0");
  const category = searchParams.get("category")?.trim() || null;
  const brand = searchParams.get("brand")?.trim() || null;
  const limit = Math.min(Number(searchParams.get("limit") || "24"), 48);

  if (!generic || !year) {
    return NextResponse.json({ error: "Missing generic model or year" }, { status: 400 });
  }

  const db = getCatalogDb();
  const values: Array<string | number> = [generic, year];
  let idx = 3;
  const conditions = [
    "cp.is_active = true",
    "LOWER(cf.make) = LOWER('Harley-Davidson')",
    "LOWER(cf.model) = LOWER($1)",
    "cf.year_start <= $2",
    "cf.year_end >= $2",
  ];

  if (category) {
    conditions.push(`cp.category = $${idx}`);
    values.push(category);
    idx++;
  }
  if (brand) {
    conditions.push(`cp.brand = $${idx}`);
    values.push(brand);
    idx++;
  }

  values.push(limit);

  try {
    const { rows } = await db.query(
      `
      SELECT
        cp.id,
        cp.sku,
        cp.slug,
        cp.name,
        cp.brand,
        cp.category,
        COALESCE(cp.price, cp.msrp, cp.cost, 0) AS price,
        cp.msrp,
        cp.map_price,
        cp.description,
        cp.is_active,
        COALESCE((
          SELECT cm.url
          FROM public.catalog_media cm
          WHERE cm.product_id = cp.id
          ORDER BY cm.priority ASC
          LIMIT 1
        ), NULL) AS image_url,
        COALESCE((
          SELECT ARRAY_AGG(cm.url ORDER BY cm.priority ASC)
          FROM public.catalog_media cm
          WHERE cm.product_id = cp.id
        ), '{}'::text[]) AS image_urls,
        COALESCE((
          SELECT SUM(vo.total_qty)
          FROM public.vendor_offers vo
          WHERE vo.catalog_product_id = cp.id
            AND vo.is_active = true
        ), 0) AS stock_quantity,
        COALESCE((
          SELECT BOOL_OR(vo.is_active)
          FROM public.vendor_offers vo
          WHERE vo.catalog_product_id = cp.id
        ), false) AS in_stock,
        cp.source_vendor,
        cp.is_harley_fitment,
        cp.fitment_year_start,
        cp.fitment_year_end
      FROM public.catalog_products cp
      JOIN public.catalog_fitment cf ON cf.product_id = cp.id
      WHERE ${conditions.join(" AND ")}
      ORDER BY cp.sort_priority DESC, cp.name ASC
      LIMIT $${idx}
      `,
      values
    );

    return NextResponse.json({
      products: rows.map(normalizeHarleyProductRow),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
