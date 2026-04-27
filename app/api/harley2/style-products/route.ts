// ============================================================
// app/api/harley2/style-products/route.ts
// ============================================================
// Phase 10 — catalog_fitment retired.
// Fitment now joins catalog_fitment_v2 → harley_model_years
// → harley_models → harley_families, filtering by family name.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";
import { getHarleyStyle } from "@/lib/harley/config";
import { normalizeHarleyProductRow } from "@/lib/harley/catalog";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const styleName = searchParams.get("style");
  const category = searchParams.get("category");

  const style = getHarleyStyle(styleName) as any;
  if (!style) return NextResponse.json({ error: "Missing style" }, { status: 400 });

  const db = getCatalogDb();

  // generic_models is an array of family names e.g. ["Touring"]
  const familyNames: string[] = style.generic_models;

  const params: Array<string | number | string[]> = [familyNames];
  const conditions = [
    "cp.is_active = true",
    `EXISTS (
      SELECT 1
      FROM catalog_fitment_v2 cfv
      JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
      JOIN harley_models hm      ON hm.id  = hmy.model_id
      JOIN harley_families hf    ON hf.id  = hm.family_id
      WHERE cfv.product_id = cp.id
        AND hf.name = ANY($1::text[])
    )`,
  ];

  if (category) {
    conditions.push(`cp.category = $2`);
    params.push(category);
  }

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
      WHERE ${conditions.join(" AND ")}
      ORDER BY cp.sort_priority DESC, cp.name ASC
      LIMIT 60
      `,
      params
    );

    return NextResponse.json({
      products: rows.map(normalizeHarleyProductRow),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}