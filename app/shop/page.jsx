// ============================================================
// app/shop/page.jsx  —  SERVER COMPONENT (no "use client")
// ============================================================
// Fetches one page of products server-side, passes to ShopClient.
//
// URL params:
//   /shop?category=ATV
//   /shop?brand=K%26L+SUPPLY
//   /shop?page=2
//   /shop?sort=price_asc
// ============================================================

import { db } from "@/lib/supabase/admin";
import ShopClient from "./ShopClient";

const PAGE_SIZE = 48;

export default async function ShopPage({ searchParams }) {
  const p        = await searchParams;
  const category = p?.category ?? null;
  const brand    = p?.brand    ?? null;
  const sort     = p?.sort     ?? "newest";
  const page     = Math.max(0, parseInt(p?.page ?? "0", 10));

  let products   = [];
  let total      = 0;
  let fetchError = null;

  try {
    const result = await db.getProducts({
      category:   category  ?? undefined,
      brand:      brand     ?? undefined,
      orderBy:    sort,
      limit:      PAGE_SIZE,
      offset:     page * PAGE_SIZE,
    });
    products = result.products;
    total    = result.total;
  } catch (err) {
    console.error("[ShopPage] db.getProducts failed:", err.message);
    fetchError = err.message;
  }

  const normalized = products.map(normalizeProductRow);

  // Derive filter lists from this page's data.
  // TODO Phase 6: replace with dedicated db.getBrands() / db.getCategories()
  // queries so the sidebar always shows full counts across all pages.
  const brands     = [...new Set(normalized.map(p => p.brand))].filter(Boolean).sort();
  const categories = [...new Set(normalized.map(p => p.category))].filter(Boolean).sort();

  return (
    <ShopClient
      initialProducts={normalized}
      availableBrands={brands}
      availableCategories={categories}
      initialCategory={category}
      initialBrand={brand}
      fetchError={fetchError}
      totalProducts={total}
      currentPage={page}
      pageSize={PAGE_SIZE}
    />
  );
}

// ── Row normalizer ────────────────────────────────────────────
function normalizeProductRow(row) {
  return {
    id:         row.id,
    slug:       row.slug,
    name:       row.name,
    brand:      row.brand_name    ?? "Unknown",
    category:   row.category_name ?? "Uncategorized",
    price:      Number(row.our_price ?? 0),
    was:        row.compare_at_price ? Number(row.compare_at_price)
              : row.msrp             ? Number(row.msrp)
              : null,
    mapPrice:   row.map_price ? Number(row.map_price) : null,
    badge:      row.is_new ? "new" : null,
    inStock:    row.in_stock ?? (row.stock_quantity > 0),
    fitmentIds: row.fitment_ids ?? null,
    image:      Array.isArray(row.images) && row.images.length > 0
                  ? row.images[0]
                  : null,
  };
}

export const metadata = {
  title:       "Shop All Parts | Stinkin' Supplies",
  description: "Browse 500K+ powersports parts and accessories.",
};