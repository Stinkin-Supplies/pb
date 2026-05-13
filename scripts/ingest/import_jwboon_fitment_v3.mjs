/**
 * import_jwboon_fitment_v3.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds catalog_fitment_v2 rows from JW Boon NOS parts data.
 *
 * Join path:
 *   jwboon-parts-w-models.csv  (OEM Number)
 *     → hd_parts_data_clean.csv  (oem_part_number → year + model string)
 *       → harley_model_years  (year + model_code → id)
 *         → catalog_unified.oem_numbers[]  (oem_primary → product_id)
 *           → catalog_fitment_v2  (product_id + model_year_id)
 *
 * Usage:
 *   node import_jwboon_fitment_v3.mjs            # dry run (prints counts)
 *   node import_jwboon_fitment_v3.mjs --live      # writes to DB
 *
 * Place CSV files in scripts/data/ before running, or adjust DATA_DIR below.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from "fs";
import path from "path";
import { createReadStream } from "fs";
import { parse } from "csv-parse";
import pg from "pg";

const { Pool } = pg;

// ── Config ────────────────────────────────────────────────────────────────────

const LIVE      = process.argv.includes("--live");
const DATA_DIR  = path.resolve("scripts/data");
const BATCH_SZ  = 500;

const JWBOON_CSV    = path.join(DATA_DIR, "jwboon-parts-w-models.csv");
const HD_PARTS_CSV  = path.join(DATA_DIR, "hd_parts_data_clean.csv");

const pool = new Pool({
  connectionString:
    process.env.CATALOG_DATABASE_URL ||
    "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on("data", (row) => rows.push(row))
      .on("end",  () => resolve(rows))
      .on("error", reject);
  });
}

/** Extract primary OEM number — everything before " / " */
function primaryOem(raw) {
  return String(raw ?? "").split(" / ")[0].trim();
}

/**
 * Extract model_code from hd_parts_data model string.
 * "XLH SPORTSTER" → "XLH"
 * "FXSTSI SOFTAIL SPRINGER" → "FXSTS"  (strip trailing I = EFI suffix)
 * "SPORTSTER XLH 883" → "SPORTSTER" (handled separately in alias map below)
 */
function extractModelCode(modelStr) {
  const first = String(modelStr).split(/\s+/)[0];
  // Strip EFI suffix: trailing -I or bare I on codes longer than 3 chars
  return first.replace(/-I$/, "").replace(/I$/, (m, offset, str) =>
    str.length > 3 ? "" : m
  );
}

/**
 * Some hd_parts_data model strings start with a generic name rather than a
 * model code. Map them to the canonical model_code used in harley_model_years.
 */
const GENERIC_ALIAS = {
  SPORTSTER: "XLH",  // generic Sportster rows → XLH (the most common code)
  SIDECAR:   "TLE",
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Mode: ${LIVE ? "LIVE" : "DRY RUN"}`);
  console.log("Reading source files …");

  const [jwRows, hdRows] = await Promise.all([
    readCsv(JWBOON_CSV),
    readCsv(HD_PARTS_CSV),
  ]);

  console.log(`  JW Boon rows:       ${jwRows.length.toLocaleString()}`);
  console.log(`  HD parts data rows: ${hdRows.length.toLocaleString()}`);

  // ── 1. Build map: oem_primary → Set<{year, model_code}> from hd_parts_data ──
  console.log("\nBuilding OEM → year/model_code map …");
  const oemToYearModel = new Map(); // oem_str → Set of "YEAR|MODEL_CODE"

  for (const row of hdRows) {
    const oem = String(row.oem_part_number ?? "").trim();
    if (!oem) continue;

    const year = parseInt(row.year);
    if (isNaN(year)) continue;

    let mc = extractModelCode(row.model);
    mc = GENERIC_ALIAS[mc] ?? mc;
    if (!mc) continue;

    if (!oemToYearModel.has(oem)) oemToYearModel.set(oem, new Set());
    oemToYearModel.get(oem).add(`${year}|${mc}`);
  }
  console.log(`  Unique OEM numbers indexed: ${oemToYearModel.size.toLocaleString()}`);

  // ── 2. Load harley_model_years from DB ────────────────────────────────────
  console.log("\nLoading harley_model_years from DB …");
  const { rows: hmyRows } = await pool.query(`
    SELECT hmy.id, hmy.year, hm.model_code
    FROM harley_model_years hmy
    JOIN harley_models hm ON hm.id = hmy.model_id
  `);

  const ymToId = new Map(); // "YEAR|MODEL_CODE" → hmy.id
  for (const r of hmyRows) ymToId.set(`${r.year}|${r.model_code}`, r.id);
  console.log(`  harley_model_years rows loaded: ${hmyRows.length.toLocaleString()}`);

  // ── 3. Load catalog_unified oem_numbers for product lookup ───────────────
  console.log("\nLoading catalog_unified OEM numbers …");
  const { rows: cuRows } = await pool.query(`
    SELECT id, oem_numbers
    FROM catalog_unified
    WHERE oem_numbers IS NOT NULL AND array_length(oem_numbers, 1) > 0
  `);

  // Build map: oem_string → Set<product_id>
  const oemToProductIds = new Map();
  for (const cu of cuRows) {
    for (const oem of (cu.oem_numbers ?? [])) {
      const key = String(oem).trim();
      if (!oemToProductIds.has(key)) oemToProductIds.set(key, new Set());
      oemToProductIds.get(key).add(cu.id);
    }
  }
  console.log(`  Products with OEM numbers: ${cuRows.length.toLocaleString()}`);

  // ── 4. Walk JW Boon rows and build fitment pairs ──────────────────────────
  console.log("\nResolving fitment pairs …");

  const fitmentPairs = new Set(); // "product_id|model_year_id"
  let jwOemsMatched = 0;
  let jwOemsNoHdData = 0;
  let jwOemsNoProduct = 0;
  let jwOemsNoYearModel = 0;

  for (const jw of jwRows) {
    const oem = primaryOem(jw["OEM Number"]);
    if (!oem || oem === "undefined") continue;

    const yearModels = oemToYearModel.get(oem);
    if (!yearModels || yearModels.size === 0) {
      jwOemsNoHdData++;
      continue;
    }

    const productIds = oemToProductIds.get(oem);
    if (!productIds || productIds.size === 0) {
      jwOemsNoProduct++;
      continue;
    }

    let resolvedAny = false;
    for (const ym of yearModels) {
      const hmyId = ymToId.get(ym);
      if (!hmyId) {
        jwOemsNoYearModel++;
        continue;
      }
      for (const pid of productIds) {
        fitmentPairs.add(`${pid}|${hmyId}`);
        resolvedAny = true;
      }
    }
    if (resolvedAny) jwOemsMatched++;
  }

  console.log(`\n  JW Boon OEM numbers processed:`);
  console.log(`    Matched (got fitment rows):      ${jwOemsMatched.toLocaleString()}`);
  console.log(`    No hd_parts_data entry:          ${jwOemsNoHdData.toLocaleString()}`);
  console.log(`    No catalog_unified product:      ${jwOemsNoProduct.toLocaleString()}`);
  console.log(`    No harley_model_years entry:     ${jwOemsNoYearModel.toLocaleString()}`);
  console.log(`\n  Total fitment pairs to insert:   ${fitmentPairs.size.toLocaleString()}`);

  if (!LIVE) {
    console.log("\nDry run complete. Pass --live to write to DB.");
    await pool.end();
    return;
  }

  // ── 5. Upsert into catalog_fitment_v2 ─────────────────────────────────────
  console.log("\nInserting into catalog_fitment_v2 …");

  const pairs = [...fitmentPairs].map((s) => {
    const [pid, hmyId] = s.split("|").map(Number);
    return { pid, hmyId };
  });

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < pairs.length; i += BATCH_SZ) {
    const batch = pairs.slice(i, i + BATCH_SZ);
    const values = batch.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
    const flat = batch.flatMap((b) => [b.pid, b.hmyId]);

    const res = await pool.query(
      `INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
       VALUES ${values}
       ON CONFLICT (product_id, model_year_id) DO NOTHING`,
      flat
    );
    inserted += res.rowCount ?? 0;
    skipped  += batch.length - (res.rowCount ?? 0);

    if (i % 10000 === 0) process.stdout.write(`  … ${i.toLocaleString()} / ${pairs.length.toLocaleString()}\r`);
  }

  console.log(`\n  Inserted: ${inserted.toLocaleString()}`);
  console.log(`  Skipped (already existed): ${skipped.toLocaleString()}`);

  const { rows: total } = await pool.query(`SELECT COUNT(*) AS n FROM catalog_fitment_v2`);
  console.log(`\n  catalog_fitment_v2 total rows now: ${total[0].n}`);

  await pool.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
