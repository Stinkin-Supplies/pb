#!/usr/bin/env node
/**
 * scripts/ingest/migrate_vtwin_fitment_to_v2.js
 *
 * Migrates VTwin fitment from catalog_unified columns
 * (fitment_hd_families, fitment_year_start, fitment_year_end)
 * into catalog_fitment_v2 (product_id, model_year_id).
 *
 * Safe to re-run — uses ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   node scripts/ingest/migrate_vtwin_fitment_to_v2.js
 */

import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

const BATCH_SIZE = 500;

// VTwin uses generic family names that map to one or more harley_families names.
const FAMILY_ALIASES = {
  "Softail":    ["Softail Evo", "Softail M8"],
  "Softail M8": ["Softail M8"],
  "Touring":    ["Touring"],
  "Sportster":  ["Sportster"],
  "Dyna":       ["Dyna"],
  "FXR":        ["FXR"],
  "V-Rod":      ["V-Rod"],
  "Twin Cam":   ["Twin Cam"],
  "Evolution":  ["Evolution"],
};

// ── Simple progress bar ───────────────────────────────────────────────────────
class ProgressBar {
  constructor(label, total) {
    this.label   = label;
    this.total   = total;
    this.current = 0;
    this.width   = 40;
    this.start   = Date.now();
    this.render();
  }

  render() {
    const pct      = this.total ? this.current / this.total : 0;
    const filled   = Math.round(this.width * pct);
    const bar      = "█".repeat(filled) + "░".repeat(this.width - filled);
    const elapsed  = ((Date.now() - this.start) / 1000).toFixed(1);
    const eta      = pct > 0 ? ((Date.now() - this.start) / pct / 1000 - (Date.now() - this.start) / 1000).toFixed(0) : "?";
    process.stdout.write(
      `\r  ${this.label.padEnd(20)} [${bar}] ${(pct * 100).toFixed(1)}% ` +
      `${this.current.toLocaleString()}/${this.total.toLocaleString()} ` +
      `| ${elapsed}s elapsed | ETA ${eta}s   `
    );
  }

  increment(n = 1) {
    this.current += n;
    this.render();
  }

  finish(msg = "") {
    this.current = this.total;
    this.render();
    const elapsed = ((Date.now() - this.start) / 1000).toFixed(1);
    console.log(`\n  ✅ Done in ${elapsed}s${msg ? " — " + msg : ""}`);
  }
}

async function main() {
  const client = await pool.connect();

  try {
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║     VTwin Fitment Migration → catalog_fitment_v2    ║");
    console.log("╚══════════════════════════════════════════════════════╝\n");

    // 1. Fetch ALL VTwin products with family+year data (no NOT EXISTS filter)
    console.log("📦 Fetching VTwin products with family+year data...");
    const { rows: products } = await client.query(`
      SELECT
        cu.id,
        cu.sku,
        cu.fitment_hd_families,
        cu.fitment_year_start,
        cu.fitment_year_end
      FROM catalog_unified cu
      WHERE cu.source_vendor = 'VTWIN'
        AND cu.fitment_hd_families IS NOT NULL
        AND array_length(cu.fitment_hd_families, 1) > 0
        AND cu.fitment_year_start IS NOT NULL
        AND cu.fitment_year_end IS NOT NULL
    `);
    console.log(`  Found ${products.length.toLocaleString()} products\n`);

    if (products.length === 0) {
      console.log("Nothing to migrate. Exiting.");
      return;
    }

    // 2. Build lookup: "FamilyName:year" → [model_year_id, ...]
    console.log("🔍 Building model_year lookup table...");
    const { rows: modelYears } = await client.query(`
      SELECT
        hmy.id   AS model_year_id,
        hmy.year,
        hf.name  AS family_name
      FROM harley_model_years hmy
      JOIN harley_models    hm ON hm.id       = hmy.model_id
      JOIN harley_families  hf ON hf.id       = hm.family_id
    `);

    const yearLookup = new Map();
    for (const row of modelYears) {
      const key = `${row.family_name}:${row.year}`;
      if (!yearLookup.has(key)) yearLookup.set(key, []);
      yearLookup.get(key).push(row.model_year_id);
    }
    console.log(`  Loaded ${modelYears.length.toLocaleString()} model-year rows\n`);

    // 3. Expand products into fitment rows
    console.log("⚙️  Expanding fitment rows...");
    const pb1 = new ProgressBar("Expanding", products.length);

    const rows = [];
    let skipped = 0;
    const unmatchedFamilies = new Set();
    const seen = new Set(); // dedupe

    for (const product of products) {
      const yearStart = parseInt(product.fitment_year_start);
      const yearEnd   = parseInt(product.fitment_year_end);

      if (isNaN(yearStart) || isNaN(yearEnd) || yearStart > yearEnd) {
        skipped++;
        pb1.increment();
        continue;
      }

      for (const vtwinFamily of product.fitment_hd_families) {
        const resolvedFamilies = FAMILY_ALIASES[vtwinFamily];
        if (!resolvedFamilies) {
          unmatchedFamilies.add(vtwinFamily);
          continue;
        }

        for (const family of resolvedFamilies) {
          for (let year = yearStart; year <= yearEnd; year++) {
            const key = `${family}:${year}`;
            const modelYearIds = yearLookup.get(key);
            if (!modelYearIds) continue;
            for (const modelYearId of modelYearIds) {
              const dedupeKey = `${product.id}:${modelYearId}`;
              if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                rows.push({ product_id: product.id, model_year_id: modelYearId });
              }
            }
          }
        }
      }

      pb1.increment();
    }

    pb1.finish(`${rows.length.toLocaleString()} fitment rows generated`);

    if (unmatchedFamilies.size > 0) {
      console.log(`\n  ⚠️  Unmatched family names: ${[...unmatchedFamilies].join(", ")}`);
    }
    if (skipped > 0) {
      console.log(`  ⚠️  Skipped ${skipped} products (bad year data)`);
    }

    if (rows.length === 0) {
      console.log("\n❌ No rows to insert — check FAMILY_ALIASES mapping.");
      return;
    }

    // 4. Insert in batches
    console.log(`\n💾 Inserting ${rows.length.toLocaleString()} rows in batches of ${BATCH_SIZE}...`);
    const pb2      = new ProgressBar("Inserting", rows.length);
    let inserted   = 0;
    let conflicts  = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch  = rows.slice(i, i + BATCH_SIZE);
      const values = batch.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
      const params = batch.flatMap(r => [r.product_id, r.model_year_id]);

      const result = await client.query(`
        INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
        VALUES ${values}
        ON CONFLICT (product_id, model_year_id) DO NOTHING
      `, params);

      inserted  += result.rowCount ?? 0;
      conflicts += batch.length - (result.rowCount ?? 0);
      pb2.increment(batch.length);
    }

    pb2.finish(`${inserted.toLocaleString()} inserted, ${conflicts.toLocaleString()} already existed`);

    // 5. Final coverage summary
    console.log("\n📊 catalog_fitment_v2 coverage after migration:");
    const { rows: counts } = await client.query(`
      SELECT hf.name, COUNT(DISTINCT cfv.product_id) AS products
      FROM harley_families hf
      JOIN harley_models     hm  ON hm.family_id  = hf.id
      JOIN harley_model_years hmy ON hmy.model_id  = hm.id
      JOIN catalog_fitment_v2 cfv ON cfv.model_year_id = hmy.id
      GROUP BY hf.name
      ORDER BY products DESC
    `);

    for (const row of counts) {
      console.log(`   ${row.name.padEnd(18)} ${Number(row.products).toLocaleString()} products`);
    }

    console.log("\n✅ Migration complete!\n");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("\n❌ Migration failed:", err.message);
  process.exit(1);
});
