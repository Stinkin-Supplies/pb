#!/usr/bin/env node
/**
 * detail_engine.mjs
 *
 * Session 90 continued: adds display_subcategory_detail groupings to the
 * Engine buckets over ~150 rows, per the standing General-bucket policy,
 * right after the Engine category rebuild onto Laken's 14-name spec (plus
 * Bottom End / Complete Engines / Cylinder Heads kept as extra buckets).
 *
 * Usage:
 *   node scripts/ingest/detail_engine.mjs            # dry run
 *   node scripts/ingest/detail_engine.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CAT = 'Engine';

const DETAIL_RULES = {
  Pistons: [
    [/piston kits?|piston sets?/i, 'Piston Kits & Sets'],
    [/rings?\b/i, 'Piston Rings'],
    [/wrist pin|circlip|pin clip/i, 'Wrist Pins & Circlips'],
    [/tool|jig|plier/i, 'Piston Tools'],
    [/./, 'Pistons (Other)'],
  ],
  Cylinders: [
    [/cylinder kits?|big bore/i, 'Cylinder Kits'],
    [/top end/i, 'Top End Kits'],
    [/base nut|stud|washer|sleeve/i, 'Cylinder Hardware'],
    [/./, 'Complete Cylinders'],
  ],
  'Cam Chest': [
    [/cam cover/i, 'Cam Covers'],
    [/camchest kit|cam chest kit/i, 'Cam Chest Kits'],
    [/lifter|tappet/i, 'Lifters & Tappets'],
    [/camshaft|\bcam\b|cams\b/i, 'Camshafts'],
    [/bearing|bushing/i, 'Bearings & Bushings'],
    [/chain|sprocket/i, 'Chain & Sprockets'],
    [/./, 'Cam Chest Hardware'],
  ],
  Valves: [
    [/valve guides?/i, 'Valve Guides'],
    [/valve springs?/i, 'Valve Springs'],
    [/rocker arm/i, 'Rocker Arms'],
    [/valve seats?/i, 'Valve Seats'],
    [/valves?\b/i, 'Valves'],
    [/./, 'Valve Train Hardware'],
  ],
  'Oil Pump & System': [
    [/oil filters?/i, 'Oil Filters'],
    [/oil coolers?/i, 'Oil Coolers'],
    [/oil pump assembly|oil pump assemblies|pump body/i, 'Oil Pump Assemblies'],
    [/./, 'Oil Pump Hardware'],
  ],
  'Bottom End': [
    [/flywheel/i, 'Flywheels'],
    [/bearing/i, 'Bearings'],
    [/pinion|sprocket shaft/i, 'Pinion & Sprocket Shaft'],
    [/connecting rod|rod race|rod bushing|rod cage/i, 'Connecting Rods'],
    [/crank ?pin/i, 'Crank Pin'],
    [/crankcase/i, 'Crankcase'],
    [/./, 'Bottom End Hardware'],
  ],
  'Engine Mounts': [
    [/front/i, 'Front Engine Mounts'],
    [/rear/i, 'Rear Engine Mounts'],
    [/top/i, 'Top Motor Mounts'],
    [/./, 'Mount Hardware & Kits'],
  ],
  'Rocker Boxes': [
    [/cover/i, 'Rocker Box Covers'],
    [/./, 'Rocker Box Hardware'],
  ],
  'Complete Engines': [
    [/long block/i, 'Long Blocks'],
    [/top end kit/i, 'Top End Kits'],
    [/chassis/i, 'Custom Chassis Engines'],
    [/./, 'Complete Engine Assemblies'],
  ],
  'Performance Kits': [
    [/conversion|big bore/i, 'Big Bore & Conversion Kits'],
    [/forged/i, 'Forged Piston Kits'],
    [/cam|chain|tensioner/i, 'Cam & Chain Conversion Kits'],
    [/./, 'Other Performance Kits'],
  ],
  Pushrods: [
    [/cover/i, 'Pushrod Covers'],
    [/./, 'Pushrods'],
  ],
};

function classify(name, rules) {
  for (const [re, label] of rules) {
    if (re.test(name)) return label;
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    const detailPlan = {};
    const detailUpdates = [];

    for (const [subcat, rules] of Object.entries(DETAIL_RULES)) {
      const res = await client.query(
        `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = $2`,
        [CAT, subcat]
      );
      const tally = {};
      let stragglers = 0;
      for (const row of res.rows) {
        const label = classify(row.name, rules);
        if (label) {
          tally[label] = (tally[label] || 0) + 1;
          detailUpdates.push({ id: row.id, label });
        } else {
          stragglers++;
        }
      }
      detailPlan[subcat] = { total: res.rows.length, tally, stragglers };
    }

    console.log('=== Detail grouping plan ===');
    for (const [subcat, plan] of Object.entries(detailPlan)) {
      console.log(`\n${subcat} (${plan.total} total)`);
      for (const [label, count] of Object.entries(plan.tally).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${label}: ${count}`);
      }
      console.log(`  (ungrouped stragglers): ${plan.stragglers}`);
    }

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    let updated = 0;
    for (const { id, label } of detailUpdates) {
      await client.query(`UPDATE catalog_unified SET display_subcategory_detail = $1 WHERE id = $2`, [label, id]);
      updated++;
    }
    await client.query('COMMIT');
    console.log(`\nApplied display_subcategory_detail to ${updated} rows. Committed.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
