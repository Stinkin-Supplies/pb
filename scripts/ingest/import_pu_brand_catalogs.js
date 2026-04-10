/**
 * import_pu_brand_catalogs_WORKING.js
 * Imports 31 PU brand XML catalogs (PIES format) into pu_brand_enrichment table.
 *
 * PIES format quirks handled:
 *   - Every element is an array: use [0] to unwrap
 *   - Attributes live in `$` key: item.PartNumber[0].$.value  (or just item.PartNumber[0])
 *   - Some text nodes: item.PartNumber[0]._  or just the string itself
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import xml2js from "xml2js";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── DB ──────────────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── CONFIG ──────────────────────────────────────────────────────────────────
const XML_DIR = path.join(__dirname, "data/pu_pricefile");
const BATCH_SIZE = 500; // stay well under PG parameter limit

// ── HELPERS ─────────────────────────────────────────────────────────────────

/** Safely unwrap a PIES array node to a plain string (or null). */
function pies(node) {
  if (node == null) return null;
  if (Array.isArray(node)) node = node[0];
  if (node == null) return null;
  if (typeof node === "string") return node.trim() || null;
  if (typeof node === "object") {
    // text node stored in `_`
    if (node._) return String(node._).trim() || null;
    // attribute-only node
    if (node.$) {
      const vals = Object.values(node.$);
      return vals.length ? String(vals[0]).trim() || null : null;
    }
  }
  return String(node).trim() || null;
}

/** Pull a named attribute from a PIES node's `$` bag. */
function attr(node, key) {
  if (!node || !node.$) return null;
  return node.$[key] ? String(node.$[key]).trim() || null : null;
}

/**
 * Parse one PIES XML file → array of row objects.
 * Returns [] on any error so the rest of the import continues.
 */
async function parseFile(filePath) {
  const xml = fs.readFileSync(filePath, "utf8");
  let xmlObj;
  try {
    xmlObj = await xml2js.parseStringPromise(xml, { explicitArray: true });
  } catch (err) {
    console.error(`  ✗ XML parse error in ${path.basename(filePath)}: ${err.message}`);
    return [];
  }

  // Root can be PIES or pies (case varies)
  const root = xmlObj.PIES || xmlObj.pies || Object.values(xmlObj)[0];
  if (!root) {
    console.error(`  ✗ No root element found in ${path.basename(filePath)}`);
    return [];
  }

  // Items container
  const itemsContainer = root.Items?.[0] || root.items?.[0];
  if (!itemsContainer) {
    console.warn(`  ⚠ No Items element in ${path.basename(filePath)}`);
    return [];
  }

  const items = itemsContainer.Item || itemsContainer.item || [];
  if (!Array.isArray(items) || items.length === 0) {
    console.warn(`  ⚠ No Item records found in ${path.basename(filePath)}`);
    return [];
  }

  // Header info (brand name, version, etc.)
  const header = root.Header?.[0] || {};
  const brandName =
    pies(header.BrandLabel) ||
    pies(header.CompanyName) ||
    path.basename(filePath).replace("_PIES_Export.xml", "").replace(/_/g, " ");

  const rows = [];
  for (const item of items) {
    // ── Part identification ──────────────────────────────────────────────
    const partNumber = pies(item.PartNumber) || pies(item.ItemLevelGTIN);
    if (!partNumber) continue; // skip rows with no part number

    // ── Descriptions ────────────────────────────────────────────────────
    // Descriptions is usually an array of Description nodes each with type attr
    let shortDesc = null;
    let longDesc = null;
    const descContainer = item.Descriptions?.[0] || item.descriptions?.[0];
    if (descContainer) {
      const descs = descContainer.Description || descContainer.description || [];
      for (const d of descs) {
        const type = attr(d, "DescriptionCode") || attr(d, "type") || "";
        const text = typeof d === "string" ? d : pies(d);
        if (!text) continue;
        if (/^SHO|^ABRE|^short/i.test(type) && !shortDesc) shortDesc = text;
        else if (/^LON|^long|^ext/i.test(type) && !longDesc) longDesc = text;
        else if (!shortDesc) shortDesc = text; // fallback: first desc is short
        else if (!longDesc) longDesc = text;   // fallback: second desc is long
      }
    }

    // ── Pricing ─────────────────────────────────────────────────────────
    let msrp = null;
    let jobberPrice = null;
    const priceContainer = item.Prices?.[0] || item.prices?.[0];
    if (priceContainer) {
      const prices = priceContainer.Pricing || priceContainer.pricing || [];
      for (const p of prices) {
        const type = attr(p, "PriceType") || attr(p, "type") || "";
        const val = parseFloat(pies(p.Price) || pies(p.price) || "");
        if (isNaN(val)) continue;
        if (/MSRP|RET/i.test(type)) msrp = val;
        else if (/JBR|JOB|JOBBER/i.test(type)) jobberPrice = val;
      }
    }

    // ── Category / Application ──────────────────────────────────────────
    const categoryCode =
      pies(item.CategoryCode) ||
      pies(item.SubCategoryCode) ||
      pies(item.PartTerminologyID) ||
      null;

    // ── Attributes (key/value pairs) ────────────────────────────────────
    const attributes = {};
    const attrContainer = item.ProductAttributes?.[0] || item.Attributes?.[0];
    if (attrContainer) {
      const attrNodes =
        attrContainer.ProductAttribute ||
        attrContainer.Attribute ||
        attrContainer.attribute ||
        [];
      for (const a of attrNodes) {
        const name = attr(a, "AttributeID") || attr(a, "name") || pies(a.AttributeID);
        const val = pies(a.AttributeValue) || pies(a.value) || (typeof a === "string" ? a : null);
        if (name && val) attributes[name] = val;
      }
    }

    // ── Digital Assets (images) ─────────────────────────────────────────
    let imageUrl = null;
    const assetContainer = item.DigitalAssets?.[0] || item.Assets?.[0];
    if (assetContainer) {
      const assets = assetContainer.DigitalAsset || assetContainer.Asset || [];
      for (const a of assets) {
        const type = attr(a, "AssetType") || attr(a, "type") || "";
        const uri = pies(a.AssetURI) || pies(a.URI) || pies(a.URL);
        if (uri && /P04|P01|IMG|image/i.test(type)) { imageUrl = uri; break; }
        if (uri && !imageUrl) imageUrl = uri; // fallback
      }
    }

    rows.push({
      part_number: partNumber,
      brand: brandName,
      short_description: shortDesc,
      long_description: longDesc,
      msrp,
      jobber_price: jobberPrice,
      category_code: categoryCode,
      attributes: Object.keys(attributes).length ? attributes : null,
      image_url: imageUrl,
      source_file: path.basename(filePath),
    });
  }

  return rows;
}

// ── DB SETUP ─────────────────────────────────────────────────────────────────

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS pu_brand_enrichment (
      id                SERIAL PRIMARY KEY,
      part_number       TEXT NOT NULL,
      brand             TEXT,
      short_description TEXT,
      long_description  TEXT,
      msrp              NUMERIC(10,2),
      jobber_price      NUMERIC(10,2),
      category_code     TEXT,
      attributes        JSONB,
      image_url         TEXT,
      source_file       TEXT,
      imported_at       TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (part_number, source_file)
    );
    CREATE INDEX IF NOT EXISTS idx_pbe_part_number ON pu_brand_enrichment(part_number);
    CREATE INDEX IF NOT EXISTS idx_pbe_brand       ON pu_brand_enrichment(brand);
  `);
}

// ── BATCH INSERT ──────────────────────────────────────────────────────────────

async function insertBatch(client, rows) {
  if (rows.length === 0) return;

  const COLS = [
    "part_number", "brand", "short_description", "long_description",
    "msrp", "jobber_price", "category_code", "attributes", "image_url", "source_file",
  ];

  const values = [];
  const placeholders = rows.map((row, i) => {
    const base = i * COLS.length;
    COLS.forEach((col) => values.push(col === "attributes" && row[col] ? JSON.stringify(row[col]) : row[col] ?? null));
    return `(${COLS.map((_, j) => `$${base + j + 1}`).join(", ")})`;
  });

  await client.query(
    `INSERT INTO pu_brand_enrichment (${COLS.join(", ")})
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (part_number, source_file) DO UPDATE SET
       brand             = EXCLUDED.brand,
       short_description = EXCLUDED.short_description,
       long_description  = EXCLUDED.long_description,
       msrp              = EXCLUDED.msrp,
       jobber_price      = EXCLUDED.jobber_price,
       category_code     = EXCLUDED.category_code,
       attributes        = EXCLUDED.attributes,
       image_url         = EXCLUDED.image_url,
       imported_at       = NOW()`,
    values
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  const xmlFiles = fs
    .readdirSync(XML_DIR)
    .filter((f) => f.endsWith(".xml"))
    .map((f) => path.join(XML_DIR, f));

  if (xmlFiles.length === 0) {
    console.error(`No XML files found in ${XML_DIR}`);
    process.exit(1);
  }

  console.log(`\n📦 Found ${xmlFiles.length} brand XML files\n`);

  const client = await pool.connect();
  try {
    await ensureTable(client);

    let totalInserted = 0;
    let totalSkipped = 0;

    for (let fi = 0; fi < xmlFiles.length; fi++) {
      const file = xmlFiles[fi];
      const label = path.basename(file);
      process.stdout.write(`[${fi + 1}/${xmlFiles.length}] ${label} ... `);

      const rows = await parseFile(file);
      if (rows.length === 0) {
        console.log("0 rows");
        continue;
      }

      let inserted = 0;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await insertBatch(client, batch);
        inserted += batch.length;
      }

      totalInserted += inserted;
      console.log(`${inserted.toLocaleString()} rows ✓`);
    }

    // Final summary
    const { rows: summary } = await client.query(`
      SELECT
        COUNT(*)                        AS total_rows,
        COUNT(DISTINCT part_number)     AS unique_parts,
        COUNT(DISTINCT brand)           AS brands,
        COUNT(DISTINCT source_file)     AS files_imported,
        COUNT(*) FILTER (WHERE short_description IS NOT NULL) AS with_desc,
        COUNT(*) FILTER (WHERE msrp IS NOT NULL)              AS with_msrp,
        COUNT(*) FILTER (WHERE image_url IS NOT NULL)         AS with_images,
        COUNT(*) FILTER (WHERE attributes IS NOT NULL)        AS with_attributes
      FROM pu_brand_enrichment
    `);

    const s = summary[0];
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Import complete!

  Total rows:        ${Number(s.total_rows).toLocaleString()}
  Unique parts:      ${Number(s.unique_parts).toLocaleString()}
  Brands:            ${s.brands}
  Files imported:    ${s.files_imported}
  With description:  ${Number(s.with_desc).toLocaleString()}
  With MSRP:         ${Number(s.with_msrp).toLocaleString()}
  With images:       ${Number(s.with_images).toLocaleString()}
  With attributes:   ${Number(s.with_attributes).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
