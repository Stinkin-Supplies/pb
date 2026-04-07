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

const SORT_MAP: Record<string, string> = {
  newest:     'in_stock:desc,computed_price:asc',
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
  const filters: string[] = []
  if (category) filters.push(`category:=${JSON.stringify(category)}`)
  if (brand)    filters.push(`brand:=${JSON.stringify(brand)}`)
  if (inStock)  filters.push('in_stock:=true')
  if (minPrice || maxPrice) {
    const min = minPrice ? Number(minPrice) : 0
    const max = maxPrice ? Number(maxPrice) : 999999
    filters.push(`computed_price:[${min}..${max}]`)
  }

  const sortBy     = SORT_MAP[sort] ?? SORT_MAP.newest
  const resolvedSortBy = sortBy
  const filterBy   = filters.join(' && ')
  const perPage    = pageSize
  const typesensePage = page + 1 // Typesense is 1-indexed

  try {
    const client = getSearchClient()

    const result = await client.collections(COLLECTION).documents().search({
      q,
      query_by:          'name,brand,sku,category',
      query_by_weights:  '10,5,3,2',
      filter_by:         filterBy,
      sort_by:           resolvedSortBy,
      facet_by:          'category,brand',
      max_facet_values:  100,
      per_page:          perPage,
      page:              typesensePage,
      highlight_full_fields: 'name',
    })

    // ── Map documents to NormalizedProduct shape ──────────────
    const products = (result.hits ?? []).map((hit: any) => {
      const d = hit.document
      const price = Number(d.computed_price ?? d.price ?? 0)
      const safePrice = Number.isFinite(price) ? price : 0
      const msrp = d.msrp == null ? null : Number(d.msrp)
      const safeMsrp = msrp != null && Number.isFinite(msrp) ? msrp : null
      return {
        id:         Number(d.id),
        slug:       d.slug,
        sku:        d.sku,
        name:       d.name,
        brand:      d.brand,
        category:   d.category,
        price:      safePrice,
        was:        safeMsrp != null && safeMsrp > safePrice ? safeMsrp : null,
        mapPrice:   d.map_price ?? null,
        badge:      null,
        inStock:    Boolean(d.in_stock),
        fitmentIds: null,
        image:      d.image_url ?? null,
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

    const priceRange = { min: 0, max: 0 }

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
