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
    console.log('[PDP] sku:', product.sku);
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
// Column reference (from catalog rows):
//   price           → price
//   msrp            → was
//   map_price       → mapPrice
//   brand           → brand
//   category        → category
//   stock_quantity  → stockQty
//   images[]        → images array
//   weight          → weight
function normalizeProductRow(row) {
  return {
    id:          row.id,
    slug:        row.slug,
    name:        row.name,

    // snake_case DB columns → camelCase props
    brand:       row.brand         ?? row.brand_name ?? "Unknown",
    category:    row.category      ?? row.category_name ?? "Uncategorized",

    price:       Number(row.price ?? row.our_price ?? 0),
    was:         row.msrp != null ? Number(row.msrp)
               : row.compare_at_price != null ? Number(row.compare_at_price)
               : (row.was != null ? Number(row.was) : null),
    mapPrice:    row.map_price != null ? Number(row.map_price) : null,

    badge:       row.is_new   ? "new"
               : row.on_sale  ? "sale"
               : (row.badge   ?? null),

    inStock:     Number(row.stock_quantity ?? 0) > 0,
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
    vendor:      row.vendor_codes?.[0] ?? row.vendor_slug ?? row.vendor ?? null,
    vendor_slug: row.vendor_codes?.[0] ?? row.vendor_slug ?? row.vendor ?? null,
    description: row.description  ?? null,
    specs:       row.specs        ?? row.attributes  ?? [],
    weight:      row.weight       ?? row.weight_lbs   ?? null,
    shipping:    row.ships_free   ?? (Number(row.price ?? row.our_price ?? 0) >= 99),
    pointsEarned: Math.floor(Number(row.price ?? row.our_price ?? 0) * 10),
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
  const brand = product?.brand ?? product?.brand_name ?? "Stinkin' Supplies";
  return {
    title:       `${name} | ${brand} | Stinkin' Supplies`,
    description: `Shop ${name} by ${brand}. Free shipping on orders over $99.`,
  };
}
