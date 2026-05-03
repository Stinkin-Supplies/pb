/**
 * lib/typesense/client.ts
 * Typesense client — Hetzner self-hosted Docker instance
 *
 * Schema fields confirmed May 3 2026:
 * name, brand, sku, oem_part_number, description, features, category,
 * in_stock, stock_quantity, source_vendor, msrp, map_price, image_url,
 * image_urls, slug, is_harley_fitment, fitment_hd_families, fitment_hd_codes,
 * fitment_hd_models, fitment_year_start, fitment_year_end, is_universal,
 * has_image, has_map_policy, closeout, drag_part, in_oldbook, in_fatbook,
 * sort_priority, name_sort, warehouse_wi, warehouse_ny, warehouse_tx,
 * warehouse_nv, warehouse_nc, product_code, vendor_sku, upc, subcategory
 *
 * NOT in schema (removed): specs_blob, search_blob, oem_numbers (→ oem_part_number),
 *   fitment_make, fitment_model, computed_price (→ msrp)
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
  apiKey:                   process.env.TYPESENSE_API_KEY || process.env.TYPESENSE_SEARCH_KEY || "xyz",
  connectionTimeoutSeconds: 15,
});

export const COLLECTION = process.env.TYPESENSE_COLLECTION || "products";
export const IS_GROUPS_COLLECTION = COLLECTION === "product_groups";

// ── Default search params ─────────────────────────────────────────────────────
// NOTE: Do NOT include filter_by here — route.ts sets it via buildFilters().
export const DEFAULT_SEARCH_PARAMS = {
  // Only fields confirmed present in the products collection schema
  query_by:         "name,brand,sku,oem_part_number,description,features",
  // Weights: name + brand highest, sku/oem exact match important, description/features lower
  query_by_weights: "10,8,6,6,3,2",
  // Facets: all confirmed present in schema
  facet_by:         "brand,category,in_stock,source_vendor,is_harley_fitment,fitment_hd_families",
  // Sort: sort_priority first (curated), then in-stock qty, then text relevance
  sort_by:          "sort_priority:desc,stock_quantity:desc,_text_match:desc",
  per_page:         24,
  num_typos:        2,
  highlight_fields: "name,brand",
};

// ── Filter builder ────────────────────────────────────────────────────────────
export function buildFilters(params: {
  inStock?:      boolean;
  hasImage?:     boolean;
  brand?:        string;
  category?:     string;
  isHarley?:     boolean;
  isUniversal?:  boolean;
  closeout?:     boolean;
  hdFamily?:     string;
  hdCode?:       string;
  yearStart?:    number;
  yearEnd?:      number;
  minPrice?:     number;
  maxPrice?:     number;
  productCode?:  string;
  sourceVendor?: string;
  groupSignal?:  string;
}): string {
  const filters: string[] = [];

  if (params.inStock)       filters.push("in_stock:true");
  if (params.hasImage)      filters.push("has_image:true");
  if (params.brand)         filters.push(`brand:=${params.brand}`);
  if (params.category)      filters.push(`category:=${params.category}`);
  if (params.isHarley)      filters.push("is_harley_fitment:true");
  if (params.isUniversal)   filters.push("is_universal:true");
  if (params.closeout)      filters.push("closeout:true");
  if (params.hdFamily)      filters.push(`fitment_hd_families:=${params.hdFamily}`);
  if (params.hdCode)        filters.push(`fitment_hd_codes:=${params.hdCode}`);
  if (params.productCode)   filters.push(`product_code:=${params.productCode}`);
  if (params.sourceVendor)  filters.push(`source_vendor:=${params.sourceVendor}`);

  // Year range: products whose fitment window overlaps the requested range
  if (params.yearStart && params.yearEnd) {
    filters.push(`fitment_year_start:<=${params.yearEnd}`);
    filters.push(`fitment_year_end:>=${params.yearStart}`);
  }

  // Price — products collection uses msrp as the price field
  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const min = params.minPrice ?? 0;
    const max = params.maxPrice ?? 99999;
    const priceField = IS_GROUPS_COLLECTION ? "price_min" : "msrp";
    filters.push(`${priceField}:[${min}..${max}]`);
  }

  return filters.join(" && ");
}
