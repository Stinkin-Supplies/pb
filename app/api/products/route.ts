/**
 * app/api/products/route.ts
 *
 * Legacy products endpoint used by brand pages and older product grids.
 * This now delegates to the canonical browse filter pipeline so the unified
 * catalog behaves the same way everywhere.
 *
 * Session 71: added canonicalSku to the mapped response — this route never
 * threaded canonical_sku through at all (same gap /api/search had until
 * session 69, fixed there via Typesense; this route reads Postgres directly
 * via lib/db/browse.ts, which now also joins canonical_products).
 */

import { NextRequest, NextResponse } from "next/server";
import { browseProducts, type BrowseFilters, type CatalogProduct } from "@/lib/db/browse";
import { proxyImageUrl, proxyImageUrls } from "@/lib/utils/image-proxy";

export const runtime = "nodejs";

type LegacyBrowseRow = CatalogProduct & {
  image_urls?: string[] | null;
  msrp?: number | null;
  map_price?: number | null;
  closeout?: boolean;
  features?: string[];
  description?: string | null;
  is_harley_fitment?: boolean;
  fitment_hd_families?: string[];
  fitment_hd_codes?: string[];
  fitment_year_start?: number | null;
  fitment_year_end?: number | null;
  drag_part?: boolean;
  warehouse_wi?: number;
  warehouse_ny?: number;
  warehouse_tx?: number;
};

function normalizeNumber(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeInt(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function mapLegacyProduct(row: LegacyBrowseRow) {
  const price = Number(row.price ?? 0);
  const stockQty = Number(row.stock_quantity ?? 0);
  const image = proxyImageUrl(row.image_url ?? null);
  const images = proxyImageUrls(Array.isArray(row.image_urls) ? row.image_urls : []);

  return {
    id: row.id,
    sku: row.slug?.match(/([A-Z]{3}-\d{6})$/i)?.[1] ?? row.sku,
    slug: row.slug,
    name: row.name,
    brand: row.brand ?? "",
    category: row.category ?? row.display_category ?? "",
    display_category: row.display_category ?? null,
    display_subcategory: row.display_subcategory ?? null,
    price,
    was: row.msrp && Number(row.msrp) > price ? Number(row.msrp) : null,
    mapPrice: row.map_price ?? null,
    inStock: row.in_stock ?? stockQty > 0,
    in_stock: row.in_stock ?? stockQty > 0,
    stockQty,
    stock_quantity: stockQty,
    image,
    images,
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
    dragPart: row.drag_part ?? false,
    warehouseWi: row.warehouse_wi ?? 0,
    warehouseNy: row.warehouse_ny ?? 0,
    warehouseTx: row.warehouse_tx ?? 0,
    oemPartNumber: row.oem_numbers?.[0] ?? null,
    oem_numbers: row.oem_numbers ?? [],
    canonicalSku: row.canonical_sku ?? null,
    priceMin: price,
    priceMax: price,
    brandCount: 1,
    availableBrands: [],
    variant_count: row.variant_count ?? null,
    oem_chain_match: row.oem_chain_match ?? false,
  };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  try {
    const families = p.getAll("family");
    const modelCodes = p.getAll("model_code");
    const dbCategories = p.getAll("dbCategory");

    const filters: BrowseFilters = {
      eraSlug:      p.get("era") || undefined,
      families:     families.length ? families : undefined,
      family:       families.length === 1 ? families[0] : undefined,
      yearMin:      normalizeInt(p.get("year_min")) ?? normalizeInt(p.get("yearStart")),
      yearMax:      normalizeInt(p.get("year_max")) ?? normalizeInt(p.get("yearEnd")),
      year:         normalizeInt(p.get("year")) ?? normalizeInt(p.get("fitmentYear")),
      universal:    p.get("universal") === "true",
      modelCode:    p.get("model") || p.get("fitmentModel") || undefined,
      modelCodes:   modelCodes.length ? modelCodes : undefined,
      dbCategories: dbCategories.length ? dbCategories : undefined,
      category:     dbCategories.length === 0 ? (p.get("display_category") || p.get("category") || undefined) : undefined,
      subcategory:  p.get("subcategory") || p.get("display_subcategory") || undefined,
      displayCategory:    p.get("display_category") || undefined,
      displaySubcategory: p.get("display_subcategory") || undefined,
      brand:        p.get("brand") || undefined,
      inStock:      p.get("in_stock") === "true" || p.get("inStock") === "true",
      search:       p.get("q")?.trim() || p.get("search")?.trim() || undefined,
      minPrice:     normalizeNumber(p.get("min_price")) ?? normalizeNumber(p.get("minPrice")),
      maxPrice:     normalizeNumber(p.get("max_price")) ?? normalizeNumber(p.get("maxPrice")),
      page:         (normalizeInt(p.get("page")) ?? 0) + 1,
      perPage:      normalizeInt(p.get("per_page")) ?? normalizeInt(p.get("pageSize")) ?? 48,
      sort:         (p.get("sort") as BrowseFilters["sort"]) || (p.get("q") || p.get("search") ? "relevance" : "newest"),
    };

    // Brand pages historically used zero-based pagination. Keep that working.
    const result = await browseProducts(filters);

    const products = result.products.map(mapLegacyProduct);
    return NextResponse.json({
      products,
      total: result.total,
      facets: {
        categories: result.facets.categories,
        brands: result.facets.brands,
        priceRange: { min: 0, max: 0 },
        price_range: { min: 0, max: 0 },
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown products error";
    console.error("[products] error:", message);
    return NextResponse.json({ error: message, products: [], total: 0, facets: { categories: [], brands: [], priceRange: { min: 0, max: 0 } } }, { status: 500 });
  }
}
