/**
 * update_wps_pricing.js
 * Updates catalog_unified with WPS dealer pricing from JSON file.
 * Sets msrp = list_price, cost = actual_dealer_price
 *
 * Run: node scripts/ingest/update_wps_pricing.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";
import { ProgressBar } from "./progress_bar.js";

dotenv.config({ path: ".env.local" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const JSON_CANDIDATES = [
  path.resolve(__dirname, "../../2026-04-17.json"),
  path.resolve(__dirname, "../data/wps-pricing.json"),
  path.resolve(__dirname, "../data/2026-04-17.json"),
  path.resolve(process.env.HOME, "Downloads/2026-04-17.json"),
  path.resolve(process.env.HOME, "Desktop/2026-04-17.json"),
];

const JSON_PATH = JSON_CANDIDATES.find(p => fs.existsSync(p));

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  if (!JSON_PATH) {
    console.error("Pricing JSON not found. Tried:\n" + JSON_CANDIDATES.join("\n"));
    process.exit(1);
  }
  console.log(`\n💰 Reading: ${JSON_PATH}\n`);

  const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  console.log(`  ${data.length.toLocaleString()} pricing records\n`);

  const client = await pool.connect();
  try {
    // Build lookup map
    const pricing = new Map();
    for (const row of data) {
      if (row.sku) {
        pricing.set(row.sku.trim(), {
          msrp: parseFloat(row.list_price) || 0,
          cost: parseFloat(row.actual_dealer_price) || 0,
        });
      }
    }

    // Batch update in chunks
    const BATCH = 1000;
    const skus = [...pricing.keys()];
    const bar = new ProgressBar(skus.length, "Updating prices");
    let updated = 0;

    for (let i = 0; i < skus.length; i += BATCH) {
      const batch = skus.slice(i, i + BATCH);
      
      // Build VALUES list for bulk update
      const values = [];
      const params = [];
      let idx = 1;
      
      for (const sku of batch) {
        const { msrp, cost } = pricing.get(sku);
        values.push(`($${idx++}::text, $${idx++}::numeric, $${idx++}::numeric)`);
        params.push(sku, msrp, cost);
      }

      await client.query(`
        UPDATE catalog_unified cu
        SET msrp = v.msrp, cost = v.cost
        FROM (VALUES ${values.join(",")}) AS v(sku, msrp, cost)
        WHERE cu.sku = v.sku AND cu.source_vendor = 'WPS'
      `, params);

      updated += batch.length;
      bar.update(updated);
    }
    bar.finish("Done");

    // Verify
    const { rows: [s] } = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE msrp > 0) AS with_price,
        ROUND(AVG(msrp) FILTER (WHERE msrp > 0), 2) AS avg_msrp,
        ROUND(MIN(msrp) FILTER (WHERE msrp > 0), 2) AS min_msrp,
        ROUND(MAX(msrp) FILTER (WHERE msrp > 0), 2) AS max_msrp
      FROM catalog_unified
      WHERE source_vendor = 'WPS'
    `);

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  WPS Pricing updated!

  Total WPS products:  ${Number(s.total).toLocaleString()}
  With price:          ${Number(s.with_price).toLocaleString()}
  Avg MSRP:            $${s.avg_msrp}
  Min MSRP:            $${s.min_msrp}
  Max MSRP:            $${s.max_msrp}
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
