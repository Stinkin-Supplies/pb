// fix_dashes_gauges_taxonomy.mjs
// Dashes & Gauges category rebuild — classification script.
// Follows standing method: audit (done, audit_dashes_gauges_scope.mjs) -> dry-run
// (this script, default mode) -> sample review -> apply (--apply flag) -> sync -> reindex.
//
// DEFAULT MODE = DRY RUN. No writes happen unless --apply is passed.
//
// Sources being migrated into Dashes & Gauges (new top-level display_category):
//   1. Instrumentation           (1,026 rows -> effectively renamed/rebuilt)
//   2. Fenders & Body            (2 rows: DASH INSERT SINGLE/TRI GROOVE BLACK)
//   3. Accessories & Misc        (~252 rows: Dash/Housing/Knobs/Decal/Sensors/Tach)
//   4. Handlebar & Controls      (~111 rows: Housing/Knobs/Sensors/Gauge Mounts/
//                                  Indicator Lights/Decal) — Laken's call: pull ALL matches
//
// "Chaps" DROPPED from spec — audit confirmed all 7 matches are Riding Gear & Apparel
// (MAVERICK CHAPS BLACK/2X/3X/4X/LG/MD/SM/XL), unrelated to this category.
//
// Subcategories (Laken's spec, keyword bucket -> subcategory name):
//   Dash & Panel        <- Dash, Dash Inserts, Dash Panel, Dash Assembly, Divider, Fuel Door
//   Decals & Trim       <- Decal
//   Housings            <- Housing
//   Speedometers        <- Speedometer, Gauge Sets, Speedometer Drives, Tin Faces
//   Gauges              <- Tachometer, Oil Pressure Gauges, general Gauge
//   Gauge Hardware      <- Bezel, Knobs, Sensors, Gauge Mounts, Gauge Accents,
//                          Indicator Lights, Gauge Accessories
//   Instrument Hardware <- catch-all per Laken's call for the 16 previously-unmatched
//                          rows: hour meters, multifunction meters, instrument harness,
//                          gauge trim kit, speedo-hole cover plate. Also catches any
//                          new rows matching these patterns going forward.
//
// Run:
//   node fix_dashes_gauges_taxonomy.mjs                 (dry run, default)
//   node fix_dashes_gauges_taxonomy.mjs --apply          (live writes)
//   node fix_dashes_gauges_taxonomy.mjs --apply --sample=50   (dry run, bigger sample)

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

const db = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const sampleArg = args.find((a) => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : 20;

const NEW_CATEGORY = 'Dashes & Gauges';

// Order matters — first match wins. More specific patterns first.
// Postgres regex: use \y not \b for word boundaries.
// BUG FIX (post dry-run round 1): these patterns are matched in JAVASCRIPT against
// strings already pulled from Postgres — JS regex word boundary is \b, NOT \y.
// \y is Postgres-only syntax (used correctly in the audit script's SQL queries,
// but wrong here). Every \y rule below was silently matching almost nothing,
// which is why round-1 coverage was 33.5%. All boundaries fixed to \b.
const RULES = [
  // --- Instrument Hardware (catch-all, Laken's call for the 16 unmatched rows) ---
  { subcategory: 'Instrument Hardware', pattern: /HOUR\s+METER/i },
  { subcategory: 'Instrument Hardware', pattern: /MULTIFUNCTION\s+METER/i },
  { subcategory: 'Instrument Hardware', pattern: /INSTRUMENT\s+(HARNESS|PANEL)/i },
  { subcategory: 'Instrument Hardware', pattern: /GAUGE\s+TRIM\s+KIT/i },
  { subcategory: 'Instrument Hardware', pattern: /SPEEDO\s+HOLE\s+COVER/i },
  { subcategory: 'Instrument Hardware', pattern: /GEAR\s+INDICATOR/i },
  { subcategory: 'Instrument Hardware', pattern: /INFRARED\s+TE?PMERATURE\s+METER/i }, // matches vendor typo "TEPMERATURE" verbatim
  { subcategory: 'Instrument Hardware', pattern: /PROGRAMMABLE\s+GAUGE/i },
  { subcategory: 'Instrument Hardware', pattern: /HOUR\s+METER\s+AND\s+TACHOMETER/i },
  { subcategory: 'Instrument Hardware', pattern: /GAUGE\s+RELOCATION\s+KIT/i }, // new: round-1 unmatched
  { subcategory: 'Instrument Hardware', pattern: /SENDING\s+UNIT/i }, // new: round-2 unmatched (oil temp / cable-drive sending units)
  { subcategory: 'Gauges', pattern: /LED\s+.*GAUGE/i }, // new: round-2 unmatched ("4 PIECE RED LED GAUGES", "Fairing Mounted LED Backlit PSI Gauges")
  { subcategory: 'Gauges', pattern: /TACHOMETR?\s+ADPTR?/i }, // new: round-2 unmatched, vendor typo "TACHOMETR ADPTR"
  { subcategory: 'Speedometers', pattern: /MOUNT\s+SPEEDO/i }, // new: round-2 unmatched, vendor abbreviation "MOUNT SPEEDO/..."

  // --- Dash & Panel ---
  { subcategory: 'Dash & Panel', pattern: /DASH\s+INSERT/i },
  { subcategory: 'Dash & Panel', pattern: /DASH\s+PANEL/i },
  { subcategory: 'Dash & Panel', pattern: /DASH\s+ASSEMBL/i },
  { subcategory: 'Dash & Panel', pattern: /DASH\s+COVER/i }, // new: round-1 unmatched ("Dash Cover", "Tear Drop Upper Dash Cover")
  { subcategory: 'Dash & Panel', pattern: /\bDASH\b/i },
  { subcategory: 'Dash & Panel', pattern: /\bDIVIDER\b/i },
  { subcategory: 'Dash & Panel', pattern: /FUEL\s+(DOOR|TANK\s+CONSOLE\s+DOOR)/i }, // Laken's call: Fuel Door stays with Dashes & Gauges, not Tanks & Body — round-2 added "Fuel Tank Console Door" wording

  // --- Decals & Trim ---
  { subcategory: 'Decals & Trim', pattern: /\bDECAL\b/i },

  // --- Housings ---
  { subcategory: 'Housings', pattern: /\bHOUSING\b/i },

  // --- Speedometers ---
  { subcategory: 'Speedometers', pattern: /SPEEDOMETER\s+DRIVE/i },
  { subcategory: 'Speedometers', pattern: /SPEEDOMETER\s+SENSOR/i }, // new: round-1 unmatched
  { subcategory: 'Speedometers', pattern: /\bSPEEDOMETER\b/i },
  { subcategory: 'Speedometers', pattern: /GAUGE\s+SET/i },
  { subcategory: 'Speedometers', pattern: /TIN\s+FACE/i },
  { subcategory: 'Speedometers', pattern: /GAUGE\s+BRACKET/i }, // new: round-1 unmatched ("Single Gauge Bracket")

  // --- Gauges (tach, oil pressure, general) ---
  { subcategory: 'Gauges', pattern: /TACHOMETER/i },
  { subcategory: 'Gauges', pattern: /\bTACH\b/i },
  { subcategory: 'Gauges', pattern: /OIL\s+PRESSURE\s+GAUGE/i },
  { subcategory: 'Gauges', pattern: /COOLANT\s+SENSOR/i }, // new: round-1 unmatched
  { subcategory: 'Gauges', pattern: /INSTRUMENT\s+KIT/i }, // new: round-1 unmatched ("6-Gauge Instrument Kit")
  { subcategory: 'Gauges', pattern: /\bGAUGE\b/i }, // broad fallback within this category only

  // --- Gauge Hardware (mounts, bezels, knobs, sensors, accents, indicator lights) ---
  { subcategory: 'Gauge Hardware', pattern: /GAUGE\s+MOUNT/i },
  { subcategory: 'Gauge Hardware', pattern: /GAUGE\s+ACCENT/i },
  { subcategory: 'Gauge Hardware', pattern: /GAUGE\s+ACCESSOR/i },
  { subcategory: 'Gauge Hardware', pattern: /INDICATOR\s+LIGHT|LIGHT\s+INDICATOR/i }, // word-order fix: round-3 unmatched "LIGHT INDICATOR RSD XL BK"
  { subcategory: 'Gauge Hardware', pattern: /\bBEZEL\b/i },
  { subcategory: 'Gauge Hardware', pattern: /\bKNOB\b/i },
  { subcategory: 'Gauge Hardware', pattern: /\bSENSOR\b/i },
];

function classify(name) {
  // Explicit exclusion: Regulator Mount belongs with electrical/regulator hardware,
  // not Dashes & Gauges — even though it currently sits in Instrumentation.
  // Laken's call: regulator mounts follow the regulators, stay unmatched here.
  if (/REGULATOR\s+MOUNT/i.test(name)) return null;

  for (const rule of RULES) {
    if (rule.pattern.test(name)) return rule.subcategory;
  }
  return null;
}

// Source queries — each returns candidate rows from a specific source category.
// Handlebar & Controls: Laken's call = pull ALL keyword matches, not just a subset.
const SOURCE_QUERIES = [
  {
    label: 'Instrumentation (full rebuild)',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Instrumentation'
            AND is_active = true`,
  },
  {
    label: 'Fenders & Body (dash insert stragglers)',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Fenders & Body'
            AND is_active = true
            AND (name ILIKE '%DASH INSERT%' OR name ILIKE '%DASH%' OR name ILIKE '%FUEL DOOR%')`,
  },
  {
    label: 'Accessories & Misc (keyword matches)',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Accessories & Misc'
            AND is_active = true
            AND (
              name ILIKE '%DASH%' OR name ILIKE '%DECAL%' OR name ILIKE '%DIVIDER%'
              OR name ILIKE '%HOUSING%' OR name ILIKE '%SENSOR%' OR name ILIKE '%KNOB%'
              OR name ILIKE '%TACHOMETER%' OR name ILIKE '%TACH%'
            )`,
  },
  {
    label: 'Handlebar & Controls (ALL keyword matches, per Laken)',
    sql: `SELECT id, source_vendor, name, display_subcategory
          FROM catalog_unified
          WHERE display_category = 'Handlebar & Controls'
            AND is_active = true
            AND (
              name ILIKE '%DECAL%' OR name ILIKE '%HOUSING%' OR name ILIKE '%SENSOR%'
              OR name ILIKE '%KNOB%' OR name ILIKE '%GAUGE MOUNT%' OR name ILIKE '%INDICATOR LIGHT%'
            )`,
  },
];

async function main() {
  console.log(`=== DASHES & GAUGES — CLASSIFIER (${APPLY ? 'LIVE APPLY' : 'DRY RUN'}) ===`);
  console.log(new Date().toISOString());
  console.log('');

  const results = {}; // subcategory -> rows[]
  const unmatched = [];
  let totalCandidates = 0;

  for (const source of SOURCE_QUERIES) {
    const res = await db.query(source.sql);
    console.log(`--- Source: ${source.label} — ${res.rows.length} candidates ---`);
    totalCandidates += res.rows.length;

    for (const row of res.rows) {
      const subcat = classify(row.name);
      if (subcat) {
        results[subcat] = results[subcat] || [];
        results[subcat].push({ ...row, source: source.label });
      } else {
        unmatched.push({ ...row, source: source.label });
      }
    }
  }

  console.log('');
  console.log('--- Classification summary ---');
  let totalClassified = 0;
  for (const [subcat, rows] of Object.entries(results)) {
    console.log(`  ${subcat}: ${rows.length}`);
    totalClassified += rows.length;
  }
  console.log(`  UNMATCHED: ${unmatched.length}`);
  console.log(`  Total candidates: ${totalCandidates} | Classified: ${totalClassified} | Unmatched: ${unmatched.length}`);
  console.log(`  Coverage: ${((totalClassified / totalCandidates) * 100).toFixed(1)}%`);
  console.log('');

  // Sample output per subcategory for review
  console.log(`--- Sample rows per subcategory (first ${SAMPLE_SIZE}) ---`);
  for (const [subcat, rows] of Object.entries(results)) {
    console.log(`\n  [${subcat}] (${rows.length} total)`);
    rows.slice(0, SAMPLE_SIZE).forEach((r) => {
      console.log(`    ${r.source_vendor} | ${r.name} | was: ${r.display_subcategory ?? 'NULL'} (${r.source})`);
    });
  }

  if (unmatched.length > 0) {
    console.log(`\n  [UNMATCHED] (${unmatched.length} total, first ${SAMPLE_SIZE})`);
    unmatched.slice(0, SAMPLE_SIZE).forEach((r) => {
      console.log(`    ${r.source_vendor} | ${r.name} | was: ${r.display_subcategory ?? 'NULL'} (${r.source})`);
    });
  }

  console.log('');

  if (!APPLY) {
    console.log('=== DRY RUN COMPLETE — no writes performed. Review samples above, then re-run with --apply. ===');
    return;
  }

  // --- APPLY ---
  console.log('=== APPLYING CHANGES ===');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let updatedCount = 0;
    for (const [subcat, rows] of Object.entries(results)) {
      const ids = rows.map((r) => r.id);
      const res = await client.query(
        `UPDATE catalog_unified
         SET display_category = $1, display_subcategory = $2
         WHERE id = ANY($3::int[])`,
        [NEW_CATEGORY, subcat, ids]
      );
      console.log(`  Updated ${res.rowCount} rows -> ${NEW_CATEGORY} / ${subcat}`);
      updatedCount += res.rowCount;
    }
    await client.query('COMMIT');
    console.log(`\n=== APPLY COMPLETE — ${updatedCount} rows updated. Unmatched (${unmatched.length}) left untouched. ===`);
    console.log('Next: re-sync / reindex Typesense per standing pipeline.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('APPLY FAILED, rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => db.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('SCRIPT FAILED:', err);
    return db.end().finally(() => process.exit(1));
  });
