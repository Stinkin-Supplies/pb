/**
 * import_wps_fitment.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds catalog_fitment_v2 rows from the WPS cross-fitment file.
 *
 * Source: wps-cross-fitment.csv  (OEM#, WPS#, Vendor, Vend#)
 *
 * Join path:
 *   wps-cross-fitment.csv  (OEM# = H-D OEM part number)
 *     → hd_parts_data_clean.csv  (oem_part_number → year + model string)
 *       → harley_model_years  (year + model_code → id)
 *         → catalog_unified  (WPS SKU = "WPS-{WPS#}" in sku, or WPS# in oem_numbers)
 *           → catalog_fitment_v2  (product_id + model_year_id)
 *
 * WPS products in catalog_unified have sku = "WPS-{wps_number}" (dashes intact).
 *
 * Usage:
 *   node import_wps_fitment.mjs            # dry run
 *   node import_wps_fitment.mjs --live      # writes to DB
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

const WPS_CSV      = path.join(DATA_DIR, "wps-cross-fitment.csv");
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

  const [wpsRows, hdRows] = await Promise.all([
    readCsv(WPS_CSV),
    readCsv(HD_PARTS_CSV),
  ]);
  console.log(`  WPS cross-fitment rows: ${wpsRows.length.toLocaleString()}`);
  console.log(`  HD parts data rows:     ${hdRows.length.toLocaleString()}`);

  // Build OEM → year/model_code map from hd_parts_data
  console.log("\nBuilding OEM → year/model_code map …");
  const oemToYearModel = new Map();
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

  // Load harley_model_years
  console.log("Loading harley_model_years …");
  const { rows: hmyRows } = await pool.query(`
    SELECT hmy.id, hmy.year, hm.model_code
    FROM harley_model_years hmy
    JOIN harley_models hm ON hm.id = hmy.model_id
  `);
  const ymToId = new Map();
  for (const r of hmyRows) ymToId.set(`${r.year}|${r.model_code}`, r.id);

  // Load WPS products — source_vendor = 'WPS', match on vendor_sku directly
  console.log("Loading WPS products from catalog_unified …");
  const { rows: wpsProducts } = await pool.query(`
    SELECT id, vendor_sku
    FROM catalog_unified
    WHERE source_vendor = 'WPS'
  `);

  // vendor_sku = "133-3015" which matches WPS# in the crossref directly
  const wpsNumToProductIds = new Map();
  for (const p of wpsProducts) {
    const vk = String(p.vendor_sku ?? "").trim();
    if (!vk) continue;
    if (!wpsNumToProductIds.has(vk)) wpsNumToProductIds.set(vk, new Set());
    wpsNumToProductIds.get(vk).add(p.id);
  }
  console.log(`  WPS products indexed: ${wpsProducts.length.toLocaleString()}`);

  // Resolve fitment pairs
  console.log("\nResolving fitment pairs …");
  const fitmentPairs = new Set();
  let matched = 0, noHdData = 0, noProduct = 0, noYearModel = 0;

  for (const row of wpsRows) {
    const oem    = String(row["OEM#"] ?? "").trim();
    const wpsNum = String(row["WPS#"] ?? "").trim();
    if (!oem || !wpsNum) continue;

    const yearModels = oemToYearModel.get(oem);
    if (!yearModels || yearModels.size === 0) { noHdData++; continue; }

    const productIds = wpsNumToProductIds.get(wpsNum);
    if (!productIds || productIds.size === 0) { noProduct++; continue; }

    let resolvedAny = false;
    for (const ym of yearModels) {
      const hmyId = ymToId.get(ym);
      if (!hmyId) { noYearModel++; continue; }
      for (const pid of productIds) {
        fitmentPairs.add(`${pid}|${hmyId}`);
        resolvedAny = true;
      }
    }
    if (resolvedAny) matched++;
  }

  console.log(`  Matched WPS OEM entries:      ${matched.toLocaleString()}`);
  console.log(`  No hd_parts_data entry:       ${noHdData.toLocaleString()}`);
  console.log(`  No catalog_unified product:   ${noProduct.toLocaleString()}`);
  console.log(`  No harley_model_years entry:  ${noYearModel.toLocaleString()}`);
  console.log(`  Total fitment pairs:          ${fitmentPairs.size.toLocaleString()}`);

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
    if (i % 5000 === 0) process.stdout.write(`  … ${i.toLocaleString()} / ${pairs.length.toLocaleString()}\r`);
  }

  console.log(`\n  Inserted: ${inserted.toLocaleString()}`);
  console.log(`  Skipped:  ${skipped.toLocaleString()}`);

  const { rows: total } = await pool.query(`SELECT COUNT(*) AS n FROM catalog_fitment_v2`);
  console.log(`\n  catalog_fitment_v2 total rows now: ${total[0].n}`);
  await pool.end();
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
