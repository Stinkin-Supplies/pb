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

// ── Collection schema ─────────────────────────────────────────
export const SCHEMA = {
  name:                 COLLECTION,
  enable_nested_fields: false,
  fields: [
    { name: 'id',           type: 'string' as const },
    { name: 'sku',          type: 'string' as const },
    { name: 'slug',         type: 'string' as const },
    { name: 'name',         type: 'string' as const },
    { name: 'brand',        type: 'string' as const, facet: true  },
    { name: 'category',     type: 'string' as const, facet: true  },
    { name: 'price',        type: 'float'  as const, facet: true  },
    { name: 'our_price',    type: 'float'  as const, facet: true  },
    { name: 'map_price',    type: 'float'  as const, optional: true },
    { name: 'msrp',         type: 'float'  as const, optional: true },
    { name: 'is_active',    type: 'bool'   as const, facet: true  },
    { name: 'stock_quantity', type: 'int64' as const, facet: true  },
    { name: 'in_stock',     type: 'bool'   as const, facet: true },
    { name: 'image',        type: 'string' as const, optional: true, index: false },
    { name: 'description',  type: 'string' as const, optional: true },
    { name: 'vendor_codes',   type: 'string[]' as const, facet: true, optional: true },
    { name: 'weight',         type: 'float'  as const, optional: true },
    { name: 'created_at',     type: 'int64'  as const },
    // v2 fitment + specs facets
    { name: 'fitment_make',   type: 'string[]' as const, facet: true, optional: true },
    { name: 'fitment_model',  type: 'string[]' as const, facet: true, optional: true },
    { name: 'fitment_year',   type: 'int32[]'  as const, facet: true, optional: true },
    { name: 'specs',          type: 'string[]' as const, facet: true, optional: true },
  ],
  default_sorting_field: 'created_at',
}

// ── Document type ─────────────────────────────────────────────
export type ProductDocument = {
  id:           string
  sku:          string
  slug:         string
  name:         string
  brand:        string
  category:     string
  price:        number
  our_price:    number
  map_price?:   number
  msrp?:        number
  is_active:    boolean
  stock_quantity: number
  in_stock:     boolean
  image?:       string
  description?: string
  vendor_codes?: string[]
  weight?:       number
  created_at:    number
  fitment_make?:  string[]
  fitment_model?: string[]
  fitment_year?:  number[]
  specs?:         string[]
}

// ── Helper: build filter string ───────────────────────────────────────────────

export function buildFilters(params: {
  inStock?:      boolean;
  hasImage?:     boolean;
  brand?:        string;
  category?:     string;
  sourceVendor?: string;
  isHarley?:     boolean;
  isUniversal?:  boolean;
  hdFamily?:     string;
  hdCode?:       string;
  inOldbook?:    boolean;
  inFatbook?:    boolean;
  dragPart?:     boolean;
  yearStart?:    number;
  yearEnd?:      number;
  minPrice?:     number;
  maxPrice?:     number;
  closeout?:     boolean;
  productCode?:  string;
  groupSignal?:  string;
}): string {
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

  if (!IS_GROUPS_COLLECTION) {
    if (params.sourceVendor) filters.push(`source_vendor:=${params.sourceVendor}`);
    if (params.productCode)  filters.push(`product_code:=${params.productCode}`);
  } else {
    if (params.sourceVendor) filters.push(`vendors:=${params.sourceVendor}`);
  }

  if (params.yearStart && params.yearEnd) {
    filters.push(`fitment_year_start:<=${params.yearEnd}`);
    filters.push(`fitment_year_end:>=${params.yearStart}`);
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const min = params.minPrice ?? 0;
    const max = params.maxPrice ?? 99999;
    const priceField = IS_GROUPS_COLLECTION ? "price_min" : "msrp";
    filters.push(`${priceField}:[${min}..${max}]`);
  }

  return filters.filter(Boolean).join(" && ");
}