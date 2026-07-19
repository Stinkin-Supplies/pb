/**
 * update_wps_catalog_flags.js
 * Reads wps-master-product.csv and updates:
 *   catalog_products.harddrive_catalog
 *   catalog_unified.in_harddrive
 *
 * Run: node scripts/ingest/update_wps_catalog_flags.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import csv from "csv-parser";
import pg from "pg";
import dotenv from "dotenv";
import { ProgressBar } from "./progress_bar.js";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Look for the CSV in common locations
const CSV_CANDIDATES = [
  path.resolve(__dirname, "../../wps-master-product.csv"),
  path.resolve(__dirname, "../data/wps-master-product.csv"),
  path.resolve(process.env.HOME, "Downloads/wps-master-product.csv"),
  path.resolve(process.env.HOME, "Desktop/wps-master-product.csv"),
];

const CSV_PATH = CSV_CANDIDATES.find(p => fs.existsSync(p));

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  if (!CSV_PATH) {
    console.error("wps-master-product.csv not found. Tried:\n" + CSV_CANDIDATES.join("\n"));
    console.error("\nMove the file to one of the above locations and re-run.");
    process.exit(1);
  }
  console.log(`\n📦 Reading: ${CSV_PATH}\n`);

  // Read all rows
  const harddrive = new Set();
  const street    = new Set();

  await new Promise((resolve, reject) => {
    fs.createReadStream(CSV_PATH)
      .pipe(csv())
      .on("data", row => {
        const sku = row.sku?.trim();
        if (!sku) return;
        const hd = (row.harddrive_catalog ?? "").trim().toLowerCase();
        const st = (row.street_catalog ?? "").trim().toLowerCase();
        if (hd === "yes" || hd === "true" || hd === "1") harddrive.add(sku);
        if (st === "yes" || st === "true" || st === "1") street.add(sku);
      })
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(`  HardDrive SKUs: ${harddrive.size.toLocaleString()}`);
  console.log(`  Street SKUs:    ${street.size.toLocaleString()}\n`);

  const client = await pool.connect();
  try {
    // Ensure columns exist
    await client.query(`
      ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS harddrive_catalog BOOLEAN DEFAULT FALSE;
      ALTER TABLE catalog_products ADD COLUMN IF NOT EXISTS street_catalog_flag BOOLEAN DEFAULT FALSE;
      ALTER TABLE catalog_unified   ADD COLUMN IF NOT EXISTS in_harddrive BOOLEAN DEFAULT FALSE;
      ALTER TABLE catalog_unified   ADD COLUMN IF NOT EXISTS in_street BOOLEAN DEFAULT FALSE;
    `);
    console.log("✓ Columns ensured\n");

    // Update catalog_products
    const hdArray = [...harddrive];
    const stArray = [...street];

    console.log("Updating catalog_products...");
    const bar1 = new ProgressBar(2, "catalog_products");
    await client.query(
      `UPDATE catalog_products SET harddrive_catalog = true WHERE sku = ANY($1)`,
      [hdArray]
    );
    bar1.update(1);
    await client.query(
      `UPDATE catalog_products SET street_catalog_flag = true WHERE sku = ANY($1)`,
      [stArray]
    );
    bar1.finish("Done");

    // Update catalog_unified for WPS products
    console.log("\nUpdating catalog_unified (WPS)...");
    const bar2 = new ProgressBar(2, "catalog_unified");
    const { rowCount: hdCount } = await client.query(
      `UPDATE catalog_unified SET in_harddrive = true
       WHERE source_vendor = 'WPS' AND sku = ANY($1)`,
      [hdArray]
    );
    bar2.update(1);
    const { rowCount: stCount } = await client.query(
      `UPDATE catalog_unified SET in_street = true
       WHERE source_vendor = 'WPS' AND sku = ANY($1)`,
      [stArray]
    );
    bar2.finish("Done");

    // Summary
    const { rows: [s] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE in_harddrive)                    AS harddrive,
        COUNT(*) FILTER (WHERE in_street)                       AS street,
        COUNT(*) FILTER (WHERE drag_part)                       AS drag,
        COUNT(*) FILTER (WHERE in_oldbook)                      AS oldbook,
        COUNT(*) FILTER (WHERE in_fatbook)                      AS fatbook,
        COUNT(*) FILTER (WHERE in_harddrive OR in_oldbook OR drag_part OR in_fatbook OR in_street) AS total_shop
      FROM catalog_unified
    `);

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Catalog flags updated!

  WPS HardDrive:     ${Number(s.harddrive).toLocaleString()}
  WPS Street:        ${Number(s.street).toLocaleString()}
  PU Drag:           ${Number(s.drag).toLocaleString()}
  PU Oldbook (H-D):  ${Number(s.oldbook).toLocaleString()}
  PU Fatbook:        ${Number(s.fatbook).toLocaleString()}
  ─────────────────────────────────────────
  Total shop SKUs:   ${Number(s.total_shop).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next: reindex Typesense
  TYPESENSE_API_KEY=xyz node scripts/ingest/index_unified.js --recreate
`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
