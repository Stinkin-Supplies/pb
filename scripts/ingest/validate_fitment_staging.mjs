/**
 * validate_fitment_staging.mjs
 *
 * Checks-and-balances pass for fitment_staging, mirroring
 * validate_oem_crossref_staging.mjs. Never writes to catalog_fitment_v2 --
 * only annotates staging rows so a human can review anything ambiguous
 * before promote_fitment_staging.mjs runs.
 *
 * All matching happens in memory against preloaded catalog_unified/
 * harley_models lookups (no per-row SELECT) and writes go through bulk
 * unnest() UPDATEs -- a per-row round-trip loop was tried first and was far
 * too slow at this table's scale (300K+ rows).
 *
 * For every 'pending' row, checks:
 *   1. sku resolves to a catalog_unified product -> else 'flagged' / no_product_match
 *   2. model_code_raw resolves to exactly one harley_models row, disambiguating
 *      the 15 known duplicate codes (e.g. 'FXRST' means two different models
 *      30 years apart) by checking which candidate's [start_year,end_year]
 *      overlaps this row's [year_start,year_end]
 *        -> zero matches: 'flagged' / no_model_match
 *        -> still >1 match after year-overlap filtering: 'flagged' / ambiguous_model
 *   3. Otherwise: 'approved' (auto-approved; year-range expansion into
 *      harley_model_years happens at promotion time, not here)
 *
 * Usage:
 *   node scripts/ingest/validate_fitment_staging.mjs                # dry run
 *   node scripts/ingest/validate_fitment_staging.mjs --apply        # writes status updates
 *   node scripts/ingest/validate_fitment_staging.mjs --batch=<name> # scope to one source_batch
 */
'use strict';

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const batchArg = process.argv.find((a) => a.startsWith('--batch='));
const BATCH_NAME = batchArg ? batchArg.split('=')[1] : null;
const BATCH_SIZE = 2000;

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

    const { rows: pending } = await client.query(
      `SELECT id, sku, model_code_raw, year_start, year_end FROM fitment_staging WHERE status = 'pending' ${batchFilter} ORDER BY id`,
      params
    );
    console.log(`\nValidating ${pending.length} pending fitment_staging row(s)${BATCH_NAME ? ` (batch: ${BATCH_NAME})` : ''}${APPLY ? '' : '  [DRY RUN]'}\n`);

    // Preload everything needed for in-memory matching -- no per-row queries.
    const { rows: allProducts } = await client.query(`SELECT id, sku FROM catalog_unified`);
    const skuToId = new Map(allProducts.map((r) => [r.sku, r.id]));

    const { rows: allModels } = await client.query(`SELECT id, model_code, start_year, end_year FROM harley_models`);
    const modelsByCode = new Map();
    for (const m of allModels) {
      if (!modelsByCode.has(m.model_code)) modelsByCode.set(m.model_code, []);
      modelsByCode.get(m.model_code).push(m);
    }

    const counts = { no_product_match: 0, no_model_match: 0, ambiguous_model: 0, approved: 0 };
    const updates = [];

    for (const row of pending) {
      const matchedProductId = skuToId.get(row.sku);
      if (!matchedProductId) {
        counts.no_product_match++;
        updates.push({ id: row.id, status: 'flagged', conflict_type: 'no_product_match', conflict_notes: `No catalog_unified row with sku='${row.sku}'`, matched_product_id: null, matched_model_id: null });
        continue;
      }

      const candidates = modelsByCode.get(row.model_code_raw) ?? [];
      if (candidates.length === 0) {
        counts.no_model_match++;
        updates.push({ id: row.id, status: 'flagged', conflict_type: 'no_model_match', conflict_notes: `model_code '${row.model_code_raw}' not found in harley_models`, matched_product_id: matchedProductId, matched_model_id: null });
        continue;
      }

      const overlapping = candidates.filter((m) => row.year_start <= m.end_year && row.year_end >= m.start_year);
      const finalCandidates = overlapping.length > 0 ? overlapping : candidates;

      if (finalCandidates.length > 1) {
        counts.ambiguous_model++;
        updates.push({ id: row.id, status: 'flagged', conflict_type: 'ambiguous_model', conflict_notes: `model_code '${row.model_code_raw}' matches ${finalCandidates.length} harley_models rows (ids: ${finalCandidates.map((c) => c.id).join(',')})`, matched_product_id: matchedProductId, matched_model_id: null });
        continue;
      }

      counts.approved++;
      updates.push({ id: row.id, status: 'approved', conflict_type: null, conflict_notes: null, matched_product_id: matchedProductId, matched_model_id: finalCandidates[0].id });
    }

    console.log('Results:');
    console.log(`  no_product_match (flagged) : ${counts.no_product_match}`);
    console.log(`  no_model_match (flagged)   : ${counts.no_model_match}`);
    console.log(`  ambiguous_model (flagged)  : ${counts.ambiguous_model}`);
    console.log(`  approved (clean)           : ${counts.approved}`);

    if (!APPLY) {
      console.log('\nDry run -- no writes made. Re-run with --apply to persist.\n');
      return;
    }

    // Bulk UPDATE via unnest() arrays -- one round trip per batch instead of one per row.
    let applied = 0;
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      await client.query('BEGIN');
      await client.query(
        `UPDATE fitment_staging AS t
           SET status = v.status,
               conflict_type = v.conflict_type,
               conflict_notes = v.conflict_notes,
               matched_product_id = v.matched_product_id,
               matched_model_id = v.matched_model_id
         FROM (
           SELECT
             unnest($1::int[])  AS id,
             unnest($2::text[]) AS status,
             unnest($3::text[]) AS conflict_type,
             unnest($4::text[]) AS conflict_notes,
             unnest($5::int[])  AS matched_product_id,
             unnest($6::int[])  AS matched_model_id
         ) AS v
         WHERE t.id = v.id`,
        [
          batch.map((u) => u.id),
          batch.map((u) => u.status),
          batch.map((u) => u.conflict_type),
          batch.map((u) => u.conflict_notes),
          batch.map((u) => u.matched_product_id),
          batch.map((u) => u.matched_model_id),
        ]
      );
      await client.query('COMMIT');
      applied += batch.length;
      process.stdout.write(`\r  ${applied}/${updates.length} applied`);
    }
    console.log();

    // Review flags: one row per (product_id, flag_type). Dedupe up front --
    // many staging rows commonly point at the same product/conflict_type,
    // and Postgres rejects ON CONFLICT DO UPDATE hitting the same row twice
    // within a single INSERT statement.
    const flagMap = new Map();
    for (const u of updates) {
      if (u.status !== 'flagged' || !u.matched_product_id) continue;
      flagMap.set(`${u.matched_product_id}::${u.conflict_type}`, u);
    }
    const flagRows = [...flagMap.values()];
    let flagsWritten = 0;
    for (let i = 0; i < flagRows.length; i += BATCH_SIZE) {
      const batch = flagRows.slice(i, i + BATCH_SIZE);
      const vals = [];
      const qparams = [];
      let idx = 1;
      for (const u of batch) {
        vals.push(`($${idx++}, $${idx++}, $${idx++})`);
        qparams.push(u.matched_product_id, 'fitment_' + u.conflict_type, u.conflict_notes);
      }
      await client.query(
        `INSERT INTO catalog_review_flags (product_id, flag_type, flag_notes)
         VALUES ${vals.join(',')}
         ON CONFLICT (product_id, flag_type) DO UPDATE SET flag_notes = EXCLUDED.flag_notes`,
        qparams
      );
      flagsWritten += batch.length;
      process.stdout.write(`\r  review flags: ${flagsWritten}/${flagRows.length}`);
    }
    console.log(`\n\nApplied ${updates.length} status update(s), ${flagsWritten} review-flag upserts.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
