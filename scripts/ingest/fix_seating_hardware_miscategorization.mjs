#!/usr/bin/env node
/**
 * fix_seating_hardware_miscategorization.mjs
 *
 * Reassigns products currently sitting in Seating > Seats whose names are
 * clearly hardware/accessories (brackets, mounts, bolts, spacers, etc.) into
 * the existing Seating > Seat Hardware subcategory instead. Confirmed via
 * browse UI: multiple pages of hardware items were outranking actual seats
 * on the Seats-filtered browse page (compounding the detail_priority sort
 * bug already patched in lib/db/browse.ts — that fix helps ranking, this
 * script fixes the underlying miscategorization it was papering over).
 *
 * Scope: catalog_unified rows where display_category = 'Seating' AND
 * display_subcategory = 'Seats' AND name matches hardware keywords.
 * Only touches subcategory + detail — does not touch display_category.
 *
 * Usage:
 *   node scripts/ingest/fix_seating_hardware_miscategorization.mjs            # dry run
 *   node scripts/ingest/fix_seating_hardware_miscategorization.mjs --apply    # live write
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

const NEW_SUBCATEGORY = 'Seat Hardware';
const PADS_SUBCATEGORY = 'Seat Pads & Covers'; // existing subcategory — comfort pads belong here, not Seat Hardware
const CARB_CATEGORY_FLAG = 'CARBURETOR_PART'; // not moved automatically — flagged for manual category change

// "Needle and seat" / "needle seat" is carburetor fuel-valve terminology,
// an entirely different meaning of "seat" than motorcycle seating. These
// are miscategorized at the CATEGORY level (should be Carburetion & Fuel,
// not anything under Seating) — flagged only, never auto-moved.
const CARB_PART_PATTERN = /needle\s+(and\s+)?seat/i;

// Comfort/replacement pads — Saddlemen's "Pad - ..." and "... Gel Pad"
// naming — belong in the EXISTING Seat Pads & Covers subcategory, not
// Seat Hardware (they're neither raw hardware nor a complete seat).
const PAD_PATTERN = /^pad\s*-|memory foam.*pad|gel pad/i;

// Detail rules — expanded from the full un-truncated Seats audit (not
// guessed): stud/seal/spot/tab/collar/clevis/pivot/emblem/tee/rivet/
// concho/handrail/hinge/yoke/extension/guide/lock/tether/strike/hanger/
// latch/filler/insert/lid/anchor/stabilizer/brace/wear-plate all showed
// up as real hardware terms this screen previously missed entirely.
const DETAIL_RULES = [
  { test: /bracket/i, detail: 'Brackets & Mounts' },
  { test: /\bmount(ing)?\b/i, detail: 'Brackets & Mounts' },
  { test: /\bhandrail\b/i, detail: 'Brackets & Mounts' },
  { test: /\bhinge\b/i, detail: 'Brackets & Mounts' },
  { test: /\byoke\b/i, detail: 'Brackets & Mounts' },
  { test: /\btab\b/i, detail: 'Brackets & Mounts' },
  { test: /\bhandle(s)?\b/i, detail: 'Brackets & Mounts' },
  { test: /\bclip(s)?\b/i, detail: 'Brackets & Mounts' },
  { test: /\bsupport\b/i, detail: 'Brackets & Mounts' },
  { test: /\bpin\b|\bspring(s)?\b/i, detail: 'Springs & Pins' },
  { test: /\bpan\b/i, detail: 'Seat Pans' },
  { test: /\bbolt(s)?\b|\bscrew(s)?\b/i, detail: 'Bolts & Screws' },
  { test: /\bstud(s)?\b/i, detail: 'Bolts & Screws' },
  { test: /\brivet(s)?\b/i, detail: 'Rivets & Spots' },
  { test: /\bspot(s)?\b/i, detail: 'Rivets & Spots' },
  { test: /\bconcho(s)?\b/i, detail: 'Rivets & Spots' },
  { test: /\bspacer(s)?\b/i, detail: 'Spacers' },
  { test: /\bwasher(s)?\b/i, detail: 'Washers' },
  { test: /\bbumper(s)?\b/i, detail: 'Bumpers' },
  { test: /\bknob(s)?\b/i, detail: 'Knobs' },
  { test: /\bstrap(s)?\b/i, detail: 'Straps' },
  { test: /\bclamp(s)?\b/i, detail: 'Clamps' },
  { test: /\badapter(s)?\b/i, detail: 'Adapters' },
  { test: /\bcover(s)?\b/i, detail: 'Covers' },
  { test: /\bliner(s)?\b/i, detail: 'Liners' },
  { test: /\bgrommet(s)?\b/i, detail: 'Grommets' },
  { test: /\bbushing(s)?\b/i, detail: 'Bushings' },
  { test: /\bcollar(s)?\b/i, detail: 'Bushings' },
  { test: /\bpivot\b|\bclevis\b/i, detail: 'Pivots & Clevises' },
  { test: /\bfastener(s)?\b/i, detail: 'Fasteners' },
  { test: /\bemblem(s)?\b/i, detail: 'Emblems & Trim' },
  { test: /\btee\b/i, detail: 'Brackets & Mounts' },
  { test: /\block(s)?\b|\blatch(es)?\b|\bstrike\b|\btether\b/i, detail: 'Locks & Latches' },
  { test: /\blid(s)?\b/i, detail: 'Lids' },
  { test: /wear plate|face plate|guide plate|filler strip|reinforcing/i, detail: 'Plates & Trim' },
  { test: /\bextension\b/i, detail: 'Extensions' },
  { test: /\bstabilizer\b|\bbrace\b/i, detail: 'Brackets & Mounts' },
  { test: /\banchor\b/i, detail: 'Brackets & Mounts' },
  { test: /\bhanger\b/i, detail: 'Brackets & Mounts' },
  { test: /\bseal(s)?\b/i, detail: 'Seals' },
  { test: /\binsert(s)?\b/i, detail: 'Inserts' },
];

// Broad screen — must match one of these for a row to be a candidate at all.
const HARDWARE_SCREEN = /(hardware|mount|bracket|bolt|screw|bumper|washer|knob|strap|clamp|adapter|kit|cover|liner|grommet|bushing|fastener|spacer|stud|seal|spot|tab|collar|clevis|pivot|reinforcing|emblem|\btee\b|rivet|concho|handrail|hinge|yoke|extension|guide|lock|tether|strike|hanger|latch|filler|insert|\blid\b|anchor|stabilizer|brace|wear plate|face plate|\bpin\b|spring|\bclip(s)?\b|support|handle|\bpan\b)/i;

// GUARD against false positives: many genuine seats are sold as a complete
// "kit" (seat + mounting hardware bundled), and some named seat styles
// literally use the word "Mount" (e.g. Bates "Solid Mount" / "Spring Mount"
// bobber seats, Corbin "Contour Style Frame Mount" — a style name, not a
// hardware descriptor). A name is a REAL SEAT — not hardware — only if:
//   1. It contains a seat-product phrase (Solo/Buddy/Police/Pillion/
//      Passenger/Bobber/Saddle + Seat), AND
//   2. "seat" is NOT immediately followed (without "and"/"with" bundling)
//      by a hardware noun — "Solo Seat Front Mount" / "Solo Seat T Bar
//      Mount" describe hardware FOR a seat, sold alone, vs. "Solo Seat
//      and/with Mount Kit" which bundles a real seat + hardware together.
//   3. For brands OTHER than Corbin/Bates, a hardware noun appearing
//      BEFORE "seat" (e.g. "Mount Bracket Solo Seat") also disqualifies —
//      but Corbin/Bates routinely put a style descriptor containing
//      "Mount" before "Solo/Buddy Seat" as their product-line naming
//      convention, so that direction is not trusted for those two brands.
const REAL_SEAT_PHRASE = /\b(solo|buddy|police|pillion|passenger|bobber|saddle)\s+seat\b/i;
const HAS_SEAT_OR_SADDLE_WORD = /\bseat(s)?\b|\bsaddle\b|\bpillion\b/i; // "saddlebag" does NOT match \bsaddle\b (no internal word boundary)
const HW_NOUNS = 'mount(?:ing)?|bracket|bushing|bar|block|pivot|tee|clamp|bolt|screw|spacer|clevis|isolator|post|plate|rail|rod|shock|strap|washer|bumper|grommet|liner|cover|fastener|knob|assembly|stud|seal|spot|tab|collar|reinforcing|emblem|rivet|concho|handrail|hinge|yoke|extension|lock|latch|tether|strike|hanger|filler|insert|lid|anchor|stabilizer|brace|handle|clip|pin|spring|support|pan';
const SEAT_THEN_HARDWARE = new RegExp(`seat\\s+(?!and\\b|with\\b)(?:\\S+\\s+){0,3}(${HW_NOUNS})\\b`, 'i');
const HARDWARE_THEN_SEAT = new RegExp(`(${HW_NOUNS})\\s+(?:\\S+\\s+){0,2}seat\\b`, 'i');
const STYLE_NAMING_BRANDS = new Set(['Corbin', 'Bates']);

// Known dedicated seat manufacturers — confirmed via brand audit earlier
// this session (their Seating-category footprint is almost entirely
// complete seats, not loose hardware). For these brands, a name containing
// "seat"/"saddle" is presumed a real product even when it uses a
// brand-specific style/line name (Renegade, Explorer Special, Lowdown
// Vintage...) that would never be enumerable via a fixed qualifier list —
// the hardware-adjacency checks below still apply to catch true exceptions.
const TRUSTED_SEAT_BRANDS = new Set([
  'Corbin', 'Bates', 'Mustang', 'Saddlemen', 'Le Pera',
  'Drag Specialties Seats', 'Danny Gray', 'Wyatt Gatling', 'Ultima',
]);

function isRealSeatNotHardware(name, brand) {
  if (!HAS_SEAT_OR_SADDLE_WORD.test(name)) return false;
  const trusted = TRUSTED_SEAT_BRANDS.has(brand);
  const narrowPhrase = REAL_SEAT_PHRASE.test(name);
  if (!trusted && !narrowPhrase) return false;
  if (SEAT_THEN_HARDWARE.test(name)) return false;
  if (!STYLE_NAMING_BRANDS.has(brand) && HARDWARE_THEN_SEAT.test(name)) return false;
  return true;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows: allSeatsRows } = await client.query(`
      SELECT id, brand, name, display_subcategory_detail
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Seating'
        AND display_subcategory = 'Seats'
    `);

    const carbParts = allSeatsRows.filter(r => CARB_PART_PATTERN.test(r.name));
    const padProducts = allSeatsRows.filter(r => !CARB_PART_PATTERN.test(r.name) && PAD_PATTERN.test(r.name));
    const carbAndPadIds = new Set([...carbParts, ...padProducts].map(r => r.id));

    const rows = allSeatsRows.filter(r => !carbAndPadIds.has(r.id) && HARDWARE_SCREEN.test(r.name));

    console.log(`Total rows currently in Seats: ${allSeatsRows.length}`);
    console.log(`Carburetor parts flagged (miscategorized at CATEGORY level, NOT moved): ${carbParts.length}`);
    carbParts.forEach(c => console.log(`  [${c.brand}] ${c.name}  -- needs manual move to Carburetion & Fuel`));
    console.log(`\nComfort pad products -> Seat Pads & Covers: ${padProducts.length}`);
    console.log(`Candidate rows (hardware-looking name, excluding carb/pad): ${rows.length}`);

    const updates = [];
    const generalBucket = [];
    const excludedRealSeats = [];

    for (const row of rows) {
      if (isRealSeatNotHardware(row.name, row.brand)) {
        excludedRealSeats.push(row);
        continue;
      }

      let detail = null;
      for (const rule of DETAIL_RULES) {
        if (rule.test.test(row.name)) {
          detail = rule.detail;
          break;
        }
      }
      if (!detail) {
        detail = 'General';
        generalBucket.push(row);
      }
      updates.push({ id: row.id, brand: row.brand, name: row.name, detail });
    }

    const byDetail = {};
    for (const u of updates) byDetail[u.detail] = (byDetail[u.detail] || 0) + 1;

    console.log('\n=== Proposed distribution (all moving Seats -> Seat Hardware) ===');
    Object.entries(byDetail)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${n.toString().padStart(4)}  ${k}`));

    console.log(`\nExcluded — genuine seat products, staying in Seats (${excludedRealSeats.length}):`);
    excludedRealSeats.forEach(e => console.log(`  [${e.brand}] ${e.name}`));

    console.log(`\nFalling to "General" detail (matched broad screen but no specific keyword): ${generalBucket.length}`);
    generalBucket.slice(0, 25).forEach(g => console.log(`  [${g.brand}] ${g.name}`));

    console.log(`\nSample of all proposed moves (first 30):`);
    updates.slice(0, 30).forEach(u => console.log(`  [${u.brand}] "${u.name}" -> Seat Hardware / ${u.detail}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    console.log(`\nApplying ${updates.length} hardware updates + ${padProducts.length} pad-product updates...`);
    await client.query('BEGIN');
    let done = 0;
    for (const u of updates) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = $2 WHERE id = $3`,
        [NEW_SUBCATEGORY, u.detail, u.id]
      );
      done++;
      if (done % 200 === 0) console.log(`  ${done}/${updates.length}`);
    }
    for (const p of padProducts) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`,
        [PADS_SUBCATEGORY, p.id]
      );
    }
    await client.query('COMMIT');
    console.log(`Done. ${done} hardware rows + ${padProducts.length} pad rows updated.`);
    console.log(`\nNOTE: ${carbParts.length} carburetor part(s) were flagged above but NOT moved —`);
    console.log('  those need a manual display_category change to Carburetion & Fuel, not a subcategory move within Seating.');
    console.log('\nNEXT STEPS:');
    console.log('  1. node scripts/ingest/sync_fitment_flat_columns.mjs');
    console.log('  2. node scripts/ingest/index_unified.js --recreate');
    console.log('  3. Spot-check /browse?display_category=Seating&display_subcategory=Seats — should now show real seats first');
    console.log('  4. Manually reassign the flagged carburetor part(s) to Carburetion & Fuel');
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
