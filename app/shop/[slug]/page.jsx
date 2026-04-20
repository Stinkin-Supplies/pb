// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// All data comes from the catalog PostgreSQL server via
// getCatalogDb(). Supabase is not used here.
//
// Query strategy:
//   1. catalog_products JOIN catalog_unified — ensures product is
//      in a valid catalog (fatbook/oldbook/harddrive/drag_part).
//      Products not in catalog_unified will 404.
//   2. Images: catalog_media first, fall back to catalog_unified.image_url
//   3. proxyImageUrl() handles both LeMans zip URLs → /api/img
//      and WPS CDN URLs → /api/image-proxy
// ============================================================

import { notFound } from "next/navigation";
import getCatalogDb from "@/lib/db/catalog";
import ProductDetailClient from "./ProductDetailClient";
import { proxyImageUrl } from "@/lib/utils/image-proxy";

export default async function ProductDetailPage({ params }) {
  const { slug } = await params;

  const catalogDb = getCatalogDb();

  // ── Fetch product — MUST exist in catalog_unified to be valid ─
  let productRow = null;
  try {
    const { rows } = await catalogDb.query(
      `SELECT
        cp.id,
        cp.sku,
        cp.internal_sku,
        cp.slug,
        cp.name,
        cp.brand,
        cp.category,
        cp.description,
        cp.weight,
        cp.manufacturer_part_number,
        COALESCE(cp.computed_price, cp.msrp) AS price,
        cp.msrp,
        cp.map_price,
        cp.has_map_policy,
        cp.is_active,
        cp.is_discontinued,
        cp.created_at,
        -- Images: catalog_media first, fall back to catalog_unified.image_url
        COALESCE(
          (
            SELECT ARRAY_AGG(cm.url ORDER BY cm.priority ASC, cm.id ASC)
            FROM public.catalog_media cm
            WHERE cm.product_id = cp.id
          ),
          CASE WHEN cu.image_url IS NOT NULL THEN ARRAY[cu.image_url] ELSE NULL END,
          '{}'::text[]
        ) AS images,
        -- Stock
        COALESCE((
          SELECT SUM(vo.total_qty)
          FROM public.vendor_offers vo
          WHERE vo.catalog_product_id = cp.id
            AND vo.is_active = true
        ), cu.stock_quantity, 0) AS stock_quantity,
        COALESCE((
          SELECT ARRAY_AGG(vo.vendor_code ORDER BY vo.updated_at DESC)
          FROM public.vendor_offers vo
          WHERE vo.catalog_product_id = cp.id
            AND vo.is_active = true
        ), ARRAY[cu.source_vendor]) AS vendor_codes,
        -- Enrichment from catalog_unified
        cu.source_vendor,
        cu.features,
        cu.upc,
        cu.fitment_year_start,
        cu.fitment_year_end,
        cu.fitment_hd_families,
        cu.is_harley_fitment,
        cu.is_universal,
        cu.in_oldbook,
        cu.in_fatbook,
        cu.drag_part,
        cu.in_harddrive,
        cu.page_reference,
        cu.fatbook_page,
        cu.oldbook_page,
        cu.oem_numbers,
        cu.country_of_origin,
        cu.weight    AS unified_weight,
        cu.height_in,
        cu.length_in,
        cu.width_in
      FROM public.catalog_products cp
      -- INNER JOIN ensures only catalog-valid products are reachable
      INNER JOIN public.catalog_unified cu ON cu.sku = cp.sku
      WHERE cp.slug = $1
        AND cp.is_active = true
      LIMIT 1`,
      [slug]
    );
    productRow = rows[0] ?? null;
  } catch (err) {
    console.error("[PDP] product fetch failed:", err.message);
  }

  // Fallback: some PU products are in catalog_unified but not catalog_products
  // (e.g. products added via PU pipeline that didn't go through catalog_products)
  if (!productRow) {
    try {
      const { rows: urows } = await catalogDb.query(
        `SELECT
          COALESCE(cp.id, cu.id)               AS id,
          cp.id                                AS cp_id,
          cu.sku,
          COALESCE(cp.internal_sku, cu.internal_sku) AS internal_sku,
          cu.slug,
          cu.name,
          COALESCE(cu.display_brand, cu.brand) AS brand,
          cu.category,
          cu.description,
          COALESCE(cu.weight, 0)               AS weight,
          cu.brand_part_number                 AS manufacturer_part_number,
          COALESCE(cu.msrp, cu.cost, 0)        AS price,
          cu.msrp,
          cu.map_price,
          cu.has_map_policy,
          cu.is_active,
          cu.is_discontinued,
          cu.created_at,
          COALESCE(
            (
              SELECT ARRAY_AGG(cm.url ORDER BY cm.priority ASC, cm.id ASC)
              FROM public.catalog_media cm
              WHERE cm.product_id = (
                SELECT id FROM catalog_products WHERE sku = cu.sku LIMIT 1
              )
            ),
            CASE WHEN cu.image_url IS NOT NULL THEN ARRAY[cu.image_url] ELSE NULL END,
            '{}'::text[]
          ) AS images,
          COALESCE(cu.stock_quantity, 0) AS stock_quantity,
          ARRAY[cu.source_vendor]        AS vendor_codes,
          cu.source_vendor,
          cu.features,
          cu.upc,
          cu.fitment_year_start,
          cu.fitment_year_end,
          cu.fitment_hd_families,
          cu.is_harley_fitment,
          cu.is_universal,
          cu.in_oldbook,
          cu.in_fatbook,
          cu.drag_part,
          cu.in_harddrive,
          cu.page_reference,
          cu.fatbook_page,
          cu.oldbook_page,
          cu.oem_numbers,
          cu.country_of_origin,
          cu.weight    AS unified_weight,
          cu.height_in,
          cu.length_in,
          cu.width_in
        FROM public.catalog_unified cu
        LEFT JOIN public.catalog_products cp ON cp.sku = cu.sku
        WHERE cu.slug = $1
          AND cu.is_active = true
          AND (cu.drag_part = true OR cu.in_fatbook = true OR cu.in_oldbook = true OR cu.in_harddrive = true)
        LIMIT 1`,
        [slug]
      );
      if (urows[0]) { productRow = urows[0]; productRow._fromUnified = true; }
    } catch (err) {
      console.error('[PDP] unified fallback failed:', err.message);
    }
  }

  if (!productRow) notFound();

  // ── Fetch variants, fitment, specs, related in parallel ──────
  let variants     = [];
  let fitment      = [];
  let catalogSpecs = [];
  let related      = [];

  try {
    const [variantRows, fitmentRows, specRows, relatedRows] = await Promise.all([
      catalogDb.query(
        `SELECT option_name, option_value
         FROM catalog_variants
         WHERE product_id = $1
         ORDER BY option_name, option_value`,
        [productRow.id]
      ),
      catalogDb.query(
        `SELECT make, model, year_start, year_end
         FROM catalog_fitment
         WHERE product_id = $1
         ORDER BY make, model, year_start`,
        [productRow.id]
      ),
      catalogDb.query(
        `SELECT attribute, value
         FROM catalog_specs
         WHERE product_id = $1
         ORDER BY attribute`,
        [productRow.id]
      ),
      // Related: must also be in catalog_unified
      catalogDb.query(
        `SELECT
          cp.id, cp.slug, cp.name, cp.brand, cp.category,
          COALESCE(cp.computed_price, cp.msrp) AS price,
          cp.msrp,
          COALESCE((
            SELECT cm.url FROM public.catalog_media cm
            WHERE cm.product_id = cp.id ORDER BY cm.priority ASC LIMIT 1
          ), cu.image_url) AS image,
          COALESCE((
            SELECT SUM(vo.total_qty) FROM public.vendor_offers vo
            WHERE vo.catalog_product_id = cp.id AND vo.is_active = true
          ), cu.stock_quantity, 0) AS stock_quantity
         FROM public.catalog_products cp
         INNER JOIN public.catalog_unified cu ON cu.sku = cp.sku
         WHERE cp.category = $1
           AND cp.slug <> $2
           AND cp.is_active = true
         ORDER BY cp.created_at DESC
         LIMIT 4`,
        [productRow.category, slug]
      ),
    ]);

    variants     = variantRows.rows ?? [];
    fitment      = fitmentRows.rows ?? [];
    catalogSpecs = specRows.rows ?? [];
    related      = (relatedRows.rows ?? []).map(normalizeProductRow);
  } catch (e) {
    console.error("[PDP] secondary fetch failed:", e.message);
  }

  const specs      = catalogSpecs
    .filter(s => !["Catalog", "Product Code"].includes(s.attribute))
    .map(s => ({ label: s.attribute, value: s.value }));

  const normalized = normalizeProductRow(productRow);

  return (
    <ProductDetailClient
      product={{ ...normalized, specs }}
      variants={variants}
      fitment={fitment}
      relatedProducts={related}
    />
  );
}

// ── Row normalizer ─────────────────────────────────────────────
function normalizeProductRow(row) {
  const price  = Number(row.price ?? 0);
  const rawWas = row.msrp != null ? Number(row.msrp) : null;
  const was    = rawWas != null && rawWas > price ? rawWas : null;

  // Build image array — proxyImageUrl handles both LeMans zip and WPS CDN URLs
  const rawImages = Array.isArray(row.images) && row.images.length > 0
    ? row.images
    : row.image ? [row.image] : [];

  const gallery      = rawImages.map(u => proxyImageUrl(u) ?? u).filter(Boolean);
  const primaryImage = gallery[0] ?? null;

  return {
    id:              row.id,
    slug:            row.slug,
    name:            row.name,
    brand:           row.brand       ?? "Unknown",
    category:        row.category    ?? "Uncategorized",
    price,
    was,
    mapPrice:        row.map_price   != null ? Number(row.map_price) : null,
    hasMapPolicy:    row.has_map_policy ?? false,
    badge:           null,
    inStock:         Number(row.stock_quantity ?? 0) > 0,
    stockQty:        Number(row.stock_quantity ?? 0),
    gallery,
    primaryImage,
    sku:             row.internal_sku ?? row.sku ?? null,
    vendor:          Array.isArray(row.vendor_codes) ? (row.vendor_codes[0] ?? null) : null,
    description:     row.description ?? null,
    specs:           [],
    // Physical
    weight:          row.unified_weight ?? row.weight ?? null,
    heightIn:        row.height_in   ?? null,
    lengthIn:        row.length_in   ?? null,
    widthIn:         row.width_in    ?? null,
    countryOfOrigin: row.country_of_origin ?? null,
    upc:             row.upc         ?? null,
    // Features / bullets
    features:        Array.isArray(row.features) ? row.features.filter(Boolean) : [],
    // OEM
    oemNumbers:      Array.isArray(row.oem_numbers) ? row.oem_numbers : [],
    // Catalog references
    pageReference:   row.page_reference ?? null,
    fatbookPage:     row.fatbook_page   ?? null,
    oldbookPage:     row.oldbook_page   ?? null,
    // Fitment flags
    fitmentYearStart:  row.fitment_year_start  ?? null,
    fitmentYearEnd:    row.fitment_year_end    ?? null,
    fitmentHdFamilies: row.fitment_hd_families ?? [],
    isHarleyFitment:   row.is_harley_fitment   ?? false,
    isUniversal:       row.is_universal        ?? false,
    inFatbook:         row.in_fatbook          ?? false,
    inOldbook:         row.in_oldbook          ?? false,
    dragPart:          row.drag_part           ?? false,
    inHarddrive:       row.in_harddrive        ?? false,
    // Commerce
    shipping:        price >= 99,
    pointsEarned:    Math.floor(price * 10),
  };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const { rows } = await getCatalogDb().query(
      `SELECT cp.name, cp.brand
       FROM catalog_products cp
       INNER JOIN catalog_unified cu ON cu.sku = cp.sku
       WHERE cp.slug = $1
         AND cp.is_active = true
       LIMIT 1`,
      [slug]
    );
    const row = rows[0];
    if (row) {
      return {
        title:       `${row.name} | ${row.brand} | Stinkin' Supplies`,
        description: `Shop ${row.name} by ${row.brand}. Free shipping on orders over $99.`,
      };
    }
  } catch (_) {}
  const name = slug.replace(/-/g, " ");
  return {
    title:       `${name} | Stinkin' Supplies`,
    description: `Shop ${name}. Free shipping on orders over $99.`,
  };
}
