#!/usr/bin/env node
/**
 * backfill_eastern_crossref_fitment.mjs
 *
 * Eastern Motorcycle Parts' 2022 catalog was already ingested into
 * catalog_oem_crossref (source_file='eastern_2022_catalog', 4,832 rows) but
 * none of those rows were ever linked to a product -- product_id is null on
 * all of them. This script:
 *
 *   1. Links each crossref row to catalog_unified by matching oem_number
 *      against cu.oem_numbers[] (NOT sku -- Eastern's own catalog numbers
 *      like "A-46-WRTT" use a different scheme than the vendor_sku already
 *      in catalog_unified, but the real HD OEM number cross-referenced in
 *      oem_number matches products' existing oem_numbers[] directly).
 *   2. For linked products that currently have no fitment, extracts fitment
 *      from page_reference: "<description> [<year-range>] [<platform code>]".
 *
 * The trailing bracket (FL/XL/WL/XR) is a platform-lineage code, not a strict
 * modern HD model code -- this is reproduction hardware (screws, gaskets,
 * bearings) that genuinely interchanges across a whole lineage, so Eastern
 * groups by lineage rather than exact model:
 *   FL -> Big Twin lineage (Knucklehead/Panhead/Shovelhead/Evo/Twin Cam/
 *         Softail/Dyna/Touring/FXR)
 *   XL -> Sportster lineage, including its 45" flathead ancestor
 *   WL -> 45"/Servi-Car flathead lineage
 *   XR -> XR-750 racing (not in harley_models -- expect ~zero matches)
 * When the free-text description also names a specific model/code inside
 * that lineage (e.g. "SPORTSTER" under [XL]), that narrower match is used
 * at higher confidence instead of the whole lineage.
 *
 * Usage:
 *   node scripts/ingest/backfill_eastern_crossref_fitment.mjs --dry-run
 *   node scripts/ingest/backfill_eastern_crossref_fitment.mjs
 */

import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const DRY_RUN = process.argv.includes("--dry-run");
const FITMENT_SOURCE = "eastern_2022_catalog";
const CURRENT_YEAR = new Date().getFullYear();

const FAMILY_CROSSWALK = {
  "Softail Evo": "Softail",
  "Softail M8": "Softail",
  "Softail Twin Cam": "Softail",
  "Buell": null,
};

const BIG_TWIN_LINEAGE = ["Touring", "Softail", "Dyna", "FXR", "Shovelhead", "Panhead", "Knucklehead", "Evolution", "Twin Cam"];
const BRACKET_FAMILIES = {
  FL: BIG_TWIN_LINEAGE,
  XL: ["Sportster", "Flathead"],
  WL: ["Flathead"],
  XR: [],
};

// Supplementary terms (not in model_alias_map) used only to detect explicit
// free-text conflicts with the bracket's lineage, e.g. bracket=[XL] but the
// description plainly says "BIG TWIN" -- those get skipped as unresolvable
// rather than forced into the bracket's family.
const SUPPLEMENTARY_ALIASES = [
  { regex: /\bbig twin\b/i, families: BIG_TWIN_LINEAGE },
  { regex: /\bforty-five\b|\b45["”]? ?twins?\b|\bservi-?car\b/i, families: ["Flathead"] },
];

const YEAR_4 = /\b(19[0-9]\d|20\d{2})\b/g;
const RANGE_4 = /\b(19[0-9]\d|20\d{2})\s*[-–]\s*(19[0-9]\d|20\d{2}|up|pres\.?|present)\b/i;
const OPEN_SUFFIX = /\b(19[0-9]\d|20\d{2})[-–]\s*(?:up|pres\.?|present|e\.?)\b/i;

function extractYears(text) {
  if (/universal|most models|custom application|all models/i.test(text)) return null;
  let m = text.match(RANGE_4);
  if (m) {
    const start = parseInt(m[1], 10);
    const endRaw = m[2].toLowerCase();
    const end = /^\d+$/.test(endRaw) ? parseInt(endRaw, 10) : CURRENT_YEAR + 1;
    if (end >= start) return { start, end };
  }
  m = text.match(OPEN_SUFFIX);
  if (m) return { start: parseInt(m[1], 10), end: CURRENT_YEAR + 1 };
  m = text.match(YEAR_4);
  if (m) { const y = parseInt(m[1], 10); return { start: y, end: y }; }
  return null;
}

function parsePageReference(pageRef) {
  const bracketMatch = [...pageRef.matchAll(/\[([^\]]*)\]/g)].map(m => m[1]);
  const bracketCode = bracketMatch.length ? bracketMatch[bracketMatch.length - 1].trim().toUpperCase() : null;
  const desc = pageRef.replace(/\[[^\]]*\]/g, " ").replace(/\s{2,}/g, " ").trim();
  return { bracketCode, desc };
}

async function main() {
  console.log("Loading model tables and alias map...");
  const { rows: aliases } = await pool.query(
    `SELECT alias_text, model_family, model_code, priority FROM model_alias_map WHERE is_active`
  );
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
  const modelsForFamilySet = names => names.flatMap(f => modelsByFamily.get(f) || []);

  const { rows: yearRows } = await pool.query(`SELECT id, model_id, year FROM harley_model_years`);
  const yearIdByModelYear = new Map();
  for (const y of yearRows) yearIdByModelYear.set(`${y.model_id}:${y.year}`, y.id);

  console.log("Loading & linking eastern_2022_catalog crossref rows to products via oem_numbers[]...");
  const { rows: crossref } = await pool.query(`
    SELECT c.id AS crossref_id, c.oem_number, c.page_reference, cu.id AS product_id,
      cu.is_harley_fitment, cu.is_universal, cu.fits_all_models,
      cu.fitment_hd_models, cu.fitment_hd_families, cu.fitment_year_start,
      EXISTS (SELECT 1 FROM catalog_fitment_v2 cfv WHERE cfv.product_id = cu.id) AS has_fitment_v2
    FROM catalog_oem_crossref c
    JOIN catalog_unified cu ON c.oem_number = ANY(cu.oem_numbers)
    WHERE c.source_file = 'eastern_2022_catalog' AND cu.is_active
  `);
  console.log(`  linked rows: ${crossref.length} (across ${new Set(crossref.map(r => r.product_id)).size} distinct products)`);

  const gapRows = crossref.filter(r =>
    !r.is_harley_fitment && !r.is_universal && !r.fits_all_models &&
    (!r.fitment_hd_models || r.fitment_hd_models.length === 0) &&
    (!r.fitment_hd_families || r.fitment_hd_families.length === 0) &&
    r.fitment_year_start === null && !r.has_fitment_v2
  );
  console.log(`  of those, currently no-fitment: ${gapRows.length} rows / ${new Set(gapRows.map(r => r.product_id)).size} products\n`);

  let hadYear = 0, hadBracket = 0, narrowedByText = 0, conflictsSkipped = 0;
  const toInsert = [];
  const samples = [];

  for (const row of gapRows) {
    const { bracketCode, desc } = parsePageReference(row.page_reference);
    const years = extractYears(desc);
    if (!years) continue;
    hadYear++;

    let familyNames = null;
    if (bracketCode && BRACKET_FAMILIES[bracketCode]) {
      familyNames = BRACKET_FAMILIES[bracketCode];
      hadBracket++;
    }
    if (!familyNames) continue; // no bracket, or XR (empty lineage) -- skip
    if (familyNames.length === 0) continue; // XR: no harley_models coverage

    // Explicit free-text conflict check (e.g. bracket=[XL] but text says "BIG TWIN"):
    // skip entirely rather than guess which one is right.
    const supp = SUPPLEMENTARY_ALIASES.find(s => s.regex.test(desc));
    if (supp && !supp.families.some(f => familyNames.includes(f))) { conflictsSkipped++; continue; }

    let candidateModels = modelsForFamilySet(familyNames);
    let confidence = 0.6;

    // If the free text also names a specific code/family inside this lineage, narrow to it.
    const alias = aliasRegexes.find(a => a.regex.test(desc));
    if (alias) {
      const aliasFamily = FAMILY_CROSSWALK[alias.family] ?? alias.family;
      if (alias.codes.size > 0) {
        const codeModels = [...alias.codes].flatMap(code => modelsByCode.get(code.toUpperCase()) || []);
        const withinLineage = codeModels.filter(m => familyNames.includes(m.family));
        if (withinLineage.length) { candidateModels = withinLineage; confidence = 0.8; narrowedByText++; }
        else if (codeModels.length) { conflictsSkipped++; continue; } // specific code entirely outside the bracket's lineage
      } else if (familyNames.includes(aliasFamily)) {
        candidateModels = modelsForFamilySet([aliasFamily]);
        confidence = 0.7;
        narrowedByText++;
      } else {
        conflictsSkipped++; continue; // named family outside the bracket's lineage
      }
    }
    if (!candidateModels.length) continue;

    let rowsForProduct = 0;
    for (const model of candidateModels) {
      const lo = Math.max(years.start, model.start_year);
      const hi = Math.min(years.end, model.end_year);
      if (lo > hi) continue;
      for (let y = lo; y <= hi; y++) {
        const modelYearId = yearIdByModelYear.get(`${model.id}:${y}`);
        if (modelYearId) { toInsert.push({ productId: row.product_id, modelYearId, confidence }); rowsForProduct++; }
      }
    }
    if (rowsForProduct > 0 && samples.length < 25) {
      samples.push({ desc, bracketCode, confidence });
    }
  }

  console.log(`  ...with a parseable year: ${hadYear}`);
  console.log(`  ...with a usable bracket lineage: ${hadBracket}`);
  console.log(`  ...narrowed further by free-text model/family: ${narrowedByText}`);
  console.log(`Fitment rows to insert (pre-dedupe): ${toInsert.length}`);
  const distinctProducts = new Set(toInsert.map(r => r.productId));
  console.log(`Distinct products gaining fitment: ${distinctProducts.size}`);
  console.log(`\nSample matches:`);
  samples.forEach(s => console.log(`  [${s.confidence}] [${s.bracketCode}] ${s.desc}`));

  if (DRY_RUN) {
    console.log("\n--dry-run set, no writes performed.");
    await pool.end();
    return;
  }

  console.log(`\nLinking product_id on catalog_oem_crossref rows...`);
  console.log("Writing fitment to catalog_fitment_v2...");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const linkMap = new Map(crossref.map(r => [r.crossref_id, r.product_id]));
    const BATCH = 1000;
    const linkIds = [...linkMap.keys()];
    let linked = 0;
    for (let i = 0; i < linkIds.length; i += BATCH) {
      const batchIds = linkIds.slice(i, i + BATCH);
      const values = batchIds.map((id, idx) => `($${idx * 2 + 1}::int, $${idx * 2 + 2}::int)`).join(",");
      const params = batchIds.flatMap(id => [id, linkMap.get(id)]);
      const res = await client.query(
        `UPDATE catalog_oem_crossref c SET product_id = v.product_id
         FROM (VALUES ${values}) AS v(crossref_id, product_id)
         WHERE c.id = v.crossref_id AND c.product_id IS NULL`,
        params
      );
      linked += res.rowCount;
    }
    console.log(`  linked ${linked} crossref rows.`);

    let written = 0;
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
