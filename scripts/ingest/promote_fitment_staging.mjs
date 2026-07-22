/**
 * promote_fitment_staging.mjs
 *
 * Moves 'approved' rows from fitment_staging into catalog_fitment_v2.
 * Expands each row's [year_start, year_end] into individual
 * harley_model_years rows for matched_model_id, then inserts one
 * catalog_fitment_v2 row per (product_id, model_year_id) pair.
 *
 * confidence_score = 0.5, matching the documented policy in
 * OEM_FITMENT_DATA_MODEL.md ("any newly-imported source starts at <=0.5
 * until it passes validation") -- this is a scraped source, not a direct
 * vendor/OEM catalog feed, so it stays at the conservative default tier
 * rather than being promoted to a higher confidence bracket.
 *
 * ON CONFLICT (product_id, model_year_id) DO NOTHING -- never downgrades an
 * existing higher-confidence row from another source.
 *
 * Usage:
 *   node scripts/ingest/promote_fitment_staging.mjs                # dry run
 *   node scripts/ingest/promote_fitment_staging.mjs --apply        # writes
 *   node scripts/ingest/promote_fitment_staging.mjs --batch=<name> # scope to one batch
 */
'use strict';

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const batchArg = process.argv.find((a) => a.startsWith('--batch='));
const BATCH_NAME = batchArg ? batchArg.split('=')[1] : null;
const CONFIDENCE = 0.5;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    const params = [];
    let batchFilter = '';
    if (BATCH_NAME) {
      params.push(BATCH_NAME);
      batchFilter = `AND source_batch = $${params.length}`;
    }

    const { rows: approved } = await client.query(
      `SELECT * FROM fitment_staging WHERE status = 'approved' ${batchFilter} ORDER BY id`,
      params
    );
    console.log(`\nPromoting ${approved.length} approved fitment_staging row(s)${BATCH_NAME ? ` (batch: ${BATCH_NAME})` : ''}${APPLY ? '' : '  [DRY RUN]'}\n`);

    // Preload harley_model_years grouped by model_id (avoid a query per staging row)
    const { rows: allYears } = await client.query(`SELECT id, model_id, year FROM harley_model_years`);
    const yearsByModel = new Map();
    for (const y of allYears) {
      if (!yearsByModel.has(y.model_id)) yearsByModel.set(y.model_id, []);
      yearsByModel.get(y.model_id).push(y);
    }

    // Expand into unique (product_id, model_year_id) pairs
    const pairSet = new Map();
    for (const row of approved) {
      const years = yearsByModel.get(row.matched_model_id) ?? [];
      for (const y of years) {
        if (y.year >= row.year_start && y.year <= row.year_end) {
          pairSet.set(`${row.matched_product_id}:${y.id}`, { product_id: row.matched_product_id, model_year_id: y.id, staging_id: row.id });
        }
      }
    }
    const pairs = [...pairSet.values()];
    console.log(`Expanded to ${pairs.length} unique (product_id, model_year_id) pairs`);

    if (!APPLY) {
      console.log('\nSample pairs:', pairs.slice(0, 5));
      console.log('\nDry run -- no writes made. Re-run with --apply to persist.\n');
      return;
    }

    // unnest() arrays instead of multi-row VALUES -- a fixed handful of
    // parameters regardless of row count, so this can move ~100K+ rows per
    // round trip instead of being capped by Postgres's parameter limit.
    // A first attempt at 500-row VALUES batches for this table (3.25M+
    // existing rows) ran at ~65 rows/sec against the remote DB -- far too
    // slow for 1.3M pairs. This chunking is sized for round-trip count, not
    // parameter limits.
    const stagingIdsPromoted = new Set();
    let inserted = 0;
    const CHUNK_SIZE = 100000;
    for (let i = 0; i < pairs.length; i += CHUNK_SIZE) {
      const chunk = pairs.slice(i, i + CHUNK_SIZE);
      const res = await client.query(
        `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
         SELECT unnest($1::int[]), unnest($2::int[]), 'ds_fitment_scraper', $3::numeric
         ON CONFLICT (product_id, model_year_id) DO NOTHING`,
        [chunk.map((p) => p.product_id), chunk.map((p) => p.model_year_id), CONFIDENCE]
      );
      inserted += res.rowCount;
      for (const p of chunk) stagingIdsPromoted.add(p.staging_id);
      process.stdout.write(`\r  ${Math.min(i + CHUNK_SIZE, pairs.length)}/${pairs.length} processed, ${inserted} inserted`);
    }
    console.log();

    const idsArr = [...stagingIdsPromoted];
    const ID_CHUNK = 20000;
    for (let i = 0; i < idsArr.length; i += ID_CHUNK) {
      const idBatch = idsArr.slice(i, i + ID_CHUNK);
      await client.query(
        `UPDATE fitment_staging SET status = 'promoted', promoted_at = now() WHERE id = ANY($1::int[])`,
        [idBatch]
      );
    }

    console.log(`\nPromoted ${inserted} new catalog_fitment_v2 rows from ${stagingIdsPromoted.size} staging rows.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
