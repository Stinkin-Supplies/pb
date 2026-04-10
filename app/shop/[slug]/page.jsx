// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches product from catalog_unified (WPS + PU merged).
// SSR for SEO. Falls back to catalog_products for legacy slugs.
// ============================================================

import { notFound } from "next/navigation";
import { getCatalogDb } from "@/lib/db/catalog";
import ProductDetailClient from "./ProductDetailClient";

export default async function ProductDetailPage({ params }) {
  const { slug } = await params;
  const db = getCatalogDb();

  let product = null;

  try {
    // Try catalog_unified first
    const { rows } = await db.query(`
      SELECT
        cu.*,
        COALESCE(
          (SELECT array_agg(cm.url ORDER BY cm.priority)
           FROM catalog_media cm
           JOIN catalog_products cp ON cp.id = cm.product_id
           WHERE cp.sku = cu.sku AND cu.source_vendor = 'WPS'),
          cu.image_urls
        ) AS all_images
      FROM catalog_unified cu
      WHERE cu.slug = $1 AND cu.is_active = true
      LIMIT 1
    `, [slug]);

    if (rows.length) {
      product = rows[0];
    } else {
      // Fallback: legacy catalog_products for slugs not yet in unified
      const { rows: legacyRows } = await db.query(`
        SELECT
          cp.*,
          COALESCE(cp.computed_price, cp.price, cp.msrp) AS unified_price,
          (SELECT array_agg(url ORDER BY priority)
           FROM catalog_media WHERE product_id = cp.id AND media_type = 'image') AS all_images
        FROM catalog_products cp
        WHERE cp.slug = $1 AND cp.is_active = true
        LIMIT 1
      `, [slug]);

      if (!legacyRows.length) notFound();
      product = { ...legacyRows[0], source_vendor: "WPS", msrp: legacyRows[0].unified_price };
    }
  } catch (err) {
    console.error("[PDP]", err.message);
    notFound();
  }

  if (!product) notFound();

  return (
    <ProductDetailClient
      product={normalizeProduct(product)}
      relatedProducts={[]}
    />
  );
}

function normalizeProduct(row) {
  const images = Array.isArray(row.all_images)
    ? row.all_images.filter(Boolean)
    : Array.isArray(row.image_urls)
      ? row.image_urls.filter(Boolean)
      : [];

  const price = Number(row.msrp ?? row.cost ?? row.price ?? row.computed_price ?? 0);
  const originalRetail = row.original_retail ? Number(row.original_retail) : null;
  const was = originalRetail && originalRetail > price ? originalRetail : null;

  return {
    id:           row.id,
    slug:         row.slug,
    sku:          row.sku,
    name:         row.name,
    brand:        row.brand    ?? "Unknown",
    category:     row.category ?? "Uncategorized",
    description:  row.description ?? null,
    features:     Array.isArray(row.features) ? row.features : [],
    price,
    was,
    mapPrice:     row.map_price != null ? Number(row.map_price) : null,
    inStock:      row.in_stock ?? (Number(row.stock_quantity ?? 0) > 0),
    stockQty:     row.stock_quantity ?? 0,
    badge:        row.closeout ? "sale" : null,
    // Images
    primaryImage: images[0] ?? null,
    gallery:      images,
    // Vendor
    vendor:       row.source_vendor ?? null,
    sourceVendor: row.source_vendor ?? null,
    // Physical
    weight:       row.weight     ?? null,
    heightIn:     row.height_in  ?? null,
    lengthIn:     row.length_in  ?? null,
    widthIn:      row.width_in   ?? null,
    uom:          row.uom        ?? null,
    upc:          row.upc        ?? null,
    countryOfOrigin: row.country_of_origin ?? null,
    oemPartNumber:   row.oem_part_number   ?? null,
    // Fitment
    isHarleyFitment:   row.is_harley_fitment   ?? false,
    fitmentHdFamilies: row.fitment_hd_families ?? [],
    fitmentHdModels:   row.fitment_hd_models   ?? [],
    fitmentHdCodes:    row.fitment_hd_codes    ?? [],
    fitmentOtherMakes: row.fitment_other_makes ?? [],
    fitmentYearStart:  row.fitment_year_start  ?? null,
    fitmentYearEnd:    row.fitment_year_end    ?? null,
    // Catalog
    inOldbook:  row.in_oldbook  ?? false,
    inFatbook:  row.in_fatbook  ?? false,
    dragPart:   row.drag_part   ?? false,
    // Warehouse
    warehouseWi: row.warehouse_wi ?? 0,
    warehouseNy: row.warehouse_ny ?? 0,
    warehouseTx: row.warehouse_tx ?? 0,
    warehouseNv: row.warehouse_nv ?? 0,
    warehouseNc: row.warehouse_nc ?? 0,
    // Misc
    shipping:     price >= 99,
    pointsEarned: Math.floor(price * 10),
  };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const db = getCatalogDb();
  try {
    const { rows } = await db.query(`
      SELECT name, brand FROM catalog_unified
      WHERE slug = $1 AND is_active = true LIMIT 1
    `, [slug]);
    const p = rows[0];
    if (p) return {
      title: `${p.name} | ${p.brand} | Stinkin' Supplies`,
      description: `Shop ${p.name} by ${p.brand}. Free shipping on orders over $99.`,
    };
  } catch {}
  return { title: "Product | Stinkin' Supplies" };
}
