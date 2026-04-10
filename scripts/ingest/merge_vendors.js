/**
 * merge_vendors.js
 * Merges WPS (catalog_products) and PU (pu_products_filtered) into
 * a single unified catalog table: catalog_unified
 *
 * Strategy:
 *   - WPS products are inserted first as the authoritative source
 *   - PU products are inserted for SKUs not already in WPS
 *   - SKU overlap (same part in both): WPS wins, PU data enriches description/features
 *   - Brand enrichment (pu_brand_enrichment) joined for richer PU descriptions
 *   - Fitment data (pu_fitment) joined and stored as JSONB
 *   - Images: WPS from catalog_media, PU from pu_brand_enrichment.image_uri
 *
 * Run: node scripts/ingest/merge_vendors.js
 */

import pg from "pg";
import dotenv from "dotenv";
import { ProgressBar } from "./progress_bar.js";

dotenv.config({ path: ".env.local" });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const BATCH_SIZE = 500;

// ── SCHEMA ────────────────────────────────────────────────────────────────────

async function createTable(client) {
  await client.query(`DROP TABLE IF EXISTS catalog_unified CASCADE`);
  await client.query(`
    CREATE TABLE catalog_unified (
      id                  SERIAL PRIMARY KEY,

      -- Identity
      sku                 VARCHAR(50)  NOT NULL UNIQUE,
      sku_normalized      VARCHAR(50),           -- no dashes, no leading zeros
      vendor_sku          VARCHAR(50),           -- original vendor part number
      source_vendor       VARCHAR(10) NOT NULL,  -- 'WPS' or 'PU'
      product_code        VARCHAR(5),            -- PU: A/E/C, WPS: null

      -- Core content
      name                TEXT NOT NULL,
      description         TEXT,
      features            TEXT[],
      brand               VARCHAR(200),
      category            VARCHAR(200),
      subcategory         VARCHAR(200),

      -- Pricing
      msrp                NUMERIC(10,2),
      original_retail     NUMERIC(10,2),
      cost                NUMERIC(10,2),
      map_price           NUMERIC(10,2),
      has_map_policy      BOOLEAN DEFAULT FALSE,
      ad_policy           BOOLEAN DEFAULT FALSE,
      dropship_fee        NUMERIC(8,2),

      -- Inventory
      stock_quantity      INTEGER DEFAULT 0,
      warehouse_wi        INTEGER DEFAULT 0,
      warehouse_ny        INTEGER DEFAULT 0,
      warehouse_tx        INTEGER DEFAULT 0,
      warehouse_nv        INTEGER DEFAULT 0,
      warehouse_nc        INTEGER DEFAULT 0,
      in_stock            BOOLEAN DEFAULT FALSE,

      -- Physical
      weight              NUMERIC(8,3),
      height_in           NUMERIC(8,3),
      length_in           NUMERIC(8,3),
      width_in            NUMERIC(8,3),
      uom                 VARCHAR(20),
      upc                 VARCHAR(20),
      country_of_origin   VARCHAR(50),
      hazardous_code      VARCHAR(5),
      truck_only          BOOLEAN DEFAULT FALSE,
      no_ship_ca          BOOLEAN DEFAULT FALSE,
      pfas                VARCHAR(5),
      harmonized_us       VARCHAR(20),

      -- Media
      image_url           TEXT,                  -- primary image
      image_urls          TEXT[],                -- all images

      -- Fitment (denormalized for fast search)
      fitment_year_start  SMALLINT,
      fitment_year_end    SMALLINT,
      fitment_year_ranges JSONB,
      fitment_hd_families TEXT[],
      fitment_hd_models   TEXT[],
      fitment_hd_codes    TEXT[],
      fitment_other_makes TEXT[],
      is_harley_fitment   BOOLEAN DEFAULT FALSE,
      is_universal        BOOLEAN DEFAULT FALSE,

      -- Catalog flags
      in_oldbook          BOOLEAN DEFAULT FALSE,
      in_fatbook          BOOLEAN DEFAULT FALSE,
      drag_part           BOOLEAN DEFAULT FALSE,
      closeout            BOOLEAN DEFAULT FALSE,
      is_active           BOOLEAN DEFAULT TRUE,
      is_discontinued     BOOLEAN DEFAULT FALSE,

      -- Enrichment
      oem_part_number     VARCHAR(100),
      brand_code          VARCHAR(20),
      enrichment_sku      VARCHAR(100),          -- matched pu_brand_enrichment.sku

      -- Catalog references
      oldbook_page        VARCHAR(20),
      fatbook_page        VARCHAR(20),

      -- Meta
      part_add_date       DATE,
      slug                TEXT UNIQUE,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_cu_sku_norm     ON catalog_unified(sku_normalized);
    CREATE INDEX idx_cu_brand        ON catalog_unified(brand);
    CREATE INDEX idx_cu_category     ON catalog_unified(category);
    CREATE INDEX idx_cu_source       ON catalog_unified(source_vendor);
    CREATE INDEX idx_cu_in_stock     ON catalog_unified(in_stock);
    CREATE INDEX idx_cu_is_active    ON catalog_unified(is_active);
    CREATE INDEX idx_cu_price        ON catalog_unified(msrp);
    CREATE INDEX idx_cu_harley       ON catalog_unified(is_harley_fitment);
    CREATE INDEX idx_cu_year         ON catalog_unified(fitment_year_start, fitment_year_end);
    CREATE INDEX idx_cu_families     ON catalog_unified USING GIN(fitment_hd_families);
    CREATE INDEX idx_cu_codes        ON catalog_unified USING GIN(fitment_hd_codes);
    CREATE INDEX idx_cu_features     ON catalog_unified USING GIN(features);
    CREATE INDEX idx_cu_product_code ON catalog_unified(product_code);
    CREATE INDEX idx_cu_drag         ON catalog_unified(drag_part);
  `);
  console.log("  ✓ catalog_unified table created\n");
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function normalizeSku(sku) {
  if (!sku) return null;
  return sku.replace(/-/g, "").toUpperCase();
}

function slugify(str, sku) {
  const base = (str || sku)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base}-${sku.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
}

// ── INSERT ────────────────────────────────────────────────────────────────────

const COLS = [
  "sku", "sku_normalized", "vendor_sku", "source_vendor", "product_code",
  "name", "description", "features", "brand", "category", "subcategory",
  "msrp", "original_retail", "cost", "map_price", "has_map_policy", "ad_policy", "dropship_fee",
  "stock_quantity", "warehouse_wi", "warehouse_ny", "warehouse_tx", "warehouse_nv", "warehouse_nc", "in_stock",
  "weight", "height_in", "length_in", "width_in", "uom", "upc",
  "country_of_origin", "hazardous_code", "truck_only", "no_ship_ca", "pfas", "harmonized_us",
  "image_url", "image_urls",
  "fitment_year_start", "fitment_year_end", "fitment_year_ranges",
  "fitment_hd_families", "fitment_hd_models", "fitment_hd_codes", "fitment_other_makes",
  "is_harley_fitment", "is_universal",
  "in_oldbook", "in_fatbook", "drag_part", "closeout", "is_active", "is_discontinued",
  "oem_part_number", "brand_code", "enrichment_sku",
  "oldbook_page", "fatbook_page", "part_add_date", "slug",
];

async function insertBatch(client, rows) {
  if (!rows.length) return;
  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = i * COLS.length;
    COLS.forEach((col) => values.push(row[col] ?? null));
    return `(${COLS.map((_, j) => `$${base + j + 1}`).join(", ")})`;
  });
  await client.query(
    `INSERT INTO catalog_unified (${COLS.join(", ")})
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (sku) DO NOTHING`,
    values
  );
}

// ── PHASE 1: WPS ──────────────────────────────────────────────────────────────

async function mergeWPS(client) {
  console.log("📦 Phase 1: Merging WPS products...");

  // Load WPS products with their images
  const { rows: wpsProducts } = await client.query(`
    SELECT
      cp.*,
      ARRAY_AGG(cm.url ORDER BY cm.priority) FILTER (WHERE cm.url IS NOT NULL) AS image_urls
    FROM catalog_products cp
    LEFT JOIN catalog_media cm ON cm.product_id = cp.id AND cm.media_type = 'image'
    GROUP BY cp.id
    ORDER BY cp.id
  `);

  const total = wpsProducts.length;
  const bar   = new ProgressBar(total, "WPS products");
  const rows  = [];
  const slugsSeen = new Set();

  for (let i = 0; i < wpsProducts.length; i++) {
    const p = wpsProducts[i];
    const imageUrls = p.image_urls || [];

    let slug = slugify(p.name, p.sku);
    if (slugsSeen.has(slug)) slug = `${slug}-${i}`;
    slugsSeen.add(slug);

    rows.push({
      sku:              p.sku,
      sku_normalized:   normalizeSku(p.sku),
      vendor_sku:       p.manufacturer_part_number || null,
      source_vendor:    "WPS",
      product_code:     null,
      name:             p.name,
      description:      p.description || null,
      features:         p.product_features ? [p.product_features] : null,
      brand:            p.brand || null,
      category:         p.category || null,
      subcategory:      null,
      msrp:             p.msrp || p.price || null,
      original_retail:  null,
      cost:             p.cost || null,
      map_price:        p.map_price || null,
      has_map_policy:   p.has_map_policy || false,
      ad_policy:        false,
      dropship_fee:     null,
      stock_quantity:   p.stock_quantity || 0,
      warehouse_wi:     0,
      warehouse_ny:     0,
      warehouse_tx:     0,
      warehouse_nv:     0,
      warehouse_nc:     0,
      in_stock:         (p.stock_quantity || 0) > 0,
      weight:           p.weight || null,
      height_in:        null,
      length_in:        null,
      width_in:         null,
      uom:              p.unit_of_measurement || null,
      upc:              p.upc || null,
      country_of_origin: p.country_of_origin || null,
      hazardous_code:   null,
      truck_only:       false,
      no_ship_ca:       false,
      pfas:             null,
      harmonized_us:    null,
      image_url:        imageUrls[0] || null,
      image_urls:       imageUrls.length ? imageUrls : null,
      fitment_year_start:  null,
      fitment_year_end:    null,
      fitment_year_ranges: null,
      fitment_hd_families: null,
      fitment_hd_models:   null,
      fitment_hd_codes:    null,
      fitment_other_makes: null,
      is_harley_fitment:   false,
      is_universal:        false,
      in_oldbook:       false,
      in_fatbook:       false,
      drag_part:        false,
      closeout:         false,
      is_active:        p.is_active !== false,
      is_discontinued:  p.is_discontinued || false,
      oem_part_number:  p.oem_part_number || null,
      brand_code:       null,
      enrichment_sku:   null,
      oldbook_page:     null,
      fatbook_page:     null,
      part_add_date:    null,
      slug,
    });

    bar.update(i + 1);

    if (rows.length >= BATCH_SIZE) {
      await insertBatch(client, rows.splice(0, BATCH_SIZE));
    }
  }

  if (rows.length) await insertBatch(client, rows);
  bar.finish(`${total.toLocaleString()} WPS products merged`);
}

// ── PHASE 2: PU ───────────────────────────────────────────────────────────────

async function mergePU(client) {
  console.log("\n📦 Phase 2: Merging PU products...");

  // Load PU products with enrichment and fitment joined
  const { rows: puProducts } = await client.query(`
    SELECT
      p.*,
      e.name            AS enrich_name,
      e.features        AS enrich_features,
      e.brand_code,
      e.sku             AS enrich_sku,
      e.image_uri,
      e.oem_part_number AS enrich_oem,
      e.country_of_origin AS enrich_country,
      f.year_start      AS fit_year_start,
      f.year_end        AS fit_year_end,
      f.year_ranges     AS fit_year_ranges,
      f.hd_families     AS fit_hd_families,
      f.hd_models       AS fit_hd_models,
      f.hd_codes        AS fit_hd_codes,
      f.other_makes     AS fit_other_makes,
      f.is_harley,
      f.is_universal
    FROM pu_products_filtered p
    LEFT JOIN pu_brand_enrichment e
      ON p.sku_punctuated = e.sku
    LEFT JOIN pu_fitment f
      ON p.sku_punctuated = f.sku
    ORDER BY p.id
  `);

  const total = puProducts.length;
  const bar   = new ProgressBar(total, "PU products");
  const rows  = [];
  const slugsSeen = new Set();
  let skipped = 0;

  // Get existing WPS normalized SKUs to detect overlaps
  const { rows: existingSkus } = await client.query(
    `SELECT sku_normalized FROM catalog_unified`
  );
  const wpsNormSet = new Set(existingSkus.map(r => r.sku_normalized));

  for (let i = 0; i < puProducts.length; i++) {
    const p = puProducts[i];

    // Skip if WPS already has this SKU (WPS wins on overlap)
    const norm = normalizeSku(p.sku_punctuated || p.sku);
    if (wpsNormSet.has(norm)) { skipped++; bar.update(i + 1); continue; }

    // Best name: enrichment title > raw PU name
    const name = p.enrich_name || p.name;

    // Build description from enrichment
    const description = p.enrich_name && p.enrich_name !== p.name ? p.enrich_name : null;

    // Features: enrichment features array
    const features = p.enrich_features?.length ? p.enrich_features : null;

    // Image: enrichment URI (LeMans CDN)
    const imageUrl = p.image_uri || null;

    let slug = slugify(name, p.sku);
    // Dedupe slugs
    let slugAttempt = slug;
    let attempt = 0;
    while (slugsSeen.has(slugAttempt)) slugAttempt = `${slug}-${++attempt}`;
    slugsSeen.add(slugAttempt);

    rows.push({
      sku:              p.sku,
      sku_normalized:   norm,
      vendor_sku:       p.vendor_part_number || null,
      source_vendor:    "PU",
      product_code:     p.product_code || null,
      name,
      description,
      features,
      brand:            p.brand || null,
      category:         null,   // PU has no categories — will be enriched later
      subcategory:      null,
      msrp:             p.msrp || null,
      original_retail:  p.original_retail || null,
      cost:             p.your_dealer_price || p.base_dealer_price || null,
      map_price:        null,
      has_map_policy:   false,
      ad_policy:        p.ad_policy || false,
      dropship_fee:     p.dropship_fee || null,
      stock_quantity:   p.total_qty || 0,
      warehouse_wi:     p.warehouse_wi || 0,
      warehouse_ny:     p.warehouse_ny || 0,
      warehouse_tx:     p.warehouse_tx || 0,
      warehouse_nv:     p.warehouse_nv || 0,
      warehouse_nc:     p.warehouse_nc || 0,
      in_stock:         (p.total_qty || 0) > 0,
      weight:           p.weight || null,
      height_in:        p.height_in || null,
      length_in:        p.length_in || null,
      width_in:         p.width_in || null,
      uom:              p.uom || null,
      upc:              p.upc_code || null,
      country_of_origin: p.country_of_origin || p.enrich_country || null,
      hazardous_code:   p.hazardous_code || null,
      truck_only:       p.truck_only || false,
      no_ship_ca:       p.no_ship_ca || false,
      pfas:             p.pfas || null,
      harmonized_us:    p.harmonized_us || null,
      image_url:        imageUrl,
      image_urls:       imageUrl ? [imageUrl] : null,
      fitment_year_start:  p.fit_year_start || null,
      fitment_year_end:    p.fit_year_end   || null,
      fitment_year_ranges: p.fit_year_ranges ? JSON.stringify(p.fit_year_ranges) : null,
      fitment_hd_families: p.fit_hd_families || null,
      fitment_hd_models:   p.fit_hd_models   || null,
      fitment_hd_codes:    p.fit_hd_codes    || null,
      fitment_other_makes: p.fit_other_makes  || null,
      is_harley_fitment:   p.is_harley || false,
      is_universal:        p.is_universal || false,
      in_oldbook:       !!p.oldbook_year_page && p.oldbook_year_page !== "0",
      in_fatbook:       !!p.fatbook_year_page && p.fatbook_year_page !== "0",
      drag_part:        p.drag_part || false,
      closeout:         p.closeout || false,
      is_active:        p.part_status === "S" || p.part_status === "P" || p.part_status === "N",
      is_discontinued:  p.part_status === "D",
      oem_part_number:  p.enrich_oem || p.vendor_part_number || null,
      brand_code:       p.brand_code || null,
      enrichment_sku:   p.enrich_sku || null,
      oldbook_page:     p.oldbook_year_page || null,
      fatbook_page:     p.fatbook_year_page || null,
      part_add_date:    p.part_add_date || null,
      slug:             slugAttempt,
    });

    bar.update(i + 1);

    if (rows.length >= BATCH_SIZE) {
      await insertBatch(client, rows.splice(0, BATCH_SIZE));
    }
  }

  if (rows.length) await insertBatch(client, rows);
  bar.finish(`${(total - skipped).toLocaleString()} PU products merged (${skipped} overlaps skipped)`);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔀 Merging vendors into catalog_unified\n");

  const client = await pool.connect();
  try {
    console.log("🔧 Creating unified table...");
    await createTable(client);

    await mergeWPS(client);
    await mergePU(client);

    // Final summary
    const { rows: [s] } = await client.query(`
      SELECT
        COUNT(*)                                               AS total,
        COUNT(*) FILTER (WHERE source_vendor = 'WPS')         AS wps,
        COUNT(*) FILTER (WHERE source_vendor = 'PU')          AS pu,
        COUNT(DISTINCT brand)                                  AS brands,
        COUNT(*) FILTER (WHERE in_stock)                      AS in_stock,
        COUNT(*) FILTER (WHERE image_url IS NOT NULL)         AS with_image,
        COUNT(*) FILTER (WHERE description IS NOT NULL)       AS with_desc,
        COUNT(*) FILTER (WHERE features IS NOT NULL)          AS with_features,
        COUNT(*) FILTER (WHERE is_harley_fitment)             AS harley_fitment,
        COUNT(*) FILTER (WHERE fitment_year_start IS NOT NULL) AS with_years,
        COUNT(*) FILTER (WHERE fitment_hd_codes IS NOT NULL)  AS with_hd_codes,
        COUNT(*) FILTER (WHERE in_oldbook)                    AS in_oldbook,
        COUNT(*) FILTER (WHERE in_fatbook)                    AS in_fatbook,
        COUNT(*) FILTER (WHERE drag_part)                     AS drag_parts,
        COUNT(*) FILTER (WHERE category IS NOT NULL)          AS with_category
      FROM catalog_unified
    `);

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Merge complete!

  Total products:       ${Number(s.total).toLocaleString()}
  WPS products:         ${Number(s.wps).toLocaleString()}
  PU products:          ${Number(s.pu).toLocaleString()}
  Unique brands:        ${s.brands}

  In stock:             ${Number(s.in_stock).toLocaleString()}
  With image:           ${Number(s.with_image).toLocaleString()}
  With description:     ${Number(s.with_desc).toLocaleString()}
  With features:        ${Number(s.with_features).toLocaleString()}
  With category:        ${Number(s.with_category).toLocaleString()}

  Harley fitment:       ${Number(s.harley_fitment).toLocaleString()}
  With year range:      ${Number(s.with_years).toLocaleString()}
  With HD model codes:  ${Number(s.with_hd_codes).toLocaleString()}
  In Oldbook:           ${Number(s.in_oldbook).toLocaleString()}
  In Fatbook:           ${Number(s.in_fatbook).toLocaleString()}
  Drag parts:           ${Number(s.drag_parts).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
