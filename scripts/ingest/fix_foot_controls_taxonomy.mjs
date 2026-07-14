// fix_foot_controls_taxonomy.mjs
// Foot Controls — REBUILD IN PLACE via subcategory RENAME/CONSOLIDATION.
//
// CRITICAL DIFFERENCE from every other rebuild this session: Foot Controls
// is NOT a messy category needing from-scratch keyword classification. The
// audit confirmed it already has 8 clean, sensible existing subcategories
// (Footpegs 878, Shifters 681, Floorboards 508, Kickstands 278, Highway
// Bars & Pegs 147, Forward Controls 123, Rearsets & Mid Controls 92, null
// 467). This script RENAMES/CONSOLIDATES those existing subcategory VALUES
// into Laken's 4 target names — it does NOT re-parse product names with
// keyword regexes the way Dashes & Gauges / Frames & Suspension / Cables did.
//
// Mapping (Laken's decisions):
//   "Forward Controls"          -> "Forward Controls & HW"
//   "Rearsets & Mid Controls"   -> "Mid-Controls"
//   "Floorboards"               -> "Floorboards & HW"
//   "Footpegs"                  -> "Footpegs, Shift Pegs, & HW"
//   "Shifters"                  -> "Footpegs, Shift Pegs, & HW"  (folded in, per Laken's call)
//
// NOT mapped — left untouched, flagged for later per Laken's call:
//   "Kickstands"          — stays as "Kickstands", unchanged
//   "Highway Bars & Pegs" — stays as "Highway Bars & Pegs", unchanged
//   NULL subcategory (467 rows) — needs its own classification pass, not
//     covered by a simple rename; left as NULL for now rather than guessed
//
// DEFAULT MODE = DRY RUN. No writes happen unless --apply is passed.
//
// Run:
//   node fix_foot_controls_taxonomy.mjs                 (dry run, default)
//   node fix_foot_controls_taxonomy.mjs --apply          (live writes)
//   node fix_foot_controls_taxonomy.mjs --sample=50       (dry run, bigger sample)

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const db = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const sampleArg = args.find((a) => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : 20;

// Direct rename/consolidation map — keyed by CURRENT display_subcategory value.
const RENAME_MAP = {
  'Forward Controls': 'Forward Controls & HW',
  'Rearsets & Mid Controls': 'Mid-Controls',
  'Floorboards': 'Floorboards & HW',
  'Footpegs': 'Footpegs, Shift Pegs, & HW',
  'Shifters': 'Footpegs, Shift Pegs, & HW',
};

// Explicitly NOT renamed — held back per Laken's call, listed here for
// clarity so it's obvious these are a deliberate exclusion, not an oversight.
const HELD_BACK_UNCHANGED = ['Kickstands', 'Highway Bars & Pegs'];

async function main() {
  console.log(`=== FOOT CONTROLS — SUBCATEGORY RENAME (${APPLY ? 'LIVE APPLY' : 'DRY RUN'}) ===`);
  console.log(new Date().toISOString());
  console.log('');

  const { rows } = await db.query(`
    SELECT id, source_vendor, name, display_subcategory
    FROM catalog_unified
    WHERE display_category = 'Foot Controls'
      AND is_active = true
  `);

  console.log(`Total Foot Controls rows (active): ${rows.length}`);
  console.log('');

  const results = {}; // new subcat name -> rows[]
  const heldBack = {}; // old subcat name -> rows[] (unchanged, per Laken's call)
  const nullSubcat = []; // rows with no subcategory at all — needs separate classification pass

  for (const row of rows) {
    const oldSub = row.display_subcategory;
    if (oldSub === null) {
      nullSubcat.push(row);
      continue;
    }
    if (RENAME_MAP[oldSub]) {
      const newSub = RENAME_MAP[oldSub];
      results[newSub] = results[newSub] || [];
      results[newSub].push(row);
      continue;
    }
    if (HELD_BACK_UNCHANGED.includes(oldSub)) {
      heldBack[oldSub] = heldBack[oldSub] || [];
      heldBack[oldSub].push(row);
      continue;
    }
    // Any subcategory value not in RENAME_MAP or HELD_BACK_UNCHANGED is
    // unexpected — surface it rather than silently dropping it.
    heldBack[`UNEXPECTED: ${oldSub}`] = heldBack[`UNEXPECTED: ${oldSub}`] || [];
    heldBack[`UNEXPECTED: ${oldSub}`].push(row);
  }

  console.log('--- Rename/consolidation summary ---');
  let totalRenamed = 0;
  for (const [newSub, rowList] of Object.entries(results)) {
    // Show which old subcategories fed this new one, and counts
    const bySource = {};
    for (const r of rowList) {
      bySource[r.display_subcategory] = (bySource[r.display_subcategory] || 0) + 1;
    }
    const sourceBreakdown = Object.entries(bySource).map(([k, v]) => `${k}: ${v}`).join(', ');
    console.log(`  ${newSub}: ${rowList.length} total (from: ${sourceBreakdown})`);
    totalRenamed += rowList.length;
  }
  console.log('');
  console.log('--- Held back, unchanged (per Laken\'s call) ---');
  let totalHeldBack = 0;
  for (const [oldSub, rowList] of Object.entries(heldBack)) {
    console.log(`  ${oldSub}: ${rowList.length} (stays as-is)`);
    totalHeldBack += rowList.length;
  }
  console.log('');
  console.log(`  NULL subcategory (needs separate classification pass, not touched by this script): ${nullSubcat.length}`);
  console.log('');
  console.log(`  Total: ${rows.length} | Renamed: ${totalRenamed} | Held back unchanged: ${totalHeldBack} | NULL untouched: ${nullSubcat.length}`);
  console.log('');

  console.log(`--- Sample rows per new subcategory (first ${SAMPLE_SIZE}) ---`);
  for (const [newSub, rowList] of Object.entries(results)) {
    console.log(`\n  [${newSub}] (${rowList.length} total)`);
    rowList.slice(0, SAMPLE_SIZE).forEach((r) => {
      console.log(`    ${r.source_vendor} | ${r.name} | was: ${r.display_subcategory}`);
    });
  }

  if (nullSubcat.length > 0) {
    console.log(`\n  [NULL SUBCATEGORY — untouched, sample] (${nullSubcat.length} total, first ${SAMPLE_SIZE})`);
    nullSubcat.slice(0, SAMPLE_SIZE).forEach((r) => {
      console.log(`    ${r.source_vendor} | ${r.name}`);
    });
  }

  console.log('');

  if (!APPLY) {
    console.log('=== DRY RUN COMPLETE — no writes performed. Review samples above, then re-run with --apply. ===');
    return;
  }

  console.log('=== APPLYING CHANGES ===');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let updatedCount = 0;
    for (const [newSub, rowList] of Object.entries(results)) {
      const ids = rowList.map((r) => r.id);
      const res = await client.query(
        `UPDATE catalog_unified
         SET display_subcategory = $1
         WHERE id = ANY($2::int[])`,
        [newSub, ids]
      );
      console.log(`  Updated ${res.rowCount} rows -> Foot Controls / ${newSub}`);
      updatedCount += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`\n=== APPLY COMPLETE — ${updatedCount} rows renamed. Kickstands/Highway Bars & Pegs (${totalHeldBack}) and NULL subcategory (${nullSubcat.length}) left untouched. ===`);
    console.log('Next: re-sync / reindex Typesense per standing pipeline.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('APPLY FAILED, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('SCRIPT FAILED:', err);
    return db.end().finally(() => process.exit(1));
  });
