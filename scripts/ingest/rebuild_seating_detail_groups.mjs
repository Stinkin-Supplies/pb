#!/usr/bin/env node
/**
 * rebuild_seating_detail_groups.mjs
 *
 * Retroactive application of the session-89 "General bucket policy" to
 * Seating (rebuilt session 88, before the policy existed).
 *
 * Findings while auditing the "Seats" bucket (185 rows -- not one of
 * Laken's 12 named model-platform/part-type buckets, functionally the
 * catch-all for seats with no detectable model code in the name):
 *   - 20 V-Twin "Seat Post Assembly"/"Seat T"/seat-post-forging rows are
 *     hardtail/springer seat MOUNTING HARDWARE, not seats themselves --
 *     moved to the existing "Seating Hardware" bucket.
 *   - 6 Wild Ass "CUSHION ..." rows are add-on cushion pads, not seats --
 *     moved to the existing "Accessories" bucket.
 *   - Renamed the remainder "Seats" -> "Universal & Styled Seats" (a
 *     category-specific label for brand-styled/universal-fit seats that
 *     aren't tied to one platform), per the catch-all-rename policy.
 *
 * Then adds display_subcategory_detail groupings to every bucket over
 * ~150 rows: Softail (1055), Touring (678), Seating Hardware (412+20),
 * Solo Seats (242), Dyna (239), Sportster (233), Universal & Styled Seats
 * (185-26=159).
 *
 * Usage:
 *   node scripts/ingest/rebuild_seating_detail_groups.mjs            # dry run
 *   node scripts/ingest/rebuild_seating_detail_groups.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CAT = 'Seating';

const SEATS_BUCKET = 'Seats';
const SEATS_RENAME = 'Universal & Styled Seats';
const HARDWARE_BUCKET = 'Seating Hardware- Springs. Brackets, Mounts, Tabs, etc.';
const ACCESSORIES_BUCKET = 'Accessories- Heaters, Covers, Gel Pad, etc.';

// Model-platform buckets: split by seat usage-type, same convention across all of them.
const MODEL_PLATFORM_RULES = [
  [/pillion/i, 'Pillion Pads'],
  [/solo/i, 'Solo Seats'],
  [/2-?up|two.up|passenger/i, '2-Up & Passenger Seats'],
  [/backrest/i, 'Seats w/ Backrest'],
  [/seat|saddle/i, 'Other Complete Seats'],
];

const DETAIL_RULES = {
  'Softail (FL/FX) (FLS/FXS)': MODEL_PLATFORM_RULES,
  'Touring (FLH/FLT)': MODEL_PLATFORM_RULES,
  'Dyna (FXD)': MODEL_PLATFORM_RULES,
  'Sportster (XL)': MODEL_PLATFORM_RULES,
  [SEATS_RENAME]: MODEL_PLATFORM_RULES,
  'Solo Seats': [
    [/spring/i, 'Spring-Mount Solo Seats'],
    [/bobber/i, 'Bobber Style Solo Seats'],
    [/police/i, 'Police Style Solo Seats'],
    [/mount kit|and mount/i, 'Solo Seat + Mount Kits'],
    [/leather/i, 'Leather Solo Seats'],
    [/vinyl/i, 'Vinyl Solo Seats'],
    [/./, 'Styled Solo Seats'],
  ],
  [HARDWARE_BUCKET]: [
    [/spring/i, 'Springs & Suspension'],
    [/seat post|seat t\b|\btee\b/i, 'Seat Post & T-Bar Hardware'],
    [/mount|bracket|hinge/i, 'Mount Kits, Brackets & Hinges'],
    [/bolt|bushing|nut\b|washer|clip/i, 'Bolts, Bushings & Small Hardware'],
    [/strap|cover|pad|bumper/i, 'Straps, Covers & Pads'],
  ],
};

function classify(name, rules) {
  for (const [re, label] of rules) {
    if (re.test(name)) return label;
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    // ── Part 1: pull misfiled hardware/cushions out of "Seats" ──────────
    const hwRes = await client.query(
      `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = $2
       AND (name ILIKE '%seat post%' OR name ILIKE 'Replica Seat T%' OR name ILIKE 'Black Replica Seat T%' OR name ILIKE 'Chrome Replica Seat T%' OR name ILIKE '%Forged Seat T%' OR name ILIKE '%Seat Post Forging%')`,
      [CAT, SEATS_BUCKET]
    );
    const cushionRes = await client.query(
      `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = $2 AND brand = 'Wild Ass'`,
      [CAT, SEATS_BUCKET]
    );
    console.log(`[Correction] ${hwRes.rows.length} seat-post hardware rows: Seats -> Seating Hardware`);
    console.log(`[Correction] ${cushionRes.rows.length} Wild Ass cushion rows: Seats -> Accessories`);

    // ── Part 2: rename Seats -> Universal & Styled Seats ─────────────────
    const remainingCount = await client.query(
      `SELECT count(*) FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = $2`,
      [CAT, SEATS_BUCKET]
    );
    console.log(`[Rename] ${remainingCount.rows[0].count} total "Seats" rows (incl. above) -> "${SEATS_RENAME}"`);

    // ── Part 3: detail groupings (run after the rename/move above, using
    // final subcategory names) ────────────────────────────────────────
    const detailPlan = {};
    const detailUpdates = [];

    for (const [subcat, rules] of Object.entries(DETAIL_RULES)) {
      const lookupSubcat = subcat === SEATS_RENAME ? SEATS_BUCKET : subcat; // pre-rename name, still true pre-apply
      const res = await client.query(
        `SELECT id, name, brand FROM catalog_unified WHERE is_active = true AND display_category = $1 AND display_subcategory = $2`,
        [CAT, lookupSubcat]
      );
      const rows = subcat === SEATS_RENAME
        ? res.rows.filter(r => !hwRes.rows.some(h => h.id === r.id) && r.brand !== 'Wild Ass')
        : res.rows;
      const tally = {};
      let stragglers = 0;
      for (const row of rows) {
        const label = classify(row.name, rules);
        if (label) {
          tally[label] = (tally[label] || 0) + 1;
          detailUpdates.push({ id: row.id, label });
        } else {
          stragglers++;
        }
      }
      detailPlan[subcat] = { total: rows.length, tally, stragglers };
    }

    console.log('\n=== Detail grouping plan ===');
    for (const [subcat, plan] of Object.entries(detailPlan)) {
      console.log(`\n${subcat} (${plan.total} total)`);
      for (const [label, count] of Object.entries(plan.tally).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${label}: ${count}`);
      }
      console.log(`  (ungrouped stragglers): ${plan.stragglers}`);
    }

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');

    for (const row of hwRes.rows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`, [HARDWARE_BUCKET, row.id]);
    }
    for (const row of cushionRes.rows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1 WHERE id = $2`, [ACCESSORIES_BUCKET, row.id]);
    }
    const renameResult = await client.query(
      `UPDATE catalog_unified SET display_subcategory = $1 WHERE is_active = true AND display_category = $2 AND display_subcategory = $3`,
      [SEATS_RENAME, CAT, SEATS_BUCKET]
    );
    console.log(`\nMoved ${hwRes.rows.length} hardware rows, ${cushionRes.rows.length} cushion rows. Renamed ${renameResult.rowCount} rows to "${SEATS_RENAME}".`);

    let updated = 0;
    for (const { id, label } of detailUpdates) {
      await client.query(`UPDATE catalog_unified SET display_subcategory_detail = $1 WHERE id = $2`, [label, id]);
      updated++;
    }
    console.log(`Applied display_subcategory_detail to ${updated} rows.`);

    await client.query('COMMIT');
    console.log('\nCommitted.');
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
