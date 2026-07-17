#!/usr/bin/env node
/**
 * fix_tools_cargo_tiedowns_covers.mjs
 *
 * Laken caught cargo nets and tie-downs sitting in Tools & Chemicals
 * (mostly swept in by keyword collisions during the session-89
 * Engine & Drivetrain Tools / Hand Tools & Sets promotion -- "CAM LOCK"
 * tie-down straps matched the cam-lock engine-tool pattern, "RATCHET"
 * tie-downs matched the ratchet hand-tool pattern). Rather than sending
 * them to Saddlebags/Luggage as first suggested, Laken confirmed they
 * should reunite with the ~200 identical sibling products already in
 * Accessories & Gear > Towing Equipment (PowerTye/Drag Specialties/Emgo/
 * ERICKSON cargo nets and tie-downs already live there).
 *
 * Same sweep also caught 6 Dowco "COVER WEATHERALL PLUS RATCHET
 * ATTACHMENT" rows -- motorcycle covers, not tools, not tie-downs --
 * misfiled the same way via the "ratchet" keyword. These join their 49
 * siblings in Accessories & Gear > Motorcycle Covers.
 *
 * Usage:
 *   node scripts/ingest/fix_tools_cargo_tiedowns_covers.mjs            # dry run
 *   node scripts/ingest/fix_tools_cargo_tiedowns_covers.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const { rows: towingRows } = await client.query(`
      SELECT id, brand, name, display_subcategory FROM catalog_unified
      WHERE is_active = true AND display_category = 'Tools & Chemicals'
        AND (name ILIKE '%cargo net%' OR name ILIKE '%tie-down%' OR name ILIKE '%tie down%' OR name ILIKE '%tiedown%')`);

    const { rows: coverRows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = 'Tools & Chemicals' AND brand = 'Dowco' AND name ILIKE '%cover%'`);

    console.log(`=== To Accessories & Gear > Towing Equipment (${towingRows.length}) ===`);
    towingRows.forEach(r => console.log(`  [${r.display_subcategory}] [${r.brand}] ${r.name}`));

    console.log(`\n=== To Accessories & Gear > Motorcycle Covers (${coverRows.length}) ===`);
    coverRows.forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');
    for (const r of towingRows) {
      await client.query(`UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, display_subcategory_detail = NULL WHERE id = $3`,
        ['Accessories & Gear', 'Towing Equipment', r.id]);
    }
    for (const r of coverRows) {
      await client.query(`UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, display_subcategory_detail = NULL WHERE id = $3`,
        ['Accessories & Gear', 'Motorcycle Covers', r.id]);
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
