#!/usr/bin/env node
/**
 * fix_null_subcategory_seating.mjs
 *
 * Seating has 74 active rows with display_subcategory IS NULL. No existing
 * script builds Seating's top-level subcategory (rebuild_seating_detail_groups.mjs
 * is a detail-tier script that only touches rows that already have a
 * subcategory) -- this is fresh classification.
 *
 * Seating's existing 14 subcategories mix two axes: HD model-family buckets
 * (Softail, Touring, Dyna, Sportster, FXR) for seats fit to one specific
 * platform, and type buckets (Solo Seats, Universal & Styled Seats, Touring
 * Back Rest, Pillion Pads, Seating Hardware, Accessories, Seat Knobs/
 * Screws) for hardware or multi-fit items. This classifies by HD model code
 * when the name states one unambiguously, falls back to a type bucket
 * otherwise -- it does not guess a family from an ambiguous bare code.
 *
 * Usage:
 *   node scripts/ingest/fix_null_subcategory_seating.mjs            # dry run
 *   node scripts/ingest/fix_null_subcategory_seating.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CATEGORY = 'Seating';

const RULES = [
  { subcategory: 'Pillion Pads', test: (n) => /SISSY BAR/.test(n) },
  { subcategory: 'Seat Knobs/ Screws', test: (n) => /SEAT MNT/.test(n) || /MOUNT KNOB/.test(n) || /\bKNOB\b/.test(n) },
  { subcategory: 'Accessories- Heaters, Covers, Gel Pad, etc.', test: (n) => /SEAT COVER/.test(n) },
  {
    // The existing Softail bucket's own label is "Softail (FL/FX) (FLS/FXS)"
    // -- confirmed with the user that "FL/FX" paired in a title is this
    // catalog's Softail shorthand, not an ambiguous dual-platform fit.
    // Must be checked before the individual family rules below, which
    // would otherwise claim it via the bare FL fallback.
    subcategory: 'Softail (FL/FX) (FLS/FXS)',
    test: (n) => /\bFL\/FX\b/.test(n) || /\bFX\/FL\b/.test(n),
  },
  { subcategory: 'Sportster (XL)', test: (n) => /\bXL\b/.test(n) },
  { subcategory: 'Dyna (FXD)', test: (n) => /\bFXD\w*\b/.test(n) || /\bFLD\b/.test(n) || /\bDYNA\b/.test(n) },
  {
    subcategory: 'Softail (FL/FX) (FLS/FXS)',
    test: (n) =>
      /\bFLST\w*\b/.test(n) ||
      /\bFXST\w*\b/.test(n) ||
      /\bFLS[LB]?\b/.test(n) ||
      /\bFXS\b/.test(n) ||
      /\bFXBR\b/.test(n) ||
      /\bFXBB\b/.test(n) ||
      /\bFXFB\b/.test(n) ||
      /\bFLFB\b/.test(n) ||
      /\bSOFTAIL\b/.test(n),
  },
  { subcategory: 'FXR', test: (n) => /\bFXR\b/.test(n) },
  {
    // FLH/FLT-prefixed codes, or a bare "FL" token (this catalog's shorthand
    // for the general Touring/Big Twin FL platform), or the word Touring.
    subcategory: 'Touring (FLH/FLT)',
    test: (n) => /\bFLH\w*\b/.test(n) || /\bFLT\w*\b/.test(n) || /\bFL\b/.test(n) || /\bTOURING\b/.test(n),
  },
  { subcategory: 'Solo Seats', test: (n) => /\bSOLO\b/.test(n) },
];

const FALLBACK_SUBCATEGORY = 'Universal & Styled Seats';

function classify(name) {
  const n = name.toUpperCase();
  for (const rule of RULES) {
    if (rule.test(n)) return rule.subcategory;
  }
  return FALLBACK_SUBCATEGORY;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, sku, name FROM catalog_unified
     WHERE display_category = $1 AND is_active = true AND display_subcategory IS NULL
     ORDER BY name`,
    [CATEGORY]
  );
  console.log(`Loaded ${rows.length} NULL-subcategory active rows from ${CATEGORY}\n`);

  const moves = rows.map((row) => ({ ...row, new_subcategory: classify(row.name) }));
  const tally = {};
  for (const m of moves) tally[m.new_subcategory] = (tally[m.new_subcategory] || 0) + 1;

  console.log('=== Classification tally ===');
  for (const [label, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)}  ${label}`);
  }

  console.log(`\n=== Full row-by-row assignment ===`);
  [...moves].sort((a, b) => a.new_subcategory.localeCompare(b.new_subcategory))
    .forEach((r) => console.log(`  [${r.new_subcategory}]  ${r.name}`));

  if (!APPLY) {
    console.log(`\nDry run only. Re-run with --apply to write changes.`);
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_unified_backup_seating_nullfix_20260730 AS
      SELECT id, display_category, display_subcategory FROM catalog_unified WHERE id = ANY($1::int[])
    `, [rows.map((r) => r.id)]);

    for (const move of moves) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory = $1, updated_at = now() WHERE id = $2`,
        [move.new_subcategory, move.id]
      );
    }
    await client.query('COMMIT');
    console.log(`\nApplied ${moves.length} subcategory assignments. Backup: catalog_unified_backup_seating_nullfix_20260730`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rolled back due to error:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
