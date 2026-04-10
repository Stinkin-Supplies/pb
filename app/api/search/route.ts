/**
 * app/api/search/route.ts
 * Unified search — Typesense → normalized response matching frontend expectations
 */

import { NextRequest, NextResponse } from "next/server";
import { typesenseClient, COLLECTION, DEFAULT_SEARCH_PARAMS, buildFilters } from "@/lib/typesense/client";

// Map Typesense facet arrays to {name, count} format the frontend expects
function normalizeFacets(facetCounts: any[]) {
  const categories: { name: string; count: number }[] = [];
  const brands:     { name: string; count: number }[] = [];
  const hdFamilies: { name: string; count: number }[] = [];
  let priceRange = { min: 0, max: 0 };

  for (const facet of facetCounts ?? []) {
    const items = (facet.counts ?? []).map((c: any) => ({
      name:  c.value,
      count: c.count,
    }));

    switch (facet.field_name) {
      case "category":           categories.push(...items);  break;
      case "brand":              brands.push(...items);       break;
      case "fitment_hd_families": hdFamilies.push(...items); break;
      case "msrp":
        if (facet.stats) {
          priceRange = { min: facet.stats.min ?? 0, max: facet.stats.max ?? 0 };
        }
        break;
    }
  }

  return { categories, brands, hdFamilies, priceRange };
}

// Normalize a Typesense document to the shape ShopClient/SearchClient expect
function normalizeDoc(doc: any) {
  return {
    id:           doc.id,
    sku:          doc.sku,
    slug:         doc.slug,
    name:         doc.name,
    brand:        doc.brand      ?? "",
    category:     doc.category   ?? "",
    price:        doc.msrp       ?? doc.cost ?? 0,
    was:          doc.original_retail && doc.original_retail > (doc.msrp ?? 0)
                    ? doc.original_retail : null,
    mapPrice:     doc.map_price  ?? null,
    inStock:      doc.in_stock   ?? false,
    stockQty:     doc.stock_quantity ?? 0,
    image:        doc.image_url  ?? (doc.image_urls?.[0] ?? null),
    images:       doc.image_urls ?? [],
    badge:        doc.closeout   ? "sale" : null,
    vendor:       doc.source_vendor ?? null,
    source_vendor: doc.source_vendor ?? null,
    // New unified fields
    features:          doc.features          ?? [],
    description:       doc.description       ?? null,
    isHarleyFitment:   doc.is_harley_fitment ?? false,
    fitmentHdFamilies: doc.fitment_hd_families ?? [],
    fitmentHdCodes:    doc.fitment_hd_codes    ?? [],
    fitmentYearStart:  doc.fitment_year_start  ?? null,
    fitmentYearEnd:    doc.fitment_year_end    ?? null,
    inOldbook:         doc.in_oldbook          ?? false,
    inFatbook:         doc.in_fatbook          ?? false,
    dragPart:          doc.drag_part           ?? false,
    warehouseWi:       doc.warehouse_wi        ?? 0,
    warehouseNy:       doc.warehouse_ny        ?? 0,
    warehouseTx:       doc.warehouse_tx        ?? 0,
    oemPartNumber:     doc.oem_part_number     ?? null,
  };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  // Support both old param names (category, brand, inStock) and new ones
  const q       = p.get("q") || p.get("search") || "*";
  const page    = parseInt(p.get("page") || "1");
  const perPage = Math.min(parseInt(p.get("per_page") || p.get("pageSize") || "24"), 100);
  const sortRaw = p.get("sort_by") || p.get("sort") || "";

  // Map old sort values to Typesense sort syntax
  const sortMap: Record<string, string> = {
    "price_asc":  "msrp:asc",
    "price-asc":  "msrp:asc",
    "price_desc": "msrp:desc",
    "price-desc": "msrp:desc",
    "name_asc":   "name_sort:asc",
    "name-asc":   "name_sort:asc",
    "newest":     "sort_priority:desc",
  };
  const sortBy = sortMap[sortRaw] || "sort_priority:desc,_text_match:desc";

  const filterBy = buildFilters({
    inStock:      p.get("in_stock") === "true" || p.get("inStock") === "true",
    hasImage:     p.get("has_image") === "true",
    brand:        p.get("brand")        || undefined,
    category:     p.get("category")     || undefined,
    sourceVendor: p.get("vendor")       || undefined,
    isHarley:     p.get("harley")       === "true",
    hdFamily:     p.get("hd_family")    || undefined,
    hdCode:       p.get("hd_code")      || undefined,
    inOldbook:    p.get("oldbook")      === "true",
    inFatbook:    p.get("fatbook")      === "true",
    dragPart:     p.get("drag")         === "true",
    closeout:     p.get("closeout")     === "true",
    productCode:  p.get("product_code") || undefined,
    yearStart:    p.get("year_start")   ? parseInt(p.get("year_start")!) : undefined,
    yearEnd:      p.get("year_end")     ? parseInt(p.get("year_end")!)   : undefined,
    minPrice:     p.get("min_price") || p.get("minPrice")
                    ? parseFloat(p.get("min_price") || p.get("minPrice") || "0") : undefined,
    maxPrice:     p.get("max_price") || p.get("maxPrice")
                    ? parseFloat(p.get("max_price") || p.get("maxPrice") || "0") : undefined,
  });

  try {
    const results = await typesenseClient
      .collections(COLLECTION)
      .documents()
      .search({
        ...DEFAULT_SEARCH_PARAMS,
        q,
        filter_by: filterBy,
        sort_by:   sortBy,
        page,
        per_page:  perPage,
      });

    const products = (results.hits ?? []).map(h => normalizeDoc(h.document));
    const facets   = normalizeFacets(results.facet_counts ?? []);

    return NextResponse.json({
      // New format
      hits:       products,
      found:      results.found,
      page:       results.page,
      facets:     results.facet_counts ?? [],
      query_time: results.search_time_ms,
      // Legacy format (keeps ShopClient + SearchClient working)
      products,
      total:      results.found,
      facets: {
        categories: facets.categories,
        brands:     facets.brands,
        hdFamilies: facets.hdFamilies,
        priceRange: facets.priceRange,
      },
    });
  } catch (err: any) {
    console.error("Search error:", err.message);
    return NextResponse.json(
      { error: "Search failed", message: err.message, products: [], total: 0,
        facets: { categories: [], brands: [], priceRange: { min: 0, max: 0 } } },
      { status: 500 }
    );
  }
}
