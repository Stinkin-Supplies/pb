/**
 * promote_oem_crossref_staging.mjs
 *
 * Moves 'approved' rows from oem_crossref_staging into the live
 * catalog_oem_crossref table. Only rows a human (or the auto-approve path in
 * validate_oem_crossref_staging.mjs) marked 'approved' get promoted --
 * 'flagged'/'pending'/'rejected' rows are left in staging untouched.
 *
 * Confidence is not stored on catalog_oem_crossref itself (that table has no
 * confidence column -- confidence lives downstream on catalog_fitment_v2 rows
 * once promote_oem_fitment.mjs runs). This script only establishes the
 * OEM# <-> product crossref link; a separate fitment-promotion pass (existing
 * promote_oem_fitment.mjs) is what turns that into confidence-scored
 * catalog_fitment_v2 rows. See OEM_FITMENT_DATA_MODEL.md.
 *
 * Usage:
 *   node scripts/ingest/promote_oem_crossref_staging.mjs                # dry run
 *   node scripts/ingest/promote_oem_crossref_staging.mjs --apply        # writes
 *   node scripts/ingest/promote_oem_crossref_staging.mjs --batch=<name> # scope to one batch
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

    const { rows: approved } = await client.query(
      `SELECT * FROM oem_crossref_staging WHERE status = 'approved' ${batchFilter} ORDER BY id`,
      params
    );

    console.log(`\nPromoting ${approved.length} approved staging row(s)${BATCH ? ` (batch: ${BATCH})` : ''}${APPLY ? '' : '  [DRY RUN]'}\n`);

    if (!APPLY) {
      for (const r of approved.slice(0, 20)) {
        console.log(`  ${r.sku}  ${r.oem_number}  (${r.source})`);
      }
      if (approved.length > 20) console.log(`  ... and ${approved.length - 20} more`);
      console.log('\nDry run -- no writes made. Re-run with --apply to persist.\n');
      return;
    }

    await client.query('BEGIN');
    let inserted = 0;
    try {
      for (const r of approved) {
        await client.query('SAVEPOINT row_sp');
        try {
          // Note: catalog_oem_crossref.oem_format is a GENERATED ALWAYS column
          // (derived from oem_number) -- never insert into it directly.
          const result = await client.query(
            `INSERT INTO catalog_oem_crossref
               (sku, oem_number, oem_manufacturer, source, source_file, page_reference, product_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (sku, oem_number) DO NOTHING`,
            [r.sku, r.oem_number, r.oem_manufacturer, r.source, r.source_file, r.page_reference, r.matched_product_id]
          );
          if (result.rowCount > 0) inserted++;
          await client.query(
            `UPDATE oem_crossref_staging SET status = 'promoted', promoted_at = now() WHERE id = $1`,
            [r.id]
          );
          await client.query('RELEASE SAVEPOINT row_sp');
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT row_sp');
          console.error(`  Row ${r.id} (${r.sku}/${r.oem_number}) failed: ${err.message}`);
        }
      }
      await client.query('COMMIT');
      console.log(`\nPromoted ${inserted} row(s) into catalog_oem_crossref.`);
      console.log(`Next: run scripts/ingest/_retired/promote_oem_fitment.mjs (or its successor) to`);
      console.log(`derive catalog_fitment_v2 rows from these new crossref links, per the confidence`);
      console.log(`tiers documented in OEM_FITMENT_DATA_MODEL.md.\n`);
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
