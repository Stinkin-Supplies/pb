#!/usr/bin/env node
/**
 * scripts/ingest/migrate_vtwin_fitment_to_v2.js
 *
 * Migrates VTwin fitment from catalog_unified columns
 * (fitment_hd_families, fitment_year_start, fitment_year_end)
 * into catalog_fitment_v2 (product_id, model_year_id).
 *
 * product_id now references catalog_unified.id (FK migrated April 29).
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

async function main() {
  const client = await pool.connect();

  try {
    console.log("=== VTwin Fitment Migration → catalog_fitment_v2 ===\n");

    // 1. Fetch all VTwin products with unmigrated fitment data
    // product_id now = catalog_unified.id (FK was migrated to catalog_unified)
    console.log("Fetching VTwin products with family+year data not yet in v2...");
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
        AND NOT EXISTS (
          SELECT 1 FROM catalog_fitment_v2 cfv WHERE cfv.product_id = cu.id
        )
    `);
    console.log(`Found ${products.length} products to migrate\n`);

    if (products.length === 0) {
      console.log("Nothing to migrate. Exiting.");
      return;
    }

    // 2. Build a lookup: family name + year → model_year_id
    console.log("Building model_year lookup table...");
    const { rows: modelYears } = await client.query(`
      SELECT
        hmy.id AS model_year_id,
        hmy.year,
        hf.name AS family_name
      FROM harley_model_years hmy
      JOIN harley_models hm ON hm.id = hmy.model_id
      JOIN harley_families hf ON hf.id = hm.family_id
    `);

    // Map: "FamilyName:year" → [model_year_id, ...]
    const yearLookup = new Map();
    for (const row of modelYears) {
      const key = `${row.family_name}:${row.year}`;
      if (!yearLookup.has(key)) yearLookup.set(key, []);
      yearLookup.get(key).push(row.model_year_id);
    }
    console.log(`Loaded ${modelYears.length} model-year rows\n`);

    // 3. Expand products into fitment rows
    console.log("Expanding fitment rows...");
    const rows = [];
    let skipped = 0;
    const unmatchedFamilies = new Set();

    for (const product of products) {
      const yearStart = parseInt(product.fitment_year_start);
      const yearEnd   = parseInt(product.fitment_year_end);

      if (isNaN(yearStart) || isNaN(yearEnd) || yearStart > yearEnd) {
        skipped++;
        continue;
      }

      for (const family of product.fitment_hd_families) {
        let matched = false;
        for (let year = yearStart; year <= yearEnd; year++) {
          const key = `${family}:${year}`;
          const modelYearIds = yearLookup.get(key);
          if (!modelYearIds) continue;
          matched = true;
          for (const modelYearId of modelYearIds) {
            rows.push({ product_id: product.id, model_year_id: modelYearId });
          }
        }
        if (!matched) unmatchedFamilies.add(family);
      }
    }

    console.log(`Expanded to ${rows.length} fitment rows (${skipped} products skipped — bad year data)`);
    if (unmatchedFamilies.size > 0) {
      console.log(`Unmatched family names (not in harley_families): ${[...unmatchedFamilies].join(', ')}`);
    }
    console.log();

    if (rows.length === 0) {
      console.log("No rows to insert — family names may not match harley_families. Check mapping above.");
      return;
    }

    // 4. Insert in batches
    console.log(`Inserting in batches of ${BATCH_SIZE}...`);
    let inserted = 0;
    let conflicts = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values = batch.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(", ");
      const params = batch.flatMap(r => [r.product_id, r.model_year_id]);

      const result = await client.query(`
        INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
        VALUES ${values}
        ON CONFLICT (product_id, model_year_id) DO NOTHING
      `, params);

      inserted += result.rowCount ?? 0;
      conflicts += batch.length - (result.rowCount ?? 0);

      if ((i / BATCH_SIZE) % 20 === 0) {
        const pct = Math.round((i / rows.length) * 100);
        process.stdout.write(`\r  Progress: ${pct}% (${inserted} inserted, ${conflicts} skipped)`);
      }
    }

    console.log(`\n\n✅ Done!`);
    console.log(`   Inserted:  ${inserted} rows`);
    console.log(`   Conflicts: ${conflicts} rows (already existed)`);
    console.log(`   Skipped:   ${skipped} products (bad year data)\n`);

    // 5. Final counts
    const { rows: counts } = await client.query(`
      SELECT hf.name, COUNT(DISTINCT cfv.product_id) AS products
      FROM harley_families hf
      JOIN harley_models hm ON hm.family_id = hf.id
      JOIN harley_model_years hmy ON hmy.model_id = hm.id
      JOIN catalog_fitment_v2 cfv ON cfv.model_year_id = hmy.id
      GROUP BY hf.name
      ORDER BY products DESC
    `);

    console.log("📊 catalog_fitment_v2 coverage after migration:");
    for (const row of counts) {
      console.log(`   ${row.name.padEnd(16)} ${row.products} products`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
