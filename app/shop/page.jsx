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

// // import { db } from "@/lib/supabase/client";
import ShopClient from "./ShopClient";

// Next.js passes searchParams as a prop to page components
export default async function ShopPage({ searchParams }) {
  const resolvedParams = await searchParams;
  const category = resolvedParams?.category ?? null;
  const brand    = resolvedParams?.brand    ?? null;
  const q        = resolvedParams?.q        ?? null;

  // ── Fetch products server-side ──────────────────────────────
  // db.getProducts uses adminSupabase — safe here, server only.
  // Falls back to empty array if Supabase is unreachable during build.
  let initialProducts = [];
  let fetchError      = null;

  try {
    initialProducts = await db.getProducts({
      category: category ?? undefined,
      brand:    brand    ?? undefined,
      // Full text search handled client-side for now;
      // TODO Phase 5: replace with Typesense query when index is populated
      limit: 200, // reasonable cap; paginate later
    });
  } catch (err) {
    console.error("[ShopPage] db.getProducts failed:", err.message);
    fetchError = err.message;
    // ShopClient will use its built-in mock fallback
  }

  // ── Fetch filter option lists server-side ──────────────────
  // These rarely change — could be cached with next/cache in future
  let brands     = [];
  let categories = [];

  try {
    // TODO: add db.getBrands() and db.getCategories() helpers
    // For now derive from the product list (good enough for Phase 2)
    brands     = [...new Set(initialProducts.map(p => p.brand))].filter(Boolean).sort();
    categories = [...new Set(initialProducts.map(p => p.category))].filter(Boolean).sort();
  } catch (_) {}

  // ── Normalize rows to the shape ShopClient expects ─────────
  // Supabase returns snake_case; component uses camelCase.
  // Centralizing this here means ShopClient never touches raw DB shape.
  const normalized = initialProducts.map(normalizeProductRow);

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
// Add fields here as your schema evolves.
function normalizeProductRow(row) {
  return {
    id:        row.id,
    slug:      row.slug,
    name:      row.name,
    brand:     row.brand_name   ?? row.brand   ?? "Unknown",
    category:  row.category_name ?? row.category ?? "Uncategorized",
    price:     Number(row.price  ?? 0),
    was:       row.compare_at_price ? Number(row.compare_at_price) : null,
    badge:     row.is_new  ? "new"
             : row.on_sale ? "sale"
             : null,
    inStock:   (row.stock_quantity ?? row.fitment_count ?? 1) > 0,
    // fitment_ids populated by vendor sync (Phase 5)
    // Until then every product shows as fitting — ShopClient handles null
    fitmentIds: row.fitment_ids ?? null,
    image:     row.primary_image_url ?? null,
    mapPrice:  row.map_price ? Number(row.map_price) : null,
  };
}

// ── Metadata (SSR, good for SEO) ─────────────────────────────
export const metadata = {
  title:       "Shop All Parts | Stinkin' Supplies",
  description: "Browse 500K+ powersports parts and accessories. Filter by your bike.",
};
