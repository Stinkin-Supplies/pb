// app/api/search/route.ts
// ─────────────────────────────────────────────────────────────
// Typesense-powered search endpoint
//
// GET /api/search?q=helmet&brand=FLY+RACING&category=Helmets
//               &minPrice=50&maxPrice=300&inStock=true
//               &sort=price_asc&page=0&pageSize=48
//
// Returns same shape as /api/products so ShopClient needs
// zero changes to switch over.
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import { getSearchClient, COLLECTION } from '@/lib/typesense/client'

const PAGE_SIZE_DEFAULT = 48
const PAGE_SIZE_MAX     = 96

// Sort map — uses correct Typesense v2 field names
const SORT_MAP: Record<string, string> = {
  newest:     'id:desc',
  price_asc:  'computed_price:asc',
  price_desc: 'computed_price:desc',
  name_asc:   'name:asc',
}

export async function GET(req: Request) {
  const url      = new URL(req.url)
  const q        = url.searchParams.get('q')?.trim()        || '*'
  const category = url.searchParams.get('category')         || ''
  const brand    = url.searchParams.get('brand')            || ''
  const minPrice = url.searchParams.get('minPrice')         || ''
  const maxPrice = url.searchParams.get('maxPrice')         || ''
  const inStock  = url.searchParams.get('inStock') === 'true'
  const sort     = url.searchParams.get('sort')             || 'newest'
  const page     = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10))
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    parseInt(url.searchParams.get('pageSize') || String(PAGE_SIZE_DEFAULT), 10)
  )

  // ── Build filter_by ─────────────────────────────────────────
  const filters: string[] = ['is_active:=true']
  if (category) filters.push(`category:=${JSON.stringify(category)}`)
  if (brand)    filters.push(`brand:=${JSON.stringify(brand)}`)
  if (inStock)  filters.push('in_stock:=true')
  if (minPrice || maxPrice) {
    const min = minPrice ? Number(minPrice) : 0
    const max = maxPrice ? Number(maxPrice) : 999999
    filters.push(`computed_price:[${min}..${max}]`)
  }

  // Sort — in-stock products first, then user's chosen sort
  const primarySort  = 'in_stock:desc'
  const secondarySort = SORT_MAP[sort] ?? SORT_MAP.newest
  const resolvedSortBy = `${primarySort},${secondarySort}`
  const filterBy   = filters.join(' && ')
  const typesensePage = page + 1 // Typesense is 1-indexed

  try {
    const client = getSearchClient()

    const result = await client.collections(COLLECTION).documents().search({
      q,
      // v2 field names + correct weights: name:10, brand:5, sku:3, specs_blob:2, search_blob:1
      query_by:              'name,brand,sku,specs_blob',
      query_by_weights:      '10,5,3,2',
      filter_by:             filterBy,
      sort_by:               resolvedSortBy,
      facet_by:              'category,brand,in_stock',
      max_facet_values:      100,
      per_page:              pageSize,
      page:                  typesensePage,
      highlight_full_fields: 'name',
      // Don't penalise longer documents
      exhaustive_search:     false,
    })

    // ── Map documents to NormalizedProduct shape ──────────────
    const products = (result.hits ?? []).map((hit: any) => {
      const d = hit.document
      return {
        id:         Number(d.id),
        slug:       d.slug,
        sku:        d.sku,
        name:       d.name,
        brand:      d.brand,
        category:   d.category   ?? null,
        price:      d.computed_price ?? null,
        was:        null,                      // msrp not in v2 schema yet
        mapPrice:   null,                      // map_price not in v2 schema yet
        badge:      null,
        inStock:    d.in_stock === true,
        fitmentIds: d.fitment_make?.length ? d.fitment_make : null,
        image:      d.primary_image ?? null,
      }
    })

    // ── Map facets ────────────────────────────────────────────
    const facetMap: Record<string, any[]> = {}
    for (const fc of result.facet_counts ?? []) {
      facetMap[fc.field_name] = fc.counts.map((c: any) => ({
        name:  c.value,
        count: c.count,
      }))
    }

    // Price range — derived from result stats since we removed price facet
    const priceValues = (result.hits ?? [])
      .map((h: any) => h.document.computed_price)
      .filter((p: any) => p != null)
      .map(Number)

    const priceRange = priceValues.length
      ? { min: Math.min(...priceValues), max: Math.max(...priceValues) }
      : { min: 0, max: 0 }

    return NextResponse.json({
      products,
      total:    result.found,
      page,
      pageSize,
      facets: {
        categories: facetMap['category'] ?? [],
        brands:     facetMap['brand']    ?? [],
        priceRange,
      },
    })

  } catch (err: any) {
    console.error('[/api/search]', err.message)
    return NextResponse.json(
      { error: err.message ?? 'Search failed' },
      { status: 500 }
    )
  }
}
