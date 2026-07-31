#!/usr/bin/env node
/**
 * fix_null_subcategory_engine.mjs
 *
 * Engine has 99 active rows with display_subcategory IS NULL. Unlike
 * rebuild_engine_taxonomy.mjs (which already ran 2026-07-18 and classified
 * the other 8,068 active rows), these 99 never went through any pass -- they
 * have no old subcategory name to key off, so rebuild_engine_taxonomy.mjs's
 * BUCKET_RENAMES logic (which depends entirely on recognizing old names like
 * 'Camchest'/'Heads & Valves') doesn't apply. This is fresh content-based
 * classification onto the same target bucket names that script produced,
 * scoped to WHERE display_subcategory IS NULL only -- it cannot touch the
 * 8,068 already-classified rows.
 *
 * Usage:
 *   node scripts/ingest/fix_null_subcategory_engine.mjs            # dry run
 *   node scripts/ingest/fix_null_subcategory_engine.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CATEGORY = 'Engine';

// Single ordered priority list (first match wins). Cross-category and
// same-category rules are interleaved deliberately -- e.g. "Twin Cam" as a
// bare engine-family descriptor must not out-rank a more specific match
// like PUSHROD/COVER/FLYWHEEL, so Cam Chest is checked last, and "O-Ring
// Style" describing a Cylinder Head Kit must not out-rank the Cylinder
// Heads match, so the generic Gaskets & Seals catch runs after every
// specific structural-part rule.
const RULES = [
  {
    subcategory: 'Foot Peg Mounts, Bracket, Hardware',
    display_category: 'Foot Controls & Pegs',
    test: (n) => /DRIVER PEGS/.test(n) || /KICK PEDAL/.test(n),
  },
  { subcategory: 'Oil Pump & System', test: (n) => /OIL PUMP/.test(n) },
  {
    // Explicit "Cam Chest Kit" naming must win over an incidental mention
    // of another part inside its description (e.g. "...Chrome Pushrods").
    subcategory: 'Cam Chest',
    test: (n) => /CAM ?CHEST/.test(n),
  },
  { subcategory: 'Pistons', test: (n) => /\bPISTONS?\b/.test(n) || /\bPSTN\b/.test(n) || /\bRING SETS?\b/.test(n) },
  { subcategory: 'Cylinder Heads', test: (n) => /CYLINDER HEAD/.test(n) },
  { subcategory: 'Valves', test: (n) => /\bVALVES?\b/.test(n) },
  { subcategory: 'Pushrods', test: (n) => /\bPUSHRODS?\b/.test(n) || /\bPUSH ?ROD\b/.test(n) },
  { subcategory: 'Rocker Boxes', test: (n) => /ROCKER BOX/.test(n) },
  { subcategory: 'Engine Mounts', test: (n) => /MOTOR MOUNT/.test(n) },
  { subcategory: 'Performance Kits', test: (n) => /POWER PACK/.test(n) },
  { subcategory: 'Complete Engines', test: (n) => /LONG BLOCK ENGINE/.test(n) },
  {
    subcategory: 'Bottom End',
    test: (n) =>
      /\bFLYWHEELS?\b/.test(n) ||
      /CONNECTING ROD/.test(n) ||
      /PINION GEAR/.test(n) ||
      /ENGINE CASE/.test(n) ||
      /STROKER FLYWHEEL/.test(n),
  },
  {
    // Per rebuild_engine_taxonomy.mjs's documented policy: Engine's internal
    // gaskets/seals/o-rings consolidate into the standalone Gaskets & Seals
    // category's Engine subcategory rather than staying duplicated here.
    // Runs after every specific structural-part rule above so a descriptor
    // like "O-Ring Style" on a Cylinder Head Kit doesn't hijack it.
    subcategory: 'Engine',
    display_category: 'Gaskets & Seals',
    test: (n) => /\bGASKETS?\b/.test(n) || /\bO-?RINGS?\b/.test(n) || /\bSEALS?\b/.test(n),
  },
  {
    // Generic covers not caught by a more specific rule above (timing
    // cover, lifter block cover, points cover, spark plug cover, side
    // cover) -- closest fit among the named buckets.
    subcategory: 'Inspection Covers',
    test: (n) => /\bCOVERS?\b/.test(n),
  },
  {
    // Checked last: bare "Cam(s)/Camshaft/Camchest" is ambiguous with
    // "Twin Cam" used only as an engine-family descriptor, so this only
    // fires for rows nothing more specific already claimed.
    subcategory: 'Cam Chest',
    test: (n) => /\bCAM(S|SHAFT|CHEST)?\b/.test(n),
  },
];

const FALLBACK_SUBCATEGORY = 'General';

function classify(name) {
  const n = name.toUpperCase();
  for (const rule of RULES) {
    if (rule.test(n)) {
      return { display_category: rule.display_category || CATEGORY, display_subcategory: rule.subcategory };
    }
  }
  return { display_category: CATEGORY, display_subcategory: FALLBACK_SUBCATEGORY };
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, sku, name FROM catalog_unified
     WHERE display_category = $1 AND is_active = true AND display_subcategory IS NULL
     ORDER BY name`,
    [CATEGORY]
  );
  console.log(`Loaded ${rows.length} NULL-subcategory active rows from ${CATEGORY}\n`);

  const moves = [];
  const tally = {};

  for (const row of rows) {
    const dest = classify(row.name);
    moves.push({ ...row, ...dest });
    const label = dest.display_category === CATEGORY ? dest.display_subcategory : `-> ${dest.display_category} / ${dest.display_subcategory}`;
    tally[label] = (tally[label] || 0) + 1;
  }

  console.log('=== Classification tally ===');
  for (const [label, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)}  ${label}`);
  }

  console.log(`\n=== Full row-by-row assignment ===`);
  moves
    .map((r) => ({ ...r, label: r.display_category === CATEGORY ? r.display_subcategory : `${r.display_category} / ${r.display_subcategory}` }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach((r) => console.log(`  [${r.label}]  ${r.name}`));

  if (!APPLY) {
    console.log(`\nDry run only. Re-run with --apply to write changes.`);
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_unified_backup_engine_nullfix_20260730 AS
      SELECT id, display_category, display_subcategory FROM catalog_unified WHERE id = ANY($1::int[])
    `, [rows.map((r) => r.id)]);

    for (const move of moves) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, updated_at = now() WHERE id = $3`,
        [move.display_category, move.display_subcategory, move.id]
      );
    }
    await client.query('COMMIT');
    const crossCount = moves.filter((m) => m.display_category !== CATEGORY).length;
    console.log(`\nApplied: ${moves.length} rows updated (${crossCount} cross-category moves, ${moves.length - crossCount} in-category). Backup: catalog_unified_backup_engine_nullfix_20260730`);
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
