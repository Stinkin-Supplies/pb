// ============================================================
// app/shop/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches first page + facets server-side so the initial render
// is instant with no loading state. ShopClient takes over for
// all subsequent filter/sort/page changes via /api/products.
// ============================================================

import { adminSupabase } from "@/lib/supabase/admin";
import ShopClient from "./ShopClient";

const PAGE_SIZE = 48;

export default async function ShopPage({ searchParams }) {
  const p        = await searchParams;
  const category = p?.category ?? null;
  const brand    = p?.brand    ?? null;
  const sort     = p?.sort     ?? "newest";

  let products   = [];
  let total      = 0;
  let facets     = { categories:[], brands:[], priceRange:{ min:0, max:0 } };

  const ORDER_MAP = {
    newest:     { column:"created_at", ascending:false },
    price_asc:  { column:"our_price",  ascending:true  },
    price_desc: { column:"our_price",  ascending:false  },
    name_asc:   { column:"name",       ascending:true  },
  };
  const order = ORDER_MAP[sort] ?? ORDER_MAP.newest;

  try {
    // Products + facets in parallel — same queries as /api/products
    const [prodRes, facetRes] = await Promise.all([
      (() => {
        let q = adminSupabase
          .from("products")
          .select(
            "id,sku,slug,name,brand_name,category_name," +
            "our_price,msrp,compare_at_price,map_price," +
            "in_stock,stock_quantity,is_new,images,fitment_ids",
            { count:"exact" }
          )
          .eq("status","active");
        if (category) q = q.eq("category_name", category);
        if (brand)    q = q.eq("brand_name",    brand);
        return q.order(order.column, { ascending:order.ascending }).range(0, PAGE_SIZE - 1);
      })(),
      adminSupabase.rpc("get_product_facets", {
        p_brand:     brand,
        p_category:  category,
        p_min_price: null,
        p_max_price: null,
        p_in_stock:  null,
      }),
    ]);

    if (prodRes.error)  console.error("[ShopPage] products:", prodRes.error.message);
    if (facetRes.error) console.error("[ShopPage] facets:",   facetRes.error.message);

    products = (prodRes.data  ?? []).map(normalizeRow);
    total    = prodRes.count  ?? 0;
    const f  = facetRes.data  ?? {};
    facets   = {
      categories: f.categories ?? [],
      brands:     f.brands     ?? [],
      priceRange: f.price_range ?? { min:0, max:0 },
    };
  } catch (err) {
    console.error("[ShopPage]", err.message);
  }

  return (
    <ShopClient
      initialProducts={products}
      initialFacets={facets}
      initialTotal={total}
      initialCategory={category}
      initialBrand={brand}
    />
  );
}

function normalizeRow(row) {
  return {
    id:         row.id,
    slug:       row.slug,
    name:       row.name,
    brand:      row.brand_name    ?? "Unknown",
    category:   row.category_name ?? "Uncategorized",
    price:      Number(row.our_price ?? 0),
    was:        row.compare_at_price ? Number(row.compare_at_price)
              : row.msrp             ? Number(row.msrp) : null,
    mapPrice:   row.map_price ? Number(row.map_price) : null,
    badge:      row.is_new ? "new" : null,
    inStock:    row.in_stock ?? (row.stock_quantity > 0),
    fitmentIds: row.fitment_ids ?? null,
    image:      Array.isArray(row.images) && row.images.length > 0
                  ? row.images[0] : null,
  };
}

export const metadata = {
  title:       "Shop All Parts | Stinkin' Supplies",
  description: "Browse 500K+ powersports parts and accessories.",
};
