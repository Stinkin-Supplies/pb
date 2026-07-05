#!/usr/bin/env node
/**
 * backfill_pu_brand_xml_fitment.mjs
 *
 * Fills fitment gaps for PU (Parts Unlimited) products by mining the per-brand
 * XML exports in scripts/data/pu_pricefile/ (+ brand_files/ subfolder, deduped
 * by filename since the two dirs are mirror copies).
 *
 * Only the human-readable title fields are used as signal (partDescription /
 * productName for "Catalog_Content_Export" format, the TLE Description for
 * "PIES_Export" format) -- bullet/FAB lines are excluded because they are
 * mostly generic installation boilerplate (proven noisy during manual review
 * of the Magnum Shielding / GMA Engineering files).
 *
 * A part is only touched if:
 *   - its partNumber matches a PU product currently in catalog_unified with
 *     NO existing fitment (is_harley_fitment=false, no flat fitment columns,
 *     no catalog_fitment_v2 rows), and
 *   - the title text yields BOTH a year range AND a model/family match.
 * No year -> skipped. No model match -> skipped. This keeps the false-positive
 * rate low at the cost of coverage (matches the ~6-25% hit rate observed
 * manually on the two brands already reviewed).
 *
 * Usage:
 *   node scripts/ingest/backfill_pu_brand_xml_fitment.mjs --dry-run
 *   node scripts/ingest/backfill_pu_brand_xml_fitment.mjs
 */

import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { XMLParser } from "fast-xml-parser";

dotenv.config({ path: ".env.local" });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const DRY_RUN = process.argv.includes("--dry-run");
const DATA_DIR = path.resolve("scripts/data/pu_pricefile");
const FITMENT_SOURCE = "pu_brand_xml_backfill";

const FAMILY_CROSSWALK = {
  "Softail Evo": "Softail",
  "Softail M8": "Softail",
  "Softail Twin Cam": "Softail",
  "Buell": null, // not an HD family in this schema, skip
};

// ── year extraction (ported from parse_years.js, standalone here for ESM) ──
const YEAR_4 = /\b(19[7-9]\d|20\d{2})\b/g;
const YEAR_APOS = /'(\d{2})\b/;
const RANGE_4 = /\b(19[7-9]\d|20\d{2})\s*[-–]\s*(19[7-9]\d|20\d{2})\b/;
const RANGE_2 = /(?<!\d)'?(\d{1,2})(?:CVO|TC)?[-–]'?(\d{2})\b/i;

function normalizeTwoDigitYear(yy) {
  const n = parseInt(yy, 10);
  return n <= 30 ? 2000 + n : 1900 + n;
}

function extractYears(text) {
  if (/universal|most models|custom application|all models/i.test(text)) return null;
  let m = text.match(RANGE_4);
  if (m) return { start: parseInt(m[1], 10), end: parseInt(m[2], 10) };
  m = text.match(RANGE_2);
  if (m) return { start: normalizeTwoDigitYear(m[1]), end: normalizeTwoDigitYear(m[2]) };
  m = text.match(YEAR_APOS);
  if (m) return { start: normalizeTwoDigitYear(m[1]), end: normalizeTwoDigitYear(m[1]) };
  m = text.match(YEAR_4);
  if (m) { const y = parseInt(m[1], 10); return { start: y, end: y }; }
  return null;
}

function normSku(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// ── file discovery (dedupe root vs brand_files/ mirror copies by basename) ──
function listXmlFiles() {
  const seen = new Map();
  for (const dir of [DATA_DIR, path.join(DATA_DIR, "brand_files")]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(".xml")) continue;
      const base = f.trim();
      if (!seen.has(base)) seen.set(base, path.join(dir, f));
    }
  }
  return [...seen.values()];
}

function detectFormat(filePath) {
  const head = fs.readFileSync(filePath, { encoding: "utf8", flag: "r" }).slice(0, 300);
  return head.includes("<PIES") ? "PIES" : "CATALOG";
}

function toArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function extractParts(filePath, parser) {
  const xml = fs.readFileSync(filePath, "utf8");
  const fmt = detectFormat(filePath);
  const doc = parser.parse(xml);
  const parts = [];

  if (fmt === "CATALOG") {
    for (const p of toArray(doc?.root?.part)) {
      const partNumber = String(p?.partNumber ?? "").trim();
      if (!partNumber) continue;
      const title = [p?.partDescription, p?.productName].filter(Boolean).join(" ");
      parts.push({ partNumber, title, brand: p?.brandName || "" });
    }
  } else {
    for (const it of toArray(doc?.PIES?.Items?.Item)) {
      const partNumber = String(it?.PartNumber ?? "").trim();
      if (!partNumber) continue;
      const descs = toArray(it?.Descriptions?.Description);
      const tle = descs.find(d => d?.["@_DescriptionCode"] === "TLE");
      const title = tle ? String(tle["#text"] ?? tle) : (descs[0] ? String(descs[0]["#text"] ?? descs[0]) : "");
      parts.push({ partNumber, title, brand: it?.BrandLabel || "" });
    }
  }
  return parts;
}

async function main() {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

  console.log("Loading gap SKUs, alias map, and HD model tables from DB...");
  const { rows: gapRows } = await pool.query(`
    SELECT cu.id, cu.sku
    FROM catalog_unified cu
    WHERE cu.is_active AND cu.source_vendor = 'PU'
      AND cu.is_harley_fitment = false AND cu.is_universal = false AND cu.fits_all_models = false
      AND (cu.fitment_hd_models IS NULL OR array_length(cu.fitment_hd_models,1) IS NULL)
      AND (cu.fitment_hd_families IS NULL OR array_length(cu.fitment_hd_families,1) IS NULL)
      AND cu.fitment_year_start IS NULL
      AND NOT EXISTS (SELECT 1 FROM catalog_fitment_v2 cfv WHERE cfv.product_id = cu.id)
  `);
  const gapBySku = new Map();
  for (const r of gapRows) gapBySku.set(normSku(r.sku), r.id);
  console.log(`  gap PU products: ${gapRows.length}`);

  const { rows: aliases } = await pool.query(
    `SELECT alias_text, model_family, model_code, priority FROM model_alias_map WHERE is_active`
  );
  // Group by alias_text: a single phrase (e.g. "fat boy") legitimately maps to
  // multiple model codes across HD generations (FLFB/FLFBS/FLSTF). Collect all
  // of them as candidates -- the per-model year-range clipping below will
  // naturally pick the generation(s) that actually overlap the extracted years.
  const aliasGroups = new Map();
  for (const a of aliases) {
    if (!aliasGroups.has(a.alias_text)) {
      aliasGroups.set(a.alias_text, { alias_text: a.alias_text, family: a.model_family, codes: new Set(), priority: a.priority });
    }
    const g = aliasGroups.get(a.alias_text);
    g.priority = Math.max(g.priority, a.priority);
    if (a.model_code) g.codes.add(a.model_code);
  }
  const aliasRegexes = [...aliasGroups.values()]
    .sort((a, b) => b.priority - a.priority || b.alias_text.length - a.alias_text.length)
    .map(g => ({
      ...g,
      regex: new RegExp(`\\b${g.alias_text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
    }));

  const { rows: modelRows } = await pool.query(`
    SELECT hm.id, hm.model_code, hm.start_year, hm.end_year, hf.name AS family
    FROM harley_models hm JOIN harley_families hf ON hf.id = hm.family_id
  `);
  const modelsByCode = new Map();
  for (const m of modelRows) {
    const key = m.model_code.toUpperCase();
    if (!modelsByCode.has(key)) modelsByCode.set(key, []);
    modelsByCode.get(key).push(m);
  }
  const modelsByFamily = new Map();
  for (const m of modelRows) {
    if (!modelsByFamily.has(m.family)) modelsByFamily.set(m.family, []);
    modelsByFamily.get(m.family).push(m);
  }

  const { rows: yearRows } = await pool.query(`SELECT id, model_id, year FROM harley_model_years`);
  const yearIdByModelYear = new Map();
  for (const y of yearRows) yearIdByModelYear.set(`${y.model_id}:${y.year}`, y.id);

  const files = listXmlFiles();
  console.log(`Found ${files.length} unique brand XML files.\n`);

  let totalParts = 0, matchedSku = 0, hadYear = 0, hadModel = 0;
  const toInsert = []; // {product_id, model_year_id, confidence, source_file}
  const perBrandStats = new Map();

  for (const file of files) {
    const brandLabel = path.basename(file);
    let parts;
    try {
      parts = extractParts(file, parser);
    } catch (e) {
      console.warn(`  [skip] ${brandLabel}: parse error ${e.message}`);
      continue;
    }
    totalParts += parts.length;
    let brandInserted = 0;

    for (const part of parts) {
      const productId = gapBySku.get(normSku(part.partNumber));
      if (!productId) continue;
      matchedSku++;

      const years = extractYears(part.title);
      if (!years) continue;
      hadYear++;

      const alias = aliasRegexes.find(a => a.regex.test(part.title));
      if (!alias) continue;
      hadModel++;

      let candidateModels = [];
      let confidence;
      if (alias.codes.size > 0) {
        candidateModels = [...alias.codes].flatMap(code => modelsByCode.get(code.toUpperCase()) || []);
        confidence = 0.75;
      } else {
        const famName = FAMILY_CROSSWALK[alias.family] ?? alias.family;
        if (!famName) continue;
        candidateModels = modelsByFamily.get(famName) || [];
        confidence = 0.55;
      }
      if (!candidateModels.length) continue;

      for (const model of candidateModels) {
        const lo = Math.max(years.start, model.start_year);
        const hi = Math.min(years.end, model.end_year);
        if (lo > hi) continue;
        for (let y = lo; y <= hi; y++) {
          const modelYearId = yearIdByModelYear.get(`${model.id}:${y}`);
          if (modelYearId) {
            toInsert.push({ productId, modelYearId, confidence });
          }
        }
      }
      brandInserted++;
    }
    if (brandInserted > 0) perBrandStats.set(brandLabel, brandInserted);
  }

  console.log(`Scanned ${totalParts} parts across ${files.length} files.`);
  console.log(`  matched to a gap SKU: ${matchedSku}`);
  console.log(`  ...with a parseable year: ${hadYear}`);
  console.log(`  ...with a model/family match: ${hadModel}`);
  console.log(`Fitment rows to insert (pre-dedupe): ${toInsert.length}`);
  const distinctProducts = new Set(toInsert.map(r => r.productId));
  console.log(`Distinct products gaining fitment: ${distinctProducts.size}`);
  console.log(`\nTop brands by SKUs matched:`);
  [...perBrandStats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([b, n]) => console.log(`  ${n.toString().padStart(5)}  ${b}`));

  if (DRY_RUN) {
    console.log("\n--dry-run set, no writes performed.");
    await pool.end();
    return;
  }

  console.log("\nWriting to catalog_fitment_v2...");
  const client = await pool.connect();
  let written = 0;
  try {
    await client.query("BEGIN");
    const BATCH = 1000;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const values = [];
      const params = [];
      batch.forEach((r, idx) => {
        const base = idx * 4;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        params.push(r.productId, r.modelYearId, FITMENT_SOURCE, r.confidence);
      });
      const res = await client.query(
        `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
         VALUES ${values.join(",")}
         ON CONFLICT (product_id, model_year_id) DO NOTHING`,
        params
      );
      written += res.rowCount;
    }
    await client.query("COMMIT");
    console.log(`Committed. ${written} new catalog_fitment_v2 rows written.`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error, rolled back:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
