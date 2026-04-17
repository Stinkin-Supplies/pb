// ============================================================
// app/shop/[slug]/page.jsx  —  SERVER COMPONENT
// ============================================================
// All data comes from the catalog PostgreSQL server via
// getCatalogDb(). Supabase is not used here.
// ============================================================

import { notFound } from "next/navigation";
import getCatalogDb from "@/lib/db/catalog";
import ProductDetailClient from "./ProductDetailClient";

export default async function ProductDetailPage({ params }) {
  const { slug } = await params;

  const catalogDb = getCatalogDb();

  // ── Fetch product + images + stock in one query ───────────
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
        COALESCE(cp.computed_price, cp.price, cp.msrp) AS price,
        cp.msrp,
        cp.map_price,
        cp.is_active,
        cp.is_discontinued,
        cp.created_at,
        COALESCE((
          SELECT ARRAY_AGG(cm.url ORDER BY cm.priority ASC)
          FROM public.catalog_media cm
          WHERE cm.product_id = cp.id
        ), '{}'::text[]) AS images,
        COALESCE((
          SELECT SUM(vo.total_qty)
          FROM public.vendor_offers vo
          WHERE vo.catalog_product_id = cp.id
            AND vo.is_active = true
        ), 0) AS stock_quantity,
        COALESCE((
          SELECT ARRAY_AGG(vo.vendor_code ORDER BY vo.updated_at DESC)
          FROM public.vendor_offers vo
          WHERE vo.catalog_product_id = cp.id
            AND vo.is_active = true
        ), '{}'::text[]) AS vendor_codes
      FROM public.catalog_products cp
      WHERE cp.slug = $1
      LIMIT 1`,
      [slug]
    );
    productRow = rows[0] ?? null;
  } catch (err) {
    console.error("[PDP] product fetch failed:", err.message);
  }

  // Fallback: catalog_unified for PU-only products not in catalog_products
  if (!productRow) {
    try {
      const { rows: urows } = await catalogDb.query(
        `SELECT
          cu.id,
          cu.sku,
          cu.slug,
          cu.name,
          COALESCE(cu.display_brand, cu.brand) AS brand,
          cu.category,
          cu.description,
          cu.weight,
          cu.brand_part_number   AS manufacturer_part_number,
          COALESCE(cu.msrp, cu.cost, 0) AS price,
          cu.msrp,
          cu.map_price,
          cu.is_active,
          cu.is_discontinued,
          cu.created_at,
          CASE WHEN cu.image_url IS NOT NULL
               THEN ARRAY[cu.image_url]
               ELSE '{}'::text[]
          END AS images,
          COALESCE(cu.stock_quantity, 0) AS stock_quantity,
          ARRAY[cu.source_vendor]        AS vendor_codes,
          cu.upc,
          cu.features,
          cu.fitment_year_start,
          cu.fitment_year_end,
          cu.fitment_hd_families,
          cu.is_harley_fitment,
          cu.is_universal,
          cu.in_oldbook,
          cu.in_fatbook,
          cu.drag_part
        FROM public.catalog_unified cu
        WHERE cu.slug = $1
        LIMIT 1`,
        [slug]
      );
      if (urows[0]) { productRow = urows[0]; productRow._fromUnified = true; }
    } catch (err) {
      console.error('[PDP] unified fallback failed:', err.message);
    }
  }

  if (!productRow) notFound();

  // ── Fetch variants, fitment, specs in parallel ────────────
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
      catalogDb.query(
        `SELECT
          cp.id, cp.slug, cp.name, cp.brand, cp.category,
          COALESCE(cp.computed_price, cp.price, cp.msrp) AS price,
          cp.msrp,
          COALESCE((
            SELECT cm.url FROM public.catalog_media cm
            WHERE cm.product_id = cp.id ORDER BY cm.priority ASC LIMIT 1
          ), NULL) AS image,
          COALESCE((
            SELECT SUM(vo.total_qty) FROM public.vendor_offers vo
            WHERE vo.catalog_product_id = cp.id AND vo.is_active = true
          ), 0) AS stock_quantity
         FROM public.catalog_products cp
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
    console.error("[PDP] catalog DB secondary fetch failed:", e.message);
  }

  const specs = catalogSpecs.filter(s => !["Catalog", "Product Code"].includes(s.attribute)).map(s => ({ label: s.attribute, value: s.value }));
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

// ── Row normalizer ────────────────────────────────────────────
function normalizeProductRow(row) {
  const price  = Number(row.price ?? 0);
  const rawWas = row.msrp != null ? Number(row.msrp) : null;
  const was    = rawWas != null && rawWas > price ? rawWas : null;

  return {
    id:           row.id,
    slug:         row.slug,
    name:         row.name,
    brand:        row.brand    ?? "Unknown",
    category:     row.category ?? "Uncategorized",
    price,
    was,
    mapPrice:     row.map_price != null ? Number(row.map_price) : null,
    badge:        null,
    inStock:      Number(row.stock_quantity ?? 0) > 0,
    stockQty:     Number(row.stock_quantity ?? 0),
    fitmentIds:   null,
    gallery:      Array.isArray(row.images) && row.images.length > 0
                    ? row.images
                    : row.image ? [row.image] : [],
    primaryImage: Array.isArray(row.images) && row.images.length > 0 ? row.images[0] : row.image ?? null,
    sku:          row.internal_sku ?? row.sku ?? null,
    vendor:       Array.isArray(row.vendor_codes) ? (row.vendor_codes[0] ?? null) : null,
    vendor_slug:  Array.isArray(row.vendor_codes) ? (row.vendor_codes[0] ?? null) : null,
    description:  row.description ?? null,
    specs:        [],
    weight:       row.weight ?? null,
    shipping:     price >= 99,
    pointsEarned: Math.floor(price * 10),
  };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const { rows } = await getCatalogDb().query(
      `SELECT name, brand FROM catalog_products WHERE slug = $1 LIMIT 1`,
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
