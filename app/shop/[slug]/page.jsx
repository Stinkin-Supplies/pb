// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches product server-side, passes to client for interactivity.
// Service role key stays server-only. Page is SSR for SEO.
// ============================================================

import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/admin";
import ProductDetailClient from "./ProductDetailClient";

export default async function ProductDetailPage({ params }) {
  const { slug } = await params;

  let product    = null;
  let related    = [];
  let fetchError = null;

  try {
    product = await db.getProduct(slug);
    console.log('[PDP] raw product keys:', Object.keys(product));
    console.log('[PDP] description:', product.description);
    console.log('[PDP] images:', product.images);
  } catch (err) {
    console.error("[ProductDetailPage] db.getProduct failed:", err.message);
    fetchError = err.message;
  }

  if (!product) notFound();

  const normalized = normalizeProductRow(product);

  // Related products — same category, exclude self
  // TODO: replace with db.getRelatedProducts(product.id, product.category_name)
  try {
    related = await db.getProducts({
      category: normalized.category,
      limit:    5,
    });
    related = related
      .filter(p => p.slug !== slug)
      .slice(0, 4)
      .map(normalizeProductRow);
  } catch (_) {}

  return (
    <ProductDetailClient
      product={normalized}
      relatedProducts={related}
      fetchError={fetchError}
    />
  );
}

// ── Row normalizer ────────────────────────────────────────────
// Maps DB column names → component prop names.
//
// Column reference (from live Supabase rows):
//   our_price       → price
//   msrp            → was  (compare_at_price is null in PU sync)
//   map_price       → mapPrice
//   brand_name      → brand
//   category_name   → category
//   stock_quantity  → stockQty  (in_stock bool is also present)
//   images text[]   → images array
//   weight_lbs      → weight
function normalizeProductRow(row) {
  return {
    id:          row.id,
    slug:        row.slug,
    name:        row.name,

    // snake_case DB columns → camelCase props
    brand:       row.brand_name    ?? row.brand    ?? "Unknown",
    category:    row.category_name ?? row.category ?? "Uncategorized",

    // PU sync writes our_price; compare_at_price unused — use msrp for was
    price:       Number(row.our_price       ?? row.price ?? 0),
    was:         row.compare_at_price       ? Number(row.compare_at_price)
               : row.msrp                  ? Number(row.msrp)
               : (row.was                  ? Number(row.was) : null),
    mapPrice:    row.map_price              ? Number(row.map_price) : null,

    badge:       row.is_new   ? "new"
               : row.on_sale  ? "sale"
               : (row.badge   ?? null),

    // in_stock bool written by sync; fall back to stock_quantity check
    inStock:     row.in_stock  ?? (row.stock_quantity != null
                   ? row.stock_quantity > 0
                   : true),
    stockQty:    row.stock_quantity  ?? null,
    fitmentIds:  row.fitment_ids     ?? null,

    // images is a text[] column; primary_image_url is a virtual alias
    images:      row.images && row.images.length > 0
                   ? row.images
                   : row.primary_image_url
                     ? [row.primary_image_url]
                     : row.image
                       ? [row.image]
                       : [],

    sku:         row.sku          ?? row.vendor_sku  ?? null,
    description: row.description  ?? null,
    specs:       row.specs        ?? row.attributes  ?? [],
    weight:      row.weight_lbs   ?? null,
    shipping:    row.ships_free   ?? (Number(row.our_price ?? row.price ?? 0) >= 99),
    pointsEarned: Math.floor(Number(row.our_price ?? row.price ?? 0) * 10),
  };
}

// ── SEO metadata ─────────────────────────────────────────────
export async function generateMetadata({ params }) {
  const { slug } = await params;
  let product = null;
  try {
    product = await db.getProduct(slug);
  } catch (_) {}
  const name  = product?.name     ?? slug.replace(/-/g, " ");
  const brand = product?.brand_name ?? "Stinkin' Supplies";
  return {
    title:       `${name} | ${brand} | Stinkin' Supplies`,
    description: `Shop ${name} by ${brand}. Free shipping on orders over $99.`,
  };
}
