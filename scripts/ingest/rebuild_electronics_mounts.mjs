#!/usr/bin/env node
/**
 * rebuild_electronics_mounts.mjs
 *
 * Creates Accessories & Misc > Electronics & Mounts and moves phone/GPS/
 * camera device-mounting + charging products into it, regardless of their
 * current (often nonsensical — Engine, Suspension) category.
 *
 * Scope:
 *   - brand IN ('RAM Mounts', 'SP Connect', 'RIDEPOWER') — entire brand,
 *     any current category/subcategory
 *   - Ciro rows currently in Electrical > Audio & Communication matching
 *     phone/GPS/camera/mirror/perch-mount name patterns only (Ciro's other
 *     products — footpegs, lighting, throttle accessories — are untouched)
 *
 * RAM Mounts / SP Connect Detail rules were built against real product
 * names (533 rows reviewed) — GPS Mounts, Camera Mounts, Tablet Mounts,
 * Cases & Protection, Chargers & Power, Phone Mounts, and a
 * Mount Bases & Adapters fallback for generic hardware (balls, bases,
 * arms, u-bolts, adapters, modules).
 *
 * Usage:
 *   node scripts/ingest/rebuild_electronics_mounts.mjs            # dry run
 *   node scripts/ingest/rebuild_electronics_mounts.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const NEW_CATEGORY = 'Accessories & Misc';
const NEW_SUBCATEGORY = 'Electronics & Mounts';

// First match wins. Applies to whatever candidate row is being processed.
// Rebuilt against real RAM Mounts / SP Connect product names (not just
// brand-level counts) — see conversation for the source data.
const RULES = [
  { test: /garmin|tomtom|gps cradle|gps.*mount/i,               detail: 'GPS Mounts' },
  { test: /gopro|camera mount/i,                                 detail: 'Camera Mounts' },
  { test: /tab-tite|\btablet\b/i,                                detail: 'Tablet Mounts' },
  { test: /cup holder|gun holster/i,                             detail: 'Accessory Holders (Cup/Gun)' },
  { test: /phone case|weather cover|screen protector|card wallet|arm band|xtreme.*case|flip cover/i, detail: 'Cases & Protection' },
  { test: /charg|power ?bank|hardwire cable|12v cable/i,         detail: 'Chargers & Power' },
  { test: /phone holder|phone mount|smartphone|x-?grip|quick-?grip|3d phone mount|moto (stem )?mount|bar clamp mount|brake mount|clutch mount|mirror mount|vent mount|ballhead mount|crossbar mount|roll cage mount/i, detail: 'Phone Mounts' },
];
const DEFAULT_DETAIL = 'Mount Bases & Adapters'; // balls, bases, arms, u-bolts, torque mounts, adapters, modules, interfaces, replacement heads, tools

async function main() {
  const client = await pool.connect();
  try {
    // Candidate set A: entire brands, any current category
    const { rows: brandRows } = await client.query(`
      SELECT id, brand, name, display_category, display_subcategory, display_subcategory_detail
      FROM catalog_unified
      WHERE is_active = true
        AND brand IN ('RAM Mounts', 'SP Connect', 'RIDEPOWER')
    `);

    // Candidate set B: Ciro phone/GPS/camera/mount items currently under Audio & Communication
    const { rows: ciroRows } = await client.query(`
      SELECT id, brand, name, display_category, display_subcategory, display_subcategory_detail
      FROM catalog_unified
      WHERE is_active = true
        AND brand = 'Ciro'
        AND display_category = 'Electrical'
        AND display_subcategory = 'Audio & Communication'
        AND (
          name ILIKE '%phone holder%' OR name ILIKE '%holder phone%' OR name ILIKE '%smartphone%' OR
          name ILIKE '%gopro%' OR name ILIKE '%camera mount%' OR
          name ILIKE '%mirror mount%' OR name ILIKE '%perch mount%' OR
          name ILIKE '%universal%mount%' OR name ILIKE '%fairing mount%'
        )
    `);

    const rows = [...brandRows, ...ciroRows];
    console.log(`Candidate rows: ${rows.length} (${brandRows.length} brand-scoped + ${ciroRows.length} Ciro phone/mount items)`);

    const updates = [];
    const fallback = []; // rows landing on the generic default (sanity-check sample)

    for (const row of rows) {
      let detail = null;
      for (const rule of RULES) {
        if (rule.test.test(row.name)) {
          detail = rule.detail;
          break;
        }
      }
      if (!detail) {
        detail = DEFAULT_DETAIL;
        fallback.push(row);
      }

      updates.push({
        id: row.id,
        brand: row.brand,
        name: row.name,
        old_category: row.display_category,
        old_subcategory: row.display_subcategory,
        new_detail: detail,
      });
    }

    const byDetail = {};
    const byOldCategory = {};
    for (const u of updates) {
      byDetail[u.new_detail] = (byDetail[u.new_detail] || 0) + 1;
      const oldKey = `${u.old_category} → ${u.old_subcategory || '(blank)'}`;
      byOldCategory[oldKey] = (byOldCategory[oldKey] || 0) + 1;
    }

    console.log('\n=== Where these rows are coming FROM today ===');
    Object.entries(byOldCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${n.toString().padStart(4)}  ${k}`));

    console.log('\n=== Proposed new Detail distribution ===');
    Object.entries(byDetail)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${n.toString().padStart(4)}  ${k}`));

    console.log(`\nRows landing on generic "Mount Bases & Adapters" fallback (no specific-bucket rule hit): ${fallback.length}`);
    console.log('  Expected — this is the correct home for generic hardware (balls, bases, arms, u-bolts, adapters).');
    console.log('  Sample:');
    fallback.slice(0, 15).forEach(f => console.log(`    [${f.brand}] ${f.name}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    console.log(`\nApplying ${updates.length} updates...`);
    await client.query('BEGIN');
    let done = 0;
    for (const u of updates) {
      await client.query(
        `UPDATE catalog_unified
         SET display_category = $1, display_subcategory = $2, display_subcategory_detail = $3
         WHERE id = $4`,
        [NEW_CATEGORY, NEW_SUBCATEGORY, u.new_detail, u.id]
      );
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${updates.length}`);
    }
    await client.query('COMMIT');
    console.log(`Done. ${done} rows updated.`);
    console.log('\nNEXT STEPS:');
    console.log('  1. Reindex Typesense (node scripts/ingest/index_unified.js --recreate)');
    console.log('  2. Spot-check /browse?display_category=Accessories+%26+Misc&display_subcategory=Electronics+%26+Mounts');
    console.log('  3. Sanity-check Engine/Suspension category counts dropped (RAM Mounts/SP Connect no longer there)');
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
