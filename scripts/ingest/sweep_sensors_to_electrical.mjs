#!/usr/bin/env node
/**
 * sweep_sensors_to_electrical.mjs
 *
 * Laken's ask: pull sensor products scattered across the catalog into
 * Electrical / Sensors & Switches. Full sweep for "sensor" in the name
 * outside Electrical found 126 rows -- most were false positives (a
 * gasket/seal/o-ring FOR a sensor, a wrench/socket TOOL for removing a
 * sensor, a bracket/bolt-kit compatible with a sensor mount, a manifold
 * with/without a sensor hole) that aren't sensors themselves and correctly
 * stay put. This script moves only the two confirmed groups:
 *   1. 56 unambiguous sensor units (O2/oxygen sensors in Exhaust, ABS
 *      brake sensors in Brakes, crankshaft position sensors in Engine,
 *      MAP sensors in Fuel/Air/Carbs that were missed by that category's
 *      recent rebuild).
 *   2. 19 speedometer/shift-position sensors scattered across Dashes &
 *      Gauges, Tools & Chemicals, Transmission, Cables, and Foot Controls
 *      -- Laken's call this time was to move all of these too, overriding
 *      the session-87 precedent of keeping speedometer sensors bundled
 *      with the gauge.
 *
 * Usage:
 *   node scripts/ingest/sweep_sensors_to_electrical.mjs            # dry run
 *   node scripts/ingest/sweep_sensors_to_electrical.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const DEST_CAT = 'Electrical';
const DEST_SUBCAT = 'Sensors & Switches';

// [category, subcategory, include-regex, exclude-regex]
const LOCATIONS = [
  ['Exhaust', 'Exhaust Parts', /sensor/i, /bung|plug|adapter|harness/i],
  ['Brakes', 'Brake Hardware', /abs brake sensor/i, null],
  ['Engine', 'Bottom End', /crankshaft position sensor/i, null],
  ['Fuel, Air & Carburetors', 'Manifold', /absolute pressure sensor/i, null],
  ['Dashes & Gauges', 'Speedometers', /electronic speedometer sensor/i, /hole plug/i],
  ['Tools & Chemicals', 'Tools', /electronic speedometer sensor/i, null],
  ['Transmission & Clutch', 'Mainshaft & Components', /speedometer drive sensor/i, null],
  ['Cables', 'Universal/Build Your Own', /speed sensor with/i, null],
  ['Foot Controls & Pegs', 'Shifter Lever, Shaft & Hardware', /shift sensor|linear sensor/i, null],
];

async function main() {
  const client = await pool.connect();
  try {
    const allUpdates = [];
    for (const [cat, subcat, include, exclude] of LOCATIONS) {
      const res = await client.query(
        `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = $2`,
        [cat, subcat]
      );
      const matched = res.rows.filter(r => include.test(r.name) && !(exclude && exclude.test(r.name)));
      console.log(`\n[${cat} / ${subcat}] ${matched.length} rows`);
      for (const r of matched) {
        console.log(`  ${r.name}`);
        allUpdates.push(r.id);
      }
    }

    console.log(`\nTotal to move: ${allUpdates.length}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    for (const id of allUpdates) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, display_subcategory_detail = NULL WHERE id = $3`,
        [DEST_CAT, DEST_SUBCAT, id]
      );
    }
    await client.query('COMMIT');
    console.log(`\nMoved ${allUpdates.length} rows to ${DEST_CAT} / ${DEST_SUBCAT}. Committed.`);
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
