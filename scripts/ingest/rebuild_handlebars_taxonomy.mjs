#!/usr/bin/env node
/**
 * rebuild_handlebars_taxonomy.mjs
 *
 * Rebuilds "Handlebar & Controls" -> "Handlebars & Hand Controls" per
 * Laken's session-89 spec. New subcategories:
 *   Ape Hangers, Z-Bars, T-Bars, Drag Style Bars, Moto Style,
 *   Replica Handlebars, Risers & Clamps, Grips, Mirrors,
 *   Handlebar Switches & Wiring Kits, Levers & Hand Controls,
 *   General & Accessories
 * ("Moto Style" and "Levers & Hand Controls" were added during the
 * session-89 walkthrough -- not in the original 10-item list.)
 *
 * Classification is keyword-first (Ape/Z/T/Drag/Moto/Replica/Switch),
 * then a table of explicit brand+line overrides for names the generic
 * keywords can't distinguish (LA Choppers "Thresher" reads as neither ape
 * nor drag by keyword, but Laken confirmed it's a T-Bar; Fat Baggers'
 * entire "Flat/Pointed/Round Top" line has no style keyword at all but is
 * confirmed Ape Hanger; etc.) -- built from a full brand-by-brand
 * walkthrough with Laken, not a blind keyword sweep.
 *
 * Rows with brand+line overrides are matched FIRST (most specific),
 * then generic keyword rules, then a small set of "pull out of this
 * category entirely" moves (Kage Fighter risers/crossbar/clamp are
 * accessories, not bars; wiring install kits are Switches; phone holders
 * are General & Accessories -> Phone Accessories detail).
 *
 * Usage:
 *   node scripts/ingest/rebuild_handlebars_taxonomy.mjs            # dry run
 *   node scripts/ingest/rebuild_handlebars_taxonomy.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const OLD_CATEGORY = 'Handlebar & Controls';
const NEW_CATEGORY = 'Handlebars & Hand Controls';

// --- non-handlebar items to pull OUT of the bar-classification pass entirely ---
const PULL_OUT = [
  // Word order matters: "Handlebar Risers"/"Handlebar Crossbar"/"Handlebar Clamp"
  // are accessories FOR a bar. "Welded Straight-Riser Handlebar - One Piece" has
  // the words reversed -- that IS the complete handlebar, not an accessory.
  { test: (b, n) => b === 'LA Choppers' && /handlebar\s+(risers?|crossbar|clamp)/i.test(n), target: 'Risers & Clamps' },
  // Brand-agnostic: any riser product, regardless of brand. Excludes the
  // "Straight-Riser Handlebar" construction (riser as an adjective
  // immediately before "Handlebar" -- that IS the complete bar, not a
  // riser accessory) but catches "Handlebar Risers" (reversed order),
  // bare "RISERS", and "RISER DRAG BAR" -- all of which were slipping into
  // Drag Style Bars via the buffalo/chubby brand-keyword match since
  // Drag Specialties' "Big Buffalo" and Wild 1's "Chubby" riser lines use
  // the same brand vocabulary as their bar lines.
  { test: (b, n) => /\briser/i.test(n) && !/riser\s*handlebar/i.test(n), target: 'Risers & Clamps' },
  { test: (b, n) => /installation kit|wire\s*harness/i.test(n), target: 'Handlebar Switches & Wiring Kits' },
  { test: (b, n) => b === 'V-Twin' && /control cover/i.test(n), target: 'Levers & Hand Controls' },
  { test: (b, n) => /phone\s*holder|phone\s*mount|constrictor/i.test(n), target: 'General & Accessories', detail: 'Phone Accessories' },
  { test: (b, n) => /handguard|hand\s*protector/i.test(n), target: 'General & Accessories' },
  { test: (b, n) => b === 'V-Twin' && /collar set/i.test(n), target: 'General & Accessories' },
  { test: (b, n) => b === 'Colony' && /bolt kit/i.test(n), target: 'General & Accessories' },
];

// --- brand+line overrides confirmed with Laken (checked before generic
// keywords -- these are deliberate corrections of specific named lines,
// e.g. "Thresher" reads as no particular style by keyword but Laken
// confirmed it's a T-Bar) ---
const BRAND_OVERRIDES = [
  { brand: 'LA Choppers', test: /thresher/i, target: 'T-Bars' },
  { brand: 'LA Choppers', test: /hammerhead/i, target: 'T-Bars' },
  { brand: 'LA Choppers', test: /kage fighter/i, target: 'T-Bars' },
  { brand: 'LA Choppers', test: /bourbon/i, target: 'General & Accessories' },
  { brand: 'LA Choppers', test: /treehugger/i, target: 'Ape Hangers' },
  { brand: 'LA Choppers', test: /twin peaks/i, target: 'Ape Hangers' },
  { brand: 'LA Choppers', test: /valley/i, target: 'Drag Style Bars' },
  { brand: 'LA Choppers', test: /performance/i, target: 'Drag Style Bars' },
  { brand: 'Drag Specialties', test: /superbar/i, target: 'Drag Style Bars' },
  { brand: 'Drag Specialties', test: /buckhorn/i, target: 'Replica Handlebars' },
  { brand: "Todd's Cycle", test: /strip/i, target: 'Ape Hangers' },
  { brand: "Todd's Cycle", test: /beater/i, target: 'Ape Hangers' },
  { brand: "Todd's Cycle", test: /moto/i, target: 'Moto Style' },
  { brand: 'Magnum Shielding', test: /mach\s*moto/i, target: 'Moto Style' },
  { brand: 'Arlen Ness', test: /mx\s*moto/i, target: 'Moto Style' },
  { brand: 'Biltwell', test: /tracker/i, target: 'Moto Style' },
  { brand: 'KODLIN USA', test: /track\s*bar/i, target: 'Moto Style' },
  { brand: 'Thrashin Supply', test: /high bend|mid bend/i, target: 'Moto Style' },
  { brand: 'V-Twin', test: /speedster/i, target: 'General & Accessories' },
  { brand: 'Ultima', test: /tall boy/i, target: 'Ape Hangers' },
  { brand: 'Burly Brand', test: /jason|louie|dominator|\bsid\b|folsom/i, target: 'General & Accessories' },
];

// --- whole-brand fallbacks (checked AFTER generic keywords, never before --
// these brands' catalogs are mostly unstyled by name, e.g. Fat Baggers'
// "Flat/Pointed/Round Top" line, but a handful of their SKUs DO contain an
// explicit Z/T/Drag/Replica/Moto keyword and those must win first; a session
// bug had these checked before keywords, silently swallowing MCM's "Z
// Handlebar"/"Replica Handlebar"/"Buffalo T Handlebar" lines into Ape
// Hangers -- fixed by moving this block to run last) ---
const BRAND_FALLBACKS = [
  { brand: 'Magnum Shielding', target: 'Ape Hangers' },
  { brand: 'KODLIN USA', target: 'Ape Hangers' },
  { brand: 'Fat Baggers', target: 'Ape Hangers' }, // entire brand: Flat/Pointed/Round Top
  { brand: 'Khrome Werks', target: 'Ape Hangers' }, // Buck-50 etc.
  { brand: 'MCM', target: 'Ape Hangers' },
];

// --- generic keyword rules (checked after overrides, before falling to General) ---
const APE = /\bape\b|apehanger|monkey\b/i;
const Z = /\bz[\s-]?bars?\b|\bz'?d\b|narrow[\s-]?z|['"]z['"]\s*bar|\bz\s+handlebar/i;
const T = /\bt[\s-]?bars?\b/i;
// "beach bar" deliberately excluded -- Laken's call was these belong in
// Plain Handlebar, not Drag Style Bars (fixed live via
// fix_beach_bars_to_plain_handlebar.mjs; excluded here so a future re-run
// of this script doesn't put them back).
const DRAG = /\bdrag\b|dragster|buffalo|chubby|chopper\s*bar|bagger\s*bar/i;
const MOTO = /\bmoto\b|\btracker\b|\btrack\s*bar\b/i;
const REPLICA = /replica|\boem\b|buckhorn/i;
const SWITCH = /switch/i;

function classify(brand, name) {
  for (const rule of PULL_OUT) {
    if (rule.test(brand, name)) return { target: rule.target, detail: rule.detail || null, via: 'pullout' };
  }
  for (const rule of BRAND_OVERRIDES) {
    if (rule.brand === brand && rule.test.test(name)) return { target: rule.target, detail: null, via: 'override' };
  }
  if (SWITCH.test(name)) return { target: 'Handlebar Switches & Wiring Kits', detail: null, via: 'keyword' };
  if (APE.test(name)) return { target: 'Ape Hangers', detail: null, via: 'keyword' };
  if (Z.test(name)) return { target: 'Z-Bars', detail: null, via: 'keyword' };
  if (T.test(name)) return { target: 'T-Bars', detail: null, via: 'keyword' };
  if (DRAG.test(name)) return { target: 'Drag Style Bars', detail: null, via: 'keyword' };
  if (MOTO.test(name)) return { target: 'Moto Style', detail: null, via: 'keyword' };
  if (REPLICA.test(name)) return { target: 'Replica Handlebars', detail: null, via: 'keyword' };
  for (const rule of BRAND_FALLBACKS) {
    if (rule.brand === brand) return { target: rule.target, detail: null, via: 'brand-fallback' };
  }
  return { target: 'General & Accessories', detail: null, via: 'default' };
}

async function main() {
  const client = await pool.connect();
  try {
    // Only the two bars-heavy source buckets get the full bar classifier;
    // the rest of the category is a straight rename/split handled below.
    const { rows: barRows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = $1
        AND display_subcategory IN ('Handlebars & Components', 'Handlebar & Controls Parts')`,
      [OLD_CATEGORY]);

    const byTarget = {};
    for (const r of barRows) {
      const c = classify(r.brand, r.name);
      r.target = c.target;
      r.detail = c.detail;
      r.via = c.via;
      (byTarget[c.target] = byTarget[c.target] || []).push(r);
    }

    console.log(`Bar-bucket rows classified: ${barRows.length}\n`);
    console.log('=== Distribution ===');
    Object.entries(byTarget).sort((a, b) => b[1].length - a[1].length)
      .forEach(([k, v]) => console.log(`  ${v.length.toString().padStart(5)}  ${k}`));

    console.log('\n=== Sample per target (15 each) ===');
    for (const [target, list] of Object.entries(byTarget)) {
      console.log(`\n--- ${target} (${list.length}) ---`);
      list.slice(0, 15).forEach(r => console.log(`  [${r.via}] [${r.brand}] ${r.name}`));
    }

    // Straight renames for the rest of the category
    const RENAME_MAP = {
      'Grips, Heated Grips': 'Grips',
      'Risers, Clamps & Components': 'Risers & Clamps',
      'Hand Control Sets, Levers': 'Levers & Hand Controls',
      'Mirrors': 'Mirrors',
      'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware': null, // handled separately below
    };

    console.log('\n=== Straight-rename subcategories (counts) ===');
    for (const [oldSub] of Object.entries(RENAME_MAP)) {
      const { rows } = await client.query(`
        SELECT COUNT(*) FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = $2`,
        [OLD_CATEGORY, oldSub]);
      console.log(`  ${oldSub}: ${rows[0].count}`);
    }

    // "Bar Ends, Throttle Tubes..." bucket: switches -> Switches, ODI grips -> Grips, rest -> General & Accessories
    const { rows: barEndsRows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware'`,
      [OLD_CATEGORY]);
    const barEndsTargets = { 'Handlebar Switches & Wiring Kits': 0, 'General & Accessories': 0 };
    for (const r of barEndsRows) {
      r.target = SWITCH.test(r.name) ? 'Handlebar Switches & Wiring Kits' : 'General & Accessories';
      barEndsTargets[r.target]++;
    }
    console.log('\n=== Bar Ends bucket split ===', barEndsTargets);

    // ODI grip products scattered outside "Grips, Heated Grips"
    const { rows: odiGripRows } = await client.query(`
      SELECT id, brand, name, display_subcategory FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND brand = 'ODI' AND display_subcategory != 'Grips, Heated Grips'
        AND (name ~* 'grip|lock-on|ruffian|rufian|hart-luck|cult\\b|vans\\b' AND name !~* 'throttle|handlebar')`,
      [OLD_CATEGORY]);
    console.log(`\nODI grip products outside Grips bucket: ${odiGripRows.length}`);
    odiGripRows.slice(0, 10).forEach(r => console.log(`  [${r.display_subcategory}] ${r.name}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');

    // 1. Rename category
    await client.query(`UPDATE catalog_unified SET display_category = $1 WHERE is_active = true AND display_category = $2`,
      [NEW_CATEGORY, OLD_CATEGORY]);

    // 2. Bar-bucket rows (now under NEW_CATEGORY since step 1 already ran)
    for (const r of barRows) {
      if (r.detail) {
        await client.query(`UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = $2 WHERE id = $3`,
          [r.target, r.detail, r.id]);
      } else {
        await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`, [r.target, r.id]);
      }
    }

    // 3. Straight renames
    for (const [oldSub, newSub] of Object.entries(RENAME_MAP)) {
      if (!newSub) continue;
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE is_active = true AND display_category = $2 AND display_subcategory = $3`,
        [newSub, NEW_CATEGORY, oldSub]);
    }

    // 4. Bar Ends bucket split
    for (const r of barEndsRows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`, [r.target, r.id]);
    }

    // 5. ODI grips scattered elsewhere
    for (const r of odiGripRows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`, ['Grips', r.id]);
    }

    await client.query('COMMIT');
    console.log('\nDone. All updates applied.');
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
