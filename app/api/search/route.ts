/**
 * app/api/search/route.ts
 * Unified search — Typesense → normalized response matching frontend expectations
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

function normalizeFacets(facetCounts: any[]) {
  const categories:    { name: string; count: number }[] = [];
  const brands:        { name: string; count: number }[] = [];
  const hdFamilies:    { name: string; count: number }[] = [];
  const fitmentMakes:  { name: string; count: number }[] = [];
  const fitmentModels: { name: string; count: number }[] = [];
  const allBrands:     { name: string; count: number }[] = [];
  let priceRange = { min: 0, max: 0 };

  for (const facet of facetCounts ?? []) {
    const items = (facet.counts ?? []).map((c: any) => ({
      name:  c.value,
      count: c.count,
    }));

    switch (facet.field_name) {
      case "category":             categories.push(...items);   break;
      case "brand":                brands.push(...items);       break;
      case "available_brands":     allBrands.push(...items);    break;
      case "fitment_make":         fitmentMakes.push(...items); break;
      case "fitment_model":
        fitmentModels.push(...items);
        hdFamilies.push(...items);
        break;
      case "fitment_hd_families":  hdFamilies.push(...items);   break;
      case "computed_price":
      case "price_min":
      case "msrp":
        if (facet.stats) {
          priceRange = { min: facet.stats.min ?? 0, max: facet.stats.max ?? 0 };
        }
        break;
    }
  }

  return { categories, brands, allBrands, hdFamilies, fitmentMakes, fitmentModels, priceRange };
}

function normalizeGroupDoc(doc: any) {
  return {
    id:           String(doc.group_id ?? doc.id),
    groupId:      doc.group_id,
    groupSignal:  doc.group_signal ?? "singleton",
    slug:         doc.slug         ?? "",
    name:         doc.name         ?? "",
    brand:        doc.brand        ?? "",
    category:     doc.category     ?? "",
    price:        doc.price_min    ?? 0,
    priceMin:     doc.price_min    ?? null,
    priceMax:     doc.price_max    ?? null,
    mapPrice:     null,
    was:          null,
    inStock:      doc.in_stock     ?? false,
    stockQty:     doc.stock_total  ?? 0,
    image:        proxyImageUrl(doc.image_url ?? doc.primary_image) ?? null,
    images:       proxyImageUrls(doc.image_urls ?? doc.images ?? []),
    availableBrands: doc.available_brands ?? [],
    memberCount:     doc.member_count     ?? 1,
    brandCount:      doc.brand_count      ?? 1,
    vendorCount:     doc.vendor_count     ?? 1,
    vendors:         doc.vendors          ?? [],
    badge:        doc.closeout ? "sale" : null,
    vendor:        null,
    source_vendor: null,
    oemPartNumber:    doc.oem_number      ?? null,
    oem_numbers:      doc.oem_numbers     ?? [],
    oemNumbers:       doc.oem_numbers     ?? [],
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
    inOldbook:    doc.in_oldbook   ?? false,
    inFatbook:    doc.in_fatbook   ?? false,
    dragPart:     doc.drag_part    ?? false,
    hasMapPolicy: doc.has_map_policy ?? false,
    truckOnly:    doc.truck_only   ?? false,
    noShipCa:     doc.no_ship_ca   ?? false,
    warehouseWi:  0,
    warehouseNy:  0,
    warehouseTx:  0,
  };
}

function normalizeProductDoc(doc: any) {
  return {
    id:           doc.id,
    sku:          doc.sku,
    slug:         doc.slug,
    name:         doc.name,
    brand:        doc.brand      ?? "",
    category:     doc.category   ?? "",
    price:        parseFloat(doc.computed_price ?? doc.msrp ?? doc.our_price ?? doc.price ?? 0) || 0,
    was:          doc.msrp && doc.msrp > (doc.computed_price ?? doc.our_price ?? doc.price ?? 0)
                    ? doc.msrp : null,
    mapPrice:     doc.map_price  ?? null,
    inStock:      doc.in_stock   ?? false,
    stockQty:     doc.stock_quantity ?? 0,
    image:        proxyImageUrl(doc.image_url ?? doc.primary_image) ?? null,
    images:       proxyImageUrls(doc.image_urls ?? doc.images ?? []),
    badge:        doc.closeout   ? "sale" : null,
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

  const q       = p.get("q") || p.get("search") || "*";
  const page    = parseInt(p.get("page") || "1");
  const perPage = Math.min(parseInt(p.get("per_page") || p.get("pageSize") || "24"), 100);
  const sortRaw = p.get("sort_by") || p.get("sort") || "";

  const priceField = IS_GROUPS_COLLECTION ? "price_min" : "computed_price";
  const sortMap: Record<string, string> = {
    "price_asc":  `${priceField}:asc`,
    "price-asc":  `${priceField}:asc`,
    "price_desc": `${priceField}:desc`,
    "price-desc": `${priceField}:desc`,
    "name_asc":   "name_sort:asc",
    "name-asc":   "name_sort:asc",
    "newest":     "stock_quantity:desc",
  };
  const sortBy = sortMap[sortRaw] || DEFAULT_SEARCH_PARAMS.sort_by;

  // FIX: build filters from params — inStock defaults to false (show all)
  // Do NOT force in_stock:true as a default; let the user toggle it.
  const filterBy = buildFilters({
    inStock:      p.get("in_stock") === "true" || p.get("inStock") === "true",
    hasImage:     p.get("has_image") === "true",
    brand:        p.get("brand")        || undefined,
    category:     p.get("category")     || undefined,
    isHarley:     p.get("is_harley")    === "true",
    isUniversal:  p.get("universal")    === "true",
    hdFamily:     p.get("hd_family")    || undefined,
    hdCode:       p.get("hd_code")      || undefined,
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
        // Only set filter_by if we have actual filters — empty string causes TS errors
        ...(filterBy ? { filter_by: filterBy } : {}),
        sort_by:  sortBy,
        page,
        per_page: perPage,
      } as any);

    const products = (results.hits ?? []).map((h: any) => normalizeDoc(h.document));
    const facets   = normalizeFacets(results.facet_counts ?? []);

    return NextResponse.json({
      hits:       products,
      found:      results.found,
      page:       results.page,
      raw_facets: results.facet_counts ?? [],
      query_time: results.search_time_ms,
      collection: COLLECTION,
      is_grouped: IS_GROUPS_COLLECTION,
      // Legacy keys SearchClient.jsx reads
      products,
      total:      results.found,
      facets: {
        categories: facets.categories,
        brands:     facets.brands,
        allBrands:  facets.allBrands,
        hdFamilies: facets.hdFamilies,
        priceRange: facets.priceRange,
      },
    });
  } catch (err: any) {
    console.error("[Search] Typesense error:", err.message);
    return NextResponse.json(
      {
        error: "Search failed", message: err.message,
        products: [], hits: [], total: 0, found: 0,
        facets: { categories: [], brands: [], allBrands: [], hdFamilies: [], priceRange: { min: 0, max: 0 } },
      },
      { status: 500 }
    );
  }
}