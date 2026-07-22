/**
 * validate_oem_crossref_staging.mjs
 *
 * Checks-and-balances pass for scripts/ingest/*_staging_import*.mjs style
 * scripts that populate oem_crossref_staging. Never writes to
 * catalog_oem_crossref/catalog_fitment_v2 -- only annotates staging rows so
 * a human can review anything ambiguous before promote_oem_crossref_staging.mjs
 * runs. See OEM_FITMENT_DATA_MODEL.md for the staging-first policy.
 *
 * For every 'pending' row, checks:
 *   1. Exact duplicate      -- (sku, oem_number) already live in catalog_oem_crossref
 *                              -> status='duplicate' (auto-skip, no review needed)
 *   2. No product match     -- sku/vendor_sku doesn't resolve to any catalog_unified row
 *                              -> status='flagged', conflict_type='no_product_match'
 *   3. Different product    -- this oem_number already points (in catalog_oem_crossref
 *                              or oem_fitment) at a DIFFERENT product than this row resolves to
 *                              -> status='flagged', conflict_type='different_product'
 *   4. Otherwise            -- status='approved' (auto-approved; clean match, no conflict)
 *
 * Flagged rows also get a matching entry in catalog_review_flags so they show
 * up in /admin/review-queue?token=$ADMIN_SECRET alongside every other manual-
 * review bucket, instead of requiring a separate admin page.
 *
 * Usage:
 *   node scripts/ingest/validate_oem_crossref_staging.mjs                # dry run, reports only
 *   node scripts/ingest/validate_oem_crossref_staging.mjs --apply        # writes status updates
 *   node scripts/ingest/validate_oem_crossref_staging.mjs --batch=<name> # scope to one source_batch
 */
'use strict';

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const batchArg = process.argv.find((a) => a.startsWith('--batch='));
const BATCH = batchArg ? batchArg.split('=')[1] : null;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    const params = [];
    let batchFilter = '';
    if (BATCH) {
      params.push(BATCH);
      batchFilter = `AND source_batch = $${params.length}`;
    }

    const { rows: pending } = await client.query(
      `SELECT * FROM oem_crossref_staging WHERE status = 'pending' ${batchFilter} ORDER BY id`,
      params
    );

    console.log(`\nValidating ${pending.length} pending staging row(s)${BATCH ? ` (batch: ${BATCH})` : ''}${APPLY ? '' : '  [DRY RUN]'}\n`);

    const counts = { duplicate: 0, no_product_match: 0, different_product: 0, approved: 0 };
    const updates = [];

    for (const row of pending) {
      // 1. Exact duplicate already live?
      const dup = await client.query(
        `SELECT 1 FROM catalog_oem_crossref WHERE sku = $1 AND oem_number = $2 LIMIT 1`,
        [row.sku, row.oem_number]
      );
      if (dup.rowCount > 0) {
        counts.duplicate++;
        updates.push({ id: row.id, status: 'duplicate', conflict_type: null, conflict_notes: 'Already present in catalog_oem_crossref', matched_product_id: null });
        continue;
      }

      // Resolve product via the declared join key
      const keyColumn = row.sku_key_type === 'vendor_sku' ? 'vendor_sku' : 'sku';
      const productMatch = await client.query(
        `SELECT id FROM catalog_unified WHERE ${keyColumn} = $1 LIMIT 2`,
        [row.sku]
      );

      // 2. No product match at all
      if (productMatch.rowCount === 0) {
        counts.no_product_match++;
        updates.push({
          id: row.id, status: 'flagged', conflict_type: 'no_product_match',
          conflict_notes: `No catalog_unified row with ${keyColumn} = '${row.sku}'`, matched_product_id: null,
        });
        continue;
      }

      const matchedProductId = productMatch.rows[0].id;

      // 3. Does this oem_number already point at a DIFFERENT product?
      const conflicting = await client.query(
        `SELECT coc.product_id, cu.sku AS existing_sku
           FROM catalog_oem_crossref coc
           JOIN catalog_unified cu ON cu.id = coc.product_id
          WHERE coc.oem_number = $1 AND coc.product_id IS NOT NULL AND coc.product_id != $2
          UNION
         SELECT of.matched_product_id AS product_id, cu.sku AS existing_sku
           FROM oem_fitment of
           JOIN catalog_unified cu ON cu.id = of.matched_product_id
          WHERE of.oem_part_no = $1 AND of.matched_product_id IS NOT NULL AND of.matched_product_id != $2
          LIMIT 3`,
        [row.oem_number, matchedProductId]
      );

      if (conflicting.rowCount > 0) {
        counts.different_product++;
        const others = conflicting.rows.map((r) => r.existing_sku).join(', ');
        updates.push({
          id: row.id, status: 'flagged', conflict_type: 'different_product',
          conflict_notes: `OEM# ${row.oem_number} already linked to different product(s): ${others}`,
          matched_product_id: matchedProductId,
        });
        continue;
      }

      // 4. Clean -- auto-approve
      counts.approved++;
      updates.push({ id: row.id, status: 'approved', conflict_type: null, conflict_notes: null, matched_product_id: matchedProductId });
    }

    console.log('Results:');
    console.log(`  duplicate (auto-skip)      : ${counts.duplicate}`);
    console.log(`  no_product_match (flagged) : ${counts.no_product_match}`);
    console.log(`  different_product (flagged): ${counts.different_product}`);
    console.log(`  approved (clean)           : ${counts.approved}`);

    if (!APPLY) {
      console.log('\nDry run -- no writes made. Re-run with --apply to persist.\n');
      return;
    }

    await client.query('BEGIN');
    try {
      for (const u of updates) {
        await client.query(
          `UPDATE oem_crossref_staging
              SET status = $1, conflict_type = $2, conflict_notes = $3, matched_product_id = $4
            WHERE id = $5`,
          [u.status, u.conflict_type, u.conflict_notes, u.matched_product_id, u.id]
        );
        if (u.status === 'flagged' && u.matched_product_id) {
          await client.query(
            `INSERT INTO catalog_review_flags (product_id, flag_type, flag_notes)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, flag_type) DO UPDATE SET flag_notes = EXCLUDED.flag_notes`,
            [u.matched_product_id, u.conflict_type === 'different_product' ? 'oem_conflict' : 'oem_duplicate', u.conflict_notes]
          );
        }
      }
      await client.query('COMMIT');
      console.log(`\nApplied ${updates.length} status update(s).\n`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
