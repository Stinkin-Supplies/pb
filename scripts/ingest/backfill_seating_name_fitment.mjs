#!/usr/bin/env node
/**
 * backfill_seating_name_fitment.mjs
 *
 * Extracts model code(s) + year range from Seating product names and writes
 * new rows to catalog_fitment_v2 for products that currently have ZERO
 * fitment data (2,258 of 3,728 Seating products, per audit).
 *
 * Uses fitment_source = 'seating_name_backfill' — deliberately distinct from
 * the legacy 'name_extraction' source (1.55M rows, only 5,441 distinct
 * products, no documented script — predates the current logging convention).
 * Keeping this separate means we never inherit unknown quality assumptions
 * from that old pass, and can audit/roll this batch back independently.
 *
 * Patterns handled:
 *   - Single model code + year range: "FL '08-'23", "XL '04-'22"
 *   - Slash-separated multi-code: "FL/FX '18-'23", "FLH/FLT '97-'07"
 *   - Bare family word + year range: "Dyna '06-'17", "Softail '00-'07"
 *   - Open-ended year: "FLH/FLT '08-UP" (resolves to max known year for
 *     each matched model)
 *   - 2-digit year century rule: 00-26 -> 20XX, 27-99 -> 19XX
 *
 * DOMAIN-CONFIRMED shorthand->family mapping (not a guess — verified with
 * Laken): FL/FLH/FLT always mean Touring ONLY in seat cross-fit convention
 * (a Touring seat cannot fit a Softail frame), FX means Dyna ONLY (not
 * Softail, despite historically sharing the FX prefix), XL means Sportster
 * ONLY. These resolve directly to their single family's full model list —
 * deliberately NOT a prefix-scan across harley_models, since that approach
 * was tried first and incorrectly pulled in Softail codes (FLST, FXST...)
 * that also start with "FL"/"FX" but are a different, incompatible frame.
 *
 * NOT handled (left unmatched, flagged in report, no guessing):
 *   - Danny Gray's compressed abbreviations (e.g. "SEAT BUTTCRK 97-07FLHR")
 *   - Names with no model/year signal at all (correctly universal hardware)
 *
 * catalog_fitment_v2 must NEVER be truncated. This script only INSERTs new
 * rows with ON CONFLICT (product_id, model_year_id) DO NOTHING.
 *
 * Usage:
 *   node scripts/ingest/backfill_seating_name_fitment.mjs            # dry run
 *   node scripts/ingest/backfill_seating_name_fitment.mjs --apply    # live write
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

const FITMENT_SOURCE = 'seating_name_backfill';
const CONFIDENCE_CODE_MATCH = 0.75;      // resolved via explicit, exact model code with year overlap
const CONFIDENCE_FAMILY_MATCH = 0.55;    // resolved via bare family word (Dyna/Softail/Touring/etc.)
const CONFIDENCE_SHORTHAND_FAMILY = 0.70; // resolved via confirmed shorthand->single-family mapping (FL/FX/XL)

// Domain-confirmed: these bare 2-3 letter codes are vendor shorthand for a
// SINGLE specific family in seat cross-fit convention, not the narrow
// historical model that literally owned this exact code in harley_models,
// and NOT a broader prefix match (which would incorrectly pull in Softail
// codes that also start with "FL"/"FX", e.g. FLST, FXST).
//   FL / FLH / FLT -> Touring only (a Touring seat cannot fit a Softail)
//   FX             -> Dyna only (confirmed — not Softail)
//   XL             -> Sportster only
const SHORTHAND_TO_FAMILY = {
  'FL': 'Touring',
  'FLH': 'Touring',
  'FLT': 'Touring',
  'FX': 'Dyna',
  'XL': 'Sportster',
};

// Family words that can appear bare (no model code) in a name, mapped to
// harley_families.name for direct family_id lookup.
const FAMILY_WORDS = ['Dyna', 'Softail', 'Touring', 'Sportster', 'Trike', 'Panhead', 'Shovelhead', 'Knucklehead', 'Flathead', 'FXR'];

function normalizeYear(raw) {
  const n = parseInt(raw, 10);
  if (raw.length === 4) return n;
  // 2-digit century rule: 00-26 -> 20XX, 27-99 -> 19XX
  return n <= 26 ? 2000 + n : 1900 + n;
}

// Matches: <CODE[/CODE...]> <'>YY<'>-<'>YY|UP
// e.g. "FLH/FLT '97-'07", "XL '04-'22", "FL '08-UP", "FLFB/S '18-'25"
// Note: multi-code segments allow 1-6 letters (not 2-6) so single-letter
// trailing codes like the "S" in "FLFB/S" still match — otherwise the
// whole alternation fails and a perfectly parseable name goes unmatched.
const CODE_YEAR_RE = /\b((?:[A-Z]{1,6})(?:\/[A-Z]{1,6})+|[A-Z]{2,6})\s+['’]?(\d{2,4})\s*-\s*['’]?(\d{2,4}|UP)\b/g;

// Matches bare family word + year range: "Dyna '06-'17", "Softail '00-'07"
const FAMILY_YEAR_RE = new RegExp(
  `\\b(${FAMILY_WORDS.join('|')})\\s+['’]?(\\d{2,4})\\s*-\\s*['’]?(\\d{2,4}|UP)\\b`,
  'gi'
);

async function main() {
  const client = await pool.connect();
  try {
    console.log('Loading reference tables...');
    const { rows: aliasRows } = await client.query(`SELECT alias_text, model_family, model_code FROM model_alias_map WHERE is_active = true ORDER BY priority ASC`);
    const { rows: modelRows } = await client.query(`SELECT id, family_id, model_code, name, start_year, end_year FROM harley_models`);
    const { rows: familyRows } = await client.query(`SELECT id, name FROM harley_families`);
    const { rows: yearRows } = await client.query(`SELECT id, model_id, year FROM harley_model_years`);

    const aliasMap = new Map(); // uppercase alias_text -> {model_family, model_code}
    for (const a of aliasRows) {
      const key = a.alias_text.toUpperCase();
      if (!aliasMap.has(key)) aliasMap.set(key, a); // priority ASC already sorted, first wins
    }
    const modelByCode = new Map(); // uppercase model_code -> [model rows] (codes can be reused across eras/families)
    for (const m of modelRows) {
      const key = m.model_code.toUpperCase();
      if (!modelByCode.has(key)) modelByCode.set(key, []);
      modelByCode.get(key).push(m);
    }

    const familyByName = new Map();
    for (const f of familyRows) familyByName.set(f.name.toLowerCase(), f.id);

    const modelsByFamily = new Map(); // family_id -> [model rows]
    for (const m of modelRows) {
      if (!modelsByFamily.has(m.family_id)) modelsByFamily.set(m.family_id, []);
      modelsByFamily.get(m.family_id).push(m);
    }

    const yearsByModel = new Map(); // model_id -> [{id, year}]
    for (const y of yearRows) {
      if (!yearsByModel.has(y.model_id)) yearsByModel.set(y.model_id, []);
      yearsByModel.get(y.model_id).push(y);
    }

    console.log(`Loaded: ${aliasRows.length} aliases, ${modelRows.length} models, ${familyRows.length} families, ${yearRows.length} model-years`);

    const { rows: candidates } = await client.query(`
      SELECT cu.id, cu.brand, cu.name
      FROM catalog_unified cu
      WHERE cu.is_active = true
        AND cu.display_category = 'Seating'
        AND NOT EXISTS (SELECT 1 FROM catalog_fitment_v2 cf WHERE cf.product_id = cu.id)
    `);

    console.log(`Candidate rows (Seating, zero fitment): ${candidates.length}`);

    function resolveCode(code) {
      const upper = code.toUpperCase();
      // Confirmed shorthand tokens route directly to their single specific
      // family — bypasses exact-code lookup entirely, since the exact code
      // (if any) is a narrow historical model, not what the vendor means.
      if (SHORTHAND_TO_FAMILY.hasOwnProperty(upper)) {
        const familyId = familyByName.get(SHORTHAND_TO_FAMILY[upper].toLowerCase());
        if (familyId && modelsByFamily.has(familyId)) {
          return { models: modelsByFamily.get(familyId), isShorthand: true };
        }
      }
      if (modelByCode.has(upper)) return { models: modelByCode.get(upper), isShorthand: false };
      if (aliasMap.has(upper)) {
        const a = aliasMap.get(upper);
        if (a.model_code && modelByCode.has(a.model_code.toUpperCase())) {
          return { models: modelByCode.get(a.model_code.toUpperCase()), isShorthand: false };
        }
        const familyId = familyByName.get(a.model_family.toLowerCase());
        if (familyId && modelsByFamily.has(familyId)) {
          return { models: modelsByFamily.get(familyId), isShorthand: false };
        }
      }
      return null;
    }

    const inserts = [];
    const matchedSample = [];
    const shorthandFamilySample = [];
    const unmatched = [];
    let countExact = 0, countFamily = 0, countShorthand = 0;

    for (const row of candidates) {
      let match = null;
      let matchType = null;

      CODE_YEAR_RE.lastIndex = 0;
      const codeMatch = CODE_YEAR_RE.exec(row.name);
      if (codeMatch) {
        match = codeMatch;
        matchType = 'code';
      } else {
        FAMILY_YEAR_RE.lastIndex = 0;
        const famMatch = FAMILY_YEAR_RE.exec(row.name);
        if (famMatch) {
          match = famMatch;
          matchType = 'family';
        }
      }

      if (!match) {
        unmatched.push(row);
        continue;
      }

      const [fullMatch, codeOrFamily, yStartRaw, yEndRaw] = match;
      const yStart = normalizeYear(yStartRaw);
      const yEnd = yEndRaw.toUpperCase() === 'UP' ? 9999 : normalizeYear(yEndRaw);

      let resolvedModels = [];
      let usedShorthandFamily = false;
      if (matchType === 'code') {
        // SPECIAL CASE, domain-confirmed: the COMBINED token "FL/FX" (either
        // order) means SOFTAIL specifically — Softail is the one platform
        // carrying both FL-prefix (FLST dresser-style) and FX-prefix (FXST
        // cruiser-style) codes under a shared frame/seat-mount. This is NOT
        // the same as splitting FL (Touring alone) + FX (Dyna alone) and
        // unioning them — that produced a false "fits Touring AND Dyna"
        // claim on 161 real products before this fix. Bare individual FL or
        // FX (not combined) still resolve via the normal shorthand map below.
        const normalizedCombo = codeOrFamily.toUpperCase().replace(/\s+/g, '');
        if (normalizedCombo === 'FL/FX' || normalizedCombo === 'FX/FL') {
          const softailId = familyByName.get('softail');
          if (softailId && modelsByFamily.has(softailId)) {
            resolvedModels = modelsByFamily.get(softailId);
            usedShorthandFamily = true;
          }
        } else {
          const codes = codeOrFamily.split('/');
          for (const c of codes) {
            const result = resolveCode(c);
            if (result) {
              resolvedModels.push(...result.models);
              if (result.isShorthand) usedShorthandFamily = true;
            }
          }
        }
      } else {
        const familyId = familyByName.get(codeOrFamily.toLowerCase());
        if (familyId && modelsByFamily.has(familyId)) resolvedModels = modelsByFamily.get(familyId);
      }

      if (resolvedModels.length === 0) {
        unmatched.push({ ...row, reason: `matched "${fullMatch}" but could not resolve "${codeOrFamily}"` });
        continue;
      }

      let confidence;
      if (usedShorthandFamily) confidence = CONFIDENCE_SHORTHAND_FAMILY;
      else if (matchType === 'code') confidence = CONFIDENCE_CODE_MATCH;
      else confidence = CONFIDENCE_FAMILY_MATCH;

      const modelYearIds = new Set();
      for (const model of resolvedModels) {
        const lo = Math.max(yStart, model.start_year);
        const hi = Math.min(yEnd === 9999 ? model.end_year : yEnd, model.end_year);
        const years = yearsByModel.get(model.id) || [];
        for (const y of years) {
          if (y.year >= lo && y.year <= hi) modelYearIds.add(y.id);
        }
      }

      if (modelYearIds.size === 0) {
        unmatched.push({ ...row, reason: `matched "${fullMatch}" but no overlapping model-years found` });
        continue;
      }

      if (modelYearIds.size === 0) {
        unmatched.push({ ...row, reason: `matched "${fullMatch}" but no overlapping model-years found` });
        continue;
      }

      for (const modelYearId of modelYearIds) {
        inserts.push({
          product_id: row.id,
          model_year_id: modelYearId,
          confidence,
          snapshot: fullMatch,
        });
      }
      if (usedShorthandFamily) countShorthand++;
      else if (matchType === 'code') countExact++;
      else countFamily++;

      if (matchedSample.length < 25) {
        matchedSample.push({ brand: row.brand, name: row.name, matched: fullMatch, models: resolvedModels.map(m => m.model_code).join('/'), yearRange: `${yStart}-${yEnd === 9999 ? 'UP' : yEnd}`, modelYears: modelYearIds.size, tier: usedShorthandFamily ? 'SHORTHAND-FAMILY' : matchType.toUpperCase() });
      }
      if (usedShorthandFamily && shorthandFamilySample.length < 25) {
        shorthandFamilySample.push({ brand: row.brand, name: row.name, matched: fullMatch, models: resolvedModels.map(m => m.model_code).join('/'), yearRange: `${yStart}-${yEnd === 9999 ? 'UP' : yEnd}`, modelYears: modelYearIds.size });
      }
    }

    console.log(`\n=== Sample resolved matches (first 25) ===`);
    matchedSample.forEach(s => console.log(`  [${s.tier}] [${s.brand}] "${s.name}"\n    matched="${s.matched}" -> models=${s.models} years=${s.yearRange} (${s.modelYears} model-year rows)`));

    console.log(`\nTotal candidate products: ${candidates.length}`);
    console.log(`Products matched: ${candidates.length - unmatched.length}`);
    console.log(`  - Exact code match (confidence ${CONFIDENCE_CODE_MATCH}): ${countExact}`);
    console.log(`  - Bare family word match (confidence ${CONFIDENCE_FAMILY_MATCH}): ${countFamily}`);
    console.log(`  - Confirmed shorthand->family (FL/FX/XL, confidence ${CONFIDENCE_SHORTHAND_FAMILY}): ${countShorthand}`);
    console.log(`Products unmatched: ${unmatched.length}`);
    console.log(`Total new (product_id, model_year_id) rows to insert: ${inserts.length}`);

    console.log(`\n=== SHORTHAND-FAMILY sample (FL/FX/XL resolution — review, first 25) ===`);
    shorthandFamilySample.forEach(s => console.log(`  [${s.brand}] "${s.name}"\n    matched="${s.matched}" -> models=${s.models} years=${s.yearRange} (${s.modelYears} model-year rows)`));

    console.log(`\n=== Unmatched sample (first 30) ===`);
    unmatched.slice(0, 30).forEach(u => console.log(`  [${u.brand}] ${u.name}${u.reason ? '  (' + u.reason + ')' : ''}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    console.log(`\nApplying ${inserts.length} inserts...`);
    await client.query('BEGIN');
    let done = 0;
    for (const ins of inserts) {
      await client.query(
        `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score, parsed_snapshot)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (product_id, model_year_id) DO NOTHING`,
        [ins.product_id, ins.model_year_id, FITMENT_SOURCE, ins.confidence, ins.snapshot]
      );
      done++;
      if (done % 500 === 0) console.log(`  ${done}/${inserts.length}`);
    }
    await client.query('COMMIT');
    console.log(`Done. ${done} rows inserted (source='${FITMENT_SOURCE}').`);
    console.log('\nNEXT STEPS:');
    console.log('  1. node scripts/ingest/sync_fitment_flat_columns.mjs');
    console.log('  2. node scripts/ingest/index_unified.js --recreate');
    console.log('  3. Spot-check a few resolved products against real bikes before trusting the facet');
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
