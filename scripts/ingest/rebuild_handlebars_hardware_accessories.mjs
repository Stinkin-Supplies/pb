#!/usr/bin/env node
/**
 * rebuild_handlebars_hardware_accessories.mjs
 *
 * Session-89 follow-up: rename the "General & Accessories" catch-all
 * (under Handlebars & Hand Controls) to "Hardware & Accessories" and add
 * detail-level groupings so the 699-row catch-all is actually browsable --
 * first application of the new standing policy: every catch-all/General
 * bucket gets like-things-grouped detail tags, with true stragglers left
 * ungrouped (they sort alphabetically by name on their own).
 *
 * Also corrects two things found while auditing the bucket:
 *   - ~19 "Handlebar Control Kit/Spacer/Module" rows (HardDrive,
 *     Performance Machine, Ultima, V-Twin, Legend Suspension) belong with
 *     their siblings in the Levers & Hand Controls subcategory -- same
 *     product type, just landed in the catch-all because they didn't match
 *     a bar-style keyword.
 *   - Stale pre-existing detail values (Risers, Front Brake Lines, Clamps,
 *     Handlebar Cable Kits, T-Bars -- leftovers from a taxonomy that
 *     predates this session's rebuild) get cleared before the new scheme
 *     is applied.
 *
 * Flagged but NOT moved (wrong CATEGORY entirely, out of scope for this
 * pass -- reported at the end for a future cleanup):
 *   - ~16 V-Twin "Stoppa-Choppa" rows are wheel hub/brake parts.
 *   - JAGG (3), OLD STF (1), SP1 fuel-line-clip rows (4) are oil-cooler/
 *     engine/fuel-system parts with no handlebar connection at all.
 *
 * Usage:
 *   node scripts/ingest/rebuild_handlebars_hardware_accessories.mjs            # dry run
 *   node scripts/ingest/rebuild_handlebars_hardware_accessories.mjs --apply    # live write
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
const OLD_SUBCAT = 'General & Accessories';
const NEW_SUBCAT = 'Hardware & Accessories';

// Move to Levers & Hand Controls entirely (not just a detail tag) --
// same product family as what's already there.
const MOVE_TO_LEVERS = /handlebar control (kit|spacer|module)|control (kit|assembly).*handlebar|handlebar mounted control/i;

// Move to Grips entirely -- ODI's "Vans Signature" line ships in both
// Cable and TBW (throttle-by-wire) fitments; the Cable ones already sit
// correctly in Grips, the TBW ones landed here since nothing else matched.
const MOVE_TO_GRIPS = (brand, name) => brand === 'ODI' && /vans signature/i.test(name);

// Flag-only: wrong category, left in place, reported at the end.
const WRONG_CATEGORY = (brand, name) =>
  (brand === 'V-Twin' && /stoppa-choppa/i.test(name)) ||
  brand === 'JAGG' ||
  brand === 'OLD STF' ||
  (brand === 'SP1' && /fuel line clip|junction box/i.test(name));

// Burly Brand lists the same handlebar lines twice under two naming
// conventions -- "Jason Handlebar - 12" - Black" (catches via /handlebar/)
// and an all-caps SKU form "JASON 12" BAR 1.25" TBW BLACK" that only says
// "BAR", never "HANDLEBAR". Scoped to the brand since bare "bar" is too
// generic to trust elsewhere.
const BURLY_BAR_LINES = /\b(jason|louie|sid|folsom|viejo|dominator|scrambler|clubman|jim)\b.*\bbar\b/i;

// Detail groupings -- checked in order, first match wins. Signature is
// test(brand, name) so brand-scoped rules (like the Burly one above) can
// sit alongside brand-agnostic keyword rules.
const DETAIL_RULES = [
  { detail: 'Stash Tubes', test: (b, n) => /stash tube/i.test(n) },
  { detail: 'Handguards', test: (b, n) => /handguard|hand protector/i.test(n) },
  { detail: 'Phone & Device Mounts', test: (b, n) => /phone|device (mount|holder)|iomount|iostand|iomini|iocore|ioadapt|iocharg|cybercharg|gopro|perch mount|accessory mount|action mount|adjust-a-ball|trim line arm|usb charger/i.test(n) },
  { detail: 'Throttle Components', test: (b, n) => /throttle|twist grip|idle (speed|adjustment)|\bspiral\b|quick-?turn/i.test(n) || ((b === 'Wild 1' || b === 'Hawg Halters') && /thrtl|\bthr\b/i.test(n)) },
  { detail: 'Hardware & Fasteners', test: (b, n) => /bolt kit|collar set|damper (bushing|kit)|end (nut|plug)|mount washer|o-clip|bushing kit|\bclip\b(?!-on)|\bplunger\b|lever mount kit|pivot barrel|\bbushing\b|\bdamper\b/i.test(n) },
  { detail: 'Handlebars', test: (b, n) => (/handlebar(?!.*\b(control|throttle|damper|bolt|collar|clip|plug|mount|bushing)\b)/i.test(n) || /\bv-bar\b|\bclub bar\b|clip-on|tiller-?bar|phatbar/i.test(n) || (b === 'Burly Brand' && BURLY_BAR_LINES.test(n))) },
];

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name, display_subcategory_detail FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND display_subcategory = $2`,
      [CATEGORY, OLD_SUBCAT]);
    console.log(`Total rows: ${rows.length}\n`);

    const moveToLevers = [];
    const moveToGrips = [];
    const flaggedWrongCategory = [];
    const byDetail = {};
    let noDetail = 0;

    for (const r of rows) {
      if (MOVE_TO_LEVERS.test(r.name)) { moveToLevers.push(r); continue; }
      if (MOVE_TO_GRIPS(r.brand, r.name)) { moveToGrips.push(r); continue; }
      if (WRONG_CATEGORY(r.brand, r.name)) { flaggedWrongCategory.push(r); continue; }
      let matched = null;
      for (const rule of DETAIL_RULES) {
        if (rule.test(r.brand, r.name)) { matched = rule.detail; break; }
      }
      r.detail = matched;
      if (matched) (byDetail[matched] = byDetail[matched] || []).push(r);
      else noDetail++;
    }

    console.log(`=== Moving to Levers & Hand Controls (${moveToLevers.length}) ===`);
    moveToLevers.forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    console.log(`\n=== Moving to Grips (${moveToGrips.length}) ===`);
    moveToGrips.forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    console.log(`\n=== Flagged wrong-category, NOT moved (${flaggedWrongCategory.length}) ===`);
    flaggedWrongCategory.forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    console.log(`\n=== Detail groupings within "${NEW_SUBCAT}" ===`);
    Object.entries(byDetail).sort((a, b) => b[1].length - a[1].length)
      .forEach(([d, list]) => console.log(`  ${list.length.toString().padStart(4)}  ${d}`));
    console.log(`  ${noDetail.toString().padStart(4)}  (no detail -- ungrouped stragglers, sort alphabetically by name)`);

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

    // 1. Rename subcategory
    await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE is_active = true AND display_category = $2 AND display_subcategory = $3`,
      [NEW_SUBCAT, CATEGORY, OLD_SUBCAT]);

    // 2. Move control-kit rows to Levers & Hand Controls
    for (const r of moveToLevers) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = NULL WHERE id = $2`,
        ['Levers & Hand Controls', r.id]);
    }

    // 3. Move ODI Vans Signature TBW rows to Grips
    for (const r of moveToGrips) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = NULL WHERE id = $2`,
        ['Grips', r.id]);
    }

    // 4. Clear stale detail values on everything else, then apply new detail groupings
    for (const r of rows) {
      if (MOVE_TO_LEVERS.test(r.name) || MOVE_TO_GRIPS(r.brand, r.name)) continue;
      const detail = r.detail || null;
      await client.query(`UPDATE catalog_unified SET display_subcategory_detail = $1 WHERE id = $2`, [detail, r.id]);
    }

    await client.query('COMMIT');
    console.log('\nDone. All updates applied.');
    console.log('\nNEXT STEPS:');
    console.log('  1. node scripts/ingest/index_unified.js --recreate');
    console.log('  2. Review the flagged wrong-category rows above for a future cleanup pass');
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
