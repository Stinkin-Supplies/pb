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
  query_by:  "name,brand,specs_blob,search_blob,oem_numbers",
  filter_by: "in_stock:true",
  facet_by:  "brand,category,in_stock,fitment_make,fitment_model",
  sort_by:   "stock_quantity:desc,_text_match:desc",
  per_page:  24,
};

// ── Filter builder ────────────────────────────────────────────────────────────

export function buildFilters(params: {
  inStock?:      boolean;
  hasImage?:     boolean;
  brand?:        string;
  category?:     string;
  isHarley?:     boolean;
  isUniversal?:  boolean;
  hdFamily?:     string;
  hdCode?:       string;
  yearStart?:    number;
  yearEnd?:      number;
  minPrice?:     number;
  maxPrice?:     number;
  productCode?:  string;
  groupSignal?:  string;
}): string {
  // Base: active products only
  const filters: string[] = [];

  if (params.inStock)      filters.push("in_stock:true");

  if (params.inStock)      filters.push("in_stock:true");
  if (params.hasImage)     filters.push("has_image:true");
  if (params.brand)        filters.push(`brand:=${params.brand}`);
  if (params.category)     filters.push(`category:=${params.category}`);
  if (params.isHarley)     filters.push("fitment_make:=Harley-Davidson");
  if (params.hdFamily)     filters.push(`fitment_model:=${params.hdFamily}`);
  if (params.productCode)  filters.push(`product_code:=${params.productCode}`);

  if (params.yearStart && params.yearEnd) {
    filters.push(`fitment_year:[${params.yearStart}..${params.yearEnd}]`);
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const min = params.minPrice ?? 0;
    const max = params.maxPrice ?? 99999;
    filters.push(`computed_price:[${min}..${max}]`);
  }

  return filters.join(" && ");
}

export const IS_GROUPS_COLLECTION = false;
