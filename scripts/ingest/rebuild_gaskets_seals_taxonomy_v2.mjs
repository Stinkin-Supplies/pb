#!/usr/bin/env node
/**
 * rebuild_gaskets_seals_taxonomy_v2.mjs
 *
 * Classifies Gaskets & Seals rows using the actual Harley-Davidson OEM
 * parts-catalog numbering scheme (Laken supplied the section chart) as the
 * PRIMARY signal, falling back to keyword classification (from v1 of this
 * script) only when no usable OEM number can be extracted. James Gasket
 * reuses the literal HD OEM number as its own part number, and Cometic's
 * `oem_numbers` array carries the cross-referenced HD number alongside its
 * own catalog number — both are exploited here.
 *
 * OEM number source priority per row:
 *   1. oem_numbers[] — first element that looks like a bare HD number
 *      (leading digit, typical "NNNNN-NN" shape, not a vendor catalog
 *      number like "C9282" or "JGI-...").
 *   2. brand_part_number — same shape check, after stripping a "JGI-"
 *      prefix if present.
 *   3. name — "OE#NNNNN..." pattern.
 * The leading 2 digits of the extracted number are looked up against HD's
 * parts-book section ranges and mapped down to our 7 target subcategories.
 * Section 39-40 (Chain, Spark) is the one range that spans two of our
 * targets, so it's disambiguated by name (spark plug -> Engine, else
 * Transmission).
 *
 * Rows with no usable OEM number, or whose section has no clear mapping
 * (hardware/seat/lighting-accessory sections that shouldn't appear in this
 * category), fall back to the keyword rules.
 *
 * Usage:
 *   node scripts/ingest/rebuild_gaskets_seals_taxonomy_v2.mjs            # dry run, full report
 *   node scripts/ingest/rebuild_gaskets_seals_taxonomy_v2.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// HD parts-book section -> our 7 target subcategories. Ranges not listed
// (hardware, seat, lighting/instrument accessories, side car, etc.) aren't
// expected to carry real gasket/seal products and fall through to keyword.
//
// 11-18 ("Gaskets, Cylinders, Rockers, Valves") and 25 ("Gear Case") are
// DELIBERATELY OMITTED even though the chart lists them as Engine: sampling
// real rows under these prefixes showed them internally mixed — 25 covers
// cam cover gaskets (Engine) AND primary/derby/chain cover gaskets
// (Transmission) sharing the same number range; 12xxx (within 11-18) is
// mostly mainshaft/sprocket/inner-primary seals (Transmission), and 17xxx
// occasionally includes exhaust port gaskets. Forcing these to Engine wiped
// out real Transmission/Exhaust signal that the keyword rules already catch
// correctly, so these two ranges fall through to keyword instead of
// overriding it.
const SECTION_MAP = [
  { min: 22, max: 24, target: 'Engine' },
  { min: 26, max: 26, target: 'Engine' },
  { min: 27, max: 27, target: 'Carbs' },
  { min: 29, max: 29, target: 'Carbs' },
  { min: 30, max: 30, target: 'Electric & Lighting' },
  { min: 31, max: 31, target: 'Electric & Lighting' },
  { min: 32, max: 32, target: 'Electric & Lighting' },
  { min: 33, max: 33, target: 'Transmission' },
  { min: 34, max: 34, target: 'Transmission' },
  { min: 35, max: 36, target: 'Transmission' },
  { min: 37, max: 38, target: 'Transmission' },
  // 39-40 Chain/Spark handled specially below
  { min: 41, max: 41, target: 'Brakes' },
  // 42 omitted: sampling under this catalog's only prefix-83 population
  // (8 rows, all "83162-51[DL]" cam gear/camshaft oil seals -- genuinely
  // Engine, zero actual brake-line parts) showed the chart's 83 = Brake
  // Line entry doesn't hold for this SKU range; 42 gets the same
  // no-override treatment out of caution since it's adjacent/unsampled.
  { min: 43, max: 43, target: 'Forks' },
  { min: 44, max: 48, target: 'Forks' },
  { min: 54, max: 54, target: 'Forks' },
  { min: 60, max: 60, target: 'Transmission' },
  { min: 61, max: 61, target: 'Carbs' },
  { min: 62, max: 63, target: 'Engine' },
  { min: 65, max: 65, target: 'Exhaust' },
  { min: 66, max: 66, target: 'Electric & Lighting' },
  { min: 68, max: 68, target: 'Electric & Lighting' },
  { min: 69, max: 69, target: 'Electric & Lighting' },
  { min: 70, max: 70, target: 'Electric & Lighting' },
  { min: 71, max: 72, target: 'Electric & Lighting' },
  // 83 (Brake Line) omitted: this catalog's only prefix-83 population (8
  // rows, all "83162-51[DL]") is entirely James Gasket cam gear/camshaft
  // oil seals -- genuinely Engine, zero actual brake-line parts. The
  // chart's 83 = Brake Line entry doesn't hold for this specific number,
  // so it falls through to keyword instead of forcing Brakes.
  { min: 85, max: 85, target: 'Forks' },
  { min: 91, max: 91, target: 'Electric & Lighting' },
  { min: 95, max: 95, target: 'Forks' },
];

function sectionForPrefix(prefix, name) {
  if (prefix === 39 || prefix === 40) {
    return /spark\s*plug|\bspark\b/i.test(name) ? 'Engine' : 'Transmission';
  }
  const hit = SECTION_MAP.find(r => prefix >= r.min && prefix <= r.max);
  return hit ? hit.target : null;
}

// Candidate must start with a digit and look like a bare HD number
// (4-6 leading digits), not a vendor catalog code (C9282, JGI-..., etc).
const BARE_HD_NUMBER = /^(\d{4,6})/;

function extractPrefix(candidate) {
  if (!candidate) return null;
  const m = BARE_HD_NUMBER.exec(candidate.trim());
  if (!m) return null;
  return parseInt(m[1].slice(0, 2), 10);
}

// Only James Gasket is confirmed to reuse the bare HD OEM number as its own
// catalog number (Laken's tip). Other vendors (V-Twin, Gary Bang, etc.) have
// their own independent numeric SKUs that happen to be digit-shaped and
// would otherwise be misread as HD section numbers (e.g. V-Twin "63874" is
// V-Twin's own catalog number, not HD section 63) — brand_part_number is
// therefore only trusted for James. oem_numbers[] and an explicit "OE#" in
// the name are cross-reference-derived and trusted for every brand.
const JAMES_BRANDS = new Set(['James Gasket', 'James Gaskets']);

function oemPrefixFor(row) {
  // For James, brand_part_number (stripped of the JGI- vendor prefix) IS
  // the HD number directly -- more reliable than rummaging through
  // oem_numbers[], which can carry multiple candidate numbers (superseded
  // revisions, alternate crossrefs) in no guaranteed order of relevance.
  if (JAMES_BRANDS.has(row.brand) && row.brand_part_number) {
    const stripped = row.brand_part_number.replace(/^JGI-/i, '');
    const p = extractPrefix(stripped);
    if (p !== null) return p;
  }
  if (Array.isArray(row.oem_numbers)) {
    for (const raw of row.oem_numbers) {
      const p = extractPrefix(raw);
      if (p !== null) return p;
    }
  }
  const m = /OE#(\d{4,6})/i.exec(row.name || '');
  if (m) return extractPrefix(m[1]);
  return null;
}

// --- keyword fallback (same rules as v1, validated against a full manual
// sweep of the Engine bucket across several iterations) ---
const KEYWORD_RULES = [
  { target: 'Brakes', test: /\bbrake\b|\bcaliper\b|master\s*cylinder/i },
  { target: 'Exhaust', test: /\bexhaust\b|\bmuffler\b|head\s*pipe|headpipe|fire\s*ring|\bcrossover\b|exhaust\s*port|(?<!int\/)\bexh\b/i },
  { target: 'Carbs', test: /carburetor|\bcarb\b|air\s*clean(er)?|\bmanifold\b|float\s*bowl|\bbowl\b|\bchoke\b|throttle\s*body|back\s*plate|backplate|air\s*filter|\bfuel\b|linkert/i },
  { target: 'Electric & Lighting', test: /generator|magneto|circuit\s*break|\blamp\b|headlight|headlamp|taillight|spotlamp|ignition|\bcoil\b|\bpoints?\b|point\s*cover|wiring|\bstarter\b|\bstrtr\b|solenoid|\bswitch\b|\bdistributor\b/i },
  { target: 'Transmission', test: /\bclutch\b|\bcltch\b|\bprimary\b|\bderby\b|transmission|\btrans\b|\bshifter\b|counter\s*shaft|main\s*shaft|main\s*drive\s*gear|inspection\s*cover|\bkicker\b|\bchain\b|\bsprocket\b/i },
  { target: 'Forks', test: /\bfork\b|damper\s*tube|slider\s*tube|dust\s*wiper|dust\s*cap|\bwheel\b|hub\s*(bearing|seal)|star\s*hub|axle.*seal|rim\s*seal|\bspoke\b/i },
];
const FALLBACK = 'Engine';
function classifyKeyword(name) {
  for (const rule of KEYWORD_RULES) {
    if (rule.test.test(name)) return rule.target;
  }
  return FALLBACK;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name, display_subcategory AS current_sub, brand_part_number, oem_numbers
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Gaskets & Seals'
      ORDER BY name`);

    console.log(`Total active Gaskets & Seals rows: ${rows.length}\n`);

    let oemHits = 0;
    let keywordFallback = 0;
    let disagreements = [];

    for (const r of rows) {
      const prefix = oemPrefixFor(r);
      const oemTarget = prefix !== null ? sectionForPrefix(prefix, r.name) : null;
      const kwTarget = classifyKeyword(r.name);

      if (oemTarget) {
        oemHits++;
        r.target = oemTarget;
        r.source = `OEM(${prefix})`;
        if (oemTarget !== kwTarget) {
          disagreements.push({ ...r, oemTarget, kwTarget, prefix });
        }
      } else {
        keywordFallback++;
        r.target = kwTarget;
        r.source = 'keyword';
      }
    }

    console.log(`Classified via OEM number: ${oemHits} (${(100*oemHits/rows.length).toFixed(1)}%)`);
    console.log(`Fell back to keyword: ${keywordFallback} (${(100*keywordFallback/rows.length).toFixed(1)}%)\n`);

    const byTarget = {};
    for (const r of rows) (byTarget[r.target] = byTarget[r.target] || []).push(r);
    console.log('=== Proposed distribution ===');
    Object.entries(byTarget).sort((a, b) => b[1].length - a[1].length)
      .forEach(([k, v]) => console.log(`  ${v.length.toString().padStart(5)}  ${k}`));

    console.log(`\n=== OEM vs keyword DISAGREEMENTS (${disagreements.length}) — OEM wins, shown for review ===`);
    disagreements.slice(0, 150).forEach(d =>
      console.log(`  [${d.brand}] "${d.name}"  OEM(${d.prefix})->${d.oemTarget}  keyword->${d.kwTarget}  [bpn=${d.brand_part_number} oem=${JSON.stringify(d.oem_numbers)}]`));
    if (disagreements.length > 150) console.log(`  ... and ${disagreements.length - 150} more`);

    console.log('\n=== Sample per bucket (20 each), with source ===');
    for (const [target, list] of Object.entries(byTarget)) {
      console.log(`\n--- ${target} (${list.length}) ---`);
      list.slice(0, 20).forEach(r => console.log(`  [${r.source}] [${r.brand}] ${r.name}`));
    }

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    console.log(`\nApplying ${rows.length} updates...`);
    await client.query('BEGIN');
    let done = 0;
    for (const r of rows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`, [r.target, r.id]);
      done++;
      if (done % 500 === 0) console.log(`  ${done}/${rows.length}`);
    }
    await client.query('COMMIT');
    console.log(`Done. ${done} rows updated.`);
    console.log('\nNEXT STEPS:');
    console.log('  1. node scripts/ingest/index_unified.js --recreate');
    console.log('  2. Spot-check /browse?display_category=Gaskets+%26+Seals on live site');
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
