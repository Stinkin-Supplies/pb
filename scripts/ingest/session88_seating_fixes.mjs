#!/usr/bin/env node
/**
 * session88_seating_fixes.mjs
 *
 * Three targeted Seating fixes agreed with Laken in session 88:
 *   1. Move 12 real seats out of "Seating Hardware- Springs. Brackets,
 *      Mounts, Tabs, etc." into Seats / Solo Seats (they were sitting
 *      alongside genuine hardware — brackets/springs/mounts — with no
 *      functional reason to be there).
 *   2. Rename "Chopper / Rigid" -> "Chopper/Rigid/Buddy" and move the 5
 *      real buddy seats (currently scattered in Seats/Solo Seats) into it.
 *      Buddy seat HARDWARE (springs/brackets/handles for buddy seats)
 *      stays in the hardware bucket — same logic as solo seat hardware
 *      staying separate from the Solo Seats subcategory.
 *   3. Move 12 "Sissy Pad"-named items out of "Touring Back Rest" into
 *      Luggage & Racks > Sissy Bars, where the rest of the sissy bar pad
 *      catalog (Saddlemen/Mustang "Sissy Bar Pad" naming) already lives.
 *
 * All three sets were hand-verified against a full read of their source
 * buckets (424 + 184 + 236 + 144 rows), not a blind keyword sweep.
 *
 * Usage:
 *   node scripts/ingest/session88_seating_fixes.mjs            # dry run
 *   node scripts/ingest/session88_seating_fixes.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// 1. Real seats misfiled in the hardware bucket -> Seats / Solo Seats
const SEATS_OUT_OF_HARDWARE = [
  { id: 19059, target: 'Seats', note: 'Sargent Pan America 2-PC LOW FRONT' },
  { id: 3685, target: 'Seats', note: 'Sargent Pan America 2-PC REGULAR FRONT' },
  { id: 78904, target: 'Seats', note: 'Bates Style Black Leather Seat Kit' },
  { id: 15474, target: 'Seats', note: 'Saddlemen Eliminator Seat Kit - Carbon Fiber' },
  { id: 12033, target: 'Seats', note: 'Saddlemen Eliminator Seat Kit - Lattice Stitched' },
  { id: 28463, target: 'Solo Seats', note: 'Drag Specialties Seat - Spring Solo - Large - Black Solar-Reflective' },
  { id: 6894, target: 'Solo Seats', note: 'Drag Specialties Seat - Spring Solo - Large - White Perimeter Stitch' },
  { id: 13416, target: 'Solo Seats', note: 'Drag Specialties Seat - Spring Solo - Large - Black Vinyl' },
  { id: 13415, target: 'Solo Seats', note: 'Drag Specialties Seat - Spring Solo - Large - Distressed Brown' },
  { id: 28466, target: 'Solo Seats', note: 'Drag Specialties Seat - Spring Solo - Low-Profile - Small - Black' },
  { id: 28419, target: 'Solo Seats', note: 'Drag Specialties Seat - Spring Solo - Low-Profile - Small - Distressed Brown' },
  { id: 19051, target: 'Solo Seats', note: 'Drag Specialties Seat - Spring Solo - Low-Profile - Small - Faux Alligator' },
];

// 2. Real buddy seats -> Chopper/Rigid/Buddy (renamed from Chopper / Rigid)
const BUDDY_SEATS_IN = [
  { id: 78897, note: 'Corbin Black Naugahyde Dresser Style Buddy Seat' },
  { id: 78976, note: 'V-Twin Buddy Seat Kit Black Naugahyde' },
  { id: 79048, note: 'V-Twin Factory Sample Black Naugahylde Thin Profile Buddy Seat' },
  { id: 78864, note: 'V-Twin Black Naugahylde Thin Profile Buddy Seat' },
  { id: 32831, note: 'Le Pera Buddy Boy Solo Seat - Large' },
];
const OLD_CHOPPER_SUBCAT = 'Chopper / Rigid';
const NEW_CHOPPER_SUBCAT = 'Chopper/Rigid/Buddy';

// 3. Sissy pads -> Luggage & Racks > Sissy Bars
const SISSY_PADS_OUT = [
  19108, 35713, 35524, 19116, 35715, 12000, 35714, 19117, 35270, 19109, 34092, 8251,
];

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== 1. Seats misfiled in Seating Hardware bucket ===');
    for (const s of SEATS_OUT_OF_HARDWARE) {
      const { rows } = await client.query(
        `SELECT id, name, display_category, display_subcategory FROM catalog_unified WHERE id = $1`, [s.id]);
      const row = rows[0];
      if (!row) { console.log(`  MISSING id ${s.id} (${s.note})`); continue; }
      console.log(`  [${row.id}] "${row.name}" : ${row.display_subcategory} -> ${s.target}`);
    }

    console.log('\n=== 2. Buddy seats -> rename Chopper / Rigid -> Chopper/Rigid/Buddy, move in ===');
    const { rows: chopperRows } = await client.query(
      `SELECT COUNT(*) FROM catalog_unified WHERE is_active = true AND display_category = 'Seating' AND display_subcategory = $1`,
      [OLD_CHOPPER_SUBCAT]);
    console.log(`  Existing "${OLD_CHOPPER_SUBCAT}" rows to rename: ${chopperRows[0].count}`);
    for (const b of BUDDY_SEATS_IN) {
      const { rows } = await client.query(
        `SELECT id, name, display_subcategory FROM catalog_unified WHERE id = $1`, [b.id]);
      const row = rows[0];
      if (!row) { console.log(`  MISSING id ${b.id} (${b.note})`); continue; }
      console.log(`  [${row.id}] "${row.name}" : ${row.display_subcategory} -> ${NEW_CHOPPER_SUBCAT}`);
    }

    console.log('\n=== 3. Sissy pads: Seating > Touring Back Rest -> Luggage & Racks > Sissy Bars ===');
    for (const id of SISSY_PADS_OUT) {
      const { rows } = await client.query(
        `SELECT id, name, display_category, display_subcategory FROM catalog_unified WHERE id = $1`, [id]);
      const row = rows[0];
      if (!row) { console.log(`  MISSING id ${id}`); continue; }
      console.log(`  [${row.id}] "${row.name}" : ${row.display_category} > ${row.display_subcategory} -> Luggage & Racks > Sissy Bars`);
    }

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');

    for (const s of SEATS_OUT_OF_HARDWARE) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`, [s.target, s.id]);
    }

    await client.query(
      `UPDATE catalog_unified SET display_subcategory = $1 WHERE is_active = true AND display_category = 'Seating' AND display_subcategory = $2`,
      [NEW_CHOPPER_SUBCAT, OLD_CHOPPER_SUBCAT]);
    for (const b of BUDDY_SEATS_IN) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`, [NEW_CHOPPER_SUBCAT, b.id]);
    }

    for (const id of SISSY_PADS_OUT) {
      await client.query(
        `UPDATE catalog_unified SET display_category = 'Luggage & Racks', display_subcategory = 'Sissy Bars' WHERE id = $1`,
        [id]);
    }

    await client.query('COMMIT');
    console.log('\nDone. All three fixes applied.');
    console.log('\nNEXT STEPS:');
    console.log('  1. node scripts/ingest/index_unified.js --recreate');
    console.log('  2. Spot-check /browse?display_category=Seating on live site');
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
