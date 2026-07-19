#!/usr/bin/env node
/**
 * fix_brakes_taxonomy.mjs
 *
 * Brakes taxonomy rebuild — hybrid within-category rebuild + two bolted-on
 * migrations, per the scope locked with Laken (July 10, 2026 session).
 *
 * THREE ROW POPULATIONS:
 *   1. WITHIN:     catalog_unified WHERE display_category='Brakes' AND
 *                  display_subcategory IS NULL (526 rows) — must resolve,
 *                  falls back to Brake Hardware if genuinely unmatched.
 *   2. MIGRATE_FC: catalog_unified WHERE display_category='Foot Controls'
 *                  AND display_subcategory='Brake Pedals' (119 rows) —
 *                  wholesale move, no classify() needed, always ->
 *                  Brakes / Brake Pedals & Pads.
 *   3. MIGRATE_AM: catalog_unified WHERE display_category='Accessories & Misc'
 *                  AND name ~* brake-candidate filter — classify() decides;
 *                  NO fallback, unmatched rows are left alone and reported.
 *
 * Also applies the Rotors -> Rotors & Drums orphan merge (2 rows, within
 * Brakes, not gated by classify() — a straight rename).
 *
 * Usage:
 *   node scripts/ingest/fix_brakes_taxonomy.mjs              # dry run (default)
 *   node scripts/ingest/fix_brakes_taxonomy.mjs --apply      # commit
 *
 * Always run the regression harness first:
 *   node scripts/ingest/test_classify_brakes.mjs
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classify, isBrakeCandidate, SUBCATEGORIES } from './classify_brakes.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.local') });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

function section(title) {
  console.log('\n' + '='.repeat(100));
  console.log(title);
  console.log('='.repeat(100));
}

function sampleTable(rows, n = 15) {
  console.table(rows.slice(0, n).map(r => ({
    id: r.id,
    name: r.name.length > 70 ? r.name.slice(0, 67) + '...' : r.name,
    from: r._from || '',
    subcategory: r._newSubcat,
    reason: r._reason,
  })));
  if (rows.length > n) console.log(`  ... and ${rows.length - n} more`);
}

async function main() {
  console.log(`\nMODE: ${APPLY ? 'APPLY (writes will happen)' : 'DRY RUN (read-only, no writes)'}\n`);

  // ───────────────────────────────────────────────────────────────────────
  // POPULATION 1: WITHIN-BRAKES NULL rows
  // ───────────────────────────────────────────────────────────────────────
  section('POPULATION 1: WITHIN-BRAKES — NULL display_subcategory (must resolve)');

  const { rows: withinRows } = await pool.query(`
    SELECT id, name, source_vendor, category AS raw_category, subcategory AS raw_subcategory, brand
    FROM catalog_unified
    WHERE display_category = 'Brakes' AND is_active = true
      AND display_subcategory IS NULL
  `);

  console.log(`Fetched ${withinRows.length} rows (expected 526).`);

  const withinResults = withinRows.map(r => {
    const result = classify(
      { id: r.id, name: r.name, source_vendor: r.source_vendor, raw_category: r.raw_category, raw_subcategory: r.raw_subcategory },
      'within'
    );
    return { ...r, _newSubcat: result.subcategory, _reason: result.reason, _matched: result.matched };
  });

  const withinBySubcat = {};
  for (const r of withinResults) {
    withinBySubcat[r._newSubcat] = (withinBySubcat[r._newSubcat] || 0) + 1;
  }
  console.log('\nBreakdown by resulting subcategory:');
  console.table(Object.entries(withinBySubcat).map(([subcat, n]) => ({ subcategory: subcat, n })));

  const withinFallbacks = withinResults.filter(r => !r._matched);
  section(`POPULATION 1 — FALLBACKS (unmatched, forced to Brake Hardware): ${withinFallbacks.length} rows`);
  sampleTable(withinFallbacks, 30);

  // ───────────────────────────────────────────────────────────────────────
  // POPULATION 1b: Rotors -> Rotors & Drums orphan merge
  // ───────────────────────────────────────────────────────────────────────
  section('POPULATION 1b: Orphaned "Rotors" subcategory merge -> "Rotors & Drums"');

  const { rows: orphanRotors } = await pool.query(`
    SELECT id, name, display_subcategory
    FROM catalog_unified
    WHERE display_category = 'Brakes' AND is_active = true
      AND display_subcategory = 'Rotors'
  `);
  console.log(`Found ${orphanRotors.length} rows with display_subcategory = 'Rotors' (expected 2).`);
  console.table(orphanRotors);

  // ───────────────────────────────────────────────────────────────────────
  // POPULATION 2: Foot Controls -> Brakes / Brake Pedals & Pads (wholesale)
  // ───────────────────────────────────────────────────────────────────────
  section('POPULATION 2: MIGRATE Foot Controls "Brake Pedals" -> Brakes / Brake Pedals & Pads');

  const { rows: fcRows } = await pool.query(`
    SELECT id, name, source_vendor, display_subcategory
    FROM catalog_unified
    WHERE display_category = 'Foot Controls' AND is_active = true
      AND display_subcategory = 'Brake Pedals'
  `);
  console.log(`Fetched ${fcRows.length} rows (expected 119). Wholesale move, no classify() needed.`);
  sampleTable(fcRows.map(r => ({ ...r, _newSubcat: SUBCATEGORIES.PEDALS_PADS, _reason: 'WHOLESALE_SUBCAT_MOVE' })), 15);

  // ───────────────────────────────────────────────────────────────────────
  // POPULATION 3: Accessories & Misc sweep (name-matched, NO fallback)
  // ───────────────────────────────────────────────────────────────────────
  section('POPULATION 3: MIGRATE Accessories & Misc brake candidates (name-matched, no fallback)');

  const { rows: amRawRows } = await pool.query(`
    SELECT id, name, source_vendor, category AS raw_category, subcategory AS raw_subcategory, brand
    FROM catalog_unified
    WHERE display_category = 'Accessories & Misc' AND is_active = true
      AND name ~* '\\ybrake\\y'
  `);
  console.log(`Fetched ${amRawRows.length} raw brake-keyword rows from Accessories & Misc.`);

  const amCandidates = amRawRows.filter(r => isBrakeCandidate({ id: r.id, name: r.name }));
  console.log(`${amCandidates.length} pass isBrakeCandidate() pre-filter (excludes mount-hardware + manual-review ids).`);

  const amResults = amCandidates.map(r => {
    const result = classify({ id: r.id, name: r.name, source_vendor: r.source_vendor, raw_category: r.raw_category, raw_subcategory: r.raw_subcategory }, 'migration');
    return { ...r, _newSubcat: result.subcategory, _reason: result.reason, _matched: result.matched };
  });

  const amMatched = amResults.filter(r => r._matched);
  const amUnmatched = amResults.filter(r => !r._matched && r._reason === 'NO_MATCH_LEAVE_ALONE');
  const amExcluded = amRawRows.filter(r => !amCandidates.some(c => c.id === r.id));

  console.log(`\n  Matched (will move to Brakes):   ${amMatched.length}`);
  console.log(`  Unmatched (left in place):       ${amUnmatched.length}`);
  console.log(`  Excluded by pre-filter:          ${amExcluded.length}`);

  const amBySubcat = {};
  for (const r of amMatched) amBySubcat[r._newSubcat] = (amBySubcat[r._newSubcat] || 0) + 1;
  console.log('\nMatched rows by destination subcategory:');
  console.table(Object.entries(amBySubcat).map(([subcat, n]) => ({ subcategory: subcat, n })));

  section('POPULATION 3 — SAMPLE: matched rows (moving to Brakes)');
  sampleTable(amMatched, 40);

  section('POPULATION 3 — UNMATCHED (left in Accessories & Misc, for manual review)');
  sampleTable(amUnmatched, 40);

  section('POPULATION 3 — EXCLUDED by isBrakeCandidate() pre-filter (mount hardware / manual-review ids)');
  console.table(amExcluded.map(r => ({ id: r.id, name: r.name.length > 70 ? r.name.slice(0, 67) + '...' : r.name })));

  // ───────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ───────────────────────────────────────────────────────────────────────
  section('SUMMARY');
  const withinConfidentCount = withinResults.filter(r => r._matched).length;
  console.log(`Population 1 (Brakes NULL -> subcategory):        ${withinRows.length} rows total — ${withinConfidentCount} confident (WILL APPLY) / ${withinFallbacks.length} held back (WILL NOT APPLY, left NULL for manual review)`);
  console.log(`Population 1b (Rotors -> Rotors & Drums merge):    ${orphanRotors.length} rows`);
  console.log(`Population 2 (Foot Controls -> Brakes):            ${fcRows.length} rows, wholesale`);
  console.log(`Population 3 (Accessories & Misc -> Brakes):       ${amMatched.length} matched / ${amUnmatched.length} left in place / ${amExcluded.length} excluded`);
  console.log(`\nTOTAL ROWS TO BE WRITTEN IF APPLIED: ${withinConfidentCount + orphanRotors.length + fcRows.length + amMatched.length}`);
  console.log(`(${withinFallbacks.length} Population 1 rows deliberately excluded from this run — see BRAKES_SESSION_NOTES.md)`);

  if (DRY_RUN) {
    console.log('\n\n[DRY RUN] No writes performed. Review the samples above, especially:');
    console.log('  - Population 1 held-back rows (confirmed non-brake parts + ambiguous lever-sets — NOT applied this run)');
    console.log('  - Population 3 unmatched (anything that should have matched but didn\'t = a rule gap)');
    console.log('  - Population 3 excluded (confirm nothing legitimate got excluded)');
    console.log('\nRe-run with --apply once this output looks correct.');
    return;
  }

  // ───────────────────────────────────────────────────────────────────────
  // APPLY
  // ───────────────────────────────────────────────────────────────────────
  section('APPLYING CHANGES');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Population 1: within-Brakes subcategory assignment.
    // Only apply CONFIDENT matches. Fallback rows (~96, includes confirmed
    // non-brake parts per BRAKES_SESSION_NOTES.md #1) are deliberately left
    // untouched — still NULL — for a dedicated manual pass rather than
    // force-writing them into Brake Hardware and re-touching them later.
    const withinConfident = withinResults.filter(r => r._matched);
    const withinHeldBack = withinResults.filter(r => !r._matched);
    for (const r of withinConfident) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`,
        [r._newSubcat, r.id]
      );
    }
    console.log(`Applied Population 1: ${withinConfident.length} rows updated (confident matches only).`);
    console.log(`Held back Population 1: ${withinHeldBack.length} rows left NULL (fallback/ambiguous — see BRAKES_SESSION_NOTES.md).`);
    console.log(`  Held-back ids: ${withinHeldBack.map(r => r.id).join(', ')}`);

    // Population 1b: Rotors -> Rotors & Drums
    await client.query(
      `UPDATE catalog_unified SET display_subcategory = 'Rotors & Drums'
       WHERE display_category = 'Brakes' AND display_subcategory = 'Rotors'`
    );
    console.log(`Applied Population 1b: ${orphanRotors.length} rows merged.`);

    // Population 2: Foot Controls -> Brakes wholesale
    await client.query(
      `UPDATE catalog_unified
       SET display_category = 'Brakes', display_subcategory = $1
       WHERE display_category = 'Foot Controls' AND display_subcategory = 'Brake Pedals'`,
      [SUBCATEGORIES.PEDALS_PADS]
    );
    console.log(`Applied Population 2: ${fcRows.length} rows migrated.`);

    // Population 3: Accessories & Misc -> Brakes (matched only)
    for (const r of amMatched) {
      await client.query(
        `UPDATE catalog_unified SET display_category = 'Brakes', display_subcategory = $1 WHERE id = $2`,
        [r._newSubcat, r.id]
      );
    }
    console.log(`Applied Population 3: ${amMatched.length} rows migrated.`);

    await client.query('COMMIT');
    console.log('\n✅ COMMIT successful.');
    console.log('\nNEXT STEPS:');
    console.log('  1. node scripts/ingest/sync_fitment_flat_columns.mjs');
    console.log('  2. node scripts/ingest/index_unified.js --recreate');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ APPLY FAILED, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error('\n❌ Fatal:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
