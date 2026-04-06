// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches product server-side, passes to client for interactivity.
// Service role key stays server-only. Page is SSR for SEO.
// ============================================================

import { notFound } from "next/navigation";
import { adminSupabase, db } from "@/lib/supabase/admin";
import { getProductImages } from "@/lib/getProductImages";
import ProductDetailClient from "./ProductDetailClient";

export default async function ProductDetailPage({ params }) {
  const slug = params?.slug;

  let product = null;
  let related    = [];
  let fetchError = null;

  try {
    const { data, error } = await adminSupabase
      .from("catalog_products")
      .select(`
        id,
        sku,
        slug,
        name,
        brand,
        category,
        price,
        cost,
        map_price,
        msrp,
        weight,
        description,
        stock_quantity,
        is_active,
        catalog_media (
          url,
          media_type,
          is_primary
        )
      `)
      .eq("slug", params.slug)
      .single();

    if (error) throw error;
    product = data;
  } catch (err) {
    console.error("[ProductDetailPage] product fetch failed:", err?.message ?? err);
    fetchError = err?.message ?? "Unknown error";
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
  } catch {}

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
//   gallery[]       → gallery array
//   weight          → weight
function normalizeProductRow(row) {
  const price = Number(row.price ?? row.our_price ?? 0);
  const rawWas = row.msrp != null ? Number(row.msrp)
    : row.compare_at_price != null ? Number(row.compare_at_price)
    : (row.was != null ? Number(row.was) : null);
  const was = rawWas != null && rawWas > price ? rawWas : null;

  const media = Array.isArray(row.catalog_media) ? row.catalog_media : [];

  const { primaryImage: mediaPrimaryImage, gallery: mediaGallery } = getProductImages({ catalog_media: media });

  const fallbackGallery = Array.isArray(row.images) && row.images.length > 0
    ? row.images.filter(Boolean)
    : row.primary_image_url
      ? [row.primary_image_url]
      : row.image
        ? [row.image]
        : [];

  const gallery = mediaGallery.length > 0 ? mediaGallery : fallbackGallery;
  const primaryImage = mediaPrimaryImage ?? gallery[0] ?? null;

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
      .eq("slug", params.slug)
      .single();
    product = data;
  } catch {}
  const name  = product?.name     ?? params.slug.replace(/-/g, " ");
  const brand = product?.brand ?? product?.brand_name ?? "Stinkin' Supplies";
  return {
    title:       `${name} | ${brand} | Stinkin' Supplies`,
    description: `Shop ${name} by ${brand}. Free shipping on orders over $99.`,
  };
}
