/**
 * import_hd_parts_fitment.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds catalog_fitment_v2 rows directly from hd_parts_data_clean.csv.
 *
 * This is the broadest fitment source — 1M rows covering year + model + OEM
 * part number. Any product in catalog_unified whose oem_numbers[] array
 * contains a matching OEM part number gets fitment rows for every year/model
 * that OEM number appears in.
 *
 * Run this AFTER import_jwboon_fitment_v3.mjs and import_wps_fitment.mjs.
 * ON CONFLICT DO NOTHING means no double-counting.
 *
 * Usage:
 *   node import_hd_parts_fitment.mjs            # dry run
 *   node import_hd_parts_fitment.mjs --live      # writes to DB
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from "path";
import { createReadStream } from "fs";
import { parse } from "csv-parse";
import pg from "pg";

const { Pool } = pg;

const LIVE     = process.argv.includes("--live");
const DATA_DIR = path.resolve("scripts/data");
const BATCH_SZ = 500;

const HD_PARTS_CSV = path.join(DATA_DIR, "hd_parts_data_clean.csv");

const pool = new Pool({
  connectionString:
    process.env.CATALOG_DATABASE_URL ||
    "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

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

function extractModelCode(modelStr) {
  const first = String(modelStr).split(/\s+/)[0];
  return first.replace(/-I$/, "").replace(/I$/, (m, _offset, str) =>
    str.length > 3 ? "" : m
  );
}

const GENERIC_ALIAS = {
  SPORTSTER: "XLH",
  SIDECAR:   "TLE",
};

async function main() {
  console.log(`Mode: ${LIVE ? "LIVE" : "DRY RUN"}`);

  console.log("Reading hd_parts_data_clean.csv …");
  const hdRows = await readCsv(HD_PARTS_CSV);
  console.log(`  Rows: ${hdRows.length.toLocaleString()}`);

  // Build OEM → Set<"year|model_code"> from hd_parts_data
  console.log("Building OEM → year/model_code index …");
  const oemToYearModels = new Map();
  let skippedYear = 0, skippedMc = 0;

  for (const row of hdRows) {
    const oem = String(row.oem_part_number ?? "").trim();
    if (!oem) continue;
    const year = parseInt(row.year);
    if (isNaN(year)) { skippedYear++; continue; }
    let mc = extractModelCode(row.model);
    mc = GENERIC_ALIAS[mc] ?? mc;
    if (!mc) { skippedMc++; continue; }
    if (!oemToYearModels.has(oem)) oemToYearModels.set(oem, new Set());
    oemToYearModels.get(oem).add(`${year}|${mc}`);
  }
  console.log(`  Unique OEM numbers indexed: ${oemToYearModels.size.toLocaleString()}`);
  console.log(`  Skipped (bad year): ${skippedYear}, (no model code): ${skippedMc}`);

  // Load harley_model_years
  console.log("\nLoading harley_model_years …");
  const { rows: hmyRows } = await pool.query(`
    SELECT hmy.id, hmy.year, hm.model_code
    FROM harley_model_years hmy
    JOIN harley_models hm ON hm.id = hmy.model_id
  `);
  const ymToId = new Map();
  for (const r of hmyRows) ymToId.set(`${r.year}|${r.model_code}`, r.id);
  console.log(`  harley_model_years rows: ${hmyRows.length.toLocaleString()}`);

  // Load catalog_unified oem_numbers
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

  // Resolve all fitment pairs
  console.log("\nResolving fitment pairs …");
  const fitmentPairs = new Set();
  let oemsWithProduct = 0, oemsNoProduct = 0, oemsNoYearModel = 0;

  for (const [oem, yearModels] of oemToYearModels) {
    const productIds = oemToProductIds.get(oem);
    if (!productIds || productIds.size === 0) { oemsNoProduct++; continue; }

    let gotOne = false;
    for (const ym of yearModels) {
      const hmyId = ymToId.get(ym);
      if (!hmyId) { oemsNoYearModel++; continue; }
      for (const pid of productIds) {
        fitmentPairs.add(`${pid}|${hmyId}`);
        gotOne = true;
      }
    }
    if (gotOne) oemsWithProduct++;
  }

  console.log(`  OEMs matched to products:         ${oemsWithProduct.toLocaleString()}`);
  console.log(`  OEMs with no catalog product:     ${oemsNoProduct.toLocaleString()}`);
  console.log(`  year|model combos not in DB:      ${oemsNoYearModel.toLocaleString()}`);
  console.log(`  Total fitment pairs to insert:    ${fitmentPairs.size.toLocaleString()}`);

  if (!LIVE) {
    console.log("\nDry run complete. Pass --live to write to DB.");
    await pool.end();
    return;
  }

  console.log("\nInserting into catalog_fitment_v2 …");
  const pairs = [...fitmentPairs].map((s) => {
    const [pid, hmyId] = s.split("|").map(Number);
    return { pid, hmyId };
  });

  let inserted = 0, skipped = 0;
  for (let i = 0; i < pairs.length; i += BATCH_SZ) {
    const batch  = pairs.slice(i, i + BATCH_SZ);
    const values = batch.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
    const flat   = batch.flatMap((b) => [b.pid, b.hmyId]);
    const res = await pool.query(
      `INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
       VALUES ${values}
       ON CONFLICT (product_id, model_year_id) DO NOTHING`,
      flat
    );
    inserted += res.rowCount ?? 0;
    skipped  += batch.length - (res.rowCount ?? 0);
    if (i % 20000 === 0) process.stdout.write(`  … ${i.toLocaleString()} / ${pairs.length.toLocaleString()}\r`);
  }

  console.log(`\n  Inserted: ${inserted.toLocaleString()}`);
  console.log(`  Skipped (already existed): ${skipped.toLocaleString()}`);

  const { rows: total } = await pool.query(`SELECT COUNT(*) AS n FROM catalog_fitment_v2`);
  console.log(`\n  catalog_fitment_v2 total rows now: ${total[0].n}`);
  await pool.end();
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
