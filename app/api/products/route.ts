// ============================================================
// app/api/products/route.ts
// ============================================================
// Server-side product filter endpoint.
// Called by ShopClient on every filter/sort/page change.
//
// GET /api/products
//   ?category=ATV
//   &brand=K%26L+SUPPLY
//   &minPrice=10
//   &maxPrice=500
//   &inStock=true
//   &sort=price_asc
//   &page=0
//   &pageSize=48
//
// Returns:
//   {
//     products:    NormalizedProduct[],
//     total:       number,
//     page:        number,
//     pageSize:    number,
//     facets: {
//       categories: { name, count }[],
//       brands:     { name, count }[],
//       priceRange: { min, max },
//     }
//   }
//
// Facet counts are accurate across ALL matching products,
// not just the current page — this is what makes sidebar
// counts correct at 146k products.
//
// Phase B: swap this for Typesense — zero DB load, sub-10ms.
// ============================================================

import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase/admin";

const PAGE_SIZE_DEFAULT = 48;
const PAGE_SIZE_MAX     = 96;

const ORDER_MAP: Record<string, { column: string; ascending: boolean }> = {
  newest:     { column: "created_at", ascending: false },
  price_asc:  { column: "our_price",  ascending: true  },
  price_desc: { column: "our_price",  ascending: false },
  name_asc:   { column: "name",       ascending: true  },
};

export async function GET(req: Request) {
  const url      = new URL(req.url);
  const category = url.searchParams.get("category")  || null;
  const brand    = url.searchParams.get("brand")      || null;
  const minPrice = url.searchParams.get("minPrice")   ? Number(url.searchParams.get("minPrice"))  : null;
  const maxPrice = url.searchParams.get("maxPrice")   ? Number(url.searchParams.get("maxPrice"))  : null;
  const inStock  = url.searchParams.get("inStock") === "true" ? true : null;
  const sort     = url.searchParams.get("sort")       || "newest";
  const page     = Math.max(0, parseInt(url.searchParams.get("page")     || "0",  10));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    parseInt(url.searchParams.get("pageSize") || String(PAGE_SIZE_DEFAULT), 10)
  );

  const from = page * pageSize;
  const to   = from + pageSize - 1;

  try {
    // ── Run products query + facets in parallel ────────────
    const [productsResult, facetsResult] = await Promise.all([

      // Products page
      (() => {
        let q = adminSupabase
          .from("products")
          .select(
            "id, sku, slug, name, brand_name, category_name, " +
            "our_price, msrp, compare_at_price, map_price, " +
            "in_stock, stock_quantity, is_new, images",
            { count: "exact" }
          )
          .eq("status", "active");

        if (category) q = q.eq("category_name", category);
        if (brand)    q = q.eq("brand_name",    brand);
        if (minPrice) q = q.gte("our_price",    minPrice);
        if (maxPrice) q = q.lte("our_price",    maxPrice);
        if (inStock)  q = q.eq("in_stock",      true);

        const order = ORDER_MAP[sort] ?? ORDER_MAP.newest;
        q = q.order(order.column, { ascending: order.ascending }).range(from, to);

        return q;
      })(),

      // Facet counts via Postgres function (single round-trip)
      adminSupabase.rpc("get_product_facets", {
        p_brand:      brand,
        p_category:   category,
        p_min_price:  minPrice,
        p_max_price:  maxPrice,
        p_in_stock:   inStock,
      }),

    ]);

    if (productsResult.error) throw productsResult.error;

    const products = (productsResult.data ?? []).map(normalizeRow);
    const total    = productsResult.count ?? 0;
    const facets   = facetsResult.data ?? { categories: [], brands: [], price_range: { min: 0, max: 0 } };

    return NextResponse.json({
      products,
      total,
      page,
      pageSize,
      facets: {
        categories: facets.categories ?? [],
        brands:     facets.brands     ?? [],
        priceRange: facets.price_range ?? { min: 0, max: 0 },
      },
    });

  } catch (err: any) {
    console.error("[/api/products] Error:", err.message);
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// ── Row normalizer ────────────────────────────────────────────
// Mirrors the normalizer in shop/page.jsx — single source of
// truth for DB → UI field mapping.
// TODO: extract to lib/normalizers/product.ts (Phase B cleanup)
function normalizeRow(row: any) {
  return {
    id:         row.id,
    slug:       row.slug,
    name:       row.name,
    brand:      row.brand_name    ?? "Unknown",
    category:   row.category_name ?? "Uncategorized",
    price:      Number(row.our_price ?? 0),
    was:        (row.compare_at_price > row.our_price) ? Number(row.compare_at_price)
              : (row.msrp > row.our_price)             ? Number(row.msrp)
              : null,
    mapPrice:   row.map_price ? Number(row.map_price) : null,
    badge:      row.is_new ? "new" : null,
    inStock:    row.in_stock ?? (row.stock_quantity > 0),
    fitmentIds: null, // populated after ACES import (Phase 5)
    image:      Array.isArray(row.images) && row.images.length > 0
                  ? row.images[0]
                  : null,
  };
}