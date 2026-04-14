// ============================================================
// app/api/products/route.ts
// ============================================================
// Server-side product filter endpoint.
// Called by ShopClient on every filter/sort/page change.
//
// GET /api/products
//   ?category=ATV
//   &brand=K%26L+SUPPLY
//   &minPrice=10
//   &maxPrice=500
//   &inStock=true
//   &sort=price_asc
//   &page=0
//   &pageSize=48
//
// Returns:
//   {
//     products:    NormalizedProduct[],
//     total:       number,
//     page:        number,
//     pageSize:    number,
//     facets: {
//       categories: { name, count }[],
//       brands:     { name, count }[],
//       priceRange: { min, max },
//     }
//   }
//
// Facet counts are accurate across ALL matching products,
// not just the current page.
//
// Phase B: swap this for Typesense — zero DB load, sub-10ms.
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

function normalizeProductRow(row: any) {
  const price = Number(row.price ?? row.msrp ?? row.cost ?? 0);
  const stockQty = Number(row.stock_quantity ?? 0);

  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    brand: row.brand ?? "",
    category: row.category ?? "",
    price,
    was: row.msrp && Number(row.msrp) > price ? Number(row.msrp) : null,
    mapPrice: row.map_price ?? null,
    inStock: row.in_stock ?? stockQty > 0,
    stockQty,
    image: row.image_url ?? row.image ?? null,
    images: row.image_urls ?? (row.image_url ? [row.image_url] : []),
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

function normalizeFacetResponse(data: any): FacetResponse {
  const rawCategories = data?.categories ?? data?.category ?? [];
  const rawBrands = data?.brands ?? [];
  const priceRange = data?.priceRange ?? data?.price_range ?? { min: 0, max: 0 };

  return {
    categories: rawCategories,
    brands: rawBrands,
    priceRange: {
      min: Number(priceRange.min ?? 0),
      max: Number(priceRange.max ?? 0),
    },
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
  const fitmentMake = url.searchParams.get("fitmentMake")?.trim() || undefined;
  const fitmentModel = url.searchParams.get("fitmentModel")?.trim() || undefined;
  const fitmentYear = url.searchParams.get("fitmentYear")
    ? parseInt(url.searchParams.get("fitmentYear")!, 10)
    : undefined;
  const sort = url.searchParams.get("sort") || "newest";
  const page = Math.max(0, parseInt(url.searchParams.get("page") || "0", 10));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    parseInt(url.searchParams.get("pageSize") || String(PAGE_SIZE_DEFAULT), 10)
  );

  const from = page * pageSize;
  const db = getCatalogDb();

  const conditions: string[] = ["cp.is_active = true"];
  const values: any[] = [];
  let paramIdx = 1;

  if (category) {
    conditions.push(`cp.category = $${paramIdx++}`);
    values.push(category);
  }
  if (brand) {
    conditions.push(`cp.brand = $${paramIdx++}`);
    values.push(brand);
  }
  if (minPrice != null && !Number.isNaN(minPrice)) {
    conditions.push(`COALESCE(cp.price, cp.msrp, cp.cost) >= $${paramIdx++}`);
    values.push(minPrice);
  }
  if (maxPrice != null && !Number.isNaN(maxPrice)) {
    conditions.push(`COALESCE(cp.price, cp.msrp, cp.cost) <= $${paramIdx++}`);
    values.push(maxPrice);
  }
  if (inStock) {
    conditions.push(`EXISTS (
      SELECT 1
      FROM public.vendor_offers vo
      WHERE vo.catalog_product_id = cp.id
        AND vo.is_active = true
    )`);
  }
  if (search) {
    conditions.push(`(
      cp.name ILIKE $${paramIdx}
      OR cp.sku ILIKE $${paramIdx}
      OR cp.brand ILIKE $${paramIdx}
      OR cp.category ILIKE $${paramIdx}
    )`);
    values.push(`%${search}%`);
    paramIdx++;
  }
  if (fitmentMake) {
    const makeIdx = paramIdx++;
    values.push(fitmentMake);
    let fitmentClauses = `AND LOWER(cf.make) = LOWER($${makeIdx})`;
    if (fitmentModel) {
      fitmentClauses += ` AND LOWER(cf.model) = LOWER($${paramIdx++})`;
      values.push(fitmentModel);
    }
    if (fitmentYear) {
      fitmentClauses += ` AND cf.year_start <= $${paramIdx} AND cf.year_end >= $${paramIdx}`;
      paramIdx++;
      values.push(fitmentYear);
    }
    conditions.push(
      `EXISTS (SELECT 1 FROM public.catalog_fitment cf WHERE cf.product_id = cp.id ${fitmentClauses})`
    );
  }

  const where = conditions.join(" AND ");
  const orderMap: Record<string, string> = {
    newest: "cp.created_at DESC",
    price_asc: "COALESCE(cp.price, cp.msrp, cp.cost) ASC",
    price_desc: "COALESCE(cp.price, cp.msrp, cp.cost) DESC",
    name_asc: "cp.name ASC",
  };
  const orderClause = orderMap[sort] ?? orderMap.newest;

  try {
    const [{ rows }, countResult, facetsResult] = await Promise.all([
      db.query(
        `SELECT
            cp.id,
            cp.sku,
            cp.slug,
            cp.name,
            cp.brand,
            cp.category,
            COALESCE(cp.price, cp.msrp, cp.cost, 0) AS price,
            cp.msrp,
            cp.map_price,
            cp.weight,
            cp.description,
            cp.is_active,
            cp.created_at,
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
            cp.fitment_hd_families,
            cp.fitment_hd_codes,
            cp.fitment_year_start,
            cp.fitment_year_end,
            cp.drag_part,
            cp.in_oldbook,
            cp.in_fatbook,
            cp.features,
            cp.warehouse_wi,
            cp.warehouse_ny,
            cp.warehouse_tx,
            cp.oem_part_number
         FROM public.catalog_products cp
         WHERE ${where}
         ORDER BY ${orderClause}
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...values, pageSize, from]
      ),
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM public.catalog_products cp
         WHERE ${where}`,
        values
      ),
      db.query(
        "SELECT get_product_facets($1, $2, $3, $4, $5) AS data",
        [brand ?? null, category ?? null, minPrice ?? null, maxPrice ?? null, inStock ?? null]
      ),
    ]);

    const total = Number(countResult.rows[0]?.count ?? 0);
    const products = rows.map(normalizeProductRow);
    const facets = normalizeFacetResponse(facetsResult.rows[0]?.data);

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
