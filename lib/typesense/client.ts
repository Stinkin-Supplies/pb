// lib/typesense/client.ts
// ─────────────────────────────────────────────────────────────
// Typed Typesense client + collection schema for catalog_products
// Admin client: server-side indexing (uses TYPESENSE_API_KEY)
// Search client: browser-safe (uses TYPESENSE_SEARCH_KEY)
// ─────────────────────────────────────────────────────────────

import Typesense from 'typesense'

export const COLLECTION = process.env.TYPESENSE_COLLECTION ?? 'products'

const NODE = {
  host:     process.env.TYPESENSE_HOST!,
  port:     Number(process.env.TYPESENSE_PORT ?? 443),
  protocol: process.env.TYPESENSE_PROTOCOL ?? 'https',
}

// Admin client — never expose to browser
export function getAdminClient() {
  return new Typesense.Client({
    nodes:          [NODE],
    apiKey:         process.env.TYPESENSE_ADMIN_API_KEY ?? process.env.TYPESENSE_API_KEY!,
    connectionTimeoutSeconds: 60,
  })
}

// Search-only client — safe for browser / API routes
export function getSearchClient() {
  return new Typesense.Client({
    nodes:          [NODE],
    apiKey:         process.env.TYPESENSE_SEARCH_KEY ?? process.env.TYPESENSE_SEARCH_ONLY_API_KEY ?? process.env.TYPESENSE_API_KEY!,
    connectionTimeoutSeconds: 10,
  })
}

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
    { name: 'in_stock',     type: 'int32'  as const, facet: true, sort: true },
    { name: 'image',        type: 'string' as const, optional: true, index: false },
    { name: 'description',  type: 'string' as const, optional: true },
    { name: 'vendor_codes', type: 'string[]' as const, facet: true, optional: true },
    { name: 'weight',       type: 'float'  as const, optional: true },
    { name: 'created_at',   type: 'int64'  as const },
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
  in_stock:     number
  image?:       string
  description?: string
  vendor_codes?: string[]
  weight?:      number
  created_at:   number
}
