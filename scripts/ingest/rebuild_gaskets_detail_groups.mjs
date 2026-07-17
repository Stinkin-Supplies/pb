#!/usr/bin/env node
/**
 * rebuild_gaskets_detail_groups.mjs
 *
 * Retroactive application of the session-89 "General bucket policy" to
 * Gaskets & Seals (rebuilt session 88, before the policy existed). No
 * catch-all "General" bucket exists here (the v2 rebuild produced 7 clean
 * functional subcats) -- this just adds display_subcategory_detail
 * groupings to the 5 buckets over ~150 rows: Engine (2259), Transmission
 * (1118), Forks (303), Carbs (250), Electric & Lighting (174).
 *
 * Usage:
 *   node scripts/ingest/rebuild_gaskets_detail_groups.mjs            # dry run
 *   node scripts/ingest/rebuild_gaskets_detail_groups.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CAT = 'Gaskets & Seals';

const DETAIL_RULES = {
  Engine: [
    [/complete.*gasket|top ?end|\bmotor\b.*\bkit\b|engine gasket kit/i, 'Complete & Top End Gasket Kits'],
    [/valve (guide|stem)/i, 'Valve Guide & Valve Stem Gaskets'],
    [/\bhead\b/i, 'Head Gaskets'],
    [/\bbase\b/i, 'Base Gaskets'],
    [/\bcam\b/i, 'Cam Cover & Cam Gaskets'],
    [/rocker|pushrod|tappet/i, 'Rocker Box & Pushrod Gaskets'],
    [/oil pump|oil pan|oil spout|oil fill|oil strainer|oil change/i, 'Oil Pump & Oil Pan Gaskets'],
    [/breather/i, 'Breather Gaskets'],
    [/seals?\b|o-?rings?/i, 'Seals & O-Rings'],
  ],
  Transmission: [
    [/complete.*gasket|gasket and seal kit/i, 'Complete Gasket Kits'],
    [/\bprim(ary)?\b/i, 'Primary Cover Gaskets & Seals'],
    [/derby/i, 'Derby Cover Gaskets'],
    [/clutch/i, 'Clutch Gaskets & Seals'],
    [/inspec/i, 'Inspection Cover Gaskets'],
    [/main ?shaft|\bshift|shftr|counter ?shaft|kicker/i, 'Shifter & Mainshaft Seals'],
    [/sprocket|sprkt|chain/i, 'Sprocket & Chain Seals'],
    [/\btrans/i, 'Transmission Top & Trans Gaskets'],
  ],
  Forks: [
    [/boots?\b/i, 'Fork Boots'],
    [/wheel|rim seal|hub/i, 'Wheel Bearing Seals'],
    [/swingarm/i, 'Swingarm & Rear Axle Seals'],
    [/fork|slider|damper|wiper/i, 'Fork Seals & Wiper Kits'],
  ],
  Carbs: [
    [/fuel pump/i, 'Fuel Pump Gaskets'],
    [/\befi\b|injector/i, 'EFI & Fuel Injection Gaskets'],
    [/magneto/i, 'Magneto Gaskets'],
    [/air ?cleaner|back ?plate|a\/c element/i, 'Air Cleaner & Backplate Gaskets'],
    [/manifold|compliance fitting|top plate|throttle body|airbox/i, 'Intake Manifold Gaskets & Seals'],
    [/carb(uretor)?|linkert|keihin|bendix|schebler|float bowl/i, 'Carburetor Gaskets & Kits'],
  ],
  'Electric & Lighting': [
    [/starter/i, 'Starter Gaskets & Seals'],
    [/generator/i, 'Generator Gaskets'],
    [/lamp|lens|marker/i, 'Lamp & Lens Gaskets'],
    [/distributor|points?\b|circuit breaker|ignition|magneto|solenoid/i, 'Distributor & Ignition Gaskets'],
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

    // One-off correction found while sampling: 10 Kibblewhite "Valve Guide
    // Seals" rows are genuinely engine valve components (not electrical
    // parts) but were filed under Electric & Lighting -- move to Engine.
    const valveGuideRes = await client.query(
      `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Electric & Lighting' AND name ILIKE '%valve guide%'`,
      [CAT]
    );
    console.log(`\n[Correction] ${valveGuideRes.rows.length} "Valve Guide Seals" rows: Electric & Lighting -> Engine`);
    for (const row of valveGuideRes.rows) {
      detailUpdates.push({ id: row.id, label: 'Valve Guide & Valve Stem Gaskets', moveTo: 'Engine' });
    }

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    let updated = 0;
    for (const { id, label, moveTo } of detailUpdates) {
      if (moveTo) {
        await client.query(
          `UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = $2 WHERE id = $3`,
          [moveTo, label, id]
        );
      } else {
        await client.query(`UPDATE catalog_unified SET display_subcategory_detail = $1 WHERE id = $2`, [label, id]);
      }
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
