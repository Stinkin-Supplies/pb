#!/usr/bin/env node
/**
 * rebuild_luggage_taxonomy.mjs
 *
 * Rebuilds "Luggage & Racks" -> "Saddlebags, Sissy Bars & Luggage" per
 * Laken's session-89 spec:
 *   Sissy Bars, Sideplates & Hardware / Sissy Bar Pads & Bags /
 *   Saddlebags, Lids & Covers / Saddlebag Latches, Mounts & Hardware /
 *   Saddle Bag Accessories / Tour Pak & Accessories / Luggage Racks / General
 *
 * Cross-category moves confirmed with Laken:
 *   - Handlebar Bags (36) + Tool Bags & Pouches (24) -> Windshields &
 *     Fairings > Trim, Windshield Bag & Accessories (same product family
 *     as the windshield/fairing pouches already there).
 *   - Docking hardware (18) -> Saddlebag Latches, Mounts & Hardware
 *     (docking points are how saddlebags/racks attach/detach).
 *   - A handful of GIVI "Rack"-named rows sitting in the old Saddlebags
 *     bucket move to Luggage Racks (they're racks, not bags).
 *   - 4 "Stash Tube" rows (Biltwell x3, HardDrive x1) sitting in old
 *     General Accessories move to Handlebars & Hand Controls > General &
 *     Accessories -- stash tubes install in the handlebar end, they're a
 *     handlebar accessory, not a luggage one.
 *
 * Usage:
 *   node scripts/ingest/rebuild_luggage_taxonomy.mjs            # dry run
 *   node scripts/ingest/rebuild_luggage_taxonomy.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const OLD_CATEGORY = 'Luggage & Racks';
const NEW_CATEGORY = 'Saddlebags, Sissy Bars & Luggage';
const WINDSHIELD_CATEGORY = 'Windshields & Fairings';
const WINDSHIELD_SUBCAT = 'Trim, Windshield Bag & Accessories';
const HANDLEBAR_CATEGORY = 'Handlebars & Hand Controls'; // already renamed by rebuild_handlebars_taxonomy.mjs
const STASH_TUBE_IDS = [26945, 26944, 26939, 41731]; // Biltwell x3, HardDrive x1 -- handlebar-end accessories, not luggage

async function main() {
  const client = await pool.connect();
  try {
    // --- Sissy Bars: pad/bag vs hardware ---
    const { rows: sissyRows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Sissy Bars'`, [OLD_CATEGORY]);
    const PADBAG = /\bpad\b|\bpads\b|\bbag\b|\bbags\b|\bpillow\b|cushion/i;
    for (const r of sissyRows) r.target = PADBAG.test(r.name) ? 'Sissy Bar Pads & Bags' : 'Sissy Bars, Sideplates & Hardware';

    // --- Saddlebags: 3-way split + special cases ---
    const { rows: sbRows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Saddlebags'`, [OLD_CATEGORY]);

    const RACK_MOVE = /\bracks?\b/i; // GIVI "Outback Racks", "Rear Rack", "Monokey Rack" -- not bags
    const ACCESSORY = /\bspot|concho|face\s*plate|filler|\bguard\b|\bhandle\b|hinge\s*cover|latch\s*cover|latch\s*insert|emblem|badge|padded\s*strips?|document\s*holder|speed\s*ball\s*wing|tumbler|hanger/i;
    const LID_BAG = /\blids?\b|\bcovers?\b|\bliners?|\blinings?\b|saddlebags?\b(?!\s*(hardware|mount|bracket|rail|support|strap|lock|latch))|\bbags?\b|\bcase\b|\binsert|\bpouch\b|\bbottoms?\b|\bsbag\b/i;
    const HARDWARE = /latch|\bmount|bracket|\brail|support|\bstrap|hardware|\bhinge\b|tether|\bpin\b|\bnut\b|\bbolt\b|\block|\bgrommet|wear\s*plate|\brivet|bareback|fastener|\byoke\b/i;
    const BRAND_LIDBAG_FALLBACK = new Set(['Willie & Max']); // dimension-only SKUs with no bag keyword (e.g. "COMPACT SLANT DELUXE 12x9.5x5.5") are still their bag line

    for (const r of sbRows) {
      if (RACK_MOVE.test(r.name)) { r.target = 'Luggage Racks'; r.crossSub = true; continue; }
      if (ACCESSORY.test(r.name)) { r.target = 'Saddle Bag Accessories'; continue; }
      if (LID_BAG.test(r.name)) { r.target = 'Saddlebags, Lids & Covers'; continue; }
      if (HARDWARE.test(r.name)) { r.target = 'Saddlebag Latches, Mounts & Hardware'; continue; }
      if (BRAND_LIDBAG_FALLBACK.has(r.brand)) { r.target = 'Saddlebags, Lids & Covers'; continue; }
      r.target = 'General'; // small residual (Cycle Visions "Bagger Tail" etc. -- not actually saddlebag products)
    }

    const byTarget = {};
    [...sissyRows, ...sbRows].forEach(r => (byTarget[r.target] = byTarget[r.target] || []).push(r));
    console.log('=== Sissy Bars + Saddlebags reclassification distribution ===');
    Object.entries(byTarget).sort((a, b) => b[1].length - a[1].length)
      .forEach(([k, v]) => console.log(`  ${v.length.toString().padStart(5)}  ${k}`));

    console.log('\n=== Samples ===');
    for (const [target, list] of Object.entries(byTarget)) {
      console.log(`\n--- ${target} (${list.length}) ---`);
      list.slice(0, 12).forEach(r => console.log(`  [${r.brand}] ${r.name}`));
    }

    // --- straight renames ---
    const RENAME_MAP = {
      'Racks': 'Luggage Racks',
      'General Accessories': 'General',
      'Tour Pak': 'Tour Pak & Accessories',
    };
    console.log('\n=== Straight-rename counts ===');
    for (const oldSub of Object.keys(RENAME_MAP)) {
      const { rows } = await client.query(`SELECT COUNT(*) FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = $2`, [OLD_CATEGORY, oldSub]);
      console.log(`  ${oldSub} -> ${RENAME_MAP[oldSub]}: ${rows[0].count}`);
    }

    // --- Docking -> Saddlebag Latches, Mounts & Hardware ---
    const { rows: dockingCount } = await client.query(`SELECT COUNT(*) FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Docking'`, [OLD_CATEGORY]);
    console.log(`  Docking -> Saddlebag Latches, Mounts & Hardware: ${dockingCount[0].count}`);

    // --- Handlebar Bags + Tool Bags & Pouches -> Windshields & Fairings ---
    const { rows: hbCount } = await client.query(`SELECT COUNT(*) FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Handlebar Bags'`, [OLD_CATEGORY]);
    const { rows: toolCount } = await client.query(`SELECT COUNT(*) FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Tool Bags & Pouches'`, [OLD_CATEGORY]);
    console.log(`  Handlebar Bags -> Windshields & Fairings > ${WINDSHIELD_SUBCAT}: ${hbCount[0].count}`);
    console.log(`  Tool Bags & Pouches -> Windshields & Fairings > ${WINDSHIELD_SUBCAT}: ${toolCount[0].count}`);

    // --- Stash tubes -> Handlebars & Hand Controls > General & Accessories ---
    const { rows: stashRows } = await client.query(`
      SELECT id, brand, name, display_subcategory FROM catalog_unified WHERE id = ANY($1)`, [STASH_TUBE_IDS]);
    console.log(`\n=== Stash tubes -> ${HANDLEBAR_CATEGORY} > General & Accessories (${stashRows.length}) ===`);
    stashRows.forEach(r => console.log(`  [${r.brand}] ${r.name}  (currently: ${r.display_subcategory})`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');

    // 1. Rename category
    await client.query(`UPDATE catalog_unified SET display_category = $1 WHERE is_active = true AND display_category = $2`, [NEW_CATEGORY, OLD_CATEGORY]);

    // 2. Sissy Bars split (now under NEW_CATEGORY)
    for (const r of sissyRows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`, [r.target, r.id]);
    }

    // 3. Saddlebags split (rack-move rows also change subcategory only, category already renamed)
    for (const r of sbRows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`, [r.target, r.id]);
    }

    // 4. Straight renames
    for (const [oldSub, newSub] of Object.entries(RENAME_MAP)) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE is_active = true AND display_category = $2 AND display_subcategory = $3`, [newSub, NEW_CATEGORY, oldSub]);
    }

    // 5. Docking
    await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE is_active = true AND display_category = $2 AND display_subcategory = 'Docking'`, ['Saddlebag Latches, Mounts & Hardware', NEW_CATEGORY]);

    // 6. Handlebar Bags + Tool Bags & Pouches -> Windshields & Fairings (cross-category)
    await client.query(`UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE is_active = true AND display_category = $3 AND display_subcategory IN ('Handlebar Bags', 'Tool Bags & Pouches')`, [WINDSHIELD_CATEGORY, WINDSHIELD_SUBCAT, NEW_CATEGORY]);

    // 7. Stash tubes -> Handlebars & Hand Controls (cross-category)
    await client.query(`UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = ANY($3)`, [HANDLEBAR_CATEGORY, 'General & Accessories', STASH_TUBE_IDS]);

    await client.query('COMMIT');
    console.log('\nDone. All updates applied.');
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
