#!/usr/bin/env node
/**
 * detail_levers_hand_controls.mjs
 *
 * Session-89 follow-up #3: Laken flagged "lots of hardware inside the
 * levers and hand controls" -- Levers & Hand Controls sits at 910 rows,
 * well over the 150-item detail-grouping threshold (see
 * [[feedback-general-bucket-policy]] in memory), and the bucket really is
 * four distinct product types mixed together with no way to browse just
 * one: complete lever sets/assemblies, master cylinder assemblies/covers/
 * rebuild kits, bundled handlebar control kits (lever + master cylinder +
 * often wiring, sold as one SKU), and small hardware (perch clamps,
 * pivot pins, retaining rings, grease fittings, adapters, gaskets).
 *
 * All 910 rows are correctly scoped to this subcategory already (this is
 * a pure detail-tagging pass, not a reclassification) -- the "hardware"
 * Laken is seeing is a real, identifiable cluster within an otherwise
 * correctly-placed bucket, not a miscategorization to fix elsewhere.
 *
 * Usage:
 *   node scripts/ingest/detail_levers_hand_controls.mjs            # dry run
 *   node scripts/ingest/detail_levers_hand_controls.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const CATEGORY = 'Handlebars & Hand Controls';
const SUBCAT = 'Levers & Hand Controls';

// Checked in priority order -- hardware/small-parts first (most specific),
// then master cylinder, then bundled control kits, then bare levers last
// (broadest match, so it doesn't steal from the more specific groups above).
const DETAIL_RULES = [
  { detail: 'Hardware & Small Parts', test: /grease fitting|rod end|allen screw|screw kit|anti-rattle|control clamp half|pivot pin|gasket|\bclip\b|\bwasher\b|\bspacer\b|\bbushing\b|set screw|snap ring|perch clamp|retaining ring|adapter|control wire/i },
  { detail: 'Master Cylinders', test: /master cyl(inder)?|m\/c\s*assy|mechanical clutch assembly/i },
  { detail: 'Handlebar Control Kits', test: /control clutch|clutch control|control kit|control assembly|control module|vintage control kit|h\/bar\s*cntrls|control cover|comp h\/bar cntrls/i },
  { detail: 'Levers', test: /\blevers?\b/i },
];

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND display_subcategory = $2`,
      [CATEGORY, SUBCAT]);
    console.log(`Total rows: ${rows.length}\n`);

    const byDetail = {};
    let noDetail = 0;
    for (const r of rows) {
      let matched = null;
      for (const rule of DETAIL_RULES) {
        if (rule.test.test(r.name)) { matched = rule.detail; break; }
      }
      r.detail = matched;
      if (matched) (byDetail[matched] = byDetail[matched] || []).push(r);
      else noDetail++;
    }

    console.log('=== Detail groupings ===');
    Object.entries(byDetail).sort((a, b) => b[1].length - a[1].length)
      .forEach(([d, list]) => console.log(`  ${list.length.toString().padStart(4)}  ${d}`));
    console.log(`  ${noDetail.toString().padStart(4)}  (no detail -- ungrouped)`);

    console.log('\n=== Sample per detail (10 each) ===');
    for (const [detail, list] of Object.entries(byDetail)) {
      console.log(`\n--- ${detail} (${list.length}) ---`);
      list.slice(0, 10).forEach(r => console.log(`  [${r.brand}] ${r.name}`));
    }

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory_detail = $1 WHERE id = $2`, [r.detail, r.id]);
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
