#!/usr/bin/env node
/**
 * phase4_migrate_fitment.js
 * ─────────────────────────────────────────────────────────────
 * Phase 4 — Migrate existing catalog_fitment rows into
 * catalog_fitment_v2 using the canonical harley_model_years IDs.
 *
 * Strategy:
 *   Tier 1 — Family-level names → all model_years in that family
 *   Tier 2 — Specific model codes → exact harley_models match
 *   Tier 3 — Skip (pre-canonical: Shovelhead, V-Rod, FXR, etc.)
 * ─────────────────────────────────────────────────────────────
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function progress(tag, current, total, startMs, extra = '') {
  const pct    = total > 0 ? current / total : 0;
  const filled = Math.round(pct * 24);
  const bar    = '█'.repeat(filled) + '░'.repeat(24 - filled);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  process.stdout.write(`\r[${tag}] │${bar}│ ${(pct*100).toFixed(1)}% (${current}/${total})${extra} | ${elapsed}s`);
}
function done(tag, msg) {
  process.stdout.write('\n');
  console.log(`[${tag}] ✓ ${msg}`);
}

// ── Tier 1: family-name → harley_families.name ────────────────
const FAMILY_MAP = {
  'Touring':    'Touring',
  'Softail':    'Softail Evo',   // legacy "Softail" = Evo era
  'Dyna':       'Dyna',
  'Sportster':  'Sportster',
  'Trike':      'Trike',
  'M8':         'Softail M8',
  'Street':     'Street',
};

// ── Tier 2: model-name → model_code(s) in harley_models ──────
const MODEL_CODE_MAP = {
  'FLHX':               ['FLHX'],
  'FLHT':               ['FLHT'],
  'FLTR':               ['FLTR', 'FLTRX'],
  'FXST':               ['FXST'],
  'Road King':          ['FLHR'],
  'Road Glide':         ['FLTR', 'FLTRX'],
  'Street Glide':       ['FLHX'],
  'Electra Glide':      ['FLHT', 'FLHTC', 'FLHTCU'],
  'Wide Glide':         ['FXDWG'],
  'FXS BLACKLINE':      ['FXS'],
  'FXS BLACKLINE 96':   ['FXS'],
  'FXS BLACKLINE 103':  ['FXS'],
  'FXSB Low Rider':     ['FXSB'],
  'SPORSTER XR 1200X':  ['XR1200X'],
};

// ── Tier 3: skip these entirely ───────────────────────────────
const SKIP = new Set([
  'All Models', 'Universal', 'Big Twin', 'Twin Cam', 'Evolution',
  'Shovelhead', 'Knucklehead', 'Panhead', 'V-Rod', 'FXR',
  'FXEF Super Glide Fat Bob', 'FXLR Low Rider Custom',
  'FXRDG Disc Glide', 'FXRD GT', 'FXRS Conv Low Rider',
  'FXRS Low Glide', 'FXRS Low Rider', 'FXRS Low Rider Liberty',
  'FXRS Low Rider Sport', 'FXRS-SP Low Rider Sport',
  'FXRS Super Glide II', 'FXRT Sport Glide',
  'POLICE FLHTP ELECTRA GLIDE', 'SIDECAR', 'SIDECAR ULTRA',
  'TLE FOR FLHTC ELECTRA GLIDE CLASSIC',
  'TLE FOR FLHT ELECTRA GLIDE STANDARD',
  'TLE - SIDE CAR', 'TLE - SIDECAR', 'TLE SIDE CAR', 'TLE SIDECAR',
  'TLEU FOR FLHTCU ULTRA CLASSIC ELECTRA GLIDE',
  'TLEU - SIDE CAR', 'TLEU - SIDECAR ULRTA',
  'TLEU - SIDE CAR ULTRA', 'TLEU - SIDECAR ULTRA', 'TLEU SIDECAR ULTRA',
]);

async function main() {
  const client = await pool.connect();
  try {
    console.log('\n[Phase4] Loading existing fitment rows...');

    const { rows: fitmentRows } = await client.query(`
      SELECT f.id, f.product_id, f.model, f.year_start, f.year_end
      FROM catalog_fitment f
      WHERE f.make = 'Harley-Davidson'
        AND f.year_start IS NOT NULL
        AND f.year_end   IS NOT NULL
      ORDER BY f.id
    `);

    console.log(`[Phase4] ${fitmentRows.length} source fitment rows to process`);

    // Pre-load canonical data for fast lookups
    const { rows: families } = await client.query(
      `SELECT id, name FROM harley_families`
    );
    const familyByName = Object.fromEntries(families.map(f => [f.name, f.id]));

    const { rows: models } = await client.query(
      `SELECT id, model_code, family_id, start_year, end_year FROM harley_models`
    );
    const modelsByCode = {};
    for (const m of models) {
      if (!modelsByCode[m.model_code]) modelsByCode[m.model_code] = [];
      modelsByCode[m.model_code].push(m);
    }

    // For a family_id + year range, get all matching model_year_ids
    async function getModelYearIds(familyId, yearStart, yearEnd) {
      const { rows } = await client.query(`
        SELECT my.id
        FROM harley_model_years my
        JOIN harley_models hm ON hm.id = my.model_id
        WHERE hm.family_id = $1::int
          AND my.year BETWEEN $2::int AND $3::int
      `, [familyId, yearStart, yearEnd]);
      return rows.map(r => r.id);
    }

    // For specific model codes + year range
    async function getModelYearIdsByCodes(codes, yearStart, yearEnd) {
      const { rows } = await client.query(`
        SELECT my.id
        FROM harley_model_years my
        JOIN harley_models hm ON hm.id = my.model_id
        WHERE hm.model_code = ANY($1::text[])
          AND my.year BETWEEN $2::int AND $3::int
      `, [codes, yearStart, yearEnd]);
      return rows.map(r => r.id);
    }

    let inserted = 0;
    let skipped  = 0;
    let noMatch  = 0;
    const t = Date.now();

    for (let i = 0; i < fitmentRows.length; i++) {
      const f = fitmentRows[i];
      progress('Phase4', i + 1, fitmentRows.length, t, ` inserted: ${inserted} skipped: ${skipped}`);

      if (SKIP.has(f.model)) { skipped++; continue; }

      let modelYearIds = [];

      // Tier 1: family-level
      if (FAMILY_MAP[f.model]) {
        const familyId = familyByName[FAMILY_MAP[f.model]];
        if (familyId) {
          modelYearIds = await getModelYearIds(familyId, f.year_start, f.year_end);
        }
      }
      // Tier 2: specific model codes
      else if (MODEL_CODE_MAP[f.model]) {
        modelYearIds = await getModelYearIdsByCodes(
          MODEL_CODE_MAP[f.model], f.year_start, f.year_end
        );
      }
      else {
        noMatch++;
        continue;
      }

      if (modelYearIds.length === 0) { noMatch++; continue; }

      // Batch insert
      if (modelYearIds.length > 0) {
        const values = modelYearIds
          .map(myId => `(${f.product_id}, ${myId})`)
          .join(',');
        const result = await client.query(`
          INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
          VALUES ${values}
          ON CONFLICT (product_id, model_year_id) DO NOTHING
        `);
        inserted += result.rowCount;
      }
    }

    done('Phase4', 'Migration complete');

    // Final counts
    const { rows: [summary] } = await client.query(`
      SELECT
        (SELECT COUNT(*)                    FROM catalog_fitment_v2)       AS total_v2,
        (SELECT COUNT(DISTINCT product_id)  FROM catalog_fitment_v2)       AS products_covered,
        (SELECT COUNT(DISTINCT model_year_id) FROM catalog_fitment_v2)     AS model_years_used
    `);

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   PHASE 4 COMPLETE                       ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  Rows inserted:      ${String(inserted).padEnd(20)} ║`);
    console.log(`║  Source rows skipped:${String(skipped).padEnd(20)} ║`);
    console.log(`║  No match:           ${String(noMatch).padEnd(20)} ║`);
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  catalog_fitment_v2: ${String(summary.total_v2).padEnd(20)} ║`);
    console.log(`║  Products covered:   ${String(summary.products_covered).padEnd(20)} ║`);
    console.log(`║  Model years used:   ${String(summary.model_years_used).padEnd(20)} ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('\nNext: run phase5_create_view.js\n');

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
