#!/usr/bin/env node
/**
 * fix_fuel_air_taxonomy.mjs
 *
 * Carburetion & Fuel — FULL subcategory remap.
 *
 * The live subcategories (Air Cleaners & Filters, Carburetors & Jets, Fuel
 * Injection, Fuel Lines & Pumps, Throttle & Cables, Intake Manifolds, Jets &
 * Needles) don't match the target structure at all — this was discovered from
 * the first dry run, not assumed up front. So this is a full remap of every
 * active row in the category, same scale as the Seating/Exhaust rebuilds, not
 * a blank-fill pass.
 *
 * Target structure (8 subcategories, finalized after two rounds of review):
 *   Turbo Kits | EFI Throttle Bodies | EFI Tuners & Diagnostic Tools |
 *   Carburetors & Components | Air Cleaner & Components | Air Filter |
 *   Throttle & Cables | Fuel Lines & Pumps
 *
 * Decisions locked in this round:
 *   - Throttle & Cables = throttle cables + idle cables specifically
 *     (not a catch-all for every cable-adjacent product).
 *   - Fuel Lines & Pumps kept as its own subcategory.
 *   - Intake Manifolds split: EFI-labeled ones -> EFI Throttle Bodies,
 *     everything else -> Carburetors & Components.
 *
 * Bugs fixed from the first dry run:
 *   - "CV Velocity Stack" was matching the bare CV keyword and landing in
 *     Carburetors & Components before ever reaching the Air Filter rule.
 *     Velocity Stack is now matched standalone, ahead of the Carbs catch-all.
 *   - Plain "___ Air Cleaner Assembly" products (Ultima, Big Dog, Wyatt
 *     Gatling) weren't matching because the old rule required a second
 *     keyword (cover/mount/bracket/etc.) alongside "AIR CLEANER". Loosened —
 *     "AIR CLEANER" appearing at all in this category is an unambiguous signal.
 *
 * Pattern: audit → dry run → sample review → apply → sync → reindex.
 *
 * Usage:
 *   node fix_fuel_air_taxonomy.mjs                  # dry run: audit + classify + sample
 *   node fix_fuel_air_taxonomy.mjs --sample=50      # bigger sample in dry run
 *   node fix_fuel_air_taxonomy.mjs --apply          # writes the classified rows
 *
 * Every row in the category gets a non-blank subcategory — no exceptions.
 * Rows that don't match any keyword rule fall back to the closest equivalent
 * new bucket based on their OLD subcategory (see FALLBACK_BY_OLD_SUBCAT
 * below), rather than being left blank or stuck on a stale old-taxonomy
 * name. Fallback assignments are reported separately from genuine keyword
 * matches so they stay visible as a cross-category cleanup candidate list.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Absolute path, not bare .env.local — avoids the cwd-dependent dotenv bug
// flagged in filter_roadmap.md (sync_fitment_flat_columns.mjs).
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const sampleArg = process.argv.find((a) => a.startsWith('--sample='));
const SAMPLE_SIZE = sampleArg ? parseInt(sampleArg.split('=')[1], 10) : 25;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const CATEGORY = 'Carburetion & Fuel';

// ---------------------------------------------------------------------------
// Classification rules — checked in priority order, first match wins.
// Each test runs against UPPERCASE product name (n) and UPPERCASE brand (b).
// Order matters: more specific/narrow rules run before the Carburetors &
// Components catch-all.
// ---------------------------------------------------------------------------
const RULES = [
  {
    // Tightened after dry run 2: bare "TURBO" was catching air-cleaner style
    // names ("Turbo Air Cleaner," "Turbo Velocity Stack" — a cosmetic cover
    // shape, same family as "teardrop"/"oval"), not real turbo systems.
    subcategory: 'Turbo Kits',
    test: (n, b) => b === 'TORNADO' || /\bTORNADO\b/.test(n) || /\bTURBOCHARG/.test(n) || /\bTURBO KITS?\b/.test(n) || /\bTURBO SYSTEMS?\b/.test(n),
  },
  {
    // Loosened: "throttle body" isn't carb terminology at all in practice —
    // only "intake manifold" is genuinely ambiguous between carb/EFI, so the
    // EFI-keyword gate only applies to that branch. Excludes anything that
    // also says "Carburetor" (signals a carb-conversion part, not a genuine
    // EFI component).
    subcategory: 'EFI Throttle Bodies',
    test: (n) => {
      if (/\bCARBURETORS?\b/.test(n)) return false;
      const isThrottleBody = /\b(THROTTLE BODY|THROTTLE BODIES|THROTTLE BDY)\b/.test(n);
      const isEfiManifold = /\bINTAKE MANIFOLDS?\b/.test(n) && /\b(EFI|FUEL INJECT(ED|ION)?)\b/.test(n);
      return isThrottleBody || isEfiManifold;
    },
  },
  {
    // Dynojet and Cycle Craft removed from unconditional brand-hit (dry run 2
    // found both brands also sell plain carb jetting parts — Thunderslide
    // kits, jet kits — that aren't EFI tools at all). Every genuine EFI
    // Dynojet product already carries one of these keywords, so nothing is
    // lost by dropping the brand-level match.
    subcategory: 'EFI Tuners & Diagnostic Tools',
    test: (n, b) => {
      const brandHit = ['FI2000', 'THUNDERMAX', 'DAYTONA TWIN TEC', 'FUELING'].includes(b);
      const namedProductHit = /\b(POWER COMMANDER|TARGET TUNE|CONTROLLER|FUELPAK|FUEL PAK|AUTO ?TUNE|POWER VISION|POWER TUNER|FI2000|ENGINE MANAGEMENT)\b/.test(n);
      const controlModuleHit = /\bCONTROL MODULES?\b/.test(n) && !(/\bIDLE\b/.test(n) && /\bAIR\b/.test(n));
      // EFI-specific engine-management sensors (O2, crank position, air temp)
      // — diagnostic sensors, not carb parts. Vendor SKUs often reverse the
      // word order ("SENSOR CRANK", "SENSOR AIR TEMP"), so this checks both
      // words are present rather than one fixed phrase.
      const sensorHit = /\bO2 SENSORS?\b|\bOXYGEN SENSORS?\b/.test(n) || (/\bSENSORS?\b/.test(n) && /\bCRANK\b|\bAIR TEMP\b|\bTEMPERATURE\b/.test(n));
      return brandHit || namedProductHit || controlModuleHit || sensorHit;
    },
  },
  {
    // Throttle & Cables = throttle cables + idle cables specifically, per
    // Laken's call — not a general "anything cable" bucket.
    subcategory: 'Throttle & Cables',
    test: (n) => /\bTHROTTLE CABLES?\b/.test(n) || /\bIDLE CABLES?\b/.test(n),
  },
  {
    subcategory: 'Fuel Lines & Pumps',
    test: (n, b) => {
      const brandHit = b === 'PINGEL';
      const keywordHit =
        /\b(FUEL LINES?|FUEL PUMPS?|FUEL PRESSURE REGULATORS?|FUEL INLETS?|FUEL FILTERS?|FUEL INJECTORS?|FUEL RAILS?|PETCOCKS?|TANK SHUT ?OFFS?|ECONO SEALS?|VENT LINES?|GAS LINES?)\b/.test(n) ||
        (/\bFUEL\b/.test(n) && /\bREGULATORS?\b/.test(n)); // catches reordered/abbreviated "REGULATOR FUEL 300KPA"
      return brandHit || keywordHit;
    },
  },
  {
    // "AIR CLEANER" (or its synonym "AIR BOX," or a branded "AIR INTAKE KIT/
    // SYSTEM") appearing anywhere in the name is an unambiguous signal in
    // this category.
    subcategory: 'Air Cleaner & Components',
    test: (n) =>
      /\bAIR CLEANERS?\b/.test(n) ||
      /\bAIR ?CLNRS?\b/.test(n) ||
      /\bAIR BOX(ES)?\b/.test(n) ||
      /\bAIR INTAKES?\b/.test(n) ||
      /\bPASSIVE DOORS?\b/.test(n) ||
      /\bBREATHER BOLTS?\b/.test(n) ||
      /\bEXTERNAL BREATHERS?\b/.test(n) ||
      /\b(BIG|BILLET) SUCKERS?\b/.test(n) ||
      (/\bTEARDROP\b|\bTEAR DROP\b/.test(n) && /\bCOVERS?\b/.test(n)),
  },
  {
    // Loosened after dry run 2: plain "Air Filter Kit"/"Air Filter Element"
    // weren't matching because the old rule required a second confirming
    // keyword. "AIR FILTER" appearing at all is enough signal on its own
    // here. Velocity Stack and Rain Sock matched standalone, ahead of the
    // Carbs catch-all so the bare CV/JET keywords there can't grab them first.
    subcategory: 'Air Filter',
    test: (n, b) => {
      const brandHit = ['K&N', 'K & N', 'UNI'].includes(b);
      const keywordHit = /\bAIR FILTERS?\b/.test(n) || /\bVELOCITY STACKS?\b/.test(n) || /\bRAIN SOCKS?\b/.test(n);
      return brandHit || keywordHit;
    },
  },
  {
    // Catch-all — runs last on purpose. Non-EFI intake manifolds land here
    // per Laken's call. Bare JET(S) (catches EBC A-Bax jet kits and Dynojet/
    // Cycle Craft jet products that lost their brand-level match above),
    // THUNDERSLIDE (Dynojet's classic carb jetting-kit line), THUNDERJET
    // (Ultima's own carburetor line), THRTL POS (abbreviated THROTTLE
    // POSITION), ACCELERATOR PUMP, and a compound MIXTURE+SCREW check
    // (word order varies by vendor SKU). Carb-brand names are also checked
    // against the name text, not just the brand field — some vendors (e.g.
    // EBC) sell "Keihin-style" parts under their own brand.
    //
    // Every countable-noun keyword below allows an optional trailing S —
    // found three separate cases (JET/JETS, BOLT/BOLTS, CLEANER/CLEANERS)
    // where the singular-only phrase silently missed the plural form, since
    // a word boundary doesn't exist between a word and a trailing S. Fixing
    // this class of bug everywhere at once rather than one at a time.
    subcategory: 'Carburetors & Components',
    test: (n, b) => {
      const brandHit = ['MIKUNI', 'KEIHIN', 'LINKERT', 'BENDIX', 'TILLOTSON', 'DEL LORTO', 'DELLORTO'].includes(b);
      const mixtureScrewHit = /\bMIXTURES?\b/.test(n) && /\bSCREWS?\b/.test(n);
      const idleAirHit = /\bIDLE\b/.test(n) && /\bAIR\b/.test(n); // catches "IDLE AIR CONTROL" and reordered SKUs like "MODULE IDLE AIR"
      const keywordHit = new RegExp(
        [
          'MANIFOLDS?', 'FLANGES?', 'CABLE OPERATED', 'INDUCTION KITS?',
          'THROTTLE POSITIONS?', 'THRTL POS', 'MAP SENSORS?', 'BAROMETRIC',
          'CARBURETORS?', '\\bCARBS?\\b', '\\bCV\\b', 'FLOAT BOWLS?', 'REBUILD KITS?',
          'DIAPHRAGMS?', '\\bJETS?\\b', 'THUNDERSLIDE', 'THUNDERJET', 'CRANKCASE BREATHERS?',
          'CHOKE', 'SNOOTS?', 'J-SLOTS?', 'J SLOTS?', 'DEFLECTORS?', 'FLATSIDES?',
          'SUPER [EGBD]\\b', 'SHORTY CARBS?', 'ACCELERATOR PUMPS?', '\\bHSR\\b', 'CHECK BALLS?',
          'KEIHIN', 'LINKERT', 'BENDIX', 'TILLOTSON', 'MIKUNI', 'DEL ?LORTO',
        ].join('|'),
      ).test(n);
      return brandHit || mixtureScrewHit || idleAirHit || keywordHit;
    },
  },
];

// Brands from the list that are deliberately NOT wired to a bare-brand match,
// because they're multi-category brands elsewhere in the catalog:
//   S&S, VANCE & HINES, PERFORMANCE MACHINE, CYCLE PRO, YOST, EBC, ULTIMA, TRASK
// EBC is a confirmed BRAKE brand elsewhere in this catalog (ebc_brake_fitment).
// TRASK is a known turbo-kit brand in the real world but wasn't in the Turbo
// Kits line of the spec — flagging rather than assuming it belongs there.
// These get surfaced in the "flagged brand, no keyword match" diagnostic below
// rather than silently classified or silently dropped.
const FLAGGED_BRANDS = ['S&S', 'VANCE & HINES', 'PERFORMANCE MACHINE', 'CYCLE PRO', 'YOST', 'EBC', 'ULTIMA', 'TRASK'];

// Safety net: nothing in this category should come out of this script still
// blank or sitting on a stale old-taxonomy name. For rows no keyword rule
// catches, fall back to the closest equivalent new bucket based on the row's
// OLD subcategory (inherits whatever weak signal the original sort already
// had) rather than defaulting everything to one bucket. Rows with no old
// subcategory at all (originally blank) fall back to Carburetors &
// Components, the largest/most general bucket.
// These fallback assignments are tracked and reported separately — this is
// NOT the same as a real keyword match, and is the cross-category cleanup
// candidate list for a follow-up pass (oil dipsticks, gas caps, ignition
// parts, etc. that don't actually belong in Carburetion & Fuel at all).
const FALLBACK_BY_OLD_SUBCAT = {
  'Air Cleaners & Filters': 'Air Cleaner & Components',
  'Carburetors & Jets': 'Carburetors & Components',
  'Fuel Injection': 'EFI Tuners & Diagnostic Tools',
  'Fuel Lines & Pumps': 'Fuel Lines & Pumps',
  'Throttle & Cables': 'Throttle & Cables',
  'Intake Manifolds': 'Carburetors & Components',
  'Jets & Needles': 'Carburetors & Components',
};
const DEFAULT_FALLBACK = 'Carburetors & Components';

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

    // FULL remap: every active row in the category, not just blanks — the
    // live subcategory names don't match the target structure at all.
    const candidates = await client.query(
      `SELECT id, name, brand, COALESCE(display_subcategory, '') AS display_subcategory
       FROM catalog_unified
       WHERE display_category = $1 AND is_active = true`,
      [CATEGORY],
    );
    console.log(`\nTotal active rows in category: ${candidates.rows.length}`);

    const byRule = {};
    const fallbackAssigned = [];
    const flaggedBrandFallback = [];
    const oldToNewCounts = {}; // old_subcat -> { new_subcat -> count }

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

    console.log(`\n=== FALLBACK-ASSIGNED (no keyword match — defaulted from old subcategory, not a real match): ${fallbackAssigned.length} ===`);
    console.log('This is the cross-category cleanup candidate list — these products likely don\'t belong in Carburetion & Fuel at all (oil dipsticks, gas caps, ignition parts, etc.) and were force-assigned only so nothing is left blank.');
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
    console.log('Next: sync fitment flat columns if any of these also need fitment work,');
    console.log('then reindex Typesense: node scripts/ingest/index_unified.js');
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
