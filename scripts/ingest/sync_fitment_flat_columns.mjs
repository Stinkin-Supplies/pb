#!/usr/bin/env node
/**
 * sync_fitment_flat_columns.mjs
 *
 * catalog_unified has flat fitment columns (is_harley_fitment, fitment_year_start,
 * fitment_year_end, fitment_hd_families, fitment_hd_models, fitment_hd_codes,
 * fitment_year_ranges) that the main product API and the Typesense index read
 * directly. catalog_fitment_v2 (the model_year_id join table) is the real
 * source of truth and is updated by many different ingest scripts, but none
 * of them wrote back to these flat columns -- as of session 68 they were 0%
 * populated across the entire 97,277-row catalog despite catalog_fitment_v2
 * having real data for 45,659 of those products.
 *
 * This script re-aggregates catalog_fitment_v2 -> flat columns for every
 * product that has fitment_v2 rows. It's idempotent (safe to re-run) and
 * should be run after any script that inserts into catalog_fitment_v2, right
 * before the Typesense reindex.
 *
 * Usage:
 *   node scripts/ingest/sync_fitment_flat_columns.mjs
 */

import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TEMP TABLE fitment_agg ON COMMIT DROP AS
      SELECT
        cfv.product_id,
        MIN(hmy.year) AS year_start,
        MAX(hmy.year) AS year_end,
        array_agg(DISTINCT hf.name) AS families,
        array_agg(DISTINCT hm.name) AS model_names,
        array_agg(DISTINCT hm.model_code) AS model_codes
      FROM catalog_fitment_v2 cfv
      JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
      JOIN harley_models hm ON hm.id = hmy.model_id
      JOIN harley_families hf ON hf.id = hm.family_id
      GROUP BY cfv.product_id
    `);

    await client.query(`
      CREATE TEMP TABLE fitment_ranges ON COMMIT DROP AS
      SELECT product_id, jsonb_agg(jsonb_build_object('year_start', ys, 'year_end', ye, 'family', family, 'models', models)) AS year_ranges
      FROM (
        SELECT cfv.product_id, hf.name AS family, MIN(hmy.year) AS ys, MAX(hmy.year) AS ye, array_agg(DISTINCT hm.model_code) AS models
        FROM catalog_fitment_v2 cfv
        JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
        JOIN harley_models hm ON hm.id = hmy.model_id
        JOIN harley_families hf ON hf.id = hm.family_id
        GROUP BY cfv.product_id, hf.name
      ) x
      GROUP BY product_id
    `);

    await client.query(`CREATE INDEX ON fitment_agg (product_id)`);
    await client.query(`CREATE INDEX ON fitment_ranges (product_id)`);

    const res = await client.query(`
      UPDATE catalog_unified cu
      SET
        is_harley_fitment = true,
        fitment_year_start = a.year_start,
        fitment_year_end = a.year_end,
        fitment_hd_families = a.families,
        fitment_hd_models = a.model_names,
        fitment_hd_codes = a.model_codes,
        fitment_year_ranges = r.year_ranges,
        updated_at = now()
      FROM fitment_agg a
      JOIN fitment_ranges r ON r.product_id = a.product_id
      WHERE cu.id = a.product_id
    `);

    await client.query("COMMIT");
    console.log(`Synced flat fitment columns for ${res.rowCount} products.`);
    console.log("Next step: node scripts/ingest/index_unified.js --recreate");
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
