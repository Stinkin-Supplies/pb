#!/usr/bin/env node
/**
 * fix_burly_wiring_and_twist_grips.mjs
 *
 * Two miscategorizations Laken caught spot-checking the live site after
 * the session-89 Handlebars & Hand Controls rebuild:
 *
 * 1. Burly Brand's "CNTRL KIT" line (e.g. "BURLY CNTRL KIT 14" APE BLACK
 *    ABS", "...W/ CRUISE") landed in Ape Hangers via the bare \bape\b
 *    keyword match. These are wiring/control kits, not handlebars -- the
 *    ABS/NON-ABS/W-CRUISE variants are electrical compatibility options,
 *    not physical bar shapes (a handlebar has no "ABS" variant). Genuine
 *    Burly handlebars in this bucket ("Gorilla Ape Handlebar", "Narrow
 *    Bottom Ape Hanger Handlebar", "NARROW ... APEHANGERS") are unaffected
 *    -- only the "CNTRL KIT" naming pattern moves.
 *
 * 2. Grips contains two genuinely different product types under one
 *    keyword: grip COVERS that mention throttle compatibility as a
 *    variant ("AIR CUSHIONED GRIPS W/CABLE THROTTLE BLACK" -- correctly
 *    Grips) vs mechanical twist-grip/throttle ASSEMBLIES (Ultima "Twist
 *    Grip Assembly", V-Twin's whole "Gear Head Twist Grip" component line
 *    -- cable guides, bearings, snap rings, cams -- none of which are a
 *    rubber grip cover at all). The assemblies move to Hardware &
 *    Accessories > Throttle Components, joining the detail group already
 *    built there in the same session.
 *
 * Usage:
 *   node scripts/ingest/fix_burly_wiring_and_twist_grips.mjs            # dry run
 *   node scripts/ingest/fix_burly_wiring_and_twist_grips.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const CATEGORY = 'Handlebars & Hand Controls';
const BURLY_WIRING_KIT = /cntrl kit/i;
// "W/O THROTTLE SLEEVE" (HardDrive's naming for grips sold WITHOUT one)
// must not match -- those are genuine grip covers, the opposite case.
const THROTTLE_ASSEMBLY = /twist grip (assembly|kit|tube)|throttle assist|(?<!w\/o )throttle sleeve|throttle tube|gear head twist grip/i;
const THROTTLE_HARDWARE = /throttle grip screws/i;

async function main() {
  const client = await pool.connect();
  try {
    const { rows: burlyRows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Ape Hangers'
        AND brand = 'Burly Brand' AND name ~* $2`,
      [CATEGORY, BURLY_WIRING_KIT.source]);
    console.log(`=== Burly "CNTRL KIT" rows moving Ape Hangers -> Handlebar Switches & Wiring Kits (${burlyRows.length}) ===`);
    console.log(`Sample: ${burlyRows.slice(0, 5).map(r => r.name).join(' | ')}`);

    const { rows: gripRows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Grips'`,
      [CATEGORY]);

    const toThrottle = gripRows.filter(r => THROTTLE_ASSEMBLY.test(r.name));
    const toHardware = gripRows.filter(r => !THROTTLE_ASSEMBLY.test(r.name) && THROTTLE_HARDWARE.test(r.name));

    console.log(`\n=== Grips rows moving to Hardware & Accessories > Throttle Components (${toThrottle.length}) ===`);
    toThrottle.forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    console.log(`\n=== Grips rows moving to Hardware & Accessories > Hardware & Fasteners (${toHardware.length}) ===`);
    toHardware.forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');

    for (const r of burlyRows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = NULL WHERE id = $2`,
        ['Handlebar Switches & Wiring Kits', r.id]);
    }
    for (const r of toThrottle) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = $2 WHERE id = $3`,
        ['Hardware & Accessories', 'Throttle Components', r.id]);
    }
    for (const r of toHardware) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = $2 WHERE id = $3`,
        ['Hardware & Accessories', 'Hardware & Fasteners', r.id]);
    }

    await client.query('COMMIT');
    console.log('\nDone. All updates applied.');
    console.log('\nNEXT STEP: node scripts/ingest/index_unified.js --recreate');
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
