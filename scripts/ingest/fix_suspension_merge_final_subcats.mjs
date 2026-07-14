// fix_suspension_merge_final_subcats.mjs
// Assigns real subcats to the 7 rows left NULL by fix_suspension_frames_merge.mjs:
//   6 cush-drive rows (now in Transmission & Clutch) -> Transmission Parts
//   1 turn-signal row (now in Lighting)               -> Turn Signals
//
// Dry run (default): node fix_suspension_merge_final_subcats.mjs
// Apply:              node fix_suspension_merge_final_subcats.mjs --apply

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const CUSH_DRIVE_IDS = [94489, 95085, 94929, 94962, 89252, 89431];
const TURN_SIGNAL_ID = [3894];

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

    const { rows: check } = await client.query(`
      SELECT id, name, display_category, display_subcategory
      FROM catalog_unified
      WHERE id = ANY($1::int[])
      ORDER BY id
    `, [[...CUSH_DRIVE_IDS, ...TURN_SIGNAL_ID]]);

    console.log('Current state of the 7 target rows:');
    for (const r of check) {
      console.log(`  [${r.id}] ${r.name} | ${r.display_category} / ${r.display_subcategory ?? 'NULL'}`);
    }

    if (!APPLY) {
      console.log('\nDRY RUN ONLY -- no rows updated. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');

    const cush = await client.query(`
      UPDATE catalog_unified SET display_subcategory = 'Transmission Parts'
      WHERE id = ANY($1::int[]) AND display_category = 'Transmission & Clutch' AND is_active = true
    `, [CUSH_DRIVE_IDS]);
    console.log(`\nCush drive -> Transmission Parts: ${cush.rowCount} rows`);

    const turn = await client.query(`
      UPDATE catalog_unified SET display_subcategory = 'Turn Signals'
      WHERE id = ANY($1::int[]) AND display_category = 'Lighting' AND is_active = true
    `, [TURN_SIGNAL_ID]);
    console.log(`Turn signal -> Turn Signals: ${turn.rowCount} rows`);

    await client.query('COMMIT');
    console.log('\nAPPLIED. Next: sync_fitment_flat_columns.mjs then index_unified.js --recreate.');
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
