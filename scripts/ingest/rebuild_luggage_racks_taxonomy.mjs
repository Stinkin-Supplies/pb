#!/usr/bin/env node
/**
 * rebuild_luggage_racks_taxonomy.mjs
 *
 * Full taxonomy rebuild for display_category = 'Luggage & Racks'.
 *
 * Does three things at once:
 *   1. Fills ~500 blank display_subcategory rows — mostly legacy ALL-CAPS
 *      product names that were never classified, sitting alongside
 *      correctly-tagged Title Case near-duplicates from the same brands
 *      (Cobra, HardDrive, V-Twin, Willie & Max, Wyatt Gatling, Burly Brand).
 *   2. Carves out a new "Tour Pak" subcategory from items currently
 *      scattered across Bags & Packs, Racks, and blank.
 *   3. Populates display_subcategory_detail across all six subcategories
 *      (Saddlebags, Tour Pak, Bags & Packs, Racks, Sissy Bars, Luggage Parts)
 *      — applied per-subcategory regardless of whether a row's subcategory
 *      changed, so already-correctly-tagged rows (e.g. Ciro "Hinge Covers -
 *      Black" already filed under Saddlebags) still get real Detail values
 *      instead of falling to a bare "General".
 *
 * Scope: ALL rows in display_category = 'Luggage & Racks', regardless of
 * current subcategory — a row already tagged "Bags & Packs" can still be
 * reassigned to "Tour Pak" if its name matches.
 *
 * NOT moved by this script (flagged only): windshield/fairing storage
 * pouches (Memphis Shades, Willie & Max, Saddlemen, Hogtunes, Dowco,
 * National Cycle) that arguably belong in Windshields & Fairings >
 * Windshields > Accessories instead — cross-category call, left to manual
 * review. Same for one phone-mount item (Electronics & Mounts candidate).
 *
 * Usage:
 *   node scripts/ingest/rebuild_luggage_racks_taxonomy.mjs            # dry run
 *   node scripts/ingest/rebuild_luggage_racks_taxonomy.mjs --apply    # live write
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

// Flagged for manual review — cross-category candidates, never touched here.
const FLAG_PATTERNS = [
  { test: /windshield.*(bag|pouch)|fairing bag|fairing storage pouch|h'?bar\/?w'?shield pouch|wndshld.*bg|fairng.*wndshld/i, reason: 'Windshield/fairing storage pouch — may belong in Windshields & Fairings > Windshields > Accessories instead' },
  { test: /phone holder/i, reason: 'Phone mount item — may belong in Accessories & Misc > Electronics & Mounts instead' },
  { test: /refreshment kit/i, reason: 'Comm-headset ear-pad accessory (Cardo/Sena) — miscategorized under Luggage & Racks entirely, belongs in Electrical > Audio & Communication' },
];

// ---------------------------------------------------------------------------
// Step 1: assign a SUBCATEGORY. First match wins. If nothing matches, the
// row's existing subcategory is kept (if any); otherwise it's unmatched.
// ---------------------------------------------------------------------------
const SUBCATEGORY_RULES = [
  { test: /tour[- ]?pak|tour pack|tourpak|rotary latch/i, sub: 'Tour Pak' },
  { test: /sissy ?bar|backrest|\bpaladin\b/i, sub: 'Sissy Bars' },
  { test: /lug(gage)? rack|luggage rk|lug\/bar rack|rack mount|docking hardware|two-up docking|tour box mount|solo rack|fender rack|wrap a\w* rack|flat rack|elastic.*net|carrying net|net with hooks/i, sub: 'Racks' },
  { test: /saddle ?bag|\bsbags?\b|swing ?arm bag|side case|gravel-t|trekker.*case|canyon.*saddlebag|bag guard|bag delete|slant|fleetside|blackjack|black magic|braided(?! trim)/i, sub: 'Saddlebags' },
  { test: /tank (bag|pad)/i, sub: 'Bags & Packs' },
  { test: /tool bag|tool pouch|tool roll/i, sub: 'Bags & Packs' },
  { test: /handlebar (bag|pouch)|h-?bar bag|fork bag/i, sub: 'Bags & Packs' },
  { test: /sissy ?bar bag/i, sub: 'Bags & Packs' },
  { test: /back ?pack|duffel|duffle|dry bag/i, sub: 'Bags & Packs' },
  { test: /cooler|canteen|drink holder|bottle holder|fuel bottle holder/i, sub: 'Bags & Packs' },
  { test: /tail bag|rack bag|destination|day.?trip|getaway|traveler|commuter|weekender/i, sub: 'Bags & Packs' },
  { test: /pet carrier|pet voyager/i, sub: 'Bags & Packs' },
  { test: /holster/i, sub: 'Luggage Parts' },
  { test: /registration holder/i, sub: 'Luggage Parts' },
  { test: /stash tube/i, sub: 'Luggage Parts' },
  { test: /luggage pad/i, sub: 'Luggage Parts' },
  { test: /\bstrap\b|stabilizer/i, sub: 'Luggage Parts' },
];

// ---------------------------------------------------------------------------
// Step 2: assign DETAIL, keyed by the FINAL subcategory (whether newly
// assigned or kept from existing data) — applies to every row uniformly.
// ---------------------------------------------------------------------------
const DETAIL_RULES_BY_SUB = {
  'Tour Pak': {
    rules: [
      { test: /trim|accent light|speaker trim/i, detail: 'Accessories' },
      { test: /luggage case (bottom|top)|luggage kit/i, detail: 'Lids & Cases' },
      { test: /hinge|latch|lock|tether|mounting rack|mount relocator|docking hardware|hardware kit|hardware hinge|hardware tether/i, detail: 'Hardware & Mounting' },
    ],
    fallback: 'Accessories',
  },
  'Sissy Bars': {
    rules: [
      { test: /\bpad\b/i, detail: 'Backrest Pads' },
      { test: /side plate/i, detail: 'Side Plates & Brackets' },
      { test: /docking|mounting kit|bushing|bracket/i, detail: 'Mounting Hardware' },
      { test: /luggage rack|and rack/i, detail: 'Sissy Bar & Rack Combo' },
    ],
    fallback: 'Sissy Bars (General)',
  },
  'Racks': {
    rules: [
      { test: /elastic.*net|carrying net|net with hooks/i, detail: 'Cargo Nets' },
      { test: /dock/i, detail: 'Mounting Hardware' },
    ],
    fallback: 'Luggage Racks & Accessories',
  },
  'Saddlebags': {
    rules: [
      { test: /swing ?arm bag/i, detail: 'Swing Arm Bags' },
      { test: /bag guard|bag delete/i, detail: 'Protective Guards & Accessories' },
      { test: /lid cover|lid organizer|lid cushion|lid gasket|lid handle|lid hinge|lid strike|lid tether|lid supports|lids? -/i, detail: 'Organizers & Lids' },
      { test: /liner/i, detail: 'Organizers & Lids' },
      { test: /trekker side or top case|gravel-t|canyon|cruiser side case|monokey rack|outback rack/i, detail: 'Adventure Luggage / Side Cases' },
      { test: /hurricane saddlebags|road trip saddlebags|escape.*saddlebags?|essential saddlebags?|expedition saddlebags?|slant|cruis'?n|highwayman|flame saddlebag|raptor|ranger|black magic|braided|adjustable tour|american class|compact|fleetside|blackjack/i, detail: 'Soft Saddlebags' },
      { test: /carbon (fiber|gloss|matte)|abs stretched/i, detail: 'Hard Saddlebags' },
      { test: /support|bracket|mount|hinge|latch|lock|grommet|tether|strap|hardware|fastener|face plate|skid plate|guard rail|guard bag|extension/i, detail: 'Mounting Hardware & Straps' },
    ],
    fallback: 'Saddlebags (General)',
  },
  'Bags & Packs': {
    rules: [
      { test: /tank (bag|pad)/i, detail: 'Tank Bags' },
      { test: /tool bag|tool pouch|tool roll/i, detail: 'Tool Bags' },
      { test: /handlebar (bag|pouch)|h-?bar bag|fork bag/i, detail: 'Handlebar Bags' },
      { test: /sissy ?bar bag/i, detail: 'Sissy Bar Bags' },
      { test: /duffel|duffle|dry bag|back ?pack/i, detail: 'Duffel, Dry Bags & Backpacks' },
      { test: /cooler|canteen|drink holder|bottle holder|fuel bottle holder/i, detail: 'Coolers, Bottle & Drink Holders' },
      { test: /tail bag|rack bag|destination|day.?trip|getaway|traveler|commuter|weekender/i, detail: 'Tail & Rack Bags' },
      { test: /pet carrier|pet voyager/i, detail: 'Pet Carriers' },
    ],
    fallback: 'Bags & Packs (General)',
  },
  'Luggage Parts': {
    rules: [
      { test: /holster/i, detail: 'Holsters' },
      { test: /registration holder/i, detail: 'Registration Holders' },
      { test: /stash tube/i, detail: 'Stash Tubes' },
      { test: /\bstrap\b|stabilizer/i, detail: 'Straps & Stabilizers' },
    ],
    fallback: 'General',
  },
};

function assignDetail(sub, name) {
  const cfg = DETAIL_RULES_BY_SUB[sub];
  if (!cfg) return 'General';
  for (const r of cfg.rules) {
    if (r.test.test(name)) return r.detail;
  }
  return cfg.fallback;
}

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name, display_subcategory, display_subcategory_detail
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Luggage & Racks'
    `);

    console.log(`Candidate rows: ${rows.length}`);

    const updates = [];
    const flagged = [];
    const unmatched = [];

    for (const row of rows) {
      const flag = FLAG_PATTERNS.find(f => f.test.test(row.name));
      if (flag) {
        flagged.push({ ...row, reason: flag.reason });
        continue;
      }

      let sub = null;
      for (const rule of SUBCATEGORY_RULES) {
        if (rule.test.test(row.name)) {
          sub = rule.sub;
          break;
        }
      }
      if (!sub) sub = row.display_subcategory || null;

      if (!sub) {
        unmatched.push(row);
        continue;
      }

      const detail = assignDetail(sub, row.name);

      updates.push({
        id: row.id,
        brand: row.brand,
        name: row.name,
        old_sub: row.display_subcategory,
        new_sub: sub,
        new_detail: detail,
      });
    }

    const bySubDetail = {};
    for (const u of updates) {
      const key = `${u.new_sub} → ${u.new_detail}`;
      bySubDetail[key] = (bySubDetail[key] || 0) + 1;
    }
    console.log('\n=== Proposed distribution ===');
    Object.entries(bySubDetail)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${n.toString().padStart(4)}  ${k}`));

    const subChanges = updates.filter(u => u.old_sub !== u.new_sub);
    console.log(`\nRows changing SUBCATEGORY (not just detail): ${subChanges.length}`);
    const bySubChange = {};
    for (const u of subChanges) {
      const key = `${u.old_sub || '(blank)'} → ${u.new_sub}`;
      bySubChange[key] = (bySubChange[key] || 0) + 1;
    }
    Object.entries(bySubChange)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${n.toString().padStart(4)}  ${k}`));

    console.log(`\nFlagged for manual review (NOT auto-applied): ${flagged.length}`);
    flagged.forEach(f => console.log(`  - [${f.brand}] ${f.name}  (${f.reason})`));

    console.log(`\nUnmatched, no rule hit AND no existing subcategory to fall back on: ${unmatched.length}`);
    unmatched.forEach(u => console.log(`  - [${u.brand}] ${u.name}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    console.log(`\nApplying ${updates.length} updates...`);
    await client.query('BEGIN');
    let done = 0;
    for (const u of updates) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = $2 WHERE id = $3`,
        [u.new_sub, u.new_detail, u.id]
      );
      done++;
      if (done % 200 === 0) console.log(`  ${done}/${updates.length}`);
    }
    await client.query('COMMIT');
    console.log(`Done. ${done} rows updated.`);
    console.log('\nNEXT STEPS:');
    console.log('  1. node scripts/ingest/sync_fitment_flat_columns.mjs');
    console.log('  2. node scripts/ingest/index_unified.js --recreate');
    console.log('  3. Spot-check /browse?display_category=Luggage+%26+Racks&display_subcategory=Tour+Pak');
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
