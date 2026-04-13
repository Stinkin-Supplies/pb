// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// Fetches product from catalog_unified (WPS + PU merged).
// SSR for SEO. Falls back to catalog_products for legacy slugs.
// ============================================================

import { notFound } from "next/navigation";
import { getCatalogDb } from "@/lib/db/catalog";
import {
  typesenseClient,
  COLLECTION,
  DEFAULT_SEARCH_PARAMS,
  IS_GROUPS_COLLECTION,
} from "@/lib/typesense/client";
import ProductDetailClient from "./ProductDetailClient";

export default async function ProductDetailPage({ params }) {
  const { slug } = await params;

  let product = null;

  try {
    // Prefer Typesense (same source as /api/search) so PDP doesn't 404 when the
    // catalog database is temporarily unavailable/misconfigured in prod.
    const tsDoc = await fetchTypesenseBySlug(slug);
    if (tsDoc) {
      product = normalizeTypesenseDoc(tsDoc);
    }
  } catch (err) {
    // If Typesense fails, fall back to Postgres below.
    console.error("[PDP Typesense]", err instanceof Error ? err.message : String(err));
  }

  const db = getCatalogDb();

  try {
    if (product) {
      return <ProductDetailClient product={product} relatedProducts={[]} />;
    }

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

async function fetchTypesenseBySlug(slug) {
  const baseFilter = DEFAULT_SEARCH_PARAMS?.filter_by
    ? String(DEFAULT_SEARCH_PARAMS.filter_by)
    : "";
  const filterBy = baseFilter ? `${baseFilter} && slug:=${slug}` : `slug:=${slug}`;

  const results = await typesenseClient
    .collections(COLLECTION)
    .documents()
    .search({
      ...DEFAULT_SEARCH_PARAMS,
      q: "*",
      filter_by: filterBy,
      page: 1,
      per_page: 1,
    });

  return results?.hits?.[0]?.document ?? null;
}

function normalizeTypesenseDoc(doc) {
  const imageArr = Array.isArray(doc.image_urls)
    ? doc.image_urls.filter(Boolean)
    : Array.isArray(doc.images)
      ? doc.images.filter(Boolean)
      : doc.image_url
        ? [doc.image_url]
        : doc.image
          ? [doc.image]
          : [];

  // product_groups doesn’t have SKU; synthesize something stable so the page can render.
  const fallbackSku = String(doc.sku ?? doc.internal_sku ?? doc.group_id ?? doc.id ?? doc.slug ?? "");

  const price =
    doc.msrp != null ? Number(doc.msrp)
      : doc.price != null ? Number(doc.price)
        : doc.price_min != null ? Number(doc.price_min)
          : 0;

  const was =
    doc.was != null ? Number(doc.was)
      : doc.original_retail != null ? Number(doc.original_retail)
        : null;

  return {
    // Identity
    id:           doc.id ?? doc.group_id ?? null,
    slug:         doc.slug ?? "",
    sku:          doc.sku ?? fallbackSku,
    name:         doc.name ?? "",
    brand:        doc.brand ?? "Unknown",
    category:     doc.category ?? "Uncategorized",

    // Content
    description:  doc.description ?? null,
    features:     Array.isArray(doc.features) ? doc.features : [],

    // Pricing
    price,
    was,
    mapPrice:     doc.mapPrice != null ? Number(doc.mapPrice) : (doc.map_price != null ? Number(doc.map_price) : null),

    // Availability
    inStock:      doc.inStock ?? doc.in_stock ?? false,
    stockQty:     doc.stockQty ?? doc.stock_quantity ?? doc.stock_total ?? 0,

    // Badges
    badge:        doc.badge ?? (doc.closeout ? "sale" : null),

    // Images
    primaryImage: imageArr[0] ?? null,
    gallery:      imageArr,

    // Vendor/meta (optional)
    vendor:       doc.vendor ?? doc.source_vendor ?? null,
    sourceVendor: doc.source_vendor ?? null,

    // Fitment + flags (pass through when present)
    isHarleyFitment:   doc.isHarleyFitment ?? doc.is_harley_fitment ?? false,
    isUniversal:       doc.isUniversal ?? doc.is_universal ?? false,
    fitmentHdFamilies: doc.fitmentHdFamilies ?? doc.fitment_hd_families ?? [],
    fitmentHdModels:   doc.fitmentHdModels ?? doc.fitment_hd_models ?? [],
    fitmentHdCodes:    doc.fitmentHdCodes ?? doc.fitment_hd_codes ?? [],
    fitmentYearStart:  doc.fitmentYearStart ?? doc.fitment_year_start ?? null,
    fitmentYearEnd:    doc.fitmentYearEnd ?? doc.fitment_year_end ?? null,

    inOldbook:  doc.inOldbook ?? doc.in_oldbook ?? false,
    inFatbook:  doc.inFatbook ?? doc.in_fatbook ?? false,
    dragPart:   doc.dragPart ?? doc.drag_part ?? false,

    // Warehouse totals (optional; groups may not have these)
    warehouseWi: doc.warehouseWi ?? doc.warehouse_wi ?? 0,
    warehouseNy: doc.warehouseNy ?? doc.warehouse_ny ?? 0,
    warehouseTx: doc.warehouseTx ?? doc.warehouse_tx ?? 0,
    warehouseNv: doc.warehouseNv ?? doc.warehouse_nv ?? 0,
    warehouseNc: doc.warehouseNc ?? doc.warehouse_nc ?? 0,

    // PDP expects these fields in a few places; safe defaults
    shipping:     price >= 99,
    pointsEarned: Math.floor(price * 10),

    // Group metadata (when using product_groups collection)
    groupId:        IS_GROUPS_COLLECTION ? (doc.group_id ?? doc.id ?? null) : undefined,
    groupSignal:    IS_GROUPS_COLLECTION ? (doc.group_signal ?? "singleton") : undefined,
    availableBrands: IS_GROUPS_COLLECTION ? (doc.available_brands ?? []) : undefined,
  };
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
