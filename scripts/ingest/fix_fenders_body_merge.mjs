// fix_fenders_body_merge.mjs
// Merges the last 26 active Fenders & Body rows into Tanks & Body,
// consolidating both existing FB subcats (Gas Caps & Petcocks, Gas Tanks)
// into Tanks & Body's existing "Gas Tanks & Gas Caps" subcat.
// Plain category-only move -- no deactivation, no dedup (Laken's call:
// leave the 2 internal PU near-duplicate pairs as-is for now).
//
// Dry run (default): node fix_fenders_body_merge.mjs
// Apply:              node fix_fenders_body_merge.mjs --apply

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const { rows: before } = await client.query(`
      SELECT id, sku, display_subcategory, name
      FROM catalog_unified
      WHERE display_category = 'Fenders & Body' AND is_active = true
      ORDER BY display_subcategory, name
    `);

    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    console.log(`Found ${before.length} active Fenders & Body rows to move.\n`);

    const bySubcat = {};
    for (const r of before) {
      bySubcat[r.display_subcategory] = (bySubcat[r.display_subcategory] || 0) + 1;
    }
    console.log('Breakdown by current subcategory:');
    for (const [k, v] of Object.entries(bySubcat)) {
      console.log(`  ${k}: ${v}`);
    }

    if (before.length !== 26) {
      console.log(`\n*** WARNING: expected 26 rows based on last audit, found ${before.length}. Re-check before applying. ***`);
    }

    if (!APPLY) {
      console.log('\nDRY RUN ONLY -- no rows updated. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE catalog_unified
      SET display_category = 'Tanks & Body',
          display_subcategory = 'Gas Tanks & Gas Caps'
      WHERE display_category = 'Fenders & Body' AND is_active = true
    `);
    await client.query('COMMIT');

    console.log(`\nAPPLIED: ${result.rowCount} rows moved to Tanks & Body / Gas Tanks & Gas Caps.`);

    const { rows: remaining } = await client.query(`
      SELECT count(*) FROM catalog_unified WHERE display_category = 'Fenders & Body' AND is_active = true
    `);
    console.log(`Fenders & Body active rows remaining: ${remaining[0].count} (should be 0 -- category now retired).`);
    console.log('\nNext: run sync_fitment_flat_columns.mjs then index_unified.js --recreate.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('SCRIPT FAILED:', err);
  process.exit(1);
});
