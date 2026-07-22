/**
 * recover_fitment_word_order.mjs
 *
 * Fixes the "no_model_match" flags caused by a word-order inconsistency in
 * catalog_fitment_enriched.csv's fitment_details field: most entries read
 * "YEAR Harley-Davidson MODELCODE ModelName", but a large subset instead
 * read "YEAR Harley-Davidson ModelName MODELCODE" (code last, not first).
 * import_ds_fitment_scraper.mjs always took the token right after
 * "Harley-Davidson" as the code, so reversed entries got the first word of
 * the model name instead (e.g. "Electra" instead of "FLHTPI").
 *
 * Fix: for every 'no_model_match' row, take the LAST word of
 * (model_code_raw + ' ' + model_name_raw) as the candidate code instead,
 * validate it against harley_models, and re-run the same disambiguation
 * validate_fitment_staging.mjs uses (year-range overlap for the 15 reused
 * codes). Only rewrites rows where this recovers a valid, unambiguous
 * match -- anything still unresolved stays flagged for human review.
 *
 * Usage:
 *   node scripts/ingest/recover_fitment_word_order.mjs           # dry run
 *   node scripts/ingest/recover_fitment_word_order.mjs --apply   # writes
 */
'use strict';

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    const { rows: flagged } = await client.query(`
      SELECT id, sku, model_code_raw, model_name_raw, year_start, year_end, matched_product_id
      FROM fitment_staging
      WHERE source = 'ds_fitment_scraper' AND conflict_type = 'no_model_match'
    `);
    console.log(`\n${flagged.length} 'no_model_match' rows to re-parse${APPLY ? '' : '  [DRY RUN]'}\n`);

    const { rows: allModels } = await client.query(`SELECT id, model_code, start_year, end_year FROM harley_models`);
    const modelsByCode = new Map();
    for (const m of allModels) {
      if (!modelsByCode.has(m.model_code)) modelsByCode.set(m.model_code, []);
      modelsByCode.get(m.model_code).push(m);
    }

    // Existing (sku, model_code, year_start, year_end, source) tuples --
    // a "recovered" row that would collide with one of these (an already
    // correctly-parsed duplicate of the same fact) gets marked 'duplicate'
    // instead of updated, to avoid violating fitment_staging_uniq.
    const { rows: existingTuples } = await client.query(
      `SELECT sku, model_code_raw, year_start, year_end FROM fitment_staging WHERE source = 'ds_fitment_scraper'`
    );
    const existingSet = new Set(existingTuples.map((t) => `${t.sku}::${t.model_code_raw}::${t.year_start}::${t.year_end}`));

    let recovered = 0, stillUnresolved = 0, stillAmbiguous = 0, duplicateOfExisting = 0;
    const updates = [];
    const duplicates = [];

    for (const row of flagged) {
      const fullText = row.model_name_raw ? `${row.model_code_raw} ${row.model_name_raw}` : row.model_code_raw;
      const words = fullText.split(/\s+/).filter(Boolean);
      const candidateCode = words[words.length - 1];
      const candidateName = words.slice(0, -1).join(' ') || null;

      const candidates = modelsByCode.get(candidateCode) ?? [];
      if (candidates.length === 0) { stillUnresolved++; continue; }

      const overlapping = candidates.filter((m) => row.year_start <= m.end_year && row.year_end >= m.start_year);
      const finalCandidates = overlapping.length > 0 ? overlapping : candidates;
      if (finalCandidates.length > 1) { stillAmbiguous++; continue; }

      const tupleKey = `${row.sku}::${candidateCode}::${row.year_start}::${row.year_end}`;
      if (existingSet.has(tupleKey)) {
        duplicateOfExisting++;
        duplicates.push({ id: row.id });
        continue;
      }
      existingSet.add(tupleKey); // dedupe among the recovered rows themselves too

      recovered++;
      updates.push({
        id: row.id,
        model_code_raw: candidateCode,
        model_name_raw: candidateName,
        matched_model_id: finalCandidates[0].id,
        matched_product_id: row.matched_product_id,
      });
    }

    console.log(`Recovered (valid, unambiguous match): ${recovered}`);
    console.log(`Duplicate of an already-correct row (marked duplicate, not updated): ${duplicateOfExisting}`);
    console.log(`Still unresolved (candidate code not a real model): ${stillUnresolved}`);
    console.log(`Still ambiguous: ${stillAmbiguous}`);

    if (!APPLY) {
      console.log('\nSample recovered:', updates.slice(0, 5));
      console.log('\nDry run -- no writes made. Re-run with --apply to persist.\n');
      return;
    }

    const BATCH_SIZE = 2000;
    let done = 0;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      await client.query('BEGIN');
      await client.query(
        `UPDATE fitment_staging AS t
           SET model_code_raw = v.model_code_raw,
               model_name_raw = v.model_name_raw,
               matched_model_id = v.matched_model_id,
               status = 'approved',
               conflict_type = NULL,
               conflict_notes = 'recovered from word-order parsing bug'
         FROM (
           SELECT
             unnest($1::int[])  AS id,
             unnest($2::text[]) AS model_code_raw,
             unnest($3::text[]) AS model_name_raw,
             unnest($4::int[])  AS matched_model_id
         ) AS v
         WHERE t.id = v.id`,
        [
          batch.map((u) => u.id),
          batch.map((u) => u.model_code_raw),
          batch.map((u) => u.model_name_raw),
          batch.map((u) => u.matched_model_id),
        ]
      );
      await client.query('COMMIT');
      done += batch.length;
      process.stdout.write(`\r  ${done}/${updates.length} recovered rows updated`);
    }
    console.log();

    if (duplicates.length > 0) {
      const dupIds = duplicates.map((d) => d.id);
      await client.query(
        `UPDATE fitment_staging SET status = 'duplicate', conflict_notes = 'recovered code duplicates an already-correct row' WHERE id = ANY($1::int[])`,
        [dupIds]
      );
      console.log(`Marked ${dupIds.length} rows as 'duplicate' (recovered value matched an already-correct row).`);
    }

    console.log(`\nDone. ${done} rows moved from 'flagged'/no_model_match to 'approved'.`);
    console.log(`Next: node scripts/ingest/promote_fitment_staging.mjs --batch=ds_fitment_scraper_2026-07-21 --apply\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
