#!/usr/bin/env node
/**
 * fix_chemicals_misfiled_tools.mjs
 *
 * Full read of all 790 Tools & Chemicals > Chemicals & Lubricants rows
 * found two things Laken's toolbox spot-check didn't cover:
 *
 * 1. One more toolbox item (Colony "Tool Box Cup Washer") sitting in
 *    Chemicals & Lubricants instead of Tools -- missed by
 *    create_toolbox_subcat.mjs since that script only searched the Tools
 *    subcategory. Same fix: -> Saddlebags, Sissy Bars & Luggage > Tool
 *    Boxes & Mounts.
 * 2. ~29 genuine hand tools/equipment (oil filter wrenches, drain tools,
 *    grease gun kits, foam cannons, dispensing pumps, funnels, sprayers,
 *    spouts) landed in Chemicals & Lubricants instead of Tools -- almost
 *    all because "oil" appears in both the tool's name and typical
 *    chemical product names (e.g. "Oil Drain Reservoir Tool" reads like an
 *    oil product by keyword alone, but it's the drain pan, not the oil).
 *    These move to Tools within the same category.
 *
 * Explicit ID list, not a keyword regex -- this bucket is small enough
 * (790 rows) that a full manual read was more reliable than pattern
 * matching, per the project's established "regex only catches what it was
 * written to catch" lesson.
 *
 * Usage:
 *   node scripts/ingest/fix_chemicals_misfiled_tools.mjs            # dry run
 *   node scripts/ingest/fix_chemicals_misfiled_tools.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// [brand, name substring to match] -- matched via exact name lookup below
const TOOLBOX_ITEM_NAMES = ['Tool Box Cup Washer'];

const MISFILED_TOOL_NAMES = [
  'OIL FILTER WRENCH SOCKET DRIVE BLACK FINISH',
  'OIL FILTER WRENCH SOCKET DRIVE TWIN CAMS 00-17 OEM 44067',
  'PRO FORK OIL LEVEL TOOL',
  'CABLE LUBER',
  'MP CABLE LUBER V3',
  'SEALMATE FORK SEAL CLEANER',
  'Backing Washer Puller Tool',
  'Cylinder Oil Tube Drain Tool Kit',
  'Oil Drain Reservoir Tool',
  'Oil Drain Spigot Tool',
  'Oil Pressure Sender Unit Wrench Tool',
  'Alemite Pistol Grease Gun Fitting Kit',
  'Alemite Pistol Grease Gun Kit',
  'Oil Catcher Drain Pan',
  'Oil Catcher Pan',
  'OIL LEVEL GUAGE',
  'FOAM CANNON',
  'PUMP FOR 1 GAL HAND CLEANER',
  'WALL MOUNT PUMP 1 GAL HAND CLEANER',
  '5 GALLON PAIL PUMP',
  'OIL FILTER PLIERS',
  'NON-AEROSOL SPRAY TANK 32 OZ',
  'FUNNEL', // RED LINE FUNNEL (exact match, not e.g. "FLEXIBLE FUNNEL" which lives in Tools already)
  'POWER SPOUT FOR 5 GALLON PAIL',
  'TRIGGER FLUID CONTROL SYSTEM FILLER HOSE SPOUT',
  'PUMP FOR 5 GAL BUCKET',
  '5 LITER CANISTER SPRAYER',
];

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = 'Tools & Chemicals' AND display_subcategory = 'Chemicals & Lubricants'`);

    const toToolbox = rows.filter(r => TOOLBOX_ITEM_NAMES.some(n => r.name === n || r.name.includes(n)));
    const toTools = rows.filter(r => !toToolbox.includes(r) && MISFILED_TOOL_NAMES.some(n => r.name === n || r.name.toUpperCase() === n.toUpperCase()));

    console.log(`=== To Saddlebags, Sissy Bars & Luggage > Tool Boxes & Mounts (${toToolbox.length}) ===`);
    toToolbox.forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    console.log(`\n=== To Tools & Chemicals > Tools (${toTools.length}) ===`);
    toTools.forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');
    for (const r of toToolbox) {
      await client.query(`UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, display_subcategory_detail = NULL WHERE id = $3`,
        ['Saddlebags, Sissy Bars & Luggage', 'Tool Boxes & Mounts', r.id]);
    }
    for (const r of toTools) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = NULL WHERE id = $2`,
        ['Tools', r.id]);
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
