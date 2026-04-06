// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches product server-side, passes to client for interactivity.
// Service role key stays server-only. Page is SSR for SEO.
// ============================================================

import { notFound } from "next/navigation";
import { adminSupabase } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import ProductDetailClient from "./ProductDetailClient";

export default async function ProductDetailPage({ params }) {
  const { slug } = await params;

  const supabase = await createServerSupabaseClient();

  let product = null;
  let error = null;

  ({ data: product, error } = await supabase
    .from("catalog_products")
    .select(`
        *,
        catalog_media (
          url,
          media_type,
          is_primary
        )
      `)
    .eq("slug", slug)
    .eq("is_active", true)
    .single());

  // Some requests (prefetch/RSC) can hit without the expected auth context/cookies.
  // Fall back to service-role server fetch so the PDP doesn't intermittently 404.
  if (error || !product) {
    console.warn("[PDP] anon fetch failed; falling back to admin client:", error?.message ?? error);
    ({ data: product, error } = await adminSupabase
      .from("catalog_products")
      .select(`
          *,
          catalog_media (
            url,
            media_type,
            is_primary
          )
        `)
      .eq("slug", slug)
      .eq("is_active", true)
      .single());
  }

  if (error || !product) notFound();

  // Build gallery + primary
  const media = product.catalog_media || [];
  const gallery = media
    .filter((m) => m.media_type === "image")
    .map((m) => m.url)
    .filter(Boolean);

  const primaryImage =
    media.find((m) => m.is_primary && m.media_type === "image")?.url ??
    gallery[0] ??
    null;

  product.gallery = gallery;
  product.primaryImage = primaryImage;

  return (
    <ProductDetailClient
      product={normalizeProductRow(product)}
      relatedProducts={[]}
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
//   gallery[]       → gallery array
//   weight          → weight
function normalizeProductRow(row) {
  const price = Number(row.price ?? row.our_price ?? 0);
  const rawWas = row.msrp != null ? Number(row.msrp)
    : row.compare_at_price != null ? Number(row.compare_at_price)
    : (row.was != null ? Number(row.was) : null);
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

    // snake_case DB columns → camelCase props
    brand:       row.brand         ?? row.brand_name ?? "Unknown",
    category:    row.category      ?? row.category_name ?? "Uncategorized",

    price,
    was,
    mapPrice:    row.map_price != null ? Number(row.map_price) : null,

    badge:       row.is_new   ? "new"
               : row.on_sale  ? "sale"
               : (row.badge   ?? null),

    inStock:     Number(row.stock_quantity ?? 0) > 0,
    stockQty:    Number(row.stock_quantity ?? 0),
    fitmentIds:  row.fitment_ids     ?? null,

    // Gallery fields
    media,
    primaryImage,
    gallery,

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
    const { data } = await adminSupabase
      .from("catalog_products")
      .select(`
        slug,
        name,
        brand,
        is_active
      `)
      .eq("slug", slug)
      .single();
    product = data;
  } catch {}
  const name  = product?.name ?? slug.replace(/-/g, " ");
  const brand = product?.brand ?? product?.brand_name ?? "Stinkin' Supplies";
  return {
    title:       `${name} | ${brand} | Stinkin' Supplies`,
    description: `Shop ${name} by ${brand}. Free shipping on orders over $99.`,
  };
}
