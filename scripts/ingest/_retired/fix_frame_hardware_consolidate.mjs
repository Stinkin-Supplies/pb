// fix_frame_hardware_consolidate.mjs
// Retires Frame & Hardware by moving each subcategory to its real home:
//   Hardware & Fasteners (1896) -> Hardware, Covers & General / Bolt Kits, Hardware Assortments & Replenishment
//   Frame Parts (166)           -> Frames & Suspension / Frame
//   Body Panels (46)            -> Tanks & Body (subcat left NULL, needs a follow-up pick)
//   Protection (40)             -> Foot Controls / Highway Bars & Pegs
//   Kickstands (4)              -> Foot Controls / Kickstands
//   NULL (2, filler hose)       -> left untouched, Laken's earlier call to skip
//
// Dry run (default): node fix_frame_hardware_consolidate.mjs
// Apply:              node fix_frame_hardware_consolidate.mjs --apply

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const MOVES = [
  {
    label: 'Hardware & Fasteners -> Hardware, Covers & General / Bolt Kits, Hardware Assortments & Replenishment',
    subcat: 'Hardware & Fasteners',
    destCategory: 'Hardware, Covers & General',
    destSubcat: 'Bolt Kits, Hardware Assortments & Replenishment',
    expected: 1896,
  },
  {
    label: 'Frame Parts -> Frames & Suspension / Frame',
    subcat: 'Frame Parts',
    destCategory: 'Frames & Suspension',
    destSubcat: 'Frame',
    expected: 166,
  },
  {
    label: 'Body Panels -> Tanks & Body (subcat left NULL, needs follow-up)',
    subcat: 'Body Panels',
    destCategory: 'Tanks & Body',
    destSubcat: null,
    expected: 46,
  },
  {
    label: 'Protection -> Foot Controls / Highway Bars & Pegs',
    subcat: 'Protection',
    destCategory: 'Foot Controls',
    destSubcat: 'Highway Bars & Pegs',
    expected: 40,
  },
  {
    label: 'Kickstands -> Foot Controls / Kickstands',
    subcat: 'Kickstands',
    destCategory: 'Foot Controls',
    destSubcat: 'Kickstands',
    expected: 4,
  },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

    const { rows: pre } = await client.query(`
      SELECT count(*) FROM catalog_unified WHERE display_category = 'Frame & Hardware' AND is_active = true
    `);
    console.log(`Frame & Hardware active rows before: ${pre[0].count} (expect 2154)\n`);

    if (!APPLY) {
      for (const move of MOVES) {
        const { rows } = await client.query(`
          SELECT count(*) FROM catalog_unified
          WHERE display_category = 'Frame & Hardware' AND is_active = true AND display_subcategory = $1
        `, [move.subcat]);
        console.log(`${move.label}: ${rows[0].count} rows (dry run, expected ${move.expected})`);
      }
      console.log('\n2 NULL-subcategory rows (filler hose) intentionally left untouched.');
      console.log('\nDRY RUN ONLY -- no rows updated. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    let total = 0;
    for (const move of MOVES) {
      const result = await client.query(`
        UPDATE catalog_unified
        SET display_category = $1, display_subcategory = $2
        WHERE display_category = 'Frame & Hardware' AND is_active = true AND display_subcategory = $3
      `, [move.destCategory, move.destSubcat, move.subcat]);
      console.log(`${move.label}: ${result.rowCount} rows`);
      total += result.rowCount;
    }
    await client.query('COMMIT');

    console.log(`\nAPPLIED: ${total} rows moved total (expect 2152; 2 filler-hose NULL rows left in Frame & Hardware).`);

    const { rows: remaining } = await client.query(`
      SELECT count(*) FROM catalog_unified WHERE display_category = 'Frame & Hardware' AND is_active = true
    `);
    console.log(`Frame & Hardware active rows remaining: ${remaining[0].count} (should be 2 -- the intentionally-skipped filler-hose rows).`);

    console.log('\n=== Tanks & Body subcats (for the 46 Body Panels rows left NULL) ===');
    const { rows: tbSubcats } = await client.query(`
      SELECT display_subcategory, count(*) FROM catalog_unified
      WHERE display_category = 'Tanks & Body' AND is_active = true
      GROUP BY display_subcategory ORDER BY count(*) DESC
    `);
    for (const r of tbSubcats) console.log(`  ${r.display_subcategory ?? 'NULL'}: ${r.count}`);

    console.log('\nNext: assign a real subcat to the 46 Body Panels rows above, then run sync_fitment_flat_columns.mjs + index_unified.js --recreate.');
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
