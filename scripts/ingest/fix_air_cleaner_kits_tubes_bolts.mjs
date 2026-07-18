#!/usr/bin/env node
/**
 * fix_air_cleaner_kits_tubes_bolts.mjs
 *
 * Laken spotted three things mixed into the "Air Cleaner" subcategory
 * (currently just the leftover breather-hardware pile after Complete Air
 * Cleaner Kits & Assemblies and Air Cleaner Inserts & Covers were promoted
 * out): a handful of items that are actually complete air cleaner kits
 * (word order "[Style Name] Air Cleaner Kit" -- the style name happens to
 * include "Heavy Breather," not an accessory kit), a couple of items that
 * are explicitly breather BOLTS (should be in the existing "Breather
 * Bolts" subcategory, which is bolt-specific -- every one of its existing
 * 16 rows has "Bolt" in the name), and generic "breather tubes" that were
 * never broken out from the rest of the breather-hardware pile.
 *
 * Fixes:
 *   1. 11 rows -> Complete Air Cleaner Kits & Assemblies
 *   2. 2 rows -> Breather Bolts (explicit "Bolt(s)" in the name)
 *   3. Remaining ~65 rows -> detail-group by type (Tubes, Hoses, Snoots,
 *      Kits, Washers & Fittings, Catch Can/Vent Systems) so "breather
 *      tubes" specifically become their own browsable DETAIL group
 *      instead of one undifferentiated pile.
 *
 * Usage:
 *   node scripts/ingest/fix_air_cleaner_kits_tubes_bolts.mjs            # dry run
 *   node scripts/ingest/fix_air_cleaner_kits_tubes_bolts.mjs --apply    # live write
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

// 1. Complete air cleaner kits (word order: "[Style] Air Cleaner Kit", not
// "Air Cleaner [Accessory] Kit") -- hand-verified from the full read.
const COMPLETE_KIT_IDS = [
  73443, 91432, 91431, 91436, 91434, 91204, 91435, 91439, 91438, 47517, 47516,
];

// 2. Explicit breather-bolt items (matches the existing Breather Bolts
// bucket's own naming convention -- literal "Bolt(s)" in the name).
const BOLT_IDS = [91756, 44285];

// 3. Detail groups for what's left (breather hardware, not a complete kit
// or a bolt) -- first match wins.
const DETAIL_RULES = [
  [/tube/i, 'Breather Tubes'],
  [/hose/i, 'Breather Hoses'],
  [/snoot|funnel|spike/i, 'Breather Snoots & Scoops'],
  [/pipe|nipple/i, 'Breather Pipes & Nipples'],
  [/catch can|separator|vent option kit|dual inlet/i, 'Catch Cans & Vent Systems'],
  [/washer|spacer|fitting|valve|banjo|billet/i, 'Breather Washers & Fittings'],
  [/kit/i, 'Breather Accessory Kits'],
];

function classifyDetail(name) {
  for (const [re, label] of DETAIL_RULES) {
    if (re.test(name)) return label;
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Air Cleaner'`,
      [CAT]
    );
    console.log(`Total rows currently in "Air Cleaner": ${res.rows.length}`);

    const kitRows = res.rows.filter(r => COMPLETE_KIT_IDS.includes(r.id));
    const boltRows = res.rows.filter(r => BOLT_IDS.includes(r.id));
    const remaining = res.rows.filter(r => !COMPLETE_KIT_IDS.includes(r.id) && !BOLT_IDS.includes(r.id));

    console.log(`\n=== Moving to Complete Air Cleaner Kits & Assemblies: ${kitRows.length} ===`);
    for (const r of kitRows) console.log(`  ${r.name}`);

    console.log(`\n=== Moving to Breather Bolts: ${boltRows.length} ===`);
    for (const r of boltRows) console.log(`  ${r.name}`);

    const detailTally = {};
    const detailUpdates = [];
    let stragglers = 0;
    for (const r of remaining) {
      const label = classifyDetail(r.name);
      if (label) {
        detailTally[label] = (detailTally[label] || 0) + 1;
        detailUpdates.push({ id: r.id, label });
      } else {
        stragglers++;
        console.log(`  UNCLASSIFIED: ${r.name}`);
      }
    }
    console.log(`\n=== Detail groups for the remaining ${remaining.length} rows ===`);
    for (const [label, count] of Object.entries(detailTally).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${label}: ${count}`);
    }
    console.log(`  (unclassified): ${stragglers}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    for (const r of kitRows) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory = 'Complete Air Cleaner Kits & Assemblies', display_subcategory_detail = NULL WHERE id = $1`,
        [r.id]
      );
    }
    for (const r of boltRows) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory = 'Breather Bolts', display_subcategory_detail = NULL WHERE id = $1`,
        [r.id]
      );
    }
    for (const { id, label } of detailUpdates) {
      await client.query(`UPDATE catalog_unified SET display_subcategory_detail = $1 WHERE id = $2`, [label, id]);
    }
    await client.query('COMMIT');
    console.log(`\nApplied: ${kitRows.length} -> Complete Air Cleaner Kits & Assemblies, ${boltRows.length} -> Breather Bolts, ${detailUpdates.length} detail tags. Committed.`);
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
