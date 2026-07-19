// fix_final_two.mjs
//
// Last two decisions in the taxonomy rebuild:
//   1. [77227] "1/8 inch NPT 90 Nipple" -- Laken's call: general hardware,
//      not a fuel/oil-specific fitting -> Hardware, Covers & General.
//   2. Chopper Supplies' 3 rows (all hose-forming/guide tools, not actual
//      chopper parts) -- Laken's call: move to Tools & Chemicals/Tools.
//      This leaves Chopper Supplies at 0 rows.
//
// Usage:
//   node fix_final_two.mjs           (dry run, no writes)
//   node fix_final_two.mjs --apply   (applies the updates)

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.CATALOG_DATABASE_URL;
if (!connectionString) {
  console.error('CATALOG_DATABASE_URL not set');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString });

const MOVES = {
  77227: { category: 'Hardware, Covers & General', subcategory: 'Bolt Caps, Plugs, Shrink Tubes, Cable Ties, Wire Wraps' },
  77201: { category: 'Tools & Chemicals', subcategory: 'Tools' },
  77200: { category: 'Tools & Chemicals', subcategory: 'Tools' },
  77039: { category: 'Tools & Chemicals', subcategory: 'Tools' },
};

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? '=== APPLYING ===\n' : '=== DRY RUN (no writes) ===\n');
    let applied = 0;

    for (const [idStr, dest] of Object.entries(MOVES)) {
      const id = Number(idStr);
      const curRes = await client.query(
        `SELECT id, name, display_category, display_subcategory FROM catalog_unified WHERE id = $1`,
        [id]
      );
      if (curRes.rows.length === 0) {
        console.log(`  [${id}] NOT FOUND -- skipping`);
        continue;
      }
      const cur = curRes.rows[0];
      console.log(`  [${id}] ${cur.name} | ${cur.display_category}/${cur.display_subcategory ?? 'NULL'} -> ${dest.category}/${dest.subcategory}`);
      if (APPLY) {
        const res = await client.query(
          `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = $3`,
          [dest.category, dest.subcategory, id]
        );
        if (res.rowCount === 1) applied++;
      }
    }

    if (APPLY) {
      const checkRes = await client.query(`
        SELECT COUNT(*)::int AS n FROM catalog_unified WHERE display_category = 'Chopper Supplies' AND is_active = true
      `);
      console.log(`\nChopper Supplies row count after move: ${checkRes.rows[0].n} (should be 0)`);
    }

    console.log('\n=== Summary ===');
    console.log(`Total candidates: ${Object.keys(MOVES).length}`);
    if (APPLY) {
      console.log(`Applied: ${applied}`);
      console.log('\nRemember: Typesense re-sync/reindex still needed after this.');
    } else {
      console.log('\nDry run only -- no writes made. Re-run with --apply to write changes.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
