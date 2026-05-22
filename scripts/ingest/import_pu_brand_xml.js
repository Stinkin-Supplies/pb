/**
 * import_pu_brand_catalogs_WORKING.js
 * Imports all PU brand XML catalogs — handles two formats:
 *   1. PIES 7.2  (_PIES_Export.xml)
 *   2. Catalog Content (_Catalog_Content_Export.xml)
 *
 * Run: node scripts/ingest/import_pu_brand_catalogs_WORKING.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import xml2js from "xml2js";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XML_DIR   = path.resolve(__dirname, "../data/pu_pricefile");
const BATCH_SIZE = 300;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── HELPERS ───────────────────────────────────────────────────────────────────

function str(node) {
  if (node == null) return null;
  if (Array.isArray(node)) node = node[0];
  if (node == null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "object") {
    if (node._) return String(node._).trim() || null;
    if (node.$) return null;
  }
  return String(node).trim() || null;
}

function attr(node, key) {
  if (Array.isArray(node)) node = node[0];
  if (!node || typeof node !== "object" || !node.$) return null;
  return node.$[key] != null ? String(node.$[key]).trim() || null : null;
}

function flt(node) {
  const v = parseFloat(str(node));
  return isNaN(v) || v === 0 ? null : v;
}

function dt(node) {
  const s = str(node);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// LeMans coming-soon placeholder — base64 decodes to
// "static/sites/lemansplatform/image-coming-soon"
const PLACEHOLDER_FRAGMENTS = [
  "c3RhdGljL3NpdGVzL2xlbWFuc3BsYXRmb3JtL2ltYWdlLWNvbWluZy1zb29u",
  "image-coming-soon",
  "coming-soon",
  "comingsoon",
  "no-image",
  "noimage",
  "placeholder",
];

function isPlaceholderImage(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  return PLACEHOLDER_FRAGMENTS.some(f => lower.includes(f.toLowerCase()));
}

// ── PARSERS ───────────────────────────────────────────────────────────────────

async function parseFile(filePath) {
  const xml = fs.readFileSync(filePath, "utf8");
  let xmlObj;
  try {
    xmlObj = await xml2js.parseStringPromise(xml, { explicitArray: true });
  } catch (err) {
    console.error(`  ✗ XML parse error: ${err.message}`);
    return [];
  }
  if (xmlObj.PIES || xmlObj.pies) return parsePIES(xmlObj, filePath);
  if (xmlObj.root)                return parseCatalogContent(xmlObj, filePath);
  console.warn(`  ⚠ Unknown root in ${path.basename(filePath)}`);
  return [];
}

// Format 1: PIES 7.2
function parsePIES(xmlObj, filePath) {
  const root    = xmlObj.PIES || xmlObj.pies;
  const itemsEl = root.Items?.[0] || root.items?.[0];
  if (!itemsEl) return [];
  const items = itemsEl.Item || itemsEl.item || [];
  const sourceFile = path.basename(filePath);
  const rows = [];

  for (const item of items) {
    const sku = str(item.PartNumber);
    if (!sku) continue;

    const brand      = str(item.BrandLabel);
    const brand_code = str(item.BrandAAIAID);

    let name = null;
    const features = [];
    for (const d of item.Descriptions?.[0]?.Description || []) {
      const code = attr(d, "DescriptionCode") || "";
      const text = str(d);
      if (!text) continue;
      if (code === "TLE") name = text;
      else if (code === "FAB") features.push(text);
    }

    let oem_part_number = null, country_of_origin = null;
    for (const e of item.ExtendedInformation?.[0]?.ExtendedProductInformation || []) {
      const code = attr(e, "EXPICode") || "";
      const val  = str(e);
      if (code === "OSP") oem_part_number   = val;
      if (code === "CTO") country_of_origin = val;
    }

    let package_uom = null, qty_of_eaches = null;
    let merch_h = null, merch_w = null, merch_l = null;
    let ship_h  = null, ship_w  = null, ship_l  = null;
    let dimension_uom = null, weight = null, weight_uom = null;

    const pkg = item.Packages?.[0]?.Package?.[0];
    if (pkg) {
      package_uom   = str(pkg.PackageUOM);
      qty_of_eaches = parseInt(str(pkg.QuantityofEaches) || "1", 10) || 1;
      const d = pkg.Dimensions?.[0];
      if (d) {
        dimension_uom = attr(d, "UOM");
        merch_h = flt(d.MerchandisingHeight); merch_w = flt(d.MerchandisingWidth);  merch_l = flt(d.MerchandisingLength);
        ship_h  = flt(d.ShippingHeight);      ship_w  = flt(d.ShippingWidth);       ship_l  = flt(d.ShippingLength);
      }
      const w = pkg.Weights?.[0];
      if (w) { weight_uom = attr(w, "UOM"); weight = flt(w.Weight); }
    }

    // Collect ALL DigitalAssets URIs — PIES has one <DigitalAssets> block per image.
    // xml2js with explicitArray:true wraps everything in arrays.
    // Structure: item.DigitalAssets = [{ DigitalFileInformation: [{ URI: ['url'], FileName: ['name'] }] }, ...]
    const allAssets = Array.isArray(item.DigitalAssets) ? item.DigitalAssets : (item.DigitalAssets ? [item.DigitalAssets] : []);
    const allUris = allAssets
      .map(a => {
        const dfi = Array.isArray(a.DigitalFileInformation) ? a.DigitalFileInformation[0] : a.DigitalFileInformation;
        return str(dfi?.URI ?? a.URI);
      })
      .filter(Boolean)
      .filter(u => !isPlaceholderImage(u));  // strip coming-soon placeholders
    const image_uri      = allUris[0] ?? null;
    const image_uris     = allUris.length > 1 ? allUris : null;
    const image_filename = allAssets[0]
      ? str((Array.isArray(allAssets[0].DigitalFileInformation)
          ? allAssets[0].DigitalFileInformation[0]
          : allAssets[0].DigitalFileInformation)?.FileName ?? allAssets[0].FileName)
      : null;

    rows.push({
      sku, brand, brand_code, name,
      features: features.length ? features : null,
      oem_part_number, country_of_origin,
      package_uom, qty_of_eaches,
      merch_h, merch_w, merch_l, ship_h, ship_w, ship_l,
      dimension_uom, weight, weight_uom,
      image_uri, image_uris, image_filename,
      dealer_price: null, your_dealer_price: null,
      retail_price: null, original_retail_price: null,
      part_status: null, special_instructions: null,
      vendor_price_updated_at: null, product_id: null,
      source_file: sourceFile,
    });
  }
  return rows;
}

// Format 2: Catalog Content (<root><part>)
function parseCatalogContent(xmlObj, filePath) {
  const parts = xmlObj.root?.part || [];
  if (!parts.length) return [];
  const sourceFile = path.basename(filePath);
  const rows = [];

  for (const p of parts) {
    const sku = str(p.punctuatedPartNumber) || str(p.partNumber);
    if (!sku) continue;

    const brand = str(p.brandName);
    const name  = str(p.productName) || str(p.partDescription);

    const features = [];
    for (let i = 1; i <= 24; i++) {
      const b = str(p[`bullet${i}`]);
      if (b) features.push(b);
    }

    rows.push({
      sku,
      brand,
      brand_code:              null,
      name,
      features:                features.length ? features : null,
      oem_part_number:         str(p.supplierNumber),
      country_of_origin:       null,
      package_uom:             str(p.unitOfMeasure),
      qty_of_eaches:           1,
      merch_h: null, merch_w: null, merch_l: null,
      ship_h:  null, ship_w:  null, ship_l:  null,
      dimension_uom:           null,
      weight:                  null,
      weight_uom:              null,
      image_uri:               str(p.partImage) || str(p.productImage) || null,
      image_filename:          null,
      dealer_price:            flt(p.baseDealerPrice),
      your_dealer_price:       flt(p.yourDealerPrice),
      retail_price:            flt(p.baseRetailPrice),
      original_retail_price:   flt(p.originalRetailPrice),
      part_status:             str(p.partStatusDescription),
      special_instructions:    str(p.specialInstructions),
      vendor_price_updated_at: dt(p.vendorPriceUpdateDate),
      product_id:              str(p.productId),
      source_file:             sourceFile,
    });
  }
  return rows;
}

// ── SCHEMA ────────────────────────────────────────────────────────────────────

async function migrateTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS pu_brand_enrichment (
      id                     SERIAL PRIMARY KEY,
      sku                    VARCHAR(100) NOT NULL UNIQUE,
      brand                  VARCHAR(200),
      brand_code             VARCHAR(20),
      name                   TEXT,
      features               TEXT[],
      oem_part_number        VARCHAR(100),
      country_of_origin      VARCHAR(10),
      package_uom            VARCHAR(20),
      qty_of_eaches          INTEGER DEFAULT 1,
      -- Dimensions (PIES only)
      merch_h                NUMERIC(8,3),
      merch_w                NUMERIC(8,3),
      merch_l                NUMERIC(8,3),
      ship_h                 NUMERIC(8,3),
      ship_w                 NUMERIC(8,3),
      ship_l                 NUMERIC(8,3),
      dimension_uom          VARCHAR(10),
      weight                 NUMERIC(8,3),
      weight_uom             VARCHAR(10),
      -- Assets
      image_uri              TEXT,
      image_filename         VARCHAR(200),
      -- Pricing (Catalog Content only)
      dealer_price           NUMERIC(10,2),
      your_dealer_price      NUMERIC(10,2),
      retail_price           NUMERIC(10,2),
      original_retail_price  NUMERIC(10,2),
      -- Catalog Content metadata
      part_status            VARCHAR(50),
      special_instructions   TEXT,
      vendor_price_updated_at TIMESTAMPTZ,
      product_id             VARCHAR(20),
      -- Housekeeping
      source_file            VARCHAR(200),
      created_at             TIMESTAMPTZ DEFAULT NOW(),
      updated_at             TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_pbe_brand       ON pu_brand_enrichment(brand);
    CREATE INDEX IF NOT EXISTS idx_pbe_brand_code  ON pu_brand_enrichment(brand_code);
    CREATE INDEX IF NOT EXISTS idx_pbe_status      ON pu_brand_enrichment(part_status);
    CREATE INDEX IF NOT EXISTS idx_pbe_product_id  ON pu_brand_enrichment(product_id);
  `);
  await client.query(`
    ALTER TABLE pu_brand_enrichment ADD COLUMN IF NOT EXISTS image_uris TEXT[]
  `);
  console.log("  ✓ Table ready (preserved existing data)");
}

// ── INSERT ────────────────────────────────────────────────────────────────────

const COLS = [
  "sku", "brand", "brand_code", "name", "features",
  "oem_part_number", "country_of_origin",
  "package_uom", "qty_of_eaches",
  "merch_h", "merch_w", "merch_l",
  "ship_h",  "ship_w",  "ship_l",
  "dimension_uom", "weight", "weight_uom",
  "image_uri", "image_uris", "image_filename",
  "dealer_price", "your_dealer_price",
  "retail_price", "original_retail_price",
  "part_status", "special_instructions",
  "vendor_price_updated_at", "product_id",
  "source_file",
];

async function insertBatch(client, rows) {
  if (!rows.length) return;
  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = i * COLS.length;
    COLS.forEach((col) => values.push(row[col] ?? null));
    return `(${COLS.map((_, j) => `$${base + j + 1}`).join(", ")})`;
  });
  const updateCols = COLS.filter((c) => c !== "sku");
  await client.query(
    `INSERT INTO pu_brand_enrichment (${COLS.join(", ")})
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (sku) DO UPDATE SET
       ${updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(",\n       ")},
       updated_at = NOW()`,
    values
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const xmlFiles = fs.readdirSync(XML_DIR)
    .filter((f) => f.endsWith(".xml"))
    .sort()
    .map((f) => path.join(XML_DIR, f));

  if (!xmlFiles.length) { console.error(`No XML files in ${XML_DIR}`); process.exit(1); }
  console.log(`\n📦 Found ${xmlFiles.length} XML files\n`);

  const client = await pool.connect();
  try {
    console.log("🔧 Migrating table schema...");
    await migrateTable(client);
    console.log("");

    let grandTotal = 0;
    for (let fi = 0; fi < xmlFiles.length; fi++) {
      const file  = xmlFiles[fi];
      const label = path.basename(file)
        .replace("_PIES_Export.xml", "")
        .replace("_Catalog_Content_Export.xml", "");
      process.stdout.write(`[${String(fi + 1).padStart(2)}/${xmlFiles.length}] ${label.padEnd(34)} `);

      const rows = await parseFile(file);
      if (!rows.length) { console.log("   0 rows"); continue; }

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await insertBatch(client, rows.slice(i, i + BATCH_SIZE));
      }
      grandTotal += rows.length;
      const fmt = rows[0]?.product_id !== undefined && rows[0]?.product_id !== null ? "catalog" : 
                  rows[0]?.brand_code !== null ? "pies" : "pies";
      console.log(`${rows.length.toLocaleString().padStart(7)} rows ✓  [${rows[0]?.dealer_price !== undefined && rows[0]?.brand_code === null ? "catalog" : "pies"}]`);
    }

    console.log("\n🖼️  Populating catalog_media from pu_brand_enrichment...");

    // Clean up any placeholder images inserted by previous runs
    await client.query(`
      DELETE FROM catalog_media 
      WHERE url ILIKE '%c3RhdGljL3NpdGVzL2xlbWFuc3BsYXRmb3JtL2ltYWdlLWNvbWluZy1zb29u%'
         OR url ILIKE '%image-coming-soon%'
         OR url ILIKE '%coming-soon%'
    `);
    await client.query(`
      UPDATE catalog_unified 
      SET image_url = NULL
      WHERE source_vendor = 'PU'
        AND (
          image_url ILIKE '%c3RhdGljL3NpdGVzL2xlbWFuc3BsYXRmb3JtL2ltYWdlLWNvbWluZy1zb29u%'
          OR image_url ILIKE '%image-coming-soon%'
          OR image_url ILIKE '%coming-soon%'
        )
    `);

    // Ensure catalog_media table exists and has required columns
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_media (
        id         SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES catalog_unified(id) ON DELETE CASCADE,
        url        TEXT NOT NULL,
        priority   INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (product_id, url)
      )
    `);
    await client.query(`ALTER TABLE catalog_media ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'pu_xml'`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_catalog_media_product ON catalog_media(product_id)`);

    // Insert all images from pu_brand_enrichment into catalog_media
    // Join on normalized SKU (strip punctuation for PU SKUs)
    const mediaResult = await client.query(`
      INSERT INTO catalog_media (product_id, url, priority, source)
      SELECT
        cu.id,
        unnest(
          CASE
            WHEN pbe.image_uris IS NOT NULL THEN pbe.image_uris
            WHEN pbe.image_uri  IS NOT NULL THEN ARRAY[pbe.image_uri]
            ELSE ARRAY[]::text[]
          END
        ) AS url,
        row_number() OVER (PARTITION BY cu.id ORDER BY pbe.id) - 1 AS priority,
        'pu_xml'
      FROM pu_brand_enrichment pbe
      JOIN catalog_unified cu
        ON replace(cu.sku, '-', '') = replace(replace(pbe.sku, '-', ''), '.', '')
      WHERE cu.source_vendor = 'PU'
        AND (pbe.image_uri IS NOT NULL OR pbe.image_uris IS NOT NULL)
        AND pbe.image_uri NOT ILIKE '%c3RhdGljL3NpdGVzL2xlbWFuc3BsYXRmb3JtL2ltYWdlLWNvbWluZy1zb29u%'
        AND pbe.image_uri NOT ILIKE '%image-coming-soon%'
        AND pbe.image_uri NOT ILIKE '%coming-soon%'
      ON CONFLICT (product_id, url) DO NOTHING
    `);
    console.log(`  ✓ ${mediaResult.rowCount.toLocaleString()} catalog_media rows inserted`);

    // Backfill catalog_unified.image_url where it's null
    const backfillResult = await client.query(`
      UPDATE catalog_unified cu
      SET image_url = pbe.image_uri
      FROM pu_brand_enrichment pbe
      WHERE replace(cu.sku, '-', '') = replace(replace(pbe.sku, '-', ''), '.', '')
        AND cu.source_vendor = 'PU'
        AND cu.image_url IS NULL
        AND pbe.image_uri IS NOT NULL
        AND pbe.image_uri NOT ILIKE '%c3RhdGljL3NpdGVzL2xlbWFuc3BsYXRmb3JtL2ltYWdlLWNvbWluZy1zb29u%'
        AND pbe.image_uri NOT ILIKE '%image-coming-soon%'
        AND pbe.image_uri NOT ILIKE '%coming-soon%'
    `);
    console.log(`  ✓ ${backfillResult.rowCount.toLocaleString()} catalog_unified.image_url backfilled`);

    console.log(`  ✓ ${backfillResult.rowCount.toLocaleString()} catalog_unified.image_url backfilled`);

    // ── Backfill features ──────────────────────────────────────
    console.log("\n📋 Backfilling features...");
    const featResult = await client.query(`
      UPDATE catalog_unified cu
      SET features = pbe.features
      FROM pu_brand_enrichment pbe
      WHERE replace(cu.sku, '-', '') = replace(replace(pbe.sku, '-', ''), '.', '')
        AND cu.source_vendor = 'PU'
        AND (cu.features IS NULL OR array_length(cu.features, 1) = 0)
        AND pbe.features IS NOT NULL
    `);
    console.log(`  ✓ ${featResult.rowCount.toLocaleString()} products updated with features`);

    // ── Backfill country_of_origin ─────────────────────────────
    const countryResult = await client.query(`
      UPDATE catalog_unified cu
      SET country_of_origin = pbe.country_of_origin
      FROM pu_brand_enrichment pbe
      WHERE replace(cu.sku, '-', '') = replace(replace(pbe.sku, '-', ''), '.', '')
        AND cu.source_vendor = 'PU'
        AND cu.country_of_origin IS NULL
        AND pbe.country_of_origin IS NOT NULL
    `);
    console.log(`  ✓ ${countryResult.rowCount.toLocaleString()} products updated with country of origin`);

    // ── Backfill weight + dimensions ───────────────────────────
    const dimsResult = await client.query(`
      UPDATE catalog_unified cu
      SET
        weight    = COALESCE(cu.weight,    pbe.weight),
        height_in = COALESCE(cu.height_in, pbe.merch_h),
        width_in  = COALESCE(cu.width_in,  pbe.merch_w),
        length_in = COALESCE(cu.length_in, pbe.merch_l)
      FROM pu_brand_enrichment pbe
      WHERE replace(cu.sku, '-', '') = replace(replace(pbe.sku, '-', ''), '.', '')
        AND cu.source_vendor = 'PU'
        AND pbe.weight IS NOT NULL
        AND (cu.weight IS NULL OR cu.height_in IS NULL)
    `);
    console.log(`  ✓ ${dimsResult.rowCount.toLocaleString()} products updated with weight/dimensions`);

    // ── Backfill cost (your_dealer_price → cost) ──────────────
    const costResult = await client.query(`
      UPDATE catalog_unified cu
      SET cost = COALESCE(pbe.your_dealer_price, pbe.dealer_price)
      FROM pu_brand_enrichment pbe
      WHERE replace(cu.sku, '-', '') = replace(replace(pbe.sku, '-', ''), '.', '')
        AND cu.source_vendor = 'PU'
        AND COALESCE(pbe.your_dealer_price, pbe.dealer_price) IS NOT NULL
    `);
    console.log(`  ✓ ${costResult.rowCount.toLocaleString()} products updated with cost price`);

    // ── Backfill OEM part numbers into catalog_oem_crossref ────
    console.log("\n🔧 Backfilling OEM part numbers...");

    // Add source column if missing
    await client.query(`ALTER TABLE catalog_oem_crossref ADD COLUMN IF NOT EXISTS source TEXT`);

    const oemResult = await client.query(`
      INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, source)
      SELECT
        cu.sku,
        pbe.oem_part_number,
        'Parts Unlimited',
        'pu_xml'
      FROM pu_brand_enrichment pbe
      JOIN catalog_unified cu
        ON replace(cu.sku, '-', '') = replace(replace(pbe.sku, '-', ''), '.', '')
      WHERE cu.source_vendor = 'PU'
        AND pbe.oem_part_number IS NOT NULL
        AND length(trim(pbe.oem_part_number)) > 2
      ON CONFLICT DO NOTHING
    `);
    console.log(`  ✓ ${oemResult.rowCount.toLocaleString()} OEM crossref rows inserted`);

    // Update oem_numbers[] array on catalog_unified
    await client.query(`
      UPDATE catalog_unified cu
      SET oem_numbers = (
        SELECT array_agg(DISTINCT oem_number ORDER BY oem_number)
        FROM catalog_oem_crossref
        WHERE sku = cu.sku
      )
      WHERE cu.source_vendor = 'PU'
        AND EXISTS (
          SELECT 1 FROM catalog_oem_crossref WHERE sku = cu.sku
        )
    `);
    console.log(`  ✓ catalog_unified.oem_numbers[] updated`);

    const { rows: [s] } = await client.query(`
      SELECT
        COUNT(*)                                                    AS total,
        COUNT(DISTINCT brand)                                       AS brands,
        COUNT(*) FILTER (WHERE name IS NOT NULL)                    AS with_name,
        COUNT(*) FILTER (WHERE features IS NOT NULL)                AS with_features,
        COUNT(*) FILTER (WHERE oem_part_number IS NOT NULL)         AS with_oem,
        COUNT(*) FILTER (WHERE country_of_origin IS NOT NULL)       AS with_country,
        COUNT(*) FILTER (WHERE weight IS NOT NULL)                  AS with_weight,
        COUNT(*) FILTER (WHERE merch_h IS NOT NULL)                 AS with_dims,
        COUNT(*) FILTER (WHERE image_uri IS NOT NULL)               AS with_image,
        COUNT(*) FILTER (WHERE dealer_price IS NOT NULL)            AS with_dealer_price,
        COUNT(*) FILTER (WHERE your_dealer_price IS NOT NULL)       AS with_your_price,
        COUNT(*) FILTER (WHERE original_retail_price IS NOT NULL)   AS with_orig_retail,
        COUNT(*) FILTER (WHERE part_status IS NOT NULL)             AS with_status,
        COUNT(*) FILTER (WHERE special_instructions IS NOT NULL)    AS with_instructions,
        COUNT(*) FILTER (WHERE vendor_price_updated_at IS NOT NULL) AS with_price_date,
        COUNT(*) FILTER (WHERE product_id IS NOT NULL)              AS with_product_id
      FROM pu_brand_enrichment
    `);

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Import complete!  (${Number(grandTotal).toLocaleString()} rows processed)

  Total in DB:              ${Number(s.total).toLocaleString()}
  Brands:                   ${s.brands}
  With name:                ${Number(s.with_name).toLocaleString()}
  With features:            ${Number(s.with_features).toLocaleString()}
  With OEM part #:          ${Number(s.with_oem).toLocaleString()}
  With country of origin:   ${Number(s.with_country).toLocaleString()}
  With dimensions:          ${Number(s.with_dims).toLocaleString()}
  With weight:              ${Number(s.with_weight).toLocaleString()}
  With image URI:           ${Number(s.with_image).toLocaleString()}
  With dealer price:        ${Number(s.with_dealer_price).toLocaleString()}
  With your dealer price:   ${Number(s.with_your_price).toLocaleString()}
  With original retail:     ${Number(s.with_orig_retail).toLocaleString()}
  With part status:         ${Number(s.with_status).toLocaleString()}
  With special instructions:${Number(s.with_instructions).toLocaleString()}
  With price update date:   ${Number(s.with_price_date).toLocaleString()}
  With product ID:          ${Number(s.with_product_id).toLocaleString()}
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
