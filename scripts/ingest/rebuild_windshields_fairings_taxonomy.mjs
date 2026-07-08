#!/usr/bin/env node
/**
 * rebuild_windshields_fairings_taxonomy.mjs
 *
 * Splits "Windshields & Fairings" out of Fenders & Body into its own
 * top-level display_category, with subcategories:
 *   Windshields | Fairings | Lower Fairings
 * and per-brand display_subcategory_detail extraction.
 *
 * SCOPE (deliberately narrow — do NOT widen with blind ILIKE across the
 * whole catalog, see session notes on FXRP/CVO-Spoiler false positives):
 *   - catalog_unified rows where display_category = 'Fenders & Body'
 *     AND display_subcategory IN ('Windshields', 'Fairings')
 *
 * Anything currently correctly filed elsewhere (fairing-mount mirrors,
 * fairing-integrated speakers, fairing-mount gauges, windshield/fender
 * lighting, windshield cleaner chemicals) is intentionally left alone.
 *
 * Usage:
 *   node rebuild_windshields_fairings_taxonomy.mjs            # dry run (default)
 *   node rebuild_windshields_fairings_taxonomy.mjs --apply    # live write
 *
 * Requires CATALOG_DATABASE_URL env var (see .env.local).
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Robust dotenv load regardless of cwd (flagged as a gotcha elsewhere in the codebase)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const NEW_CATEGORY = 'Windshields & Fairings';

// ---------------------------------------------------------------------------
// Rule table. Evaluated top-to-bottom, FIRST MATCH WINS per product.
// Each rule: { test: RegExp, subcategory, detail }
// subcategory omitted = keep existing subcategory (Windshields/Fairings)
// ---------------------------------------------------------------------------
const RULES = [
  // ---- Lower Fairings (pull out of Fairings first, before brand rules) ----
  { test: /\blowers?\b/i,                          subcategory: 'Lower Fairings', detail: 'Lowers' },
  { test: /repair kit/i,                            subcategory: 'Lower Fairings', detail: 'Repair Kits' },

  // ---- Klock Werks (Windshields) ----
  { test: /billboard flare/i,                       subcategory: 'Windshields', detail: 'Billboard Flare' },
  { test: /kolor flare/i,                            subcategory: 'Windshields', detail: 'Kolor Flare' },
  { test: /ice flare/i,                              subcategory: 'Windshields', detail: 'Ice Flare' },
  { test: /pro-touring flare/i,                      subcategory: 'Windshields', detail: 'Pro-Touring Flare' },
  { test: /sport flare/i,                            subcategory: 'Windshields', detail: 'Sport Flare' },
  { test: /sport glide.*windshield/i,                subcategory: 'Windshields', detail: 'Sport Glide' },
  { test: /flare.*windshield|windshield.*flare/i,    subcategory: 'Windshields', detail: 'Flare Series' },
  { test: /fxrp-style fairing/i,                      subcategory: 'Fairings',    detail: 'FXRP-Style' },
  { test: /fairing vent screen/i,                     subcategory: 'Fairings',    detail: 'Vents' },

  // ---- Memphis Shades ----
  { test: /batwing/i,                                subcategory: 'Fairings',    detail: 'Batwing' },
  { test: /\bbullet\b/i,                              subcategory: 'Fairings',    detail: 'Bullet' },
  { test: /\bcafe\b/i,                                subcategory: 'Fairings',    detail: 'Cafe' },
  { test: /gauntlet/i,                                subcategory: 'Fairings',    detail: 'Gauntlet' },
  { test: /road warrior.*fairing|fairing.*road warrior/i, subcategory: 'Fairings', detail: 'Road Warrior' },
  { test: /road warrior/i,                            subcategory: 'Windshields', detail: 'Road Warrior' },
  { test: /fats\/?\s*slim|slim\/?\s*fats/i,           subcategory: 'Windshields', detail: 'Fats/Slim' },
  { test: /\bfats\b/i,                                subcategory: 'Windshields', detail: 'Fats' },
  { test: /memphis slim|\bslim\b/i,                   subcategory: 'Windshields', detail: 'Slim' },
  { test: /del rio/i,                                 subcategory: 'Windshields', detail: 'Del Rio' },
  { test: /del rey/i,                                 subcategory: 'Windshields', detail: 'Del Rey' },
  { test: /el paso/i,                                 subcategory: 'Windshields', detail: 'El Paso' },
  { test: /rio grande/i,                               subcategory: 'Windshields', detail: 'Rio Grande' },
  { test: /speed demon/i,                              subcategory: 'Windshields', detail: 'Speed Demon' },
  { test: /hellcat/i,                                  subcategory: 'Windshields', detail: 'Hellcat' },
  { test: /shooter/i,                                  subcategory: 'Windshields', detail: 'Shooter' },
  { test: /\bdemon\b/i,                                subcategory: 'Windshields', detail: 'Demon' },
  { test: /spoiler.*shield|spoiler.*windshield/i,      subcategory: 'Windshields', detail: 'Spoiler' },

  // ---- National Cycle ----
  { test: /v-?stream/i,                                subcategory: 'Windshields', detail: 'VStream' },
  { test: /switchblade/i,                              subcategory: 'Windshields', detail: 'Switchblade' },
  { test: /spartan/i,                                  subcategory: 'Windshields', detail: 'Spartan' },
  { test: /mohawk/i,                                   subcategory: 'Windshields', detail: 'Mohawk' },
  { test: /\bwave\b/i,                                 subcategory: 'Windshields', detail: 'Wave' },
  { test: /dakota/i,                                   subcategory: 'Windshields', detail: 'Dakota' },
  { test: /flyscreen/i,                                subcategory: 'Fairings',    detail: 'Flyscreen' },
  { test: /plexifairing/i,                             subcategory: 'Fairings',    detail: 'Plexifairing' },
  { test: /beaded/i,                                   subcategory: 'Windshields', detail: 'Beaded' },
  { test: /streetshield/i,                             subcategory: 'Windshields', detail: 'Streetshield' },
  { test: /ranger|low ?boy|heavy duty/i,               subcategory: 'Windshields', detail: 'Heavy Duty / Ranger' },

  // ---- Slipstreamer ----
  { test: /ss-20 stealth/i,                            subcategory: 'Windshields', detail: 'SS-20 Stealth' },
  { test: /spitfire/i,                                 subcategory: 'Windshields', detail: 'Spitfire' },
  { test: /\bviper\b/i,                                subcategory: 'Windshields', detail: 'Viper' },
  { test: /tombstone/i,                                subcategory: 'Windshields', detail: 'Tombstone' },
  { test: /mini police/i,                              subcategory: 'Windshields', detail: 'Mini Police' },
  { test: /\bs-06\b/i,                                 subcategory: 'Windshields', detail: 'S-06' },

  // ---- PUIG ----
  { test: /anarchy/i,                                  subcategory: 'Fairings',    detail: 'Anarchy' },
  { test: /naked new gen/i,                            subcategory: 'Windshields', detail: 'Naked New Gen' },
  { test: /\btrend\b/i,                                subcategory: 'Windshields', detail: 'Trend' },

  // ---- Cross-brand generic detail (applies whatever subcategory it's already in) ----
  { test: /mounting kit|mount kit|mounting system|attachment assembly|fork clamp|bracket bushing|trigger.?lock|clamp kit/i, detail: 'Mounts & Hardware' },
  { test: /\bhardware\b/i,                              detail: 'Mounts & Hardware' },
  { test: /pouch|storage bag|windshield bag/i,          detail: 'Accessories' },
  { test: /\btrim\b/i,                                  detail: 'Trim' },
  { test: /\bvent\b/i,                                  detail: 'Vents' },
];

// Explicit exclusions — matched by the earlier broad audit but NOT part of
// this taxonomy. Left untouched regardless of rule matches above.
const EXCLUDE_BRANDS_KEYWORDS = [
  { brand: 'V-Twin', keyword: /fxrp/i },          // model code, not a fairing ref
  { keyword: /crashbar/i },                        // frame part matched on "spoiler"
];

function isExcluded(row) {
  return EXCLUDE_BRANDS_KEYWORDS.some(rule =>
    (!rule.brand || row.brand === rule.brand) && rule.keyword.test(row.name)
  );
}

// Flagged for manual review — never auto-applied even with --apply.
const FLAG_FOR_REVIEW = [
  { test: /display(\s|$)/i, reason: 'Possible dealer POS display fixture, not a sellable product (see session 75 precedent)' },
];

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name, display_category, display_subcategory, display_subcategory_detail
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Fenders & Body'
        AND display_subcategory IN ('Windshields', 'Fairings')
    `);

    console.log(`Candidate rows: ${rows.length}`);

    const updates = [];
    const flagged = [];
    const unmatched = [];

    for (const row of rows) {
      if (isExcluded(row)) continue;

      const flag = FLAG_FOR_REVIEW.find(f => f.test.test(row.name));
      if (flag) {
        flagged.push({ ...row, reason: flag.reason });
        continue;
      }

      let subcategory = row.display_subcategory;
      let detail = row.display_subcategory_detail;
      let matched = false;

      for (const rule of RULES) {
        if (rule.test.test(row.name)) {
          if (rule.subcategory) subcategory = rule.subcategory;
          detail = rule.detail;
          matched = true;
          break;
        }
      }

      if (!matched && !detail) {
        unmatched.push(row);
      }

      updates.push({
        id: row.id,
        old_subcategory: row.display_subcategory,
        old_detail: row.display_subcategory_detail,
        new_category: NEW_CATEGORY,
        new_subcategory: subcategory,
        new_detail: detail || (subcategory === 'Fairings' ? 'Fairings (General)' : 'Replacement Windshields'),
      });
    }

    // ---- Summary ----
    const bySubDetail = {};
    for (const u of updates) {
      const key = `${u.new_subcategory} → ${u.new_detail}`;
      bySubDetail[key] = (bySubDetail[key] || 0) + 1;
    }
    console.log('\n=== Proposed distribution ===');
    Object.entries(bySubDetail)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${n.toString().padStart(4)}  ${k}`));

    console.log(`\nFlagged for manual review (NOT auto-applied): ${flagged.length}`);
    flagged.forEach(f => console.log(`  - [${f.brand}] ${f.name}  (${f.reason})`));

    console.log(`\nUnmatched / falling to generic bucket: ${unmatched.length}`);
    if (unmatched.length) {
      console.log('  Sample:');
      unmatched.slice(0, 15).forEach(u => console.log(`    [${u.brand}] ${u.name}`));
    }

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
        [u.new_category, u.new_subcategory, u.new_detail, u.id]
      );
      done++;
      if (done % 200 === 0) console.log(`  ${done}/${updates.length}`);
    }
    await client.query('COMMIT');
    console.log(`Done. ${done} rows updated.`);
    console.log('\nNEXT STEPS:');
    console.log('  1. node scripts/ingest/sync_fitment_flat_columns.mjs (if any fitment touched — it wasn\'t here, but keep habit)');
    console.log('  2. Reindex Typesense (node scripts/ingest/index_unified.js --recreate)');
    console.log('  3. Spot-check /browse?display_category=Windshields+%26+Fairings');
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
