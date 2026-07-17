#!/usr/bin/env node
/**
 * rebuild_fuel_air_carbs_taxonomy.mjs
 *
 * Laken's finalized spec for "Carburetion & Fuel" -> renamed "Fuel, Air &
 * Carburetors", 15 target subcategories. Classifies every active row in the
 * category from scratch (old subcat boundaries don't map cleanly onto the
 * new 15). Also relocates 57 rows that don't belong in this category at all
 * (Laken's own spot-check list -- belt buckles, shop books, crankcase/
 * oil-tank breathers -- plus more of the same families found while
 * sampling the General leftover bucket) to their correct existing homes
 * elsewhere in the catalog.
 *
 * Usage:
 *   node scripts/ingest/rebuild_fuel_air_carbs_taxonomy.mjs            # dry run, full report
 *   node scripts/ingest/rebuild_fuel_air_carbs_taxonomy.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CAT = 'Carburetion & Fuel';
const NEW_CAT = 'Fuel, Air & Carburetors';

// ── Out-of-category candidates ──────────────────────────────────────────────
// Laken's own spot-check list, plus more of the same families found while
// sampling the General leftover bucket. Each moves to an existing bucket
// elsewhere in the catalog (confirmed against live subcategory names).
const OUT_OF_CATEGORY_RULES = [
  [/belt buckle/i, 'Accessories & Gear', 'Merchandising'],
  [/parts book/i, 'Accessories & Gear', 'Shop Books'],
  [/vented dipstick|oil tank breather|filter element - oil tank/i, 'Tanks & Body', 'Oil Tank & Dipsticks'],
  [/oil drain|oil return|oil line/i, 'Tanks & Body', 'Oil & Fuel Lines'],
  [/crankcase to primary|inner primary cover breather|rocker box breather|primary breather/i, 'Engine', 'Engine Accessories'],
  [/threadlocker/i, 'Tools & Chemicals', 'Chemicals & Lubricants'],
  [/points and condenser/i, 'Electrical', 'Points, Distributors & Accessories'],
];

// Rows that stay in-category but get routed to a different existing
// category/subcategory than the main 15-bucket classification would give
// them (currently just the EFI sensors, per Laken's call).
const CROSS_CATEGORY_IN_RULES = [
  [/o2 sensors?|map sensors?|barometric pressure switch|throttle position sensors?/i, 'Electrical', 'Sensors & Switches'],
];

// ── In-category classification (first match wins) ──────────────────────────
const RULES = [
  [/throttle bod(y|ies)|throttle bdy/i, 'Throttle Body'],
  [/manifolds?/i, 'Manifold'],
  [/tuners?|modules?|\becm\b|controllers?|fuelpak|power commander|power vision|autotune|auto tune|thundermax|fi2000|target tune|digital display|tune up kits?|pocket tuner|thunderslide/i, 'Modules'],
  [/fuel filters?|fuel injectors?|\binjectors?\b|fuel pressure regulators?|fuel inlets?|gas shut ?offs?|fuel lines?|vent lines?|hose covers?|siphon pump/i, 'Fuel Filters'],
  [/backing plates?/i, 'Backing Plates'],
  [/adapters?/i, 'Air Cleaner Adapters'],
  [/rebuild kits?|repair kits?|master rebuild/i, 'Rebuild Kits'],
  [/jets?\b|needles?|screws?|pilots?\b|floats?\b|springs?\b|diaphragms?|accelerator pump|insulator block|enrichment|idle plunger|ejector nozzle|vent banjo|fuel bowl/i, 'Jets, Needles, Screws, etc.'],
  [/flanges?/i, 'Flange'],
  [/breather bolts?/i, 'Breather Bolts'],
  [/air filters?|velocity stacks?|filter elements?|filter wraps?|drycharger|rain socks?|pre-filters?|foam air/i, 'Air Filter'],
  [/big sucker|billet sucker/i, 'Air Cleaner'],
  [/air dam|choke/i, 'Carburetor'],
  [/brackets?|mounts?|support kits?|hardware kits?/i, 'Air Cleaner Mounts, Brackets & Hardware'],
  [/carburetors?|\bcarbs?\b|linkert/i, 'Carburetor'],
  [/air ?cleaners?|aircln?r|air intakes?|aircharger|breather/i, 'Air Cleaner'],
];

function matchOutOfCategory(name) {
  for (const [re, cat, subcat] of OUT_OF_CATEGORY_RULES) {
    if (re.test(name)) return { cat, subcat };
  }
  return null;
}

function matchCrossCategoryIn(name) {
  for (const [re, cat, subcat] of CROSS_CATEGORY_IN_RULES) {
    if (re.test(name)) return { cat, subcat };
  }
  return null;
}

function classify(name) {
  for (const [re, label] of RULES) {
    if (re.test(name)) return label;
  }
  return 'General';
}

async function main() {
  const res = await pool.query(
    `SELECT id, name, brand, display_subcategory FROM catalog_unified WHERE is_active = true AND display_category = $1`,
    [CAT]
  );
  console.log(`Total active rows in "${CAT}": ${res.rows.length}\n`);

  const outOfCategory = {}; // label -> rows, dest
  const crossCategory = {};
  const tally = {};
  const sampleByLabel = {};
  const updates = []; // { id, cat, subcat }

  for (const row of res.rows) {
    const ooc = matchOutOfCategory(row.name);
    if (ooc) {
      const label = `${ooc.cat} / ${ooc.subcat}`;
      outOfCategory[label] = outOfCategory[label] || [];
      outOfCategory[label].push(row);
      updates.push({ id: row.id, cat: ooc.cat, subcat: ooc.subcat });
      continue;
    }
    const xcat = matchCrossCategoryIn(row.name);
    if (xcat) {
      const label = `${xcat.cat} / ${xcat.subcat}`;
      crossCategory[label] = crossCategory[label] || [];
      crossCategory[label].push(row);
      updates.push({ id: row.id, cat: xcat.cat, subcat: xcat.subcat });
      continue;
    }
    const label = classify(row.name);
    tally[label] = (tally[label] || 0) + 1;
    sampleByLabel[label] = sampleByLabel[label] || [];
    if (sampleByLabel[label].length < 5) sampleByLabel[label].push(row.name);
    updates.push({ id: row.id, cat: NEW_CAT, subcat: label });
  }

  console.log('=== Out-of-category moves ===');
  for (const [label, rows] of Object.entries(outOfCategory)) {
    console.log(`\n${label}: ${rows.length}`);
    for (const r of rows.slice(0, 12)) console.log(`  ${r.brand || ''} | ${r.name}`);
  }

  console.log('\n=== Cross-category moves (stays out of the 15-bucket split) ===');
  for (const [label, rows] of Object.entries(crossCategory)) {
    console.log(`\n${label}: ${rows.length}`);
    for (const r of rows.slice(0, 5)) console.log(`  ${r.brand || ''} | ${r.name}`);
  }

  console.log('\n\n=== Proposed 15-bucket mapping (in-category rows) ===');
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  for (const [label, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`\n${label}: ${count}`);
    for (const s of sampleByLabel[label]) console.log(`  e.g. ${s}`);
  }
  console.log(`\nTotal classified: ${total} / ${res.rows.length}`);
  console.log(`Total updates staged: ${updates.length}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write changes.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DROP TABLE IF EXISTS backup_fuel_air_carbs_20260717`);
    await client.query(
      `CREATE TABLE backup_fuel_air_carbs_20260717 AS
       SELECT id, display_category, display_subcategory FROM catalog_unified
       WHERE is_active = true AND display_category = $1`,
      [CAT]
    );

    let updated = 0;
    for (const { id, cat, subcat } of updates) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = $3`,
        [cat, subcat, id]
      );
      updated++;
    }
    await client.query('COMMIT');
    console.log(`\nApplied ${updated} row updates. Committed. Backup table: backup_fuel_air_carbs_20260717`);
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
