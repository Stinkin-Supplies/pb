// ============================================================
// app/shop/page.jsx  —  SERVER COMPONENT (no "use client")
// ============================================================
// Runs only on the server. Safe to use adminSupabase / db here.
// Fetches initial data, passes it as props to the client shell.
//
// Benefits:
//  - Service role key never reaches the browser
//  - Products are in the HTML on first load (SEO + no loading flash)
//  - Client component only handles interactivity (filters, sort, cart)
//
// URL search params handled here so filtering is SSR-compatible:
//   /shop?category=exhaust
//   /shop?brand=vance-hines
//   /shop?q=air+cleaner
// ============================================================

import { db } from "@/lib/supabase/admin";
import ShopClient from "./ShopClient";

export default async function ShopPage({ searchParams }) {
  const resolvedParams = await searchParams;
  const category = resolvedParams?.category ?? null;
  const brand    = resolvedParams?.brand    ?? null;
  const q        = resolvedParams?.q        ?? null;

  let rawProducts = [];
  let fetchError  = null;

  try {
    rawProducts = await db.getProducts({
      category: category ?? undefined,
      brand:    brand    ?? undefined,
      limit:    200,
    });
  } catch (err) {
    console.error("[ShopPage] db.getProducts failed:", err.message);
    fetchError = err.message;
  }

  // ── Normalize FIRST, then derive filter lists ─────────────
  // The DB uses snake_case (our_price, brand_name, category_name).
  // Normalize to camelCase before deriving brand/category lists so
  // the sidebar values always match what the filter compares against.
  const normalized = rawProducts.map(normalizeProductRow);

  const brands     = [...new Set(normalized.map(p => p.brand))]
    .filter(Boolean).sort();
  const categories = [...new Set(normalized.map(p => p.category))]
    .filter(Boolean).sort();

  return (
    <ShopClient
      initialProducts={normalized}
      availableBrands={brands}
      availableCategories={categories}
      initialCategory={category}
      initialBrand={brand}
      fetchError={fetchError}
    />
  );
}

// ── Row normalizer ────────────────────────────────────────────
// Maps DB column names → component prop names.
// PU sync writes: our_price, brand_name, category_name, map_price,
//                 compare_at_price, stock_quantity, is_new, images
function normalizeProductRow(row) {
  return {
    id:       row.id,
    slug:     row.slug,
    name:     row.name,

    // vendor sync writes brand_name / category_name (snake_case)
    brand:    row.brand_name    ?? row.brand    ?? "Unknown",
    category: row.category_name ?? row.category ?? "Uncategorized",

    // vendor sync writes our_price — NOT `price`
    price:    Number(row.our_price ?? row.price ?? 0),
    // PU sync writes msrp; compare_at_price is an alias some schemas use
    was:      row.compare_at_price ? Number(row.compare_at_price)
            : row.msrp             ? Number(row.msrp)
            : null,
    mapPrice: row.map_price        ? Number(row.map_price)        : null,

    badge:    row.is_new  ? "new"
            : row.on_sale ? "sale"
            : null,

    // treat stock_quantity > 0 as in-stock; fall back to true if column missing
    inStock:    row.in_stock ?? (row.stock_quantity != null
                  ? row.stock_quantity > 0
                  : true),

    fitmentIds: row.fitment_ids ?? null,

    // images is a text[] array from the sync; primary_image_url is a
    // computed/virtual column some schemas add — handle both
    image:    row.primary_image_url
           ?? (Array.isArray(row.images) ? row.images[0] : null)
           ?? null,
  };
}

// ── Metadata ──────────────────────────────────────────────────
export const metadata = {
  title:       "Shop All Parts | Stinkin' Supplies",
  description: "Browse 500K+ powersports parts and accessories. Filter by your bike.",
};