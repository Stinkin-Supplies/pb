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

    const asset = item.DigitalAssets?.[0]?.DigitalFileInformation?.[0];
    const image_uri      = asset ? str(asset.URI)      : null;
    const image_filename = asset ? str(asset.FileName) : null;

    rows.push({
      sku, brand, brand_code, name,
      features: features.length ? features : null,
      oem_part_number, country_of_origin,
      package_uom, qty_of_eaches,
      merch_h, merch_w, merch_l, ship_h, ship_w, ship_l,
      dimension_uom, weight, weight_uom,
      image_uri, image_filename,
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
  await client.query(`DROP TABLE IF EXISTS pu_brand_enrichment`);
  await client.query(`
    CREATE TABLE pu_brand_enrichment (
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
    CREATE INDEX idx_pbe_brand       ON pu_brand_enrichment(brand);
    CREATE INDEX idx_pbe_brand_code  ON pu_brand_enrichment(brand_code);
    CREATE INDEX idx_pbe_status      ON pu_brand_enrichment(part_status);
    CREATE INDEX idx_pbe_product_id  ON pu_brand_enrichment(product_id);
  `);
  console.log("  ✓ Table recreated with full schema");
}

// ── INSERT ────────────────────────────────────────────────────────────────────

const COLS = [
  "sku", "brand", "brand_code", "name", "features",
  "oem_part_number", "country_of_origin",
  "package_uom", "qty_of_eaches",
  "merch_h", "merch_w", "merch_l",
  "ship_h",  "ship_w",  "ship_l",
  "dimension_uom", "weight", "weight_uom",
  "image_uri", "image_filename",
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
