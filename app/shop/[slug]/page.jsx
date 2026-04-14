// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches product server-side, passes to client for interactivity.
// Service role key stays server-only. Page is SSR for SEO.
// ============================================================

import { notFound } from "next/navigation";
import { db } from "@/lib/supabase/admin";
import getCatalogDb from "@/lib/db/catalog";
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

  // Fetch variants, fitment, and specs from catalog DB
  let variants = [];
  let fitment  = [];
  let catalogSpecs = [];
  try {
    const catalogDb = getCatalogDb();
    const [variantRows, fitmentRows, specRows] = await Promise.all([
      catalogDb.query(
        `SELECT cv.option_name, cv.option_value
         FROM catalog_variants cv
         JOIN catalog_products cp ON cv.product_id = cp.id
         WHERE cp.slug = $1
         ORDER BY cv.option_name, cv.option_value`,
        [slug]
      ),
      catalogDb.query(
        `SELECT cf.make, cf.model, cf.year_start, cf.year_end
         FROM catalog_fitment cf
         JOIN catalog_products cp ON cf.product_id = cp.id
         WHERE cp.slug = $1
         ORDER BY cf.make, cf.model, cf.year_start`,
        [slug]
      ),
      catalogDb.query(
        `SELECT cs.attribute, cs.value
         FROM catalog_specs cs
         JOIN catalog_products cp ON cs.product_id = cp.id
         WHERE cp.slug = $1
         ORDER BY cs.attribute`,
        [slug]
      ),
    ]);
    variants     = variantRows.rows ?? [];
    fitment      = fitmentRows.rows ?? [];
    catalogSpecs = specRows.rows ?? [];
  } catch (e) {
    console.error("[PDP] catalog DB fetch failed:", e.message);
  }

  // Merge catalog specs with any specs already on the product row
  const mergedSpecs = catalogSpecs.length > 0
    ? catalogSpecs.map(s => ({ label: s.attribute, value: s.value }))
    : (normalized.specs ?? []);

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
      product={{ ...normalized, specs: mergedSpecs }}
      variants={variants}
      fitment={fitment}
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
  const price = Number(row.price ?? row.our_price ?? 0);
  const rawWas = row.msrp != null ? Number(row.msrp)
    : row.compare_at_price != null ? Number(row.compare_at_price)
    : (row.was != null ? Number(row.was) : null);
  const was = rawWas != null && rawWas > price ? rawWas : null;

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
