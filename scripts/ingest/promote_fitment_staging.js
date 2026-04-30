#!/usr/bin/env node
/**
 * scripts/ingest/promote_fitment_staging.js
 *
 * Promotes approved rows from fitment_staging → catalog_fitment_v2.
 * Only touches rows with status = 'approved'.
 * Safe to re-run — uses ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   node scripts/ingest/promote_fitment_staging.js [--confidence high|medium|low] [--dry-run]
 *
 * Options:
 *   --confidence  Only promote rows at or above this confidence level (default: high)
 *   --dry-run     Print what would be promoted without writing anything
 *
 * Workflow:
 *   1. Review fitment_staging (see review queries below)
 *   2. Approve rows:  UPDATE fitment_staging SET status='approved' WHERE confidence='high';
 *   3. Run this script
 *   4. Reject bad rows: UPDATE fitment_staging SET status='rejected' WHERE ...;
 */

import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog",
});

const args = process.argv.slice(2);
const confidenceFilter = args.includes("--confidence") ? args[args.indexOf("--confidence") + 1] : "high";
const dryRun = args.includes("--dry-run");

const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };
const minRank = CONFIDENCE_RANK[confidenceFilter] ?? 3;

async function main() {
  const client = await pool.connect();

  try {
    console.log("=== Promote Fitment Staging → catalog_fitment_v2 ===\n");
    console.log(`Confidence threshold: ${confidenceFilter}+`);
    if (dryRun) console.log("DRY RUN — no writes\n");
    console.log();

    // Build model_year lookup: family_name:year → [model_year_id]
    console.log("Building model_year lookup...");
    const { rows: modelYears } = await client.query(`
      SELECT hmy.id AS model_year_id, hmy.year, hf.name AS family_name
      FROM harley_model_years hmy
      JOIN harley_models hm ON hm.id = hmy.model_id
      JOIN harley_families hf ON hf.id = hm.family_id
    `);
    const yearLookup = new Map();
    for (const row of modelYears) {
      const key = `${row.family_name}:${row.year}`;
      if (!yearLookup.has(key)) yearLookup.set(key, []);
      yearLookup.get(key).push(row.model_year_id);
    }
    console.log(`  ${modelYears.length} model-year rows loaded\n`);

    // Load approved staging rows above confidence threshold
    const confValues = Object.entries(CONFIDENCE_RANK)
      .filter(([, rank]) => rank >= minRank)
      .map(([c]) => c);

    const { rows: staging } = await client.query(`
      SELECT fs.product_id, fs.family_name, fs.year_min, fs.year_max,
             fs.confidence, fs.inference_source
      FROM fitment_staging fs
      WHERE fs.status = 'approved'
        AND fs.confidence = ANY($1::text[])
        AND fs.family_name != 'Universal'
    `, [confValues]);

    console.log(`Found ${staging.length} approved staging rows to promote\n`);

    if (staging.length === 0) {
      console.log("Nothing to promote. Approve rows first:");
      console.log("  UPDATE fitment_staging SET status='approved' WHERE confidence='high';");
      return;
    }

    // Expand staging rows → fitment_v2 rows via model_year lookup
    const fitmentRows = [];
    let skipped = 0;

    for (const row of staging) {
      const yearMin = row.year_min;
      const yearMax = row.year_max;

      if (!yearMin || !yearMax) {
        // No year bounds — insert for ALL years of this family
        const allKeys = [...yearLookup.keys()].filter(k => k.startsWith(`${row.family_name}:`));
        for (const key of allKeys) {
          for (const myId of yearLookup.get(key)) {
            fitmentRows.push({ product_id: row.product_id, model_year_id: myId });
          }
        }
        continue;
      }

      for (let year = yearMin; year <= yearMax; year++) {
        const key = `${row.family_name}:${year}`;
        const ids = yearLookup.get(key);
        if (!ids) continue;
        for (const myId of ids) {
          fitmentRows.push({ product_id: row.product_id, model_year_id: myId });
        }
      }
    }

    // Deduplicate
    const seen = new Set();
    const unique = fitmentRows.filter(r => {
      const key = `${r.product_id}:${r.model_year_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`Expanded to ${unique.length} fitment rows (${fitmentRows.length - unique.length} dupes removed)\n`);

    if (dryRun) {
      console.log("DRY RUN complete — would insert:", unique.length, "rows");
      console.log("\nSample (first 10):");
      for (const r of unique.slice(0, 10)) {
        console.log(`  product_id=${r.product_id} model_year_id=${r.model_year_id}`);
      }
      return;
    }

    // Insert in batches
    const BATCH = 500;
    let inserted = 0;
    let conflicts = 0;

    for (let i = 0; i < unique.length; i += BATCH) {
      const batch = unique.slice(i, i + BATCH);
      const values = batch.map((_, j) => `($${j*2+1},$${j*2+2},'staging',0.8)`).join(",");
      const params = batch.flatMap(r => [r.product_id, r.model_year_id]);
      const res = await client.query(`
        INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
        VALUES ${values}
        ON CONFLICT (product_id, model_year_id) DO NOTHING
      `, params);
      inserted += res.rowCount ?? 0;
      conflicts += batch.length - (res.rowCount ?? 0);
      if (i % 10000 === 0) process.stdout.write(`\r  Progress: ${Math.round(i/unique.length*100)}%`);
    }
    console.log(`\r  100%\n`);

    // Mark staging rows as promoted
    await client.query(`
      UPDATE fitment_staging SET status='approved'
      WHERE status='approved' AND confidence = ANY($1::text[]) AND family_name != 'Universal'
    `, [confValues]);

    // Update is_universal on catalog_unified for Universal-flagged products
    const { rowCount: universalUpdated } = await client.query(`
      UPDATE catalog_unified cu
      SET is_universal = true
      FROM fitment_staging fs
      WHERE fs.product_id = cu.id
        AND fs.family_name = 'Universal'
        AND fs.status = 'approved'
    `);

    console.log("✅ Promotion complete!\n");
    console.log(`   Inserted into catalog_fitment_v2: ${inserted}`);
    console.log(`   Conflicts (already existed):      ${conflicts}`);
    console.log(`   Products flagged is_universal:    ${universalUpdated}\n`);

    // Final counts
    const { rows: counts } = await client.query(`
      SELECT hf.name, COUNT(DISTINCT cfv.product_id) AS products
      FROM harley_families hf
      JOIN harley_models hm ON hm.family_id = hf.id
      JOIN harley_model_years hmy ON hmy.model_id = hm.id
      JOIN catalog_fitment_v2 cfv ON cfv.model_year_id = hmy.id
      GROUP BY hf.name
      ORDER BY products DESC
    `);
    console.log("📊 catalog_fitment_v2 coverage after promotion:");
    for (const r of counts) {
      console.log(`   ${r.name.padEnd(16)} ${r.products} products`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Failed:", err.message);
  process.exit(1);
});
