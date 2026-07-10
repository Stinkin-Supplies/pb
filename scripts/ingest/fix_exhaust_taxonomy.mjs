#!/usr/bin/env node
/**
 * fix_exhaust_taxonomy.mjs
 *
 * Full taxonomy pass for display_category = 'Exhaust'. Keeps the four
 * existing subcategories (Exhaust Systems, Headers & Pipes, Mufflers,
 * Exhaust Parts) rather than rebuilding from scratch — confirmed via audit
 * that this skeleton is reasonably sound, it just has the same "legacy
 * ALL-CAPS names never classified" gap we found in Seating and Luggage &
 * Racks, plus zero Detail population on the huge Exhaust Parts bucket.
 *
 * Does three things:
 *   1. Fills blank display_subcategory using vocabulary already proven by
 *      the correctly-tagged Title Case half of this same brand/catalog.
 *   2. Populates display_subcategory_detail for Exhaust Parts (100% blank
 *      today) with real categories: Heat Shields, Baffles, O2 Sensors &
 *      Bungs, Clamps & Brackets, Wrap & Packing, Gaskets & Seals, Studs &
 *      Hardware, End Caps & Tips.
 *   3. Flags engine valve/valve-seat components (Kibblewhite, KPMI,
 *      Motorshop) that are miscategorized at the CATEGORY level — "exhaust
 *      valve" here means a cylinder-head poppet valve, not the pipe system.
 *      Flagged only, never auto-moved (category-level change).
 *
 * Usage:
 *   node scripts/ingest/fix_exhaust_taxonomy.mjs            # dry run
 *   node scripts/ingest/fix_exhaust_taxonomy.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Engine valve components mistakenly under Exhaust — "exhaust valve"/"valve
// seat" here is cylinder-head terminology, unrelated to the pipe system.
// Flagged only, needs manual category move to Engine. Not brand-restricted —
// found on Ultima too, not just Kibblewhite/KPMI/Motorshop.
const ENGINE_VALVE_PATTERN = /valve\s*seat|exhaust\s*(conversion\s*)?valve|intake\/exhaust.*valve/i;

// Handlebar grip products mistakenly under Exhaust — matched on "end cap"
// (grips have end caps too) during initial testing. Flagged only, needs
// manual category move to Handlebar & Controls > Grips.
const GRIP_PATTERN = /\bgrip\b/i;

// Brake-linkage tool mistakenly under Exhaust — matched on "crossover"
// (crossover exhaust pipes), but this is brake-shaft hardware. Flagged only.
const BRAKE_TOOL_PATTERN = /brake\s*shaft/i;

// ---------------------------------------------------------------------------
// Subcategory rules — first match wins. Only applied when display_subcategory
// is currently blank; existing correctly-tagged rows are left untouched
// (except for Detail population, handled separately below).
// ---------------------------------------------------------------------------
const SUBCATEGORY_RULES = [
  { test: /true\s*dual/i, sub: 'Exhaust Systems', detail: 'True Dual Systems' },
  { test: /2[\s:-]?(in|into)?[\s:-]?1|2IN1/i, sub: 'Exhaust Systems', detail: '2-into-1 Systems' },
  { test: /full\s*length|mid\s*length|\bshorty\b|intmdtr/i, sub: 'Exhaust Systems' },
  { test: /pro\s*chamber|\bh\/p\b/i, sub: 'Headers & Pipes' },
  { test: /header|drag\s*pipe|head\s*pipe|headpipe|extension|connector|upsweep|megaphone|trumpet|\btube\b/i, sub: 'Headers & Pipes' },
  { test: /slip-?on|muffler|silencer|tail\s*set|straight\s*tail/i, sub: 'Mufflers' },
  { test: /exhaust\s*system|dual\s*exhaust|el\s*diablo|speedster|radial\s*sweepers?|pro\s*street|road\s*rage|big\s*radius|big\s*shots|shortshots|dominator|outlaw|icon-sr|qualifier|sidewinder|assault|big\s*sexy|nasty\s*bastard|dragster/i, sub: 'Exhaust Systems' },
  { test: /heat\s*shield|split\s*sleeve|exhaust\s*sleeve|flexible.*cover|exhaust\s*cover/i, sub: 'Exhaust Parts', detail: 'Heat Shields' },
  { test: /baffle/i, sub: 'Exhaust Parts', detail: 'Baffles' },
  { test: /\bo2\b|oxygen sensor/i, sub: 'Exhaust Parts', detail: 'O2 Sensors & Bungs' },
  { test: /clamp|bracket/i, sub: 'Exhaust Parts', detail: 'Clamps & Brackets' },
  { test: /wrap|packing|repack|patch(es)?|locking\s*tie(s)?/i, sub: 'Exhaust Parts', detail: 'Wrap & Packing' },
  { test: /gasket|\bseal(s)?\b|retain(ing|er)\s*ring/i, sub: 'Exhaust Parts', detail: 'Gaskets & Seals' },
  { test: /stud|\bbolt(s)?\b|\bnut(s)?\b|flange/i, sub: 'Exhaust Parts', detail: 'Studs & Hardware' },
  { test: /\bmount\b|\btab\b|stabilizer|\bspring\b/i, sub: 'Exhaust Parts', detail: 'Clamps & Brackets' },
  { test: /end\s*cap|\btip(s)?\b/i, sub: 'Exhaust Parts', detail: 'End Caps & Tips' },
  { test: /pipe/i, sub: 'Headers & Pipes' },
];

// ---------------------------------------------------------------------------
// Detail rules for Exhaust Parts — applied to EVERY Exhaust Parts row
// (both newly-assigned and already-tagged) since Detail is 100% blank today
// regardless of how the subcategory itself was set.
// ---------------------------------------------------------------------------
const EXHAUST_PARTS_DETAIL_RULES = [
  { test: /heat\s*shield/i, detail: 'Heat Shields' },
  { test: /baffle/i, detail: 'Baffles' },
  { test: /\bo2\b|oxygen sensor/i, detail: 'O2 Sensors & Bungs' },
  { test: /clamp|bracket/i, detail: 'Clamps & Brackets' },
  { test: /wrap|packing|repack/i, detail: 'Wrap & Packing' },
  { test: /gasket|\bseal(s)?\b|retain(ing|er)\s*ring/i, detail: 'Gaskets & Seals' },
  { test: /stud|\bbolt(s)?\b|\bnut(s)?\b|flange/i, detail: 'Studs & Hardware' },
  { test: /end\s*cap|\btip(s)?\b/i, detail: 'End Caps & Tips' },
];

async function main() {
  const client = await pool.connect();
  try {
    const { rows: allRows } = await client.query(`
      SELECT id, brand, name, display_subcategory, display_subcategory_detail
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Exhaust'
    `);

    console.log(`Total rows in Exhaust: ${allRows.length}`);

    const engineValveFlags = allRows.filter(r => ENGINE_VALVE_PATTERN.test(r.name));
    const gripFlags = allRows.filter(r => GRIP_PATTERN.test(r.name));
    const brakeToolFlags = allRows.filter(r => BRAKE_TOOL_PATTERN.test(r.name));
    const flaggedIds = new Set([...engineValveFlags, ...gripFlags, ...brakeToolFlags].map(r => r.id));

    console.log(`\nEngine valve components flagged (miscategorized at CATEGORY level, NOT moved): ${engineValveFlags.length}`);
    engineValveFlags.slice(0, 15).forEach(f => console.log(`  [${f.brand}] ${f.name}  -- needs manual move to Engine`));

    console.log(`\nHandlebar grip products flagged (miscategorized at CATEGORY level, NOT moved): ${gripFlags.length}`);
    gripFlags.forEach(f => console.log(`  [${f.brand}] ${f.name}  -- needs manual move to Handlebar & Controls > Grips`));

    console.log(`\nBrake tool products flagged (miscategorized at CATEGORY level, NOT moved): ${brakeToolFlags.length}`);
    brakeToolFlags.forEach(f => console.log(`  [${f.brand}] ${f.name}  -- needs manual move to Brakes or Tools & Chemicals`));

    const subUpdates = [];
    const detailUpdates = [];
    const unmatchedBlank = [];

    for (const row of allRows) {
      if (flaggedIds.has(row.id)) continue;

      let newSub = row.display_subcategory;
      let newDetail = row.display_subcategory_detail;

      // Fill blank subcategory
      if (!row.display_subcategory) {
        let matched = false;
        for (const rule of SUBCATEGORY_RULES) {
          if (rule.test.test(row.name)) {
            newSub = rule.sub;
            if (rule.detail) newDetail = rule.detail;
            matched = true;
            break;
          }
        }
        if (!matched) {
          unmatchedBlank.push(row);
          continue;
        }
        subUpdates.push({ id: row.id, brand: row.brand, name: row.name, newSub, newDetail: newDetail || null });
      }

      // Populate Detail for Exhaust Parts rows (whether just assigned or already tagged)
      if (newSub === 'Exhaust Parts' && !newDetail) {
        for (const rule of EXHAUST_PARTS_DETAIL_RULES) {
          if (rule.test.test(row.name)) {
            newDetail = rule.detail;
            break;
          }
        }
        if (newDetail && newDetail !== row.display_subcategory_detail) {
          detailUpdates.push({ id: row.id, brand: row.brand, name: row.name, detail: newDetail });
        }
      }
    }

    console.log(`\nBlank-subcategory rows resolved: ${subUpdates.length}`);
    const bySub = {};
    for (const u of subUpdates) bySub[u.newSub] = (bySub[u.newSub] || 0) + 1;
    Object.entries(bySub).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${n.toString().padStart(5)}  ${k}`));

    console.log(`\nExhaust Parts Detail assignments (new): ${detailUpdates.length}`);
    const byDetail = {};
    for (const u of detailUpdates) byDetail[u.detail] = (byDetail[u.detail] || 0) + 1;
    Object.entries(byDetail).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${n.toString().padStart(5)}  ${k}`));

    console.log(`\nBlank subcategory, no rule matched (left untouched): ${unmatchedBlank.length}`);
    unmatchedBlank.slice(0, 30).forEach(u => console.log(`  [${u.brand}] ${u.name}`));

    console.log(`\nSample of subcategory resolutions (first 20):`);
    subUpdates.slice(0, 20).forEach(u => console.log(`  [${u.brand}] "${u.name}" -> ${u.newSub}${u.newDetail ? ' / ' + u.newDetail : ''}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    console.log(`\nApplying ${subUpdates.length} subcategory updates + ${detailUpdates.length} detail updates...`);
    await client.query('BEGIN');
    let done = 0;
    for (const u of subUpdates) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = $2 WHERE id = $3`,
        [u.newSub, u.newDetail, u.id]
      );
      done++;
      if (done % 300 === 0) console.log(`  ${done}/${subUpdates.length + detailUpdates.length}`);
    }
    for (const u of detailUpdates) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory_detail = $1 WHERE id = $2`,
        [u.detail, u.id]
      );
      done++;
      if (done % 300 === 0) console.log(`  ${done}/${subUpdates.length + detailUpdates.length}`);
    }
    await client.query('COMMIT');
    console.log(`Done. ${done} rows updated.`);
    console.log(`\nNOTE: ${engineValveFlags.length} engine valve component(s), ${gripFlags.length} grip product(s), and ${brakeToolFlags.length} brake tool(s) were flagged above but NOT moved —`);
    console.log('  those need a manual display_category change, not a subcategory move within Exhaust.');
    console.log('\nNEXT STEPS:');
    console.log('  1. node scripts/ingest/sync_fitment_flat_columns.mjs');
    console.log('  2. node scripts/ingest/index_unified.js --recreate');
    console.log('  3. Spot-check /browse?display_category=Exhaust');
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK');
    console.error('ERROR:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
