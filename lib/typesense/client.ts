/**
 * lib/typesense/client.ts
 * Typesense client — points at Hetzner self-hosted instance
 *
 * Collection switch:
 *   TYPESENSE_COLLECTION=product_groups  → new deduped group search (default)
 *   TYPESENSE_COLLECTION=products        → legacy per-SKU search
 */

import Typesense from "typesense";

export const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host:     process.env.TYPESENSE_HOST     || "5.161.100.126",
      port:     parseInt(process.env.TYPESENSE_PORT || "8108"),
      protocol: process.env.TYPESENSE_PROTOCOL || "http",
    },
  ],
  apiKey:                   process.env.TYPESENSE_SEARCH_KEY || "",
  connectionTimeoutSeconds: 10,
});

export const COLLECTION = process.env.TYPESENSE_COLLECTION || "product_groups";

// True when we're using the new deduped group collection
export const IS_GROUPS_COLLECTION = COLLECTION === "product_groups";

// ── Search params ─────────────────────────────────────────────────────────────

// product_groups collection — vendor-blind, deduped results
const GROUPS_SEARCH_PARAMS = {
  query_by: "name,brand,available_brands,oem_numbers,page_references,description,features",
  facet_by: [
    "brand",
    "category",
    "available_brands",
    "vendors",
    "in_stock",
    "has_image",
    "is_harley_fitment",
    "is_universal",
    "fitment_hd_families",
    "fitment_hd_models",
    "fitment_hd_codes",
    "in_oldbook",
    "in_fatbook",
    "drag_part",
    "closeout",
    "group_signal",
  ].join(","),
  sort_by:          "sort_priority:desc,_text_match:desc",
  per_page:         24,
  max_facet_values: 50,
};

// products collection — legacy per-SKU (fallback)
const PRODUCTS_SEARCH_PARAMS = {
  query_by:  "name,brand,description,features,oem_part_number,upc",
  filter_by: "is_active:true",
  facet_by:  [
    "brand",
    "category",
    "source_vendor",
    "in_stock",
    "has_image",
    "is_harley_fitment",
    "fitment_hd_families",
    "fitment_hd_models",
    "fitment_hd_codes",
    "in_oldbook",
    "in_fatbook",
    "drag_part",
    "closeout",
    "product_code",
  ].join(","),
  sort_by:          "sort_priority:desc,_text_match:desc",
  per_page:         24,
  max_facet_values: 50,
};

export const DEFAULT_SEARCH_PARAMS = IS_GROUPS_COLLECTION
  ? GROUPS_SEARCH_PARAMS
  : PRODUCTS_SEARCH_PARAMS;

// ── Helper: build filter string ───────────────────────────────────────────────

export function buildFilters(params: {
  inStock?:     boolean;
  hasImage?:    boolean;
  brand?:       string;
  category?:    string;
  sourceVendor?: string;
  isHarley?:    boolean;
  isUniversal?: boolean;
  hdFamily?:    string;
  hdCode?:      string;
  inOldbook?:   boolean;
  inFatbook?:   boolean;
  dragPart?:    boolean;
  yearStart?:   number;
  yearEnd?:     number;
  minPrice?:    number;
  maxPrice?:    number;
  closeout?:    boolean;
  productCode?: string;
  groupSignal?: string;
}): string {
  // product_groups has no is_active — all records are live by definition
  const filters: string[] = IS_GROUPS_COLLECTION ? [] : ["is_active:true"];

  if (params.inStock)      filters.push("in_stock:true");
  if (params.hasImage)     filters.push("has_image:true");
  if (params.brand)        filters.push(`brand:=${params.brand}`);
  if (params.category)     filters.push(`category:=${params.category}`);
  if (params.isHarley)     filters.push("is_harley_fitment:true");
  if (params.isUniversal)  filters.push("is_universal:true");
  if (params.hdFamily)     filters.push(`fitment_hd_families:=${params.hdFamily}`);
  if (params.hdCode)       filters.push(`fitment_hd_codes:=${params.hdCode}`);
  if (params.inOldbook)    filters.push("in_oldbook:true");
  if (params.inFatbook)    filters.push("in_fatbook:true");
  if (params.dragPart)     filters.push("drag_part:true");
  if (params.closeout)     filters.push("closeout:true");
  if (params.groupSignal)  filters.push(`group_signal:=${params.groupSignal}`);

  // source_vendor / product_code only exist on legacy products collection
  if (!IS_GROUPS_COLLECTION) {
    if (params.sourceVendor) filters.push(`source_vendor:=${params.sourceVendor}`);
    if (params.productCode)  filters.push(`product_code:=${params.productCode}`);
  } else {
    // On product_groups: vendor filter hits the vendors[] multi-value field
    if (params.sourceVendor) filters.push(`vendors:=${params.sourceVendor}`);
  }

  if (params.yearStart && params.yearEnd) {
    filters.push(`fitment_year_start:<=${params.yearEnd}`);
    filters.push(`fitment_year_end:>=${params.yearStart}`);
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const min = params.minPrice ?? 0;
    const max = params.maxPrice ?? 99999;
    // product_groups uses price_min for range filtering
    const priceField = IS_GROUPS_COLLECTION ? "price_min" : "msrp";
    filters.push(`${priceField}:[${min}..${max}]`);
  }

  return filters.filter(Boolean).join(" && ");
}
