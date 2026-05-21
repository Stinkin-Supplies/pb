/**
 * app/api/search/route.ts
 * Unified search — Typesense → normalized response
 * Schema-corrected May 3 2026 (products collection, no computed_price/fitment_make/fitment_model)
 */

import { NextRequest, NextResponse } from "next/server";
import { proxyImageUrl, proxyImageUrls } from "@/lib/utils/image-proxy";
import {
  typesenseClient,
  COLLECTION,
  IS_GROUPS_COLLECTION,
  DEFAULT_SEARCH_PARAMS,
  buildFilters,
  VARIANT_GROUP_FIELD,
} from "@/lib/typesense/client";

function normalizeFacets(facetCounts: any[]) {
  const categories:  { name: string; count: number }[] = [];
  const brands:      { name: string; count: number }[] = [];
  const hdFamilies:  { name: string; count: number }[] = [];
  const vendors:     { name: string; count: number }[] = [];
  let priceRange = { min: 0, max: 0 };

  for (const facet of facetCounts ?? []) {
    const items = (facet.counts ?? []).map((c: any) => ({
      name:  c.value,
      count: c.count,
    }));

    switch (facet.field_name) {
      case "category":             categories.push(...items);  break;
      case "brand":                brands.push(...items);      break;
      case "fitment_hd_families":  hdFamilies.push(...items);  break;
      case "source_vendor":        vendors.push(...items);     break;
      // msrp is the price field in the products collection
      case "msrp":
      case "price_min":
        if (facet.stats) {
          priceRange = { min: facet.stats.min ?? 0, max: facet.stats.max ?? 0 };
        }
        break;
    }
  }

  return { categories, brands, hdFamilies, vendors, priceRange };
}

function normalizeDoc(doc: any) {
  // products collection — msrp is the price field, no computed_price
  const price = parseFloat(doc.msrp ?? doc.map_price ?? 0) || 0;

  return {
    id:           String(doc.id),
    sku:          doc.sku          ?? "",
    slug:         doc.slug         ?? "",
    name:         doc.name         ?? "",
    brand:        doc.brand        ?? "",
    category:     doc.category     ?? "",
    subcategory:  doc.subcategory  ?? "",
    price,
    msrp:         doc.msrp         ?? null,
    mapPrice:     doc.map_price    ?? null,
    was:          null, // single price field in this schema — no separate was price
    inStock:      doc.in_stock     ?? false,
    stockQty:     doc.stock_quantity ?? 0,
    image:        proxyImageUrl(doc.image_url) ?? null,
    images:       proxyImageUrls(doc.image_urls ?? []),
    badge:        doc.closeout     ? "sale" : null,
    vendor:       doc.source_vendor ?? null,
    source_vendor: doc.source_vendor ?? null,

    // Fitment
    isHarleyFitment:   doc.is_harley_fitment  ?? false,
    isUniversal:       doc.is_universal        ?? false,
    fitmentHdFamilies: doc.fitment_hd_families ?? [],
    fitmentHdCodes:    doc.fitment_hd_codes    ?? [],
    fitmentHdModels:   doc.fitment_hd_models   ?? [],
    fitmentYearStart:  doc.fitment_year_start  ?? null,
    fitmentYearEnd:    doc.fitment_year_end    ?? null,

    // Catalog flags
    inOldbook:    doc.in_oldbook   ?? false,
    inFatbook:    doc.in_fatbook   ?? false,
    dragPart:     doc.drag_part    ?? false,
    hasMapPolicy: doc.has_map_policy ?? false,
    truckOnly:    doc.truck_only   ?? false,
    noShipCa:     doc.no_ship_ca   ?? false,

    // Part numbers
    oemPartNumber: doc.oem_part_number ?? null,
    vendorSku:     doc.vendor_sku      ?? null,
    upc:           doc.upc             ?? null,
    productCode:   doc.product_code    ?? null,

    // Warehouse stock
    warehouseWi:  doc.warehouse_wi ?? 0,
    warehouseNy:  doc.warehouse_ny ?? 0,
    warehouseTx:  doc.warehouse_tx ?? 0,
    warehouseNv:  doc.warehouse_nv ?? 0,
    warehouseNc:  doc.warehouse_nc ?? 0,

    // Variant grouping
    variant_group_id: doc.variant_group_id ?? null,

    // Content
    description:  doc.description ?? null,
    features:     doc.features    ?? [],
  };
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  const q       = p.get("q") || p.get("search") || "*";
  const page    = parseInt(p.get("page") || "1");
  const perPage = Math.min(parseInt(p.get("per_page") || p.get("pageSize") || "24"), 100);
  const sortRaw = p.get("sort_by") || p.get("sort") || "";

  // msrp is the price field in the products collection
  const sortMap: Record<string, string> = {
    "price_asc":  "msrp:asc",
    "price-asc":  "msrp:asc",
    "price_desc": "msrp:desc",
    "price-desc": "msrp:desc",
    "name_asc":   "name_sort:asc",
    "name-asc":   "name_sort:asc",
    "newest":     "stock_quantity:desc",
    "relevance":  "sort_priority:desc,stock_quantity:desc,_text_match:desc",
  };
  const sortBy = sortMap[sortRaw] || DEFAULT_SEARCH_PARAMS.sort_by;

  const filterBy = buildFilters({
    inStock:      p.get("in_stock") === "true" || p.get("inStock") === "true",
    hasImage:     p.get("has_image") === "true",
    closeout:     p.get("closeout") === "true",
    brand:        p.get("brand")        || undefined,
    category:     p.get("category")     || undefined,
    isHarley:     p.get("is_harley")    === "true",
    isUniversal:  p.get("universal")    === "true",
    hdFamily:     p.get("hd_family")    || undefined,
    hdCode:       p.get("hd_code")      || undefined,
    productCode:  p.get("product_code") || undefined,
    sourceVendor: p.get("source_vendor") || undefined,
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
        ...(filterBy ? { filter_by: filterBy } : {}),
        sort_by:     sortBy,
        page,
        per_page:    perPage,
        // Group by variant_group_id — variant groups collapse to 1 card each.
        // group_limit matches per_page so the ungrouped catch-all group
        // (documents with no variant_group_id) returns a full page of results.
        group_by:    VARIANT_GROUP_FIELD,
        group_limit: perPage,
      } as any);

    // Slice final array to per_page since the ungrouped expansion can overshoot
    const rawHits: any[] = [];

    if (results.grouped_hits) {
      for (const g of results.grouped_hits) {
        const hasRealGroup = g.group_key && g.group_key.length > 0 && g.group_key[0] !== "";
        if (hasRealGroup) {
          // Variant group — take only the best representative (hits[0])
          const hit = g.hits?.[0];
          if (hit) {
            hit._group_count = g.found;
            rawHits.push(hit);
          }
        } else {
          // Ungrouped products — expand all hits, no variant badge
          for (const hit of g.hits ?? []) {
            hit._group_count = null;
            rawHits.push(hit);
          }
        }
      }
    } else {
      rawHits.push(...(results.hits ?? []));
    }

    const products = rawHits.slice(0, perPage).map((h: any) => ({
      ...normalizeDoc(h.document),
      variant_count: h._group_count ?? null,
    }));
    const facets   = normalizeFacets(results.facet_counts ?? []);

    // found_docs = total individual documents matched; found = total groups
    // Use found_docs for pagination total so page count is accurate
    const totalFound = results.found_docs ?? results.found ?? 0;

    return NextResponse.json({
      hits:       products,
      found:      totalFound,
      page:       results.page,
      raw_facets: results.facet_counts ?? [],
      query_time: results.search_time_ms,
      collection: COLLECTION,
      // Legacy keys SearchClient.jsx reads
      products,
      total:      totalFound,
      facets: {
        categories: facets.categories,
        brands:     facets.brands,
        allBrands:  facets.brands, // alias — same data
        hdFamilies: facets.hdFamilies,
        vendors:    facets.vendors,
        priceRange: facets.priceRange,
      },
    });
  } catch (err: any) {
    console.error("[Search] Typesense error:", err.message);
    return NextResponse.json(
      {
        error: "Search failed", message: err.message,
        products: [], hits: [], total: 0, found: 0,
        facets: {
          categories: [], brands: [], allBrands: [], hdFamilies: [],
          vendors: [], priceRange: { min: 0, max: 0 },
        },
      },
      { status: 500 }
    );
  }
}
