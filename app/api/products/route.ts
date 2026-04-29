// ============================================================
// app/api/products/route.ts
// ============================================================
// Phase 10 — catalog_fitment retired. Fitment filtering uses
// catalog_fitment_v2 only.
// ============================================================

import { NextResponse } from "next/server";
import getCatalogDb from "@/lib/db/catalog";

const PAGE_SIZE_DEFAULT = 48;
const PAGE_SIZE_MAX = 96;

type FacetCounts = { name: string; count: number };
type FacetResponse = {
  categories: FacetCounts[];
  brands: FacetCounts[];
  priceRange: { min: number; max: number };
};

function proxyVTwinUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.includes('vtwinmfg.com')) return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  return url;
}

function normalizeProductRow(row: any) {
  const price = Number(row.price ?? row.msrp ?? row.cost ?? 0);
  const stockQty = Number(row.stock_quantity ?? 0);

  return {
    id: row.id,
    sku: row.slug?.match(/([A-Z]{3}-\d{6})$/i)?.[1] ?? row.sku,
    slug: row.slug,
    name: row.name,
    brand: row.brand ?? "",
    category: row.category ?? "",
    price,
    was: row.msrp && Number(row.msrp) > price ? Number(row.msrp) : null,
    mapPrice: row.map_price ?? null,
    inStock: row.in_stock ?? stockQty > 0,
    stockQty,
    image: proxyVTwinUrl(row.image_url ?? row.image ?? null),
    images: (row.image_urls ?? (row.image_url ? [row.image_url] : [])).map(proxyVTwinUrl),
    badge: row.closeout ? "sale" : null,
    vendor: row.source_vendor ?? null,
    source_vendor: row.source_vendor ?? null,
    features: row.features ?? [],
    description: row.description ?? null,
    isHarleyFitment: row.is_harley_fitment ?? false,
    fitmentHdFamilies: row.fitment_hd_families ?? [],
    fitmentHdCodes: row.fitment_hd_codes ?? [],
    fitmentYearStart: row.fitment_year_start ?? null,
    fitmentYearEnd: row.fitment_year_end ?? null,
    inOldbook: row.in_oldbook ?? false,
    inFatbook: row.in_fatbook ?? false,
    dragPart: row.drag_part ?? false,
    warehouseWi: row.warehouse_wi ?? 0,
    warehouseNy: row.warehouse_ny ?? 0,
    warehouseTx: row.warehouse_tx ?? 0,
    oemPartNumber: row.oem_part_number ?? null,
    priceMin: price,
    priceMax: price,
    brandCount: 1,
    availableBrands: [],
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category") || undefined;
  const brand = url.searchParams.get("brand") || undefined;
  const minPrice = url.searchParams.get("minPrice")
    ? Number(url.searchParams.get("minPrice"))
    : undefined;
  const maxPrice = url.searchParams.get("maxPrice")
    ? Number(url.searchParams.get("maxPrice"))
    : undefined;
  const inStock = url.searchParams.get("inStock") === "true" ? true : undefined;
  const search = url.searchParams.get("search")?.trim() || undefined;
  const fitmentModel = url.searchParams.get("fitmentModel")?.trim() || undefined;
  const fitmentYear = url.searchParams.get("fitmentYear")
    ? parseInt(url.searchParams.get("fitmentYear")!, 10)
    : undefined;
  const sort = url.searchParams.get("sort") || "name_asc";
  const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    parseInt(url.searchParams.get("pageSize") || String(PAGE_SIZE_DEFAULT), 10)
  );

  const from = page * pageSize;
  const db = getCatalogDb();

  const conditions: string[] = ["cu.is_active = true"];
  const values: any[] = [];
  let paramIdx = 1;

  if (category) {
    conditions.push(`cu.category = $${paramIdx++}`);
    values.push(category);
  }
  if (brand) {
    conditions.push(`cu.brand = $${paramIdx++}`);
    values.push(brand);
  }
  if (minPrice != null && !Number.isNaN(minPrice)) {
    conditions.push(`COALESCE(cu.computed_price, cu.msrp, cu.cost) >= $${paramIdx++}`);
    values.push(minPrice);
  }
  if (maxPrice != null && !Number.isNaN(maxPrice)) {
    conditions.push(`COALESCE(cu.computed_price, cu.msrp, cu.cost) <= $${paramIdx++}`);
    values.push(maxPrice);
  }
  if (inStock) {
    conditions.push(`EXISTS (
      SELECT 1
      FROM public.vendor_offers vo
      WHERE vo.catalog_product_id = cu.id
        AND vo.is_active = true
    )`);
  }
  if (search) {
    conditions.push(`(
      cu.name ILIKE $${paramIdx}
      OR cu.sku ILIKE $${paramIdx}
      OR cu.brand ILIKE $${paramIdx}
      OR cu.category ILIKE $${paramIdx}
    )`);
    values.push(`%${search}%`);
    paramIdx++;
  }

  // Fitment filtering — catalog_fitment_v2 only
  if (fitmentModel && fitmentYear) {
    conditions.push(`
      EXISTS (
        SELECT 1 FROM catalog_fitment_v2 cfv
        JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
        JOIN harley_models hm ON hm.id = hmy.model_id
        WHERE cfv.product_id = cu.id
          AND hm.model_code = $${paramIdx++}
          AND hmy.year = $${paramIdx++}
      )
    `);
    values.push(fitmentModel, fitmentYear);
  } else if (fitmentModel) {
    conditions.push(`
      EXISTS (
        SELECT 1 FROM catalog_fitment_v2 cfv
        JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
        JOIN harley_models hm ON hm.id = hmy.model_id
        WHERE cfv.product_id = cu.id
          AND hm.model_code = $${paramIdx++}
      )
    `);
    values.push(fitmentModel);
  } else if (fitmentYear) {
    conditions.push(`
      EXISTS (
        SELECT 1 FROM catalog_fitment_v2 cfv
        JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
        WHERE cfv.product_id = cu.id
          AND hmy.year = $${paramIdx++}
      )
    `);
    values.push(fitmentYear);
  }

  const where = conditions.join(" AND ");
  const orderMap: Record<string, string> = {
    newest: "cu.created_at DESC",
    price_asc: "COALESCE(cu.computed_price, cu.msrp, cu.cost) ASC",
    price_desc: "COALESCE(cu.computed_price, cu.msrp, cu.cost) DESC",
    name_asc: "cu.name ASC",
  };
  const orderClause = orderMap[sort] ?? orderMap.newest;

  try {
    const [{ rows }, countResult, categoriesResult, brandsResult, priceRangeResult] = await Promise.all([
      db.query(
        `SELECT
            cu.id,
            cu.sku,
            cu.slug,
            cu.name,
            cu.brand,
            cu.category,
            COALESCE(cu.computed_price, cu.msrp, cu.cost, 0) AS price,
            cu.msrp,
            cu.map_price,
            cu.weight,
            cu.description,
            cu.is_active,
            cu.created_at,
            COALESCE((
              SELECT cm.url
              FROM public.catalog_media cm
              WHERE cm.product_id = cu.id
              ORDER BY cm.priority ASC
              LIMIT 1
            ), cu.image_url) AS image_url,
            COALESCE((
              SELECT ARRAY_AGG(cm.url ORDER BY cm.priority ASC)
              FROM public.catalog_media cm
              WHERE cm.product_id = cu.id
            ), cu.image_urls, '{}'::text[]) AS image_urls,
            COALESCE((
              SELECT SUM(vo.total_qty)
              FROM public.vendor_offers vo
              WHERE vo.catalog_product_id = cu.id
                AND vo.is_active = true
            ), cu.stock_quantity, 0) AS stock_quantity,
            COALESCE((
              SELECT BOOL_OR(vo.is_active)
              FROM public.vendor_offers vo
              WHERE vo.catalog_product_id = cu.id
            ), cu.in_stock, false) AS in_stock,
            cu.source_vendor,
            cu.is_harley_fitment,
            cu.fitment_hd_families,
            cu.fitment_hd_codes,
            cu.fitment_year_start,
            cu.fitment_year_end,
            cu.drag_part,
            cu.in_oldbook,
            cu.in_fatbook,
            cu.features,
            cu.warehouse_wi,
            cu.warehouse_ny,
            cu.warehouse_tx,
            cu.oem_part_number
         FROM public.catalog_unified cu
         LEFT JOIN public.catalog_products cp ON cp.sku = cu.sku
         WHERE ${where}
         ORDER BY ${orderClause}
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...values, pageSize, from]
      ),
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM public.catalog_unified cu
         WHERE ${where}`,
        values
      ),
      db.query(
        `SELECT cu.category AS name, COUNT(DISTINCT cu.id)::int AS count
         FROM public.catalog_unified cu
         WHERE ${where}
         GROUP BY cu.category
         ORDER BY count DESC
         LIMIT 20`,
        values
      ),
      db.query(
        `SELECT cu.brand AS name, COUNT(DISTINCT cu.id)::int AS count
         FROM public.catalog_unified cu
         WHERE ${where}
         GROUP BY cu.brand
         ORDER BY count DESC
         LIMIT 30`,
        values
      ),
      db.query(
        `SELECT
           MIN(COALESCE(cu.computed_price, cu.msrp, cu.cost)) AS min,
           MAX(COALESCE(cu.computed_price, cu.msrp, cu.cost)) AS max
         FROM public.catalog_unified cu
         WHERE ${where}`,
        values
      ),
    ]);

    const total = Number(countResult.rows[0]?.count ?? 0);
    const products = rows.map(normalizeProductRow);
    const facets = {
      categories: categoriesResult.rows ?? [],
      brands: brandsResult.rows ?? [],
      priceRange: {
        min: Number(priceRangeResult.rows[0]?.min ?? 0),
        max: Number(priceRangeResult.rows[0]?.max ?? 0),
      },
    };

    return NextResponse.json({
      products,
      total,
      page,
      pageSize,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
      facets: {
        categories: facets.categories,
        brands: facets.brands,
        priceRange: facets.priceRange,
        price_range: facets.priceRange,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/products]", msg);
    return NextResponse.json(
      {
        error: "Failed to load products",
        message: msg,
        products: [],
        total: 0,
        page,
        pageSize,
        facets: { categories: [], brands: [], priceRange: { min: 0, max: 0 } },
      },
      { status: 500 }
    );
  }
}
