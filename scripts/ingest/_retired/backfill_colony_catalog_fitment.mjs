#!/usr/bin/env node
/**
 * backfill_colony_catalog_fitment.mjs
 *
 * Fills fitment gaps for Colony products using Colony Machine's own 2026
 * catalog (scripts/data/colony/Colony_2026_Catalog.txt, extracted via
 * `pdftotext -layout` from the PDF at colonymachine.com). The "Screw and Nut
 * Kit Application Index" sections list lines like:
 *
 *   8481-20   Primary Cover Screw Kit - All Big Twins with 5-Speed 1980-1984   8482-20
 *
 * i.e. one or more Colony stock numbers sharing a single fitment description.
 * Only this clean, self-contained tabular pattern is used (both model and
 * year on the same line, no cross-line context needed) -- the catalog also
 * has a denser "Stock No. NNNN ... " prose style embedded in paragraphs that
 * relies on a preceding line for the model context; that's out of scope here
 * (lower confidence, left for a future pass).
 *
 * Usage:
 *   node scripts/ingest/backfill_colony_catalog_fitment.mjs --dry-run
 *   node scripts/ingest/backfill_colony_catalog_fitment.mjs
 */

import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: ".env.local" });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const DRY_RUN = process.argv.includes("--dry-run");
const TXT_FILE = path.resolve("scripts/data/colony/Colony_2026_Catalog.txt");
const FITMENT_SOURCE = "colony_2026_catalog";

const FAMILY_CROSSWALK = {
  "Softail Evo": "Softail",
  "Softail M8": "Softail",
  "Softail Twin Cam": "Softail",
  "Buell": null,
};

// ── year extraction (same engine as the PU brand-xml backfill) ─────────────
const YEAR_4 = /\b(19[0-4]\d|19[5-9]\d|20\d{2})\b/g;
const YEAR_APOS = /'(\d{2})\b/;
const RANGE_4 = /\b(19[0-9]\d|20\d{2})\s*[-–]\s*(19[0-9]\d|20\d{2}|up)\b/;
const RANGE_2 = /(?<!\d)'?(\d{1,2})(?:CVO|TC)?[-–]'?(\d{2})\b/i;
const CURRENT_YEAR = new Date().getFullYear();

function normalizeTwoDigitYear(yy) {
  const n = parseInt(yy, 10);
  return n <= 30 ? 2000 + n : 1900 + n;
}

function extractYears(text) {
  if (/universal|most models|custom application|all models/i.test(text)) return null;
  let m = text.match(RANGE_4);
  if (m) {
    const start = parseInt(m[1], 10);
    const end = m[2] === "up" ? CURRENT_YEAR + 1 : parseInt(m[2], 10);
    return { start, end };
  }
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

// Colony stock-number token: 3-6 digits, dash, 1-3 alphanumerics, optional -P suffix.
// Capped at 3 chars in the second group specifically to avoid colliding with
// 4-digit-4-digit year ranges like "1980-1984".
const STOCK_TOKEN = /\b(\d{3,6}-[\dA-Za-z]{1,3}(?:-P)?)\b/g;

function extractLineCandidates(rawLine) {
  if (!/\d{3,4}[-–](up|\d{2,4})\b/.test(rawLine)) return null; // needs a year signal
  const tokens = [...rawLine.matchAll(STOCK_TOKEN)].map(m => m[1]);
  if (!tokens.length) return null;
  // description = line with all stock tokens stripped out
  const desc = rawLine.replace(STOCK_TOKEN, " ").replace(/\s{2,}/g, " ").trim();
  return { tokens: [...new Set(tokens)], desc };
}

async function main() {
  console.log("Loading Colony gap products, alias map, and HD model tables from DB...");
  const { rows: gapRows } = await pool.query(`
    SELECT cu.id, cu.sku, cu.vendor_sku
    FROM catalog_unified cu
    WHERE cu.is_active AND cu.brand ILIKE '%colony%'
      AND cu.is_harley_fitment = false AND cu.is_universal = false AND cu.fits_all_models = false
      AND (cu.fitment_hd_models IS NULL OR array_length(cu.fitment_hd_models,1) IS NULL)
      AND (cu.fitment_hd_families IS NULL OR array_length(cu.fitment_hd_families,1) IS NULL)
      AND cu.fitment_year_start IS NULL
      AND NOT EXISTS (SELECT 1 FROM catalog_fitment_v2 cfv WHERE cfv.product_id = cu.id)
  `);
  const gapByToken = new Map();
  for (const r of gapRows) {
    gapByToken.set(normSku(r.vendor_sku), r.id);
    gapByToken.set(normSku(r.sku), r.id);
  }
  console.log(`  Colony gap products: ${gapRows.length}`);

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
  // "Big Twin" isn't a harley_families row -- it means the whole non-Sportster lineage.
  const BIG_TWIN_FAMILIES = ["Touring", "Softail", "Dyna", "FXR", "Shovelhead", "Panhead", "Knucklehead", "Flathead", "Evolution", "Twin Cam"];
  modelsByFamily.set("Big Twin", BIG_TWIN_FAMILIES.flatMap(f => modelsByFamily.get(f) || []));

  const { rows: yearRows } = await pool.query(`SELECT id, model_id, year FROM harley_model_years`);
  const yearIdByModelYear = new Map();
  for (const y of yearRows) yearIdByModelYear.set(`${y.model_id}:${y.year}`, y.id);

  const lines = fs.readFileSync(TXT_FILE, "utf8").split("\n");
  console.log(`Scanning ${lines.length} lines from ${TXT_FILE}...\n`);

  let candidateLines = 0, matchedSku = 0, hadModel = 0;
  // Collect per-token hits first so we can detect the same stock number being
  // claimed by genuinely conflicting lines elsewhere in the catalog (this
  // happens -- e.g. "8606-6" appears as both a Big Twin 1973-up kit and a
  // separate Sportster 1979-2022 kit) before generating any insert rows.
  const hitsByToken = new Map(); // token -> [{desc, candidateModels, years, confidence}]
  const samples = [];

  for (const rawLine of lines) {
    const cand = extractLineCandidates(rawLine);
    if (!cand) continue;
    candidateLines++;

    const matchedTokens = cand.tokens.filter(t => gapByToken.has(normSku(t)));
    if (!matchedTokens.length) continue;
    matchedSku += matchedTokens.length;

    const years = extractYears(cand.desc);
    if (!years) continue;

    const alias = aliasRegexes.find(a => a.regex.test(cand.desc));
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

    for (const token of matchedTokens) {
      if (!hitsByToken.has(token)) hitsByToken.set(token, []);
      hitsByToken.get(token).push({ desc: cand.desc, candidateModels, years, confidence });
    }
  }

  // A token is "ambiguous" if its hits disagree on Sportster-vs-not (the
  // clearest, safest disjointness check -- Sportster never shares a fitment
  // with the Big Twin lineage). Ambiguous tokens are skipped entirely rather
  // than guessed at.
  const toInsert = [];
  let ambiguousTokens = 0;
  for (const [token, hits] of hitsByToken) {
    const isSportster = hits.map(h => h.candidateModels.some(m => m.family === "Sportster"));
    if (new Set(isSportster).size > 1) { ambiguousTokens++; continue; }

    const productId = gapByToken.get(normSku(token));
    let rowsForToken = 0;
    for (const hit of hits) {
      for (const model of hit.candidateModels) {
        const lo = Math.max(hit.years.start, model.start_year);
        const hi = Math.min(hit.years.end, model.end_year);
        if (lo > hi) continue;
        for (let y = lo; y <= hi; y++) {
          const modelYearId = yearIdByModelYear.get(`${model.id}:${y}`);
          if (modelYearId) { toInsert.push({ productId, modelYearId, confidence: hit.confidence }); rowsForToken++; }
        }
      }
    }
    if (rowsForToken > 0 && samples.length < 25) {
      samples.push({ token, desc: hits[0].desc, confidence: hits[0].confidence, multi: hits.length > 1 });
    }
  }

  console.log(`Candidate lines (stock token + year signal): ${candidateLines}`);
  console.log(`  stock tokens matched to a gap SKU: ${matchedSku}`);
  console.log(`  ...with a model/family match: ${hadModel}`);
  console.log(`  ambiguous tokens skipped (conflicting Sportster/Big-Twin claims): ${ambiguousTokens}`);
  console.log(`Fitment rows to insert (pre-dedupe): ${toInsert.length}`);
  const distinctProducts = new Set(toInsert.map(r => r.productId));
  console.log(`Distinct products gaining fitment: ${distinctProducts.size}`);
  console.log(`\nSample matches:`);
  samples.forEach(s => console.log(`  [${s.confidence}]${s.multi ? " (multi-line)" : ""} ${s.token.padEnd(12)} ${s.desc}`));

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
