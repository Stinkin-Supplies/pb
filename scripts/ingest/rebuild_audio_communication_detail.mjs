#!/usr/bin/env node
/**
 * rebuild_audio_communication_detail.mjs
 *
 * Populates display_subcategory_detail for Electrical > Audio & Communication
 * (352 candidate rows, 0% currently populated).
 *
 * Also identifies rows that are phone/GPS/device-mount items mis-filed in
 * this subcategory (Ciro phone holders, GoPro/mirror/perch mounts, RidePower
 * phone holders) — these are EXCLUDED here and handled instead by
 * rebuild_electronics_mounts.mjs, which moves them to
 * Accessories & Misc > Electronics & Mounts.
 *
 * Usage:
 *   node scripts/ingest/rebuild_audio_communication_detail.mjs            # dry run
 *   node scripts/ingest/rebuild_audio_communication_detail.mjs --apply    # live write
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

// ---------------------------------------------------------------------------
// Rows matching these patterns belong to the phone/GPS/device-mount rework
// instead — excluded here, never written by this script.
// ---------------------------------------------------------------------------
const EXCLUDE_BRANDS = ['RAM Mounts', 'SP Connect', 'RIDEPOWER']; // fully handled by rebuild_electronics_mounts.mjs regardless of current category
const EXCLUDE_PATTERNS = [
  /phone holder|holder phone/i, // catches reversed word order (RIDEPOWER)
  /smartphone/i,
  /gps holder/i,
  /gopro mount/i,
  /mirror mount/i,
  /perch mount/i,
  /fairing mount/i, // Ciro's plain mounting base for phone/GPS holders, not itself a fairing part
  /universal.*mount(?!.*bolt)/i,
  /camera mount/i,
  /windshield camera mount/i,
];

// Flagged for manual review — genuinely miscategorized, not an Audio &
// Communication product at all (e.g. an engine/ECU tuning module).
// Never auto-applied even with --apply.
const FLAG_FOR_REVIEW = [
  { test: /mastertune|canbus/i, reason: 'Engine/ECU tuning module, not audio or communication — likely wrong category entirely' },
];

// First match wins.
const RULES = [
  { test: /baffle/i,                                          detail: 'Baffles' },
  { test: /grill|grille/i,                                     detail: 'Grills & Trim' },
  { test: /antenna/i,                                          detail: 'Antennas' },
  { test: /packtalk|freecom|spirit hd|tufftalk|\bmuff\b/i,     detail: 'Communication Systems' }, // Cardo/Sena model names
  { test: /headset|intercom|\bmesh\b|communication.*system|bluetooth.*system/i, detail: 'Communication Systems' },
  { test: /wind ?sock/i,                                        detail: 'Communication Systems' }, // mic wind muff accessory
  { test: /\bamp\b|amplifier/i,                                detail: 'Amps' },
  { test: /speak(e)?r|subwoofer|tweeter|woofer|\blid\b|\bpod\b|pods\b/i, detail: 'Speakers' },
  { test: /sound system|audio kit/i,                            detail: 'Speakers' },
  { test: /stereo|radio|media player|mp3/i,                    detail: 'Stereos & Media Players' },
  { test: /helmet clamp|clamp kit|\bbracket\b/i,               detail: 'Mounts & Hardware' },
  { test: /remote|button/i,                                    detail: 'Remotes & Controls' },
  { test: /install kt|install kit|harness|\bcord\b|\bcable\b|connector|jumper|adapter|adaptor|converter|\bplug\b|usb port/i, detail: 'Install Kits & Wiring' },
];

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name, display_subcategory_detail
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Electrical'
        AND display_subcategory = 'Audio & Communication'
    `);

    console.log(`Candidate rows: ${rows.length}`);

    const updates = [];
    const excluded = [];
    const flagged = [];
    const unmatched = [];

    for (const row of rows) {
      if (EXCLUDE_BRANDS.includes(row.brand) || EXCLUDE_PATTERNS.some(p => p.test(row.name))) {
        excluded.push(row);
        continue;
      }

      const flag = FLAG_FOR_REVIEW.find(f => f.test.test(row.name));
      if (flag) {
        flagged.push({ ...row, reason: flag.reason });
        continue;
      }

      let detail = null;
      for (const rule of RULES) {
        if (rule.test.test(row.name)) {
          detail = rule.detail;
          break;
        }
      }

      if (!detail) {
        unmatched.push(row);
        detail = 'General';
      }

      updates.push({ id: row.id, brand: row.brand, name: row.name, detail });
    }

    const byDetail = {};
    for (const u of updates) byDetail[u.detail] = (byDetail[u.detail] || 0) + 1;

    console.log('\n=== Proposed distribution ===');
    Object.entries(byDetail)
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => console.log(`  ${n.toString().padStart(4)}  ${k}`));

    console.log(`\nExcluded — handled by rebuild_electronics_mounts.mjs instead: ${excluded.length}`);
    excluded.forEach(e => console.log(`  - [${e.brand}] ${e.name}`));

    console.log(`\nFlagged for manual review (NOT auto-applied): ${flagged.length}`);
    flagged.forEach(f => console.log(`  - [${f.brand}] ${f.name}  (${f.reason})`));

    console.log(`\nUnmatched / falling to "General": ${unmatched.length}`);
    unmatched.slice(0, 20).forEach(u => console.log(`  - [${u.brand}] ${u.name}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    console.log(`\nApplying ${updates.length} updates...`);
    await client.query('BEGIN');
    let done = 0;
    for (const u of updates) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory_detail = $1 WHERE id = $2`,
        [u.detail, u.id]
      );
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${updates.length}`);
    }
    await client.query('COMMIT');
    console.log(`Done. ${done} rows updated.`);
    console.log('\nNOTE: excluded rows above are untouched by this script —');
    console.log('run rebuild_electronics_mounts.mjs to move them.');
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
