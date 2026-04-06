// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches product from HETZNER catalog database (not Supabase).
// Images are in catalog_media table on Hetzner.
// Page is SSR for SEO.
// ============================================================

import { notFound } from "next/navigation";
import { getProductBySlug, getRelatedProducts } from "@/lib/catalog/client";
import ProductDetailClient from "./ProductDetailClient";

export default async function ProductDetailPage({ params }) {
  const { slug } = await params;

  // Fetch from Hetzner catalog database (not Supabase)
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  // Fetch related products from same category
  const relatedProducts = await getRelatedProducts(product.category, product.id, 6);

  // Build gallery from catalog_media
  const media = product.catalog_media || [];
  const gallery = media
    .filter((m) => m.media_type === "image")
    .map((m) => m.url)
    .filter(Boolean);

  const primaryImage =
    media.find((m) => m.is_primary && m.media_type === "image")?.url ??
    gallery[0] ??
    null;

  // Attach gallery to product
  product.gallery = gallery;
  product.primaryImage = primaryImage;

  return (
    <ProductDetailClient
      product={normalizeProductRow(product)}
      relatedProducts={relatedProducts.map(normalizeProductRow)}
    />
  );
}

// ── Row normalizer ────────────────────────────────────────────
// Maps DB column names → component prop names.
//
// Hetzner catalog schema:
//   computed_price  → price
//   msrp            → was
//   map_price       → mapPrice
//   brand           → brand
//   category        → category
//   stock_quantity  → stockQty
//   catalog_media[] → gallery array
//   weight          → weight
function normalizeProductRow(row) {
  const price = Number(row.computed_price ?? row.price ?? 0);
  const rawWas = row.msrp != null ? Number(row.msrp) : null;
  const was = rawWas != null && rawWas > price ? rawWas : null;

  const media = row.catalog_media || [];

  const gallery = Array.isArray(row.gallery)
    ? row.gallery.filter(Boolean)
    : media
        .filter((m) => m?.media_type === "image")
        .map((m) => m?.url)
        .filter(Boolean);

  const primaryImage =
    row.primaryImage ??
    media.find((m) => m?.is_primary && m?.media_type === "image")?.url ??
    gallery[0] ??
    null;

  return {
    id:          row.id,
    slug:        row.slug,
    name:        row.name,
    brand:       row.brand ?? "Unknown",
    category:    row.category ?? "Uncategorized",

    price,
    was,
    mapPrice:    row.map_price != null ? Number(row.map_price) : null,

    badge:       row.is_new ? "new" : null,

    inStock:     Number(row.stock_quantity ?? 0) > 0,
    stockQty:    Number(row.stock_quantity ?? 0),
    fitmentIds:  row.fitment_ids ?? null,

    // Gallery fields
    media,
    primaryImage,
    gallery,

    sku:         row.sku ?? null,
    vendor:      row.vendor_codes?.[0] ?? row.vendor_slug ?? row.vendor ?? "wps",
    vendor_slug: row.vendor_codes?.[0] ?? row.vendor_slug ?? row.vendor ?? "wps",
    description: row.description ?? null,
    specs:       row.specs ?? row.attributes ?? [],
    weight:      row.weight ?? null,
    shipping:    price >= 99,
    pointsEarned: Math.floor(price * 10),
  };
}

// ── SEO metadata ─────────────────────────────────────────────
export async function generateMetadata({ params }) {
  const { slug } = await params;
  
  const product = await getProductBySlug(slug);
  
  if (!product) {
    return {
      title: "Product Not Found | Stinkin' Supplies",
      description: "The product you're looking for could not be found.",
    };
  }
  
  const name = product.name ?? slug.replace(/-/g, " ");
  const brand = product.brand ?? "Stinkin' Supplies";
  
  return {
    title: `${name} | ${brand} | Stinkin' Supplies`,
    description: `Shop ${name} by ${brand}. Free shipping on orders over $99.`,
  };
}
