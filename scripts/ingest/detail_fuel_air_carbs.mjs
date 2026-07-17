#!/usr/bin/env node
/**
 * detail_fuel_air_carbs.mjs
 *
 * Session 90 continued: adds display_subcategory_detail groupings to the 7
 * "Fuel, Air & Carburetors" buckets over ~150 rows (per the standing
 * General-bucket policy), immediately after that category's 15-bucket
 * rebuild (see rebuild_fuel_air_carbs_taxonomy.mjs).
 *
 * Usage:
 *   node scripts/ingest/detail_fuel_air_carbs.mjs            # dry run
 *   node scripts/ingest/detail_fuel_air_carbs.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CAT = 'Fuel, Air & Carburetors';

const DETAIL_RULES = {
  'Air Cleaner': [
    [/covers?\b/i, 'Air Cleaner Covers'],
    [/breather/i, 'Breather Hardware'],
    [/inserts?\b|windows?\b/i, 'Inserts & Windows'],
    [/./, 'Complete Air Cleaner Kits & Assemblies'],
  ],
  'Jets, Needles, Screws, etc.': [
    [/main jets?/i, 'Main Jets'],
    [/pilot jets?/i, 'Pilot Jets'],
    [/jets?\b/i, 'Jets (Other)'],
    [/needles?/i, 'Needles'],
    [/screws?/i, 'Screws'],
    [/springs?\b/i, 'Springs'],
    [/floats?\b/i, 'Floats'],
    [/diaphragms?|accelerator pump|insulator block|enrichment|idle plunger|ejector nozzle|vent banjo|fuel bowl/i, 'Diaphragms & Accelerator Pump Parts'],
  ],
  Carburetor: [
    [/linkert/i, 'Linkert Parts'],
    [/throttle|choke/i, 'Throttle & Choke Components'],
    [/bowl|venturi|nozzle/i, 'Bowl & Venturi Components'],
    [/./, 'Complete Carburetors'],
  ],
  'Air Filter': [
    [/velocity stacks?/i, 'Velocity Stacks'],
    [/wraps?|drycharger|rain socks?|pre-filters?/i, 'Filter Wraps & Pre-Filters'],
    [/./, 'Replacement Filter Elements'],
  ],
  Manifold: [
    [/seals?\b|o-?rings?/i, 'Manifold Seals & O-Rings'],
    [/clamps?/i, 'Manifold Clamps'],
    [/nipples?|spacers?|flanges?/i, 'Manifold Hardware'],
    [/./, 'Complete Manifolds'],
  ],
  Modules: [
    [/\becm\b/i, 'ECM & Engine Controllers'],
    [/fi2000/i, 'Fi2000 Tuning Modules'],
    [/power commander|power vision|fuelpak|thundermax|autotune|auto tune|target tune|thunderslide/i, 'Tuning Modules'],
    [/./, 'Other Modules & Accessories'],
  ],
  'Air Cleaner Mounts, Brackets & Hardware': [
    [/brackets?/i, 'Mount Brackets'],
    [/support kits?/i, 'Support Kits'],
    [/hardware kits?/i, 'Hardware Kits'],
    [/./, 'Other Mounting Hardware'],
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
