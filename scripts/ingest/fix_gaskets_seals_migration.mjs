#!/usr/bin/env node
/**
 * fix_gaskets_seals_migration.mjs
 *
 * Creates the new "Gaskets & Seals" display_category and migrates rows into
 * it from five source categories. This is a bigger, more consequential
 * operation than the previous subcategory rebuilds — it's a CATEGORY-level
 * move (display_category AND display_subcategory both change), not a
 * subcategory tweak within one category.
 *
 * Scope, confirmed with Laken via a read-only scoping audit first
 * (audit_gaskets_seals_scope.mjs) before any of this was written:
 *   - Engine: the original 3,030-row "Gaskets & Seals" bucket, PLUS any
 *     other gasket/seal-named items scattered into other Engine
 *     subcategories during that rebuild (name-matched, not just the old
 *     subcategory flag).
 *   - Transmission & Clutch: name-matched.
 *   - Suspension: the whole "Fork Seals & Boots" subcategory, moved
 *     wholesale — confirmed this one is genuinely cohesive (seals + their
 *     protective boots), no pure-unrelated-part contamination found.
 *   - Wheels & Tires: name-matched WITHIN "Bearings & Seals" only — NOT
 *     the whole subcategory. Correction from the first dry run: the
 *     scoping audit's "34 rows" figure was actually just the seal-named
 *     subset of that subcategory, not its total size (238 rows, mostly
 *     pure wheel/swingarm bearings with no seal relation at all). Laken's
 *     call after seeing the corrected numbers: only move the seal-related
 *     items, leave the pure bearings in Wheels & Tires.
 *   - Exhaust: name-matched gasket/seal items — explicitly named in the spec.
 *
 * Deliberately NOT touched:
 *   - Brakes (caliper seal kits) — Laken's explicit call; not named in the
 *     original spec (only Exhaust/Fork/Wheel were).
 *   - Tools & Chemicals — chemical sealant products and seal-installation
 *     tools are a different product type entirely.
 *   - Everything else not named in the spec (Fenders & Body gas cap
 *     gaskets, Lighting, Frame & Hardware, Electrical, Instrumentation,
 *     etc.) — same "only move what was explicitly named" logic.
 *   - Cross-category noise found in the first dry run, excluded here (see
 *     isExcluded() below) rather than swept into a generic bucket where
 *     it'd be even harder to trace back to its real system:
 *       - Brake caliper items ("Caliper Seal Kit," "Caliper Piston with
 *         Seal") mislabeled in Engine's Pistons & Cylinders — actually
 *         Brakes, consistent with the "leave brake seals in Brakes" call.
 *       - Master cylinder gaskets ("Handlebar Master Cylinder Gasket")
 *         mislabeled in Engine's Pistons & Cylinders — actually Handlebar
 *         & Controls (same "Cylinder" word collision, different system).
 *       - Piston kits that bundle gaskets as an accessory ("Piston Kit
 *         w/Gaskets") — primary product is pistons, staying put.
 *       - Electrical connector seals ("Deutsch...Interface Seal")
 *         mislabeled in Engine — a wiring connector seal, not a gasket.
 *
 * Subcategory logic:
 *   1. Brand = James Gasket (any spelling variant) -> James Gaskets,
 *      regardless of source system — brand takes priority for the two
 *      dominant brands, per how Laken structured the spec.
 *   2. Brand = Cometic -> Cometic Gaskets, same brand-first priority.
 *   3. Gasket board/sheet material -> Gasket Board.
 *   4. Sourced from Suspension, Wheels & Tires, or Exhaust ->
 *      "Gaskets/Seals - Exhaust/Fork/Wheel".
 *   5. Everything else (the bulk of non-James/Cometic Engine and
 *      Transmission gaskets) -> Gasket Kits (default).
 *
 * Pattern: audit → dry run → sample review → apply → sync → reindex.
 *
 * Usage:
 *   node fix_gaskets_seals_migration.mjs                  # dry run
 *   node fix_gaskets_seals_migration.mjs --sample=50      # bigger sample
 *   node fix_gaskets_seals_migration.mjs --apply          # writes the rows
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const sampleArg = process.argv.find((a) => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : 25;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const NEW_CATEGORY = 'Gaskets & Seals';

function classify(name, brand, oldCategory) {
  const n = (name || '').toUpperCase();
  const b = (brand || '').toUpperCase();

  if (b.includes('JAMES')) return 'James Gaskets';
  if (b === 'COMETIC') return 'Cometic Gaskets';
  if (/\bGASKET (BOARD|SHEET|MATERIAL|STOCK)\b/.test(n) || /\bSHEET GASKET\b/.test(n) || /\bCORK SHEET\b/.test(n)) {
    return 'Gasket Board';
  }
  // Fork seals occasionally end up mislabeled outside Suspension (e.g. an
  // SKF fork seal filed under Engine) — catch these by name too, not just
  // by source category.
  if (/\bFORK ?SEALS?\b/.test(n) || /\bFORK BOOTS?\b/.test(n) || /\bFORK DUST\b/.test(n)) {
    return 'Gaskets/Seals - Exhaust/Fork/Wheel';
  }
  if (['Suspension', 'Wheels & Tires', 'Exhaust'].includes(oldCategory)) {
    return 'Gaskets/Seals - Exhaust/Fork/Wheel';
  }
  return 'Gasket Kits'; // default — the bulk of non-James/Cometic Engine/Transmission gaskets
}

// Cross-category noise found in the first dry run — items that are actually
// a different system's part (Brakes, Handlebar & Controls, Electrical) that
// happen to mention "gasket"/"seal" because of a word collision or a bundled
// accessory. Excluded here rather than swept into a generic bucket.
function excludeReason(name) {
  const n = (name || '').toUpperCase();
  if (/\bCALIPER\b/.test(n)) return 'Brake caliper item — leave for Brakes cross-category cleanup';
  if (/\bMASTER CYLINDER\b/.test(n)) return 'Handlebar & Controls item (brake/clutch master cylinder) — not an engine gasket';
  if (/\bPISTON (KIT|SET)\b/.test(n)) return 'Piston kit/set — primary product is pistons, gaskets are a bundled accessory';
  if (/\bDEUTSCH\b/.test(n) && /\bSEAL\b/.test(n)) return 'Electrical connector seal — not a gasket';
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n=== Does "${NEW_CATEGORY}" already exist? ===`);
    const catCheck = await client.query(
      `SELECT COUNT(*) FROM catalog_unified WHERE is_active = true AND display_category = $1`,
      [NEW_CATEGORY],
    );
    console.log(`Existing rows: ${catCheck.rows[0].count}`);

    const candidates = await client.query(
      `SELECT id, name, brand, display_category AS old_category, COALESCE(display_subcategory, '') AS old_subcategory
       FROM catalog_unified
       WHERE is_active = true
         AND (
           (display_category = 'Engine' AND (name ILIKE '%gasket%' OR name ~* '\\yseal(s)?\\y'))
           OR (display_category = 'Transmission & Clutch' AND (name ILIKE '%gasket%' OR name ~* '\\yseal(s)?\\y'))
           OR (display_category = 'Suspension' AND display_subcategory = 'Fork Seals & Boots')
           OR (display_category = 'Wheels & Tires' AND display_subcategory = 'Bearings & Seals' AND (name ILIKE '%gasket%' OR name ~* '\\yseal(s)?\\y'))
           OR (display_category = 'Exhaust' AND (name ILIKE '%gasket%' OR name ~* '\\yseal(s)?\\y'))
         )`,
    );
    console.log(`\nTotal candidate rows across all five source categories: ${candidates.rows.length}`);

    const byOldCategory = {};
    for (const row of candidates.rows) {
      byOldCategory[row.old_category] = (byOldCategory[row.old_category] || 0) + 1;
    }
    console.log('\n=== Candidates by OLD category ===');
    console.table(Object.entries(byOldCategory).map(([old_category, count]) => ({ old_category, count })));

    const byNewSubcat = {};
    const excluded = [];
    const oldToNewCounts = {};
    for (const row of candidates.rows) {
      const reason = excludeReason(row.name);
      if (reason) {
        excluded.push({ ...row, reason });
        continue;
      }
      const newSub = classify(row.name, row.brand, row.old_category);
      row.newSub = newSub;
      (byNewSubcat[newSub] = byNewSubcat[newSub] || []).push(row);
      const oldKey = `${row.old_category} / ${row.old_subcategory || '(blank)'}`;
      oldToNewCounts[oldKey] = oldToNewCounts[oldKey] || {};
      oldToNewCounts[oldKey][newSub] = (oldToNewCounts[oldKey][newSub] || 0) + 1;
    }

    console.log('\n=== OLD (category/subcategory) → NEW subcategory MAPPING (row counts) ===');
    const mappingRows = [];
    for (const [oldKey, newCounts] of Object.entries(oldToNewCounts)) {
      for (const [newSub, count] of Object.entries(newCounts)) {
        mappingRows.push({ old: oldKey, new: newSub, count });
      }
    }
    console.table(mappingRows);

    console.log('\n=== CLASSIFICATION RESULTS (dry run) ===');
    for (const [subcat, rows] of Object.entries(byNewSubcat)) {
      console.log(`\n${subcat}: ${rows.length} matched`);
      console.table(rows.slice(0, SAMPLE_SIZE).map((r) => ({ id: r.id, name: r.name, brand: r.brand, old_category: r.old_category, old_subcategory: r.old_subcategory || '(blank)' })));
    }

    console.log(`\n=== EXCLUDED (cross-category noise, left untouched): ${excluded.length} ===`);
    console.table(excluded.slice(0, SAMPLE_SIZE).map((r) => ({ id: r.id, name: r.name, brand: r.brand, old_category: r.old_category, reason: r.reason })));

    if (!APPLY) {
      console.log('\nDry run only — no rows written. Re-run with --apply once the samples above look right.');
      return;
    }

    console.log('\n=== APPLYING ===');
    await client.query('BEGIN');
    let totalUpdated = 0;
    for (const [subcat, rows] of Object.entries(byNewSubcat)) {
      const ids = rows.map((r) => r.id);
      const res = await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = ANY($3::int[])`,
        [NEW_CATEGORY, subcat, ids],
      );
      console.log(`  ${subcat}: ${res.rowCount} rows updated`);
      totalUpdated += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`\nTotal rows updated: ${totalUpdated}`);
    console.log('Next: reindex Typesense: node scripts/ingest/index_unified.js');
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK');
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
