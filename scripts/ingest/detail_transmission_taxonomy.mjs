#!/usr/bin/env node
/**
 * detail_transmission_taxonomy.mjs
 *
 * display_subcategory_detail groupings for every Transmission & Clutch
 * subcategory over ~150 rows, per the standing general-bucket policy
 * (any bucket over 150 items gets detail groupings, size alone is the
 * trigger). Run after rebuild_transmission_taxonomy_v2.mjs has applied.
 *
 * Genuine stragglers are left with no detail tag rather than force-fit
 * into a wrong cluster, same convention as prior sessions' detail passes.
 *
 * Usage:
 *   node detail_transmission_taxonomy.mjs           # dry run
 *   node detail_transmission_taxonomy.mjs --apply    # writes rows
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CATEGORY = 'Transmission & Clutch';

const DETAIL_GROUPS = {
  'Pulley & Sprocket': [
    { detail: 'Rear Sprockets', test: (n) => /\bREAR SPROCKETS?\b/.test(n) },
    { detail: 'Compensator Sprockets', test: (n) => /COMPENSAT/.test(n) },
    { detail: 'Transmission Sprockets', test: (n) => /TRANSMISSION SPROCKET/.test(n) || /\bTRN SPRKT\b/.test(n) || /\bTRN SPKT\b/.test(n) },
    { detail: 'Cush Drive & Dampers', test: (n) => /\bCUSH/.test(n) || /DAMPENER/.test(n) || /DAMPER/.test(n) },
    { detail: 'Sprocket Covers', test: (n) => /SPROCKET COVER/.test(n) },
    { detail: 'Pulleys', test: (n) => /\bPULLEYS?\b/.test(n) || /\bPULLYS?\b/.test(n) },
    { detail: 'Spacers & Hardware', test: (n) => /SPACER/.test(n) || /\bNUT\b/.test(n) },
  ],
  'Clutch Components': [
    { detail: 'Clutch Hubs & Baskets', test: (n) => /\bHUB\b/.test(n) || /\bBASKET\b/.test(n) },
    { detail: 'Clutch Covers', test: (n) => /COVER/.test(n) },
    { detail: 'Levers, Cables & Rods', test: (n) => /LEVER/.test(n) || /CABLE/.test(n) || /\bROD\b/.test(n) },
    { detail: 'Springs', test: (n) => /SPRING/.test(n) },
    { detail: 'Pushrods', test: (n) => /PUSH ?ROD/.test(n) },
    { detail: 'Hardware (Nuts, Washers, Rivets, Screws)', test: (n) => /\bNUT\b/.test(n) || /WASHER/.test(n) || /RIVET/.test(n) || /SCREW/.test(n) || /SPACER/.test(n) },
  ],
  Chains: [
    { detail: 'Master & Connecting Links', test: (n) => /MASTER LINK/.test(n) || /CONNECTING LINK/.test(n) || /\bCONN LINK\b/.test(n) },
    { detail: 'Drive Chains', test: (n) => /\bCHAIN\b/.test(n) && /LINKS?\b/.test(n) },
    { detail: 'Primary Chain Kits', test: (n) => /PRIMARY CHAIN/.test(n) || /\bPRI CHN?\b/.test(n) },
    { detail: 'Chain Guards', test: (n) => /GUARD/.test(n) },
    { detail: 'Chain Adjusters & Tensioners', test: (n) => /ADJUSTER/.test(n) || /TENSIONER/.test(n) },
  ],
  'Primary Inner & Outer': [
    { detail: 'Outer Primary Covers', test: (n) => /OUTER PRIMARY/.test(n) },
    { detail: 'Inner Primary Covers', test: (n) => /INNER PRIMARY/.test(n) },
    { detail: 'Side Covers', test: (n) => /SIDE COVER/.test(n) },
    { detail: 'Cover Bolt & Screw Kits', test: (n) => /BOLT KIT/.test(n) || /SCREW KIT/.test(n) || /MOUNT(ING)? KIT/.test(n) },
    { detail: 'Plugs & Caps', test: (n) => /\bPLUG\b/.test(n) || /\bCAP\b/.test(n) },
  ],
  'Shifter Forks': [
    { detail: 'Shift Rods & Linkages', test: (n) => /\bROD\b/.test(n) || /LINKAGE/.test(n) },
    { detail: 'Shifter Levers & Knobs', test: (n) => /LEVER/.test(n) || /KNOB/.test(n) },
    { detail: 'Shift Forks', test: (n) => /\bFORKS?\b/.test(n) },
    { detail: 'Shifter Cams & Drums', test: (n) => /\bCAM\b/.test(n) || /\bDRUM\b/.test(n) },
    { detail: 'Shifter Shaft & Bushings', test: (n) => /SHAFT/.test(n) || /BUSHING/.test(n) },
  ],
  Kickstarters: [
    { detail: 'Kick Starter Pedals', test: (n) => /PEDAL/.test(n) },
    { detail: 'Kick Starter Arms', test: (n) => /\bARM\b/.test(n) },
    { detail: 'Kick Starter Shafts', test: (n) => /SHAFT/.test(n) },
    { detail: 'Kick Starter Gears', test: (n) => /GEAR/.test(n) },
    { detail: 'Kick Starter Covers', test: (n) => /COVER/.test(n) },
  ],
  Belts: [
    { detail: 'Rear Drive Belts', test: (n) => /REAR (DRIVE )?BELT/.test(n) },
    { detail: 'Belt Drive Kits', test: (n) => /BELT DRIVE KIT/.test(n) || /BDL BELT DRIVE/.test(n) },
    { detail: 'Primary Belts', test: (n) => /PRIMARY BELT/.test(n) },
    { detail: 'Belt Guards', test: (n) => /GUARD/.test(n) },
  ],
  Mainshaft: [
    { detail: 'Countershaft Parts', test: (n) => /COUNTER ?SHAFT/.test(n) },
    { detail: 'Mainshaft Assemblies', test: (n) => /MAIN ?SHAFT/.test(n) },
    { detail: 'Thrust Washers', test: (n) => /THRUST WASHER/.test(n) },
    { detail: 'Transmission Assemblies', test: (n) => /TRANSMISSION ASSEMBLY/.test(n) || /SUB ?ASSEMBLY/.test(n) },
    { detail: 'Mounting Plates', test: (n) => /MOUNT(ING)? PLATE/.test(n) },
  ],
  'Clutch Kits': [
    { detail: 'Friction & Plate Kits', test: (n) => /PLATE KIT/.test(n) || /FRICTION/.test(n) },
    { detail: 'Pushrod Kits', test: (n) => /PUSH ?ROD KIT/.test(n) },
    { detail: 'Jockey & Foot Clutch Kits', test: (n) => /JOCKEY/.test(n) || /FOOT CLUTCH/.test(n) },
  ],
  'Gear Sets': [
    { detail: 'Full Gear Sets', test: (n) => /GEAR SET/.test(n) },
    { detail: 'Individual Gears', test: (n) => /\b(1ST|2ND|3RD|4TH|5TH)\b/.test(n) },
    { detail: 'Countershaft Gears', test: (n) => /COUNTER ?SHAFT/.test(n) },
    { detail: 'Bushings & Washers', test: (n) => /BUSHING/.test(n) || /WASHER/.test(n) },
  ],
  'Derby Covers': [
    { detail: 'Skull & Themed Designs', test: (n) => /SKULL/.test(n) },
    { detail: 'Finned, Smooth & Dimpled Styles', test: (n) => /FINNED/.test(n) || /SMOOTH/.test(n) || /DIMPLE/.test(n) },
    { detail: 'Hole-Count Styles', test: (n) => /\d-HOLE/.test(n) },
    { detail: 'Bolt Kits & Hardware', test: (n) => /BOLT KIT/.test(n) },
  ],
  'Bearings & Seals': [
    { detail: 'Mainshaft & Transmission Bearings', test: (n) => /MAIN ?SHAFT/.test(n) || /TRANSMISSION/.test(n) },
    { detail: 'Clutch Bearings', test: (n) => /CLUTCH/.test(n) },
    { detail: 'Races', test: (n) => /\bRACES?\b/.test(n) },
    { detail: 'Primary Bearings', test: (n) => /PRIMARY/.test(n) },
  ],
  'Covers & Guards': [
    { detail: 'Transmission Top Covers', test: (n) => /TOP COVER/.test(n) },
    { detail: 'Transmission Case & Doors', test: (n) => /\bCASE\b/.test(n) || /\bDOOR\b/.test(n) },
    { detail: 'Inspection Covers', test: (n) => /INSPECTION/.test(n) },
    { detail: 'Screw Kits & Studs', test: (n) => /SCREW KIT/.test(n) || /\bSTUD/.test(n) },
  ],
  'Clutch Plates': [
    { detail: 'Friction Plates', test: (n) => /FRICTION/.test(n) },
    { detail: 'Steel Plates', test: (n) => /STEEL/.test(n) },
    { detail: 'Pressure Plates', test: (n) => /PRESSURE PLATE/.test(n) },
    { detail: 'Plate Sets', test: (n) => /\bSET\b/.test(n) },
  ],
};

async function main() {
  const summary = {};
  const applies = [];

  for (const [subcategory, groups] of Object.entries(DETAIL_GROUPS)) {
    const { rows } = await pool.query(
      `SELECT id, name FROM catalog_unified
       WHERE display_category = $1 AND display_subcategory = $2 AND is_active = true`,
      [CATEGORY, subcategory]
    );

    const counts = {};
    for (const row of rows) {
      const n = row.name.toUpperCase();
      let matched = null;
      for (const g of groups) {
        if (g.test(n)) {
          matched = g.detail;
          break;
        }
      }
      counts[matched || '(ungrouped straggler)'] = (counts[matched || '(ungrouped straggler)'] || 0) + 1;
      if (matched) applies.push({ id: row.id, detail: matched });
    }
    summary[subcategory] = { total: rows.length, counts };
  }

  for (const [sub, { total, counts }] of Object.entries(summary)) {
    console.log(`\n=== ${sub} (${total} rows) ===`);
    for (const [detail, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count.toString().padStart(5)}  ${detail}`);
    }
  }

  if (!APPLY) {
    console.log(`\nDry run only (${applies.length} rows would get a detail tag). Re-run with --apply to write changes.`);
    await pool.end();
    return;
  }

  console.log(`\nApplying ${applies.length} detail-tag updates...`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const a of applies) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory_detail = $1, updated_at = now() WHERE id = $2`,
        [a.detail, a.id]
      );
    }
    await client.query('COMMIT');
    console.log(`Applied ${applies.length} detail-tag updates.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rolled back due to error:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
