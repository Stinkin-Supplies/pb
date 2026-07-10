#!/usr/bin/env node
/**
 * fix_engine_taxonomy.mjs
 *
 * Engine — subcategory classification pass, v2.
 *
 * Target structure (10 subcategories, revised after the first dry run):
 *   Complete Engines | Performance Kits | Pistons & Cylinders |
 *   Heads & Valves | Bottom End | Camchest | Oil Pumps |
 *   Engine Mounts & Hardware | Engine Accessories | Engine Parts
 *
 * The original spec (7 subcategories) implied collapsing Pistons & Cylinders,
 * Heads & Valves, and Bottom End into one generic "Engine Parts" bucket. The
 * first dry run showed that would make Engine Parts an 8,300+ row bucket —
 * bigger than the entire Fuel/Air category was before its rebuild — so those
 * three are kept as their own subcategories instead (Laken's call, after
 * asking for a recommendation).
 *
 * Gaskets & Seals (3,030 rows, old subcategory) is EXCLUDED from this pass
 * entirely — that's slated to become its own top-level display_category in a
 * future rebuild, not something to reclassify into an Engine subcategory
 * right now. Those rows are left completely untouched (not fallback-assigned,
 * not reclassified) and reported separately so they stay visible.
 *
 * Bugs fixed from the first dry run (before it was ever applied):
 *   - Bare "CAM" was matching "Twin Cam" constantly — that's an engine
 *     PLATFORM NAME (like Panhead/Shovelhead), not a description of the
 *     product, so it misfired on any part that just happens to fit or
 *     exclude Twin Cam engines. "Twin Cam" is stripped out of the name
 *     before checking for a genuine bare "cam" mention.
 *   - "Motor Mount" wasn't covered — only "Engine Mount" was. The current
 *     old subcategory is literally named "Motor Mounts," so this was a
 *     guaranteed miss.
 *   - Bare \bCAMS?\b doesn't match "CAMSHAFT" (no word boundary between the
 *     M and the S — same class of bug as JET/JETS in the Fuel/Air rebuild).
 *     Added CAMSHAFT(S) as its own explicit keyword.
 *
 * Every countable-noun keyword allows an optional trailing S from the start,
 * same lesson carried over from Fuel/Air.
 *
 * Pattern: audit → dry run → sample review → apply → sync → reindex.
 *
 * Usage:
 *   node fix_engine_taxonomy.mjs                  # dry run: audit + classify + sample
 *   node fix_engine_taxonomy.mjs --sample=50      # bigger sample in dry run
 *   node fix_engine_taxonomy.mjs --apply          # writes the classified rows
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

const CATEGORY = 'Engine';
const EXCLUDED_OLD_SUBCAT = 'Gaskets & Seals'; // slated for its own category — left untouched here

// ---------------------------------------------------------------------------
// Classification rules — checked in priority order, first match wins.
// Each test runs against UPPERCASE product name (n) and UPPERCASE brand (b).
// Order matters:
//   1. Complete Engines runs first — a complete-engine listing may mention
//      words that would otherwise trip a more specific rule downstream.
//   2. Oil Pumps / Engine Mounts & Hardware run early — narrow, unambiguous
//      phrases, no reason to risk a broader rule grabbing them first.
//   3. Engine Accessories (bare COVER) runs BEFORE Camchest, Heads & Valves,
//      Bottom End, and Pistons & Cylinders on purpose — "Cam Cover," "Valve
//      Covers," "Cylinder Head Cover" all contain a keyword from one of
//      those subcategories as well as COVER, and per the spec these are all
//      Accessories items, not Camchest/Heads/Parts.
//   4. Camchest excludes CAM PLATE(S) (a Parts item) and strips "TWIN CAM"
//      before checking for a genuine bare "cam" mention (see header notes).
//   5. Heads & Valves runs before Pistons & Cylinders so "Cylinder Head"
//      claims itself before the bare CYLINDER catch in Pistons & Cylinders
//      can grab it.
//   6. Engine Parts is the genuine catch-all — runs last, kept intentionally
//      small (just SHIM(S) plus the brand/keyword fallback net below).
// ---------------------------------------------------------------------------
const RULES = [
  {
    // Generic hardware fastener whose HEAD is a drive shape (hex/allen/
    // socket/square), not a cylinder head. The old "Heads & Valves" bucket
    // has this exact ambiguity baked in — dozens of plain hardware bolts
    // sitting there purely because the word "head" appears. Runs early so
    // these never reach the Heads & Valves rule or inherit that mistake via
    // fallback.
    subcategory: 'Engine Parts',
    test: (n) => /\b(HEXAGON|HEX|ALLEN|SOCKET|SQUARE) HEAD (BOLTS?|SCREWS?)\b/.test(n),
  },
  {
    subcategory: 'Complete Engines',
    test: (n) => {
      const assemblyLanguage = /\b(LONG BLOCK|SHORT BLOCK|COMPLETE ENGINES?|CRATE ENGINES?|ENGINE ASSEMBLY|COMPLETE MOTORS?)\b/.test(n);
      const eraPlusEngine =
        /\b(PANHEAD|SHOVELHEAD|FLATHEAD|KNUCKLEHEAD|IRONHEAD|TWIN CAM|MILWAUKEE[- ]?EIGHT|M8)\b/.test(n) &&
        /\b(ENGINE|MOTOR)\b/.test(n);
      return assemblyLanguage || eraPlusEngine;
    },
  },
  {
    subcategory: 'Performance Kits',
    test: (n) => {
      const namedKitHit = /\b(BIG BORE KITS?|POWER PACKAGES?|HOT SETUP|HOOLIGAN|MONSTER BIG BORE|BOLT-ON BIG BORE|STROKER FLYWHEELS?|SIDEWINDER|HIGH COMPRESSION|BLACK EDITION|HYPEREUTECTIC|FORGED)\b/.test(n);
      const conversionKitHit = /\bCONVERSION\b/.test(n) && /\bKITS?\b/.test(n);
      return namedKitHit || conversionKitHit;
    },
  },
  {
    subcategory: 'Oil Pumps',
    test: (n) => /\b(OIL PUMPS?|OIL LINES?|SUMP PUMPS?|OIL SCREENS?|DRAIN PLUGS?|BREATHER GEARS?)\b/.test(n),
  },
  {
    subcategory: 'Engine Mounts & Hardware',
    test: (n) => /\b(ENGINE MOUNTS?|MOTOR MOUNTS?|RADIATOR GUARDS?|ISO ?ISOLATOR MOUNTS?|ISOLATOR MOUNTS?|STABILIZERS?|ADAPTER PLATES?)\b/.test(n),
  },
  {
    subcategory: 'Engine Accessories',
    test: (n) =>
      /\bCOVERS?\b/.test(n) ||
      /\bTUBE KEEPERS?\b/.test(n) ||
      /\bPUSH ?ROD TUBE\b/.test(n) ||
      /\bTIMING POINTS?\b/.test(n),
  },
  {
    subcategory: 'Camchest',
    test: (n, b) => {
      if (b === 'ANDREWS') return true;
      if (/\bENGINE CASES?\b/.test(n)) return true;
      if (/\bCAMSHAFTS?\b/.test(n)) return true;
      if (/\bCAM PLATES?\b/.test(n)) return false;
      // "Twin Cam" is a platform name (like Panhead/Shovelhead), not a
      // description of the product — strip it before checking for a
      // genuine bare "cam" mention, or every part that merely fits/excludes
      // Twin Cam engines would false-positive here.
      const nSansTwinCam = n.replace(/\bTWIN CAM\b/g, '');
      if (/\bCAMS?\b/.test(nSansTwinCam)) return true;
      if (/\bGEARS?\b/.test(n) && /\b(TIMING|PINION|IDLER)\b/.test(n) && !/\bPINION SHAFTS?\b/.test(n)) return true;
      if (/\bCHAINS?\b/.test(n) || /\bTENSIONERS?\b/.test(n)) return true;
      if (/\bLIFTERS?\b/.test(n) || /\bTAPPETS?\b/.test(n) || /\bPUSH ?RODS?\b/.test(n)) return true;
      return false;
    },
  },
  {
    subcategory: 'Heads & Valves',
    test: (n, b) => {
      const brandHit = ['KIBBLEWHITE', 'KPMI'].includes(b);
      const keywordHit = /\bCYLINDER HEADS?\b|\bVALVE GUIDES?\b|\bVALVE SPRINGS?\b|\bVALVES?\b|\bROCKERS?\b|\bROCKER ARMS?\b|\bBEEHIVE\b/.test(n);
      return brandHit || keywordHit;
    },
  },
  {
    subcategory: 'Pistons & Cylinders',
    test: (n, b) => {
      const brandHit = ['WISECO', 'JE PISTONS', 'HASTINGS', 'KB PERFORMANCE', 'KEITH BLACK'].includes(b);
      // A caliper's internal pistons are a brake part, not an engine part —
      // "4 Piston Caliper" would otherwise false-positive here.
      if (/\bCALIPER\b|\bBRAKE\b/.test(n)) return brandHit;
      const keywordHit = /\bPISTONS?\b|\bCYLINDERS?\b|\bPISTON RINGS?\b|\bWRIST PINS?\b|\bPISTON PINS?\b/.test(n);
      return brandHit || keywordHit;
    },
  },
  {
    subcategory: 'Bottom End',
    test: (n) =>
      /\bCRANKCASES?\b|\bFLYWHEELS?\b|\bCRANKSHAFTS?\b|\bCONNECTING RODS?\b|\bCRANK ?PINS?\b|\bPINION SHAFTS?\b|\bINNER RACES?\b|\bMOTOR SPROCKET NUTS?\b|\bROLLERS?\b|\bTHRUST BEARINGS?\b|\bWOODRUFF KEYS?\b|\bBEARINGS?\b/.test(n),
  },
  {
    // Catch-all — runs last on purpose, kept deliberately small.
    subcategory: 'Engine Parts',
    test: (n) => /\bSHIMS?\b/.test(n),
  },
];

// Brands from the spec deliberately NOT wired to a bare-brand match — either
// known multi-category brands from the Fuel/Air rebuild, or brands that span
// multiple Engine subcategories internally (JIMS alone showed up in the first
// dry run's fallback list for Bottom End, Camchest, AND Oil Pumps items —
// brand alone doesn't say which).
const FLAGGED_BRANDS = [
  'S&S', 'REVOLUTION PERFORMANCE', 'JIMS', 'EASTERN', 'FUELING', 'VANCE & HINES',
  'CUSTOM CYCLE', 'DRAG SPECIALTIES', 'PAUGHCO', 'ROUGH CRAFTS', 'ARLEN NESS',
  'PERFORMANCE MACHINE', 'ROLAND SANDS', 'TRASK', 'COVINGTONS', 'ALLOY ART',
  'PRO 1 PERFORMANCE', 'AVON', 'COLONY', 'DYNOJET', 'THRASHIN', 'JOKER MACHINE', 'SLYFOX',
];

// Fallback net — informed by the real old-subcategory names from the first
// audit (unlike Fuel/Air, this didn't have to wait for a round of dry-run
// output to be populated). Gaskets & Seals is deliberately absent — those
// rows are excluded from this pass entirely, not fallback-assigned.
const FALLBACK_BY_OLD_SUBCAT = {
  'Pistons & Cylinders': 'Pistons & Cylinders',
  'Heads & Valves': 'Heads & Valves',
  'Bottom End': 'Bottom End',
  'Cams & Valvetrain': 'Camchest',
  'Engine Covers': 'Engine Accessories',
  'Oil Pumps & Lubrication': 'Oil Pumps',
  'Motor Mounts': 'Engine Mounts & Hardware',
  'Complete Engines': 'Complete Engines',
  'Performance Kits': 'Performance Kits',
};
const DEFAULT_FALLBACK = 'Engine Parts';

function classify(name, brand) {
  const n = (name || '').toUpperCase();
  const b = (brand || '').toUpperCase();
  for (const rule of RULES) {
    if (rule.test(n, b)) return rule.subcategory;
  }
  return null;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n=== AUDIT: ${CATEGORY} — current display_subcategory distribution ===`);
    const audit = await client.query(
      `SELECT COALESCE(display_subcategory, '(blank)') AS subcat, COUNT(*)
       FROM catalog_unified
       WHERE display_category = $1 AND is_active = true
       GROUP BY 1 ORDER BY 2 DESC`,
      [CATEGORY],
    );
    console.table(audit.rows);

    const excludedCount = await client.query(
      `SELECT COUNT(*) FROM catalog_unified WHERE display_category = $1 AND is_active = true AND display_subcategory = $2`,
      [CATEGORY, EXCLUDED_OLD_SUBCAT],
    );
    console.log(`\nExcluded from this pass (old subcategory = '${EXCLUDED_OLD_SUBCAT}', left untouched — slated for its own category): ${excludedCount.rows[0].count}`);

    const candidates = await client.query(
      `SELECT id, name, brand, COALESCE(display_subcategory, '') AS display_subcategory
       FROM catalog_unified
       WHERE display_category = $1 AND is_active = true
         AND (display_subcategory IS DISTINCT FROM $2)`,
      [CATEGORY, EXCLUDED_OLD_SUBCAT],
    );
    console.log(`Total active rows being classified in this pass: ${candidates.rows.length}`);

    const byRule = {};
    const fallbackAssigned = [];
    const flaggedBrandFallback = [];
    const oldToNewCounts = {};

    for (const row of candidates.rows) {
      const oldSub = row.display_subcategory || '(blank)';
      let result = classify(row.name, row.brand);
      let isFallback = false;
      if (!result) {
        result = FALLBACK_BY_OLD_SUBCAT[oldSub] || DEFAULT_FALLBACK;
        isFallback = true;
      }
      (byRule[result] = byRule[result] || []).push(row);
      oldToNewCounts[oldSub] = oldToNewCounts[oldSub] || {};
      oldToNewCounts[oldSub][result] = (oldToNewCounts[oldSub][result] || 0) + 1;
      if (isFallback) {
        fallbackAssigned.push({ ...row, fallbackSubcat: result });
        if (FLAGGED_BRANDS.includes((row.brand || '').toUpperCase())) {
          flaggedBrandFallback.push({ ...row, fallbackSubcat: result });
        }
      }
    }

    console.log('\n=== OLD → NEW SUBCATEGORY MAPPING (row counts) ===');
    const mappingRows = [];
    for (const [oldSub, newCounts] of Object.entries(oldToNewCounts)) {
      for (const [newSub, count] of Object.entries(newCounts)) {
        mappingRows.push({ old: oldSub, new: newSub, count });
      }
    }
    console.table(mappingRows);

    console.log('\n=== CLASSIFICATION RESULTS (dry run) ===');
    for (const [subcat, rows] of Object.entries(byRule)) {
      console.log(`\n${subcat}: ${rows.length} matched`);
      console.table(rows.slice(0, SAMPLE_SIZE).map((r) => ({ id: r.id, name: r.name, brand: r.brand, old: r.display_subcategory || '(blank)' })));
    }

    console.log(`\n=== FALLBACK-ASSIGNED (no keyword match — defaulted, not a real match): ${fallbackAssigned.length} ===`);
    console.log('These didn\'t match any rule and were force-assigned so nothing is left blank. Review before applying — this is where a missing keyword or an unwired brand shows up.');
    console.table(fallbackAssigned.slice(0, SAMPLE_SIZE).map((r) => ({ id: r.id, name: r.name, brand: r.brand, old: r.display_subcategory || '(blank)', fallback_new: r.fallbackSubcat })));

    console.log(`\n⚠️  Fallback-assigned rows carrying a FLAGGED brand (${FLAGGED_BRANDS.join(', ')}): ${flaggedBrandFallback.length}`);
    console.table(flaggedBrandFallback.slice(0, SAMPLE_SIZE).map((r) => ({ id: r.id, name: r.name, brand: r.brand, old: r.display_subcategory || '(blank)', fallback_new: r.fallbackSubcat })));

    if (!APPLY) {
      console.log('\nDry run only — no rows written. Re-run with --apply once the samples above look right.');
      return;
    }

    console.log('\n=== APPLYING ===');
    await client.query('BEGIN');
    let totalUpdated = 0;
    for (const [subcat, rows] of Object.entries(byRule)) {
      const ids = rows.map((r) => r.id);
      const res = await client.query(
        `UPDATE catalog_unified SET display_subcategory = $1 WHERE id = ANY($2::int[])`,
        [subcat, ids],
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
