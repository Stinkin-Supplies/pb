/**
 * lib/typesense/client.ts
 * Typesense client — Hetzner self-hosted Docker instance
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
  // FIX: unified env var lookup — TYPESENSE_API_KEY is the canonical name
  apiKey:                   process.env.TYPESENSE_API_KEY || process.env.TYPESENSE_SEARCH_KEY || "xyz",
  connectionTimeoutSeconds: 15,
});

export const COLLECTION = process.env.TYPESENSE_COLLECTION || "products";
export const IS_GROUPS_COLLECTION = COLLECTION === "product_groups";

// ── Default search params ─────────────────────────────────────────────────────
// NOTE: Do NOT include filter_by here — it gets merged in route.ts via buildFilters()
// to avoid conflicts with caller-supplied filters.
export const DEFAULT_SEARCH_PARAMS = {
  query_by:        "name,brand,specs_blob,search_blob,oem_numbers",
  facet_by:        "brand,category,in_stock,fitment_make,fitment_model",
  sort_by:         "stock_quantity:desc,_text_match:desc",
  per_page:        24,
  num_typos:       2,
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
  hdFamily?:     string;
  hdCode?:       string;
  yearStart?:    number;
  yearEnd?:      number;
  minPrice?:     number;
  maxPrice?:     number;
  productCode?:  string;
  groupSignal?:  string;
}): string {
  const filters: string[] = [];

  // FIX: was duplicated — only push once
  if (params.inStock)     filters.push("in_stock:true");
  if (params.hasImage)    filters.push("has_image:true");
  if (params.brand)       filters.push(`brand:=${params.brand}`);
  if (params.category)    filters.push(`category:=${params.category}`);
  if (params.isHarley)    filters.push("fitment_make:=Harley-Davidson");
  if (params.hdFamily)    filters.push(`fitment_model:=${params.hdFamily}`);
  if (params.productCode) filters.push(`product_code:=${params.productCode}`);
  if (params.groupSignal) filters.push(`group_signal:=${params.groupSignal}`);

  if (params.yearStart && params.yearEnd) {
    filters.push(`fitment_year:[${params.yearStart}..${params.yearEnd}]`);
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    const min = params.minPrice ?? 0;
    const max = params.maxPrice ?? 99999;
    const priceField = IS_GROUPS_COLLECTION ? "price_min" : "computed_price";
    filters.push(`${priceField}:[${min}..${max}]`);
  }

  return filters.join(" && ");
}