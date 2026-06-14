// ============================================================
// app/browse/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// PDP fitment and OEM display are sourced directly from the
// dedicated catalog_fitment_v2 and catalog_oem_crossref tables.
// ============================================================

import SideNav from "components/SideNav";
import { notFound } from "next/navigation";
import getCatalogDb from "@/lib/db/catalog";
import ProductDetailClient from "./ProductDetailClient";
import { proxyImageUrl } from "@/lib/utils/image-proxy";
import { getChronologicalNeighbors } from "@/lib/db/browse";

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
        COALESCE(
          (
            SELECT ARRAY_AGG(cm.url ORDER BY cm.priority ASC, cm.id ASC)
            FROM public.catalog_media cm
            WHERE cm.product_id = cp.id
          ),
          CASE WHEN cu.image_url IS NOT NULL THEN ARRAY[cu.image_url] ELSE NULL END,
          '{}'::text[]
        ) AS images,
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
        cu.source_vendor,
        cu.features,
        cu.upc,
        cu.fitment_year_start,
        cu.fitment_year_end,
        cu.fitment_hd_families,
        cu.is_harley_fitment,
        cu.is_universal,
        cu.oem_numbers,
        cu.image_urls,
        cu.special_instructions,
        cu.country_of_origin,
        cu.weight    AS unified_weight,
        cu.height_in,
        cu.length_in,
        cu.width_in,
        cu.id        AS unified_id,
        cu.pack_qty,
        cu.display_category,
        cu.display_subcategory,
        cu.fits_all_models
      FROM public.catalog_products cp
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

  // Fallback: products in catalog_unified but not catalog_products
  if (!productRow) {
    try {
      const { rows: urows } = await catalogDb.query(
        `SELECT
          COALESCE(cp.id, cu.id)               AS id,
          cp.id                                AS cp_id,
          cu.sku,
          COALESCE(cu.internal_sku, cp.internal_sku) AS internal_sku,
          cu.slug,
          cu.name,
          cu.brand AS brand,
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
          cu.oem_numbers,
          cu.image_urls,
          cu.special_instructions,
          cu.country_of_origin,
          cu.weight    AS unified_weight,
          cu.height_in,
          cu.length_in,
          cu.width_in,
          cu.id        AS unified_id,
          cu.pack_qty,
          cu.display_category,
          cu.display_subcategory,
          cu.fits_all_models
        FROM public.catalog_unified cu
        LEFT JOIN public.catalog_products cp ON cp.sku = cu.sku
        WHERE cu.slug = $1
          AND cu.is_active = true
        LIMIT 1`,
        [slug]
      );
      if (urows[0]) { productRow = urows[0]; productRow._fromUnified = true; }
    } catch (err) {
      console.error('[PDP] unified fallback failed:', err.message);
    }
  }

  if (!productRow) notFound();

  // ── Fetch variants, fitment, OEM, specs, related — each isolated ──
  let variants     = [];
  let fitment      = [];
  let oemNumbers   = [];
  let catalogSpecs = [];
  let related      = [];
  let prevPart          = null;
  let nextPart          = null;
  let timelineYearStart = null;
  let timelineYearEnd   = null;

  // Variants — table may not exist yet
  try {
    const { rows } = await catalogDb.query(
      `SELECT option_name, option_value
       FROM catalog_variants
       WHERE product_id = $1
       ORDER BY option_name, option_value`,
      [productRow.id]
    );
    variants = rows;
  } catch (e) {
    // table doesn't exist yet — skip silently
  }

  // Fitment — direct source of truth from catalog_fitment_v2.
  try {
    const fitmentProductId = productRow.unified_id ?? productRow.id;
    const { rows } = await catalogDb.query(
      `SELECT
         hf.name          AS make,
         hm.model_code    AS model,
         hmy.year         AS year
       FROM catalog_fitment_v2 cfv
       JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
       JOIN harley_models hm ON hm.id = hmy.model_id
       JOIN harley_families hf ON hf.id = hm.family_id
       WHERE cfv.product_id = $1
       ORDER BY hf.name, hm.model_code, hmy.year`,
      [fitmentProductId]
    );
    fitment = rows.map((row) => ({
      make: row.make,
      model: row.model,
      year: row.year,
      year_start: row.year,
      year_end: row.year,
    }));
  } catch (e) {
    console.error("[PDP] fitment fetch failed:", e.message);
  }

  // OEM cross-reference — direct source of truth from catalog_oem_crossref.
  try {
    const skuCandidates = [productRow.sku, productRow.internal_sku].filter(Boolean);
    if (skuCandidates.length) {
      const { rows } = await catalogDb.query(
        `SELECT DISTINCT oem_number
         FROM catalog_oem_crossref
         WHERE sku = ANY($1::text[])
           AND oem_number IS NOT NULL
           AND oem_number <> ''
         ORDER BY oem_number`,
        [skuCandidates]
      );
      oemNumbers = rows.map((row) => row.oem_number).filter(Boolean);
    }
  } catch (e) {
    console.error("[PDP] OEM fetch failed:", e.message);
  }

  // Specs — table may not exist yet
  try {
    const { rows } = await catalogDb.query(
      `SELECT attribute, value
       FROM catalog_specs
       WHERE product_id = $1
       ORDER BY attribute`,
      [productRow.id]
    );
    catalogSpecs = rows;
  } catch (e) {
    // table doesn't exist yet — skip silently
  }

  // Related products + chronological neighbors — run in parallel
  await Promise.all([
    // Related: same category, recent
    (async () => {
      try {
        const { rows } = await catalogDb.query(
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
        );
        related = rows.map(normalizeProductRow);
      } catch (e) {
        console.error("[PDP] related fetch failed:", e.message);
      }
    })(),

    // Chronological neighbors: predecessor / successor for same model
    (async () => {
      try {
        const unifiedId = productRow.unified_id ?? productRow.id;
        const neighbors = await getChronologicalNeighbors(
          unifiedId,
          productRow.category ?? null,
        );
        prevPart          = neighbors.prev;
        nextPart          = neighbors.next;
        timelineYearStart = neighbors.currentYearStart;
        timelineYearEnd   = neighbors.currentYearEnd;
      } catch (e) {
        console.error("[PDP] neighbors fetch failed:", e.message);
      }
    })(),
  ]);

  const specs = catalogSpecs
    .filter(s => !["Catalog", "Product Code", "Data", "DATA"].includes(s.attribute))
    .filter(s => {
      try {
        JSON.parse(s.value);
        return false;
      } catch {
        return true;
      }
    })
    .map(s => ({ label: s.attribute, value: s.value }));

  const normalized = normalizeProductRow(productRow);
  // Only use real OEM numbers from catalog_oem_crossref — never fall back to
  // cu.oem_numbers, which stores vendor catalog numbers (e.g. K&L "32-XXXX").
  const resolvedOemNumbers = oemNumbers;

  return (
    <ProductDetailClient
      product={{ ...normalized, specs, oemNumbers: resolvedOemNumbers }}
      variants={variants}
      fitment={fitment}
      relatedProducts={related}
      prevPart={prevPart}
      nextPart={nextPart}
      timelineYearStart={timelineYearStart}
      timelineYearEnd={timelineYearEnd}
    />
  );
}

// ── Row normalizer ─────────────────────────────────────────────
function normalizeProductRow(row) {
  const price  = Number(row.price ?? 0);
  const rawWas = row.msrp != null ? Number(row.msrp) : null;
  const was    = rawWas != null && rawWas > price ? rawWas : null;

  // Build gallery from catalog_media images, then supplement with image_urls from PU enrichment.
  // Do NOT rewrite http:// -> https:// here — proxyImageUrl detects http:// URLs and routes
  // them through /api/img. Rewriting first breaks that check (LeMans CDN is http-only).
  const mediaImages = Array.isArray(row.images) && row.images.length > 0
    ? row.images.filter(Boolean)
    : row.image ? [row.image] : [];

  const enrichedImages = Array.isArray(row.image_urls)
    ? row.image_urls.filter(Boolean)
    : [];

  // Merge: media images first, then any additional from image_urls not already present
  const mediaSet = new Set(mediaImages);
  const allImages = [...mediaImages, ...enrichedImages.filter(u => !mediaSet.has(u))];

  const gallery      = allImages.map(u => proxyImageUrl(u) ?? u).filter(Boolean);
  const primaryImage = gallery[0] ?? null;

  return {
    id:              row.unified_id ?? row.id,
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
    weight:          row.unified_weight ?? row.weight ?? null,
    heightIn:        row.height_in   ?? null,
    lengthIn:        row.length_in   ?? null,
    widthIn:         row.width_in    ?? null,
    countryOfOrigin: row.country_of_origin ?? null,
    upc:             row.upc         ?? null,
    features:        Array.isArray(row.features) ? row.features.filter(Boolean) : [],
    oemNumbers:      Array.isArray(row.oem_numbers) ? row.oem_numbers : [],
    specialInstructions: row.special_instructions ?? null,
    fitmentYearStart:  row.fitment_year_start  ?? null,
    fitmentYearEnd:    row.fitment_year_end    ?? null,
    fitmentHdFamilies: row.fitment_hd_families ?? [],
    isHarleyFitment:   row.is_harley_fitment   ?? false,
    isUniversal:       row.is_universal        ?? false,
    dragPart:          row.drag_part           ?? false,
    pageReference:     null,
    fatbookPage:       null,
    oldbookPage:       null,
    inFatbook:         false,
    inOldbook:         false,
    inHarddrive:       false,
    shipping:          price >= 99,
    pointsEarned:      Math.floor(price * 10),
    packQty:           row.pack_qty && row.pack_qty > 1 ? Number(row.pack_qty) : 1,
    displayCategory:   row.display_category    ?? null,
    displaySubcategory: row.display_subcategory ?? null,
    fitsAllModels:     row.fits_all_models     ?? false,
    sourceVendor:      row.source_vendor       ?? null,
  };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const { rows } = await getCatalogDb().query(
      `SELECT COALESCE(cp.name, cu.name) AS name, COALESCE(cp.brand, cu.brand) AS brand
       FROM catalog_unified cu
       LEFT JOIN catalog_products cp ON cp.sku = cu.sku
       WHERE cu.slug = $1
         AND cu.is_active = true
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
  } catch {}
  const name = slug.replace(/-/g, " ");
  return {
    title:       `${name} | Stinkin' Supplies`,
    description: `Shop ${name}. Free shipping on orders over $99.`,
  };
}
