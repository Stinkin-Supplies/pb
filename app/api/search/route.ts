/**
 * app/api/search/route.ts
 * Unified search — Typesense → normalized response matching frontend expectations
 *
 * Supports both collections:
 *   product_groups  — deduped vendor-blind results (default)
 *   products        — legacy per-SKU results
 */

import { NextRequest, NextResponse } from "next/server";
import { proxyImageUrl, proxyImageUrls } from "@/lib/utils/image-proxy";
import {
  typesenseClient,
  COLLECTION,
  IS_GROUPS_COLLECTION,
  DEFAULT_SEARCH_PARAMS,
  buildFilters,
} from "@/lib/typesense/client";

// Map Typesense facet arrays to {name, count} format the frontend expects
function normalizeFacets(facetCounts: any[]) {
  const categories:   { name: string; count: number }[] = [];
  const brands:       { name: string; count: number }[] = [];
  const hdFamilies:   { name: string; count: number }[] = [];
  const fitmentMakes: { name: string; count: number }[] = [];
  const fitmentModels:{ name: string; count: number }[] = [];
  const allBrands:    { name: string; count: number }[] = [];   // available_brands facet
  let priceRange = { min: 0, max: 0 };

  for (const facet of facetCounts ?? []) {
    const items = (facet.counts ?? []).map((c: any) => ({
      name:  c.value,
      count: c.count,
    }));

    switch (facet.field_name) {
      case "category":             categories.push(...items);  break;
      case "brand":                brands.push(...items);      break;
      case "available_brands":     allBrands.push(...items);   break;
      case "fitment_make":         fitmentMakes.push(...items); break;
      case "fitment_model":
        fitmentModels.push(...items);
        hdFamilies.push(...items);
        break;
      case "fitment_hd_families":  hdFamilies.push(...items);  break;
      case "computed_price":
        if (facet.stats) {
          priceRange = { min: facet.stats.min ?? 0, max: facet.stats.max ?? 0 };
        }
        break;
      // price_min stats (product_groups)
      case "price_min":
        if (facet.stats) {
          priceRange = { min: facet.stats.min ?? 0, max: facet.stats.max ?? 0 };
        }
        break;
      // msrp stats (legacy products)
      case "msrp":
        if (facet.stats) {
          priceRange = { min: facet.stats.min ?? 0, max: facet.stats.max ?? 0 };
        }
        break;
    }
  }

  return { categories, brands, allBrands, hdFamilies, fitmentMakes, fitmentModels, priceRange };
}

// Normalize a product_groups document to the shape ShopClient/SearchClient expect
function normalizeGroupDoc(doc: any) {
  return {
    // Core identity
    id:           String(doc.group_id ?? doc.id),
    groupId:      doc.group_id,
    groupSignal:  doc.group_signal ?? "singleton",
    slug:         doc.slug         ?? "",
    name:         doc.name         ?? "",
    brand:        doc.brand        ?? "",
    category:     doc.category     ?? "",

    // Pricing — use price_min as the "from" price shown on card
    price:        doc.price_min    ?? 0,
    priceMin:     doc.price_min    ?? null,
    priceMax:     doc.price_max    ?? null,
    mapPrice:     null,   // not on group level (per-member only)
    was:          null,

    // Availability
    inStock:      doc.in_stock     ?? false,
    stockQty:     doc.stock_total  ?? 0,

    // Image
    image:  proxyImageUrl(doc.image_url ?? doc.primary_image) ?? null,
    images: proxyImageUrls(doc.image_urls ?? doc.images ?? []),

    // Brand options (multi-member groups)
    availableBrands: doc.available_brands ?? [],
    memberCount:     doc.member_count     ?? 1,
    brandCount:      doc.brand_count      ?? 1,
    vendorCount:     doc.vendor_count     ?? 1,
    vendors:         doc.vendors          ?? [],

    // Badges
    badge:        doc.closeout ? "sale" : null,

    // Vendor — intentionally hidden in group search (routing picks at checkout)
    vendor:        null,
    source_vendor: null,

    // OEM / part number search helpers
    oemPartNumber:    doc.oem_number      ?? null,
    oem_numbers:      doc.oem_numbers     ?? [],
    page_references:  doc.page_references ?? [],
    oemNumbers:       doc.oem_numbers     ?? [],

    // Fitment
    features:          doc.features           ?? [],
    description:       doc.description        ?? null,
    isHarleyFitment:   doc.is_harley_fitment  ?? false,
    isUniversal:       doc.is_universal       ?? false,
    fitmentHdFamilies: doc.fitment_hd_families ?? [],
    fitmentHdCodes:    doc.fitment_hd_codes    ?? [],
    fitmentHdModels:   doc.fitment_hd_models   ?? [],
    fitmentYearStart:  doc.fitment_year_start  ?? null,
    fitmentYearEnd:    doc.fitment_year_end    ?? null,
    fitmentMakes:      doc.fitment_make        ?? [],
    fitmentModels:     doc.fitment_model       ?? [],

    // Catalog flags
    inOldbook:    doc.in_oldbook   ?? false,
    inFatbook:    doc.in_fatbook   ?? false,
    dragPart:     doc.drag_part    ?? false,
    hasMapPolicy: doc.has_map_policy ?? false,
    truckOnly:    doc.truck_only   ?? false,
    noShipCa:     doc.no_ship_ca   ?? false,

    // Warehouse totals not available at group level (use /api/products/group for per-member detail)
    warehouseWi:  0,
    warehouseNy:  0,
    warehouseTx:  0,
  };
}

// Normalize a legacy products document (unchanged behaviour)
function normalizeProductDoc(doc: any) {
  return {
    id:           doc.id,
    sku:          doc.sku,
    slug:         doc.slug,
    name:         doc.name,
    brand:        doc.brand      ?? "",
    category:     doc.category   ?? "",
    price:        parseFloat(doc.msrp ?? doc.computed_price ?? doc.our_price ?? doc.price ?? 0) || 0,
    was:          doc.msrp && doc.msrp > (doc.computed_price ?? doc.our_price ?? doc.price ?? 0)
                    ? doc.msrp : null,
    mapPrice:     doc.map_price  ?? null,
    inStock:      doc.in_stock   ?? false,
    stockQty:     doc.stock_quantity ?? 0,
    image:  proxyImageUrl(doc.image_url ?? doc.primary_image) ?? null,
    images: proxyImageUrls(doc.image_urls ?? doc.images ?? []),    badge:        doc.closeout   ? "sale" : null,
    vendor:       doc.source_vendor ?? null,
    source_vendor: doc.source_vendor ?? null,
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

function normalizeDoc(doc: any) {
  return IS_GROUPS_COLLECTION ? normalizeGroupDoc(doc) : normalizeProductDoc(doc);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  // Support both old param names (category, brand, inStock) and new ones
  const q       = p.get("q") || p.get("search") || "*";
  const page    = parseInt(p.get("page") || "1");
  const perPage = Math.min(parseInt(p.get("per_page") || p.get("pageSize") || "24"), 100);
  const sortRaw = p.get("sort_by") || p.get("sort") || "";

  // Map old sort values to Typesense sort syntax.
  // product_groups uses price_min; legacy products uses msrp.
  const priceField = IS_GROUPS_COLLECTION ? "price_min" : "msrp";
  const sortMap: Record<string, string> = {
    "price_asc":  `${priceField}:asc`,
    "price-asc":  `${priceField}:asc`,
    "price_desc": `${priceField}:desc`,
    "price-desc": `${priceField}:desc`,
    "name_asc":   "name_sort:asc",
    "name-asc":   "name_sort:asc",
    "newest":     "stock_quantity:desc",
  };
  const sortBy = sortMap[sortRaw] || "stock_quantity:desc,_text_match:desc";

  const filterBy = buildFilters({
    inStock:      p.get("in_stock") === "true" || p.get("inStock") === "true",
    hasImage:     p.get("has_image") === "true",
    brand:        p.get("brand")        || undefined,
    category:     p.get("category")     || undefined,
    sourceVendor: p.get("vendor")       || undefined,
    isHarley:     p.get("harley")       === "true",
    isUniversal:  p.get("universal")    === "true",
    hdFamily:     p.get("hd_family")    || undefined,
    hdCode:       p.get("hd_code")      || undefined,
    inOldbook:    p.get("oldbook")      === "true",
    inFatbook:    p.get("fatbook")      === "true",
    dragPart:     p.get("drag")         === "true",
    closeout:     p.get("closeout")     === "true",
    productCode:  p.get("product_code") || undefined,
    groupSignal:  p.get("group_signal") || undefined,
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
        filter_by: filterBy || undefined,
        sort_by:   sortBy,
        page,
        per_page:  perPage,
      } as any);

    const products = (results.hits ?? []).map((h: any) => normalizeDoc(h.document));
    const facets   = normalizeFacets(results.facet_counts ?? []);

    return NextResponse.json({
      // New format
      hits:           products,
      found:          results.found,
      page:           results.page,
      raw_facets:     results.facet_counts ?? [],
      query_time:     results.search_time_ms,
      collection:     COLLECTION,
      is_grouped:     IS_GROUPS_COLLECTION,
      // Legacy format (keeps ShopClient + SearchClient working)
      products,
      total:          results.found,
      facets: {
        categories:   facets.categories,
        brands:       facets.brands,
        allBrands:    facets.allBrands,   // available_brands multi-value facet
        hdFamilies:   facets.hdFamilies,
        priceRange:   facets.priceRange,
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
