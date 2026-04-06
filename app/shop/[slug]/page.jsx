// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches product server-side from HETZNER CATALOG DB.
// Uses lib/db/index.ts sql template tag helper.
// Page is SSR for SEO.
// ============================================================

import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import ProductDetailClient from "./ProductDetailClient";

export default async function ProductDetailPage({ params }) {
  const { slug } = await params;

  let product = null;
  
  try {
    const rows = await sql`
      SELECT 
        cp.id,
        cp.sku,
        cp.slug,
        cp.name,
        cp.brand,
        cp.category,
        cp.description,
        cp.computed_price as price,
        cp.stock_quantity,
        cp.is_active,
        cp.is_discontinued,
        cp.weight,
        -- Get vendor info from first offer
        (SELECT json_build_object(
          'vendor_code', vendor_code,
          'our_price', our_price,
          'map_price', map_price,
          'wholesale_cost', wholesale_cost
        ) FROM vendor_offers WHERE catalog_product_id = cp.id LIMIT 1) as vendor_offer,
        -- Get all media
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'url', url,
              'media_type', media_type,
              'is_primary', is_primary,
              'priority', priority
            ) ORDER BY is_primary DESC, priority ASC
          )
          FROM catalog_media
          WHERE catalog_media.product_id = cp.id
            AND catalog_media.media_type = 'image'),
          '[]'
        ) as catalog_media
      FROM catalog_products cp
      WHERE cp.slug = ${slug}
        AND cp.is_active = true
      LIMIT 1
    `;

    if (rows.length === 0) {
      console.warn(`[PDP] Product not found: ${slug}`);
      notFound();
    }

    product = rows[0];

    // Parse vendor_offer JSON
    if (product.vendor_offer && typeof product.vendor_offer === 'string') {
      product.vendor_offer = JSON.parse(product.vendor_offer);
    }

  } catch (error) {
    console.error("[PDP] catalog DB fetch failed:", error);
    notFound();
  }

  if (!product) notFound();

  // Parse catalog_media JSON array
  const media = typeof product.catalog_media === 'string'
    ? JSON.parse(product.catalog_media)
    : (Array.isArray(product.catalog_media) ? product.catalog_media : []);

  // Build gallery
  const gallery = media
    .filter(m => m.media_type === "image")
    .map(m => m.url)
    .filter(Boolean);

  const primaryImage = media.find(m => m.is_primary && m.media_type === "image")?.url 
    ?? gallery[0] 
    ?? null;

  product.gallery = gallery;
  product.primaryImage = primaryImage;
  product.catalog_media = media;

  // Extract vendor info from vendor_offer
  if (product.vendor_offer) {
    product.vendor_code = product.vendor_offer.vendor_code;
    product.our_price = product.vendor_offer.our_price;
    product.map_price = product.vendor_offer.map_price;
  }

  return (
    <ProductDetailClient
      product={normalizeProductRow(product)}
      relatedProducts={[]}
    />
  );
}

// ── Row normalizer ────────────────────────────────────────────
// Maps DB column names → component prop names.
function normalizeProductRow(row) {
  // Price hierarchy: computed_price > our_price > price
  const price = Number(row.computed_price ?? row.our_price ?? row.price ?? 0);
  
  const rawWas = row.msrp != null ? Number(row.msrp)
    : row.compare_at_price != null ? Number(row.compare_at_price)
    : (row.was != null ? Number(row.was) : null);
  const was = rawWas != null && rawWas > price ? rawWas : null;

  const media = typeof row.catalog_media === 'string'
    ? JSON.parse(row.catalog_media)
    : (Array.isArray(row.catalog_media) ? row.catalog_media : []);

  const gallery = Array.isArray(row.gallery)
    ? row.gallery.filter(Boolean)
    : media
        .filter(m => m?.media_type === "image")
        .map(m => m?.url)
        .filter(Boolean);

  const primaryImage =
    row.primaryImage ??
    media.find(m => m?.is_primary && m?.media_type === "image")?.url ??
    gallery[0] ??
    null;

  return {
    id:          row.id,
    slug:        row.slug,
    name:        row.name,

    // snake_case DB columns → camelCase props
    brand:       row.brand ?? "Unknown",
    category:    row.category ?? "Uncategorized",

    price,
    was,
    mapPrice:    row.map_price != null ? Number(row.map_price) : null,

    badge:       row.is_new   ? "new"
               : row.on_sale  ? "sale"
               : (row.badge   ?? null),

    inStock:     Number(row.stock_quantity ?? 0) > 0,
    stockQty:    Number(row.stock_quantity ?? 0),
    fitmentIds:  row.fitment_ids ?? null,

    // Gallery fields
    media,
    primaryImage,
    gallery,

    sku:         row.sku ?? null,
    vendor:      row.vendor_code ?? null,
    vendor_slug: row.vendor_code ?? null,
    description: row.description ?? null,
    specs:       row.specs ?? row.attributes ?? [],
    weight:      row.weight ?? row.weight_lbs ?? null,
    shipping:    row.ships_free ?? (price >= 99),
    pointsEarned: Math.floor(price * 10),
  };
}

// ── SEO metadata ─────────────────────────────────────────────
export async function generateMetadata({ params }) {
  const { slug } = await params;
  
  let product = null;
  try {
    const rows = await sql`
      SELECT slug, name, brand
      FROM catalog_products
      WHERE slug = ${slug} AND is_active = true
      LIMIT 1
    `;
    
    product = rows[0];
  } catch (error) {
    console.error("[PDP metadata] catalog DB fetch failed:", error);
  }

  const name = product?.name ?? slug.replace(/-/g, " ");
  const brand = product?.brand ?? "Stinkin' Supplies";
  
  return {
    title: `${name} | ${brand} | Stinkin' Supplies`,
    description: `Shop ${name} by ${brand}. Free shipping on orders over $99.`,
  };
}