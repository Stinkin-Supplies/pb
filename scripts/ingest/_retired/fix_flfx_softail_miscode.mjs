#!/usr/bin/env node
/**
 * fix_flfx_softail_miscode.mjs
 *
 * Corrects a real error from backfill_seating_name_fitment.mjs: the combined
 * token "FL/FX" (or "FX/FL") was resolved by splitting on '/' and unioning
 * FL (Touring, per confirmed domain rule) + FX (Dyna, per confirmed domain
 * rule) — producing a false "fits both Touring and Dyna" claim on 161 real
 * products (physically impossible per Laken: a Touring seat cannot fit a
 * Dyna frame).
 *
 * Domain-confirmed correction: "FL/FX" as a COMBINED token specifically
 * means SOFTAIL — Softail is the one platform that carries both FL-prefix
 * (FLST-series dresser-style) and FX-prefix (FXST-series cruiser-style)
 * model codes under the same shared frame/seat-mount architecture. The
 * bare individual letters (FL alone = Touring, FX alone = Dyna) are
 * unaffected by this fix — only the specific "FL/FX" or "FX/FL" pairing
 * changes meaning.
 *
 * Scope: catalog_unified rows where a catalog_fitment_v2 row exists with
 * fitment_source = 'seating_name_backfill' AND the product name contains
 * "FL/FX" or "FX/FL" (case-insensitive). For these:
 *   1. DELETE the existing wrong seating_name_backfill rows for that product
 *   2. Re-parse the year range from the name
 *   3. INSERT correct Softail-family model-years for that range
 *
 * catalog_fitment_v2 is NEVER truncated — only targeted DELETE by
 * product_id + fitment_source, scoped to exactly the affected rows.
 *
 * Usage:
 *   node scripts/ingest/fix_flfx_softail_miscode.mjs            # dry run
 *   node scripts/ingest/fix_flfx_softail_miscode.mjs --apply    # live write
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

const OLD_SOURCE = 'seating_name_backfill';
const NEW_SOURCE = 'seating_name_backfill_flfx_corrected';
const CONFIDENCE = 0.75; // same tier as a confirmed exact-code match

// Matches the FL/FX combo specifically (either order), plus its year range.
const FLFX_RE = /\bF[LX]\s*\/\s*F[LX]\b.*?['’]?(\d{2,4})\s*-\s*['’]?(\d{2,4}|UP)\b/i;

function normalizeYear(raw) {
  const n = parseInt(raw, 10);
  if (raw.length === 4) return n;
  return n <= 26 ? 2000 + n : 1900 + n;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Loading Softail family models + years...');
    const { rows: familyRows } = await client.query(`SELECT id FROM harley_families WHERE name = 'Softail'`);
    if (familyRows.length === 0) throw new Error("No 'Softail' row found in harley_families — check exact name spelling");
    const softailFamilyId = familyRows[0].id;

    const { rows: softailModels } = await client.query(
      `SELECT id, model_code, start_year, end_year FROM harley_models WHERE family_id = $1`,
      [softailFamilyId]
    );
    const { rows: yearRows } = await client.query(`SELECT id, model_id, year FROM harley_model_years`);
    const yearsByModel = new Map();
    for (const y of yearRows) {
      if (!yearsByModel.has(y.model_id)) yearsByModel.set(y.model_id, []);
      yearsByModel.get(y.model_id).push(y);
    }
    console.log(`Softail family: ${softailModels.length} models`);

    // Find affected products: has a wrong seating_name_backfill row AND name contains FL/FX combo
    const { rows: affected } = await client.query(
      `SELECT DISTINCT cu.id, cu.brand, cu.name
       FROM catalog_unified cu
       JOIN catalog_fitment_v2 cf ON cf.product_id = cu.id
       WHERE cf.fitment_source = $1
         AND cu.name ~* 'F[LX]\\s*/\\s*F[LX]'
       ORDER BY cu.name`,
      [OLD_SOURCE]
    );

    console.log(`\nAffected products (wrong Touring+Dyna claim, should be Softail): ${affected.length}`);

    const plan = [];
    const unparsed = [];

    for (const row of affected) {
      const m = FLFX_RE.exec(row.name);
      if (!m) {
        unparsed.push(row);
        continue;
      }
      const yStart = normalizeYear(m[1]);
      const yEnd = m[2].toUpperCase() === 'UP' ? 9999 : normalizeYear(m[2]);

      const modelYearIds = new Set();
      for (const model of softailModels) {
        const lo = Math.max(yStart, model.start_year);
        const hi = Math.min(yEnd === 9999 ? model.end_year : yEnd, model.end_year);
        const years = yearsByModel.get(model.id) || [];
        for (const y of years) {
          if (y.year >= lo && y.year <= hi) modelYearIds.add(y.id);
        }
      }

      if (modelYearIds.size === 0) {
        unparsed.push({ ...row, reason: `parsed year range ${yStart}-${yEnd} but no overlapping Softail model-years` });
        continue;
      }

      plan.push({ productId: row.id, brand: row.brand, name: row.name, yearRange: `${yStart}-${yEnd === 9999 ? 'UP' : yEnd}`, modelYearIds: [...modelYearIds] });
    }

    console.log(`\nProducts with a valid corrected Softail range: ${plan.length}`);
    console.log(`Products where the FL/FX + year pattern couldn't be re-parsed (left untouched, flagged): ${unparsed.length}`);
    unparsed.forEach(u => console.log(`  [${u.brand}] ${u.name}${u.reason ? '  (' + u.reason + ')' : ''}`));

    console.log(`\n=== Sample corrections (first 15) ===`);
    plan.slice(0, 15).forEach(p => console.log(`  [${p.brand}] "${p.name}"\n    years=${p.yearRange} -> ${p.modelYearIds.length} Softail model-year rows`));

    const totalNewRows = plan.reduce((sum, p) => sum + p.modelYearIds.length, 0);
    console.log(`\nTotal rows to DELETE (old wrong Touring+Dyna claims): all '${OLD_SOURCE}' rows for these ${plan.length} products`);
    console.log(`Total rows to INSERT (corrected Softail claims): ${totalNewRows}`);

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    console.log('\nApplying correction...');
    await client.query('BEGIN');
    let done = 0;
    for (const p of plan) {
      await client.query(
        `DELETE FROM catalog_fitment_v2 WHERE product_id = $1 AND fitment_source = $2`,
        [p.productId, OLD_SOURCE]
      );
      for (const modelYearId of p.modelYearIds) {
        await client.query(
          `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score, parsed_snapshot)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (product_id, model_year_id) DO NOTHING`,
          [p.productId, modelYearId, NEW_SOURCE, CONFIDENCE, 'FL/FX (corrected to Softail)']
        );
      }
      done++;
      if (done % 50 === 0) console.log(`  ${done}/${plan.length}`);
    }
    await client.query('COMMIT');
    console.log(`Done. Corrected ${done} products (source='${NEW_SOURCE}').`);
    console.log('\nNEXT STEPS:');
    console.log('  1. node scripts/ingest/sync_fitment_flat_columns.mjs');
    console.log('  2. node scripts/ingest/index_unified.js --recreate');
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
