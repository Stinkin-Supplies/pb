/**
 * lib/typesense/client.ts
 * Typesense client — Hetzner self-hosted Docker instance
 * Collection: products (catalog_unified, 132K documents)
 */

import Typesense from "typesense";

export const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host:     process.env.TYPESENSE_HOST     || "5.161.100.126.nip.io",
      port:     parseInt(process.env.TYPESENSE_PORT || "443"),
      protocol: process.env.TYPESENSE_PROTOCOL || "https",
    },
  ],
  apiKey:                   process.env.TYPESENSE_SEARCH_KEY || process.env.TYPESENSE_API_KEY || "",
  connectionTimeoutSeconds: 15,
});

export const COLLECTION = process.env.TYPESENSE_COLLECTION || "products";

// ── Default search params ─────────────────────────────────────────────────────

export const DEFAULT_SEARCH_PARAMS = {
  query_by:         "name,brand,description,features,oem_part_number",
  // Base filter: only active products that are Drag Specialties OR in Oldbook/Fatbook
  filter_by:        "is_active:true && (drag_part:true || in_oldbook:true || in_fatbook:true || in_harddrive:true)",
  facet_by:         [
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

// ── Filter builder ────────────────────────────────────────────────────────────

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
  // Base: active + scoped to Drag/Oldbook/Fatbook
  const filters: string[] = [
    "is_active:true",
    "(drag_part:true || in_oldbook:true || in_fatbook:true || in_harddrive:true)",
  ];

  if (params.inStock)      filters.push("in_stock:true");
  if (params.hasImage)     filters.push("has_image:true");
  if (params.brand)        filters.push(`brand:=${params.brand}`);
  if (params.category)     filters.push(`category:=${params.category}`);
  if (params.sourceVendor) filters.push(`source_vendor:=${params.sourceVendor}`);
  if (params.isHarley)     filters.push("is_harley_fitment:true");
  if (params.hdFamily)     filters.push(`fitment_hd_families:=${params.hdFamily}`);
  if (params.hdCode)       filters.push(`fitment_hd_codes:=${params.hdCode}`);
  if (params.inOldbook)    filters.push("in_oldbook:true");
  if (params.inFatbook)    filters.push("in_fatbook:true");
  if (params.dragPart)     filters.push("drag_part:true");
  if (params.closeout)     filters.push("closeout:true");
  if (params.productCode)  filters.push(`product_code:=${params.productCode}`);

  if (params.yearStart && params.yearEnd) {
    filters.push(`fitment_year_start:<=${params.yearEnd}`);
    filters.push(`fitment_year_end:>=${params.yearStart}`);
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const min = params.minPrice ?? 0;
    const max = params.maxPrice ?? 99999;
    filters.push(`msrp:[${min}..${max}]`);
  }

  return filters.join(" && ");
}

export const IS_GROUPS_COLLECTION = false;
