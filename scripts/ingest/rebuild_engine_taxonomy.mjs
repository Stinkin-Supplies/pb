#!/usr/bin/env node
/**
 * rebuild_engine_taxonomy.mjs
 *
 * Laken's finalized spec for Engine, 14 named subcategories: Pistons,
 * Cylinders, Cam Chest, Rocker Boxes, Performance Kits, Oil Pump & System,
 * Engine Mounts, Valves, Cooling System, Inspection Covers, Engine Dress
 * Up Kit, General, Pushrods, Accessories -- plus 3 extra buckets she
 * confirmed keeping (content that's genuinely Engine but not covered by
 * the 14 names): Bottom End, Complete Engines, Cylinder Heads.
 *
 * Findings from sampling, all confirmed with Laken before applying:
 *   - 241 rows in "Pistons & Cylinders" are brake calipers (described by
 *     piston count, e.g. "4 Piston Caliper") and seat springs -- not
 *     engine parts. Move out to Brakes / Seating.
 *   - "Heads & Valves" 's 119 complete cylinder-head-casting rows get
 *     their own new "Cylinder Heads" bucket, separate from Valves.
 *   - Rocker-box-specific rows inside "Heads & Valves" (die-cast rocker
 *     boxes, rocker box nuts/mounts/studs) merge into "Rocker Boxes"
 *     (renamed from "Rocker Box Covers"), not "Valves".
 *   - Engine's own internal "Gaskets & Seals" (354 rows: O-rings/seals for
 *     cam/pushrod/rocker/clutch cover/etc.) consolidates into the
 *     standalone Gaskets & Seals category's own Engine subcategory,
 *     rather than staying as a redundant duplicate inside Engine.
 *   - Old "Cam Covers" bucket merges into "Cam Chest".
 *   - Old "Engine Parts" catch-all (29 rows) folds into "General".
 *
 * Usage:
 *   node scripts/ingest/rebuild_engine_taxonomy.mjs            # dry run
 *   node scripts/ingest/rebuild_engine_taxonomy.mjs --apply    # live write
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

// ── Phase A: whole-bucket renames/merges (old subcategory -> new) ──────────
const BUCKET_RENAMES = {
  'Camchest': 'Cam Chest',
  'Cam Covers': 'Cam Chest',
  'Rocker Box Covers': 'Rocker Boxes',
  'Pushrod Covers': 'Pushrods',
  'Engine Mounts & Hardware': 'Engine Mounts',
  'Engine Dress-Up Kits': 'Engine Dress Up Kit',
  'Engine Accessories': 'Accessories',
  'Oil Pumps & System': 'Oil Pump & System',
  'Cooling System': 'Cooling System',
  'Performance Kits': 'Performance Kits',
  'Inspection Covers': 'Inspection Covers',
  'Bottom End': 'Bottom End',
  'Complete Engines': 'Complete Engines',
  'Engine Parts': 'General',
  'Valves & Valve Train': 'Valves',
};

// ── Phase B: Pistons & Cylinders split ──────────────────────────────────
const BRAKE_SEAT_RULES = [
  [/caliper/i, 'Brakes', 'Calipers'],
  [/master cylinder/i, 'Brakes', 'Master Cylinders'],
  [/brake shoe/i, 'Brakes', 'Brake Hardware'],
  [/seat spring/i, 'Seating', 'Seating Hardware- Springs. Brackets, Mounts, Tabs, etc.'],
];
function classifyBrakeSeat(name) {
  for (const [re, cat, subcat] of BRAKE_SEAT_RULES) {
    if (re.test(name)) return { cat, subcat };
  }
  return null;
}
function classifyPistonCylinder(name) {
  if (/cylinder|cylindr\b|cyolinder|top end/i.test(name)) return 'Cylinders';
  if (/piston|pstn|ring|wrist pin|circlip/i.test(name)) return 'Pistons';
  return 'General';
}

// ── Phase C: Heads & Valves split ───────────────────────────────────────
function classifyHeadsValves(name) {
  if (/cylinder head|complete head|replacement head|head casting/i.test(name)) return 'Cylinder Heads';
  if (/rocker box|die cast rocker/i.test(name)) return 'Rocker Boxes';
  return 'Valves';
}

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, name, display_subcategory FROM catalog_unified WHERE is_active = true AND display_category = $1`,
      [CAT]
    );
    console.log(`Total active rows in "${CAT}": ${res.rows.length}\n`);

    const updates = []; // { id, cat, subcat }
    const tally = {};

    for (const row of res.rows) {
      let dest = null;

      if (row.display_subcategory === 'Pistons & Cylinders') {
        const brakeSeat = classifyBrakeSeat(row.name);
        if (brakeSeat) {
          dest = brakeSeat;
        } else {
          dest = { cat: CAT, subcat: classifyPistonCylinder(row.name) };
        }
      } else if (row.display_subcategory === 'Heads & Valves') {
        dest = { cat: CAT, subcat: classifyHeadsValves(row.name) };
      } else if (row.display_subcategory === 'Gaskets & Seals') {
        // one confirmed brake misfile found while sampling
        if (/brake caliper seal/i.test(row.name)) {
          dest = { cat: 'Brakes', subcat: 'Brake Hardware' };
        } else {
          dest = { cat: 'Gaskets & Seals', subcat: 'Engine' };
        }
      } else if (BUCKET_RENAMES[row.display_subcategory]) {
        dest = { cat: CAT, subcat: BUCKET_RENAMES[row.display_subcategory] };
      } else {
        dest = { cat: CAT, subcat: 'General' };
      }

      const label = dest.cat === CAT ? dest.subcat : `${dest.cat} / ${dest.subcat}`;
      tally[label] = (tally[label] || 0) + 1;
      updates.push({ id: row.id, cat: dest.cat, subcat: dest.subcat });
    }

    console.log('=== Final mapping ===');
    for (const [label, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${label}: ${count}`);
    }
    console.log(`\nTotal updates staged: ${updates.length} / ${res.rows.length}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    await client.query(`DROP TABLE IF EXISTS backup_engine_20260718`);
    await client.query(
      `CREATE TABLE backup_engine_20260718 AS
       SELECT id, display_category, display_subcategory FROM catalog_unified
       WHERE is_active = true AND display_category = $1`,
      [CAT]
    );

    let updated = 0;
    for (const { id, cat, subcat } of updates) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, display_subcategory_detail = NULL WHERE id = $3`,
        [cat, subcat, id]
      );
      updated++;
    }
    await client.query('COMMIT');
    console.log(`\nApplied ${updated} row updates. Committed. Backup table: backup_engine_20260718`);
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
