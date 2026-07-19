#!/usr/bin/env node
/**
 * fix_electrical_taxonomy.mjs
 *
 * Electrical — subcategory classification pass, v1.
 *
 * Target structure (12 subcategories + 1 fallback catch-all — Audio &
 * Communication was added after the first dry run, see below):
 *   Spark Plug | Ignition Coils | Starter Motors, Solenoids & Accessories |
 *   Relays | Charging System & Components | Batteries, Cables & Accessories |
 *   Horns | Ignition Switches & Accessories | Points, Distributors &
 *   Accessories | Sensors & Switches | Wiring & Components | Audio &
 *   Communication | Electrical Parts (fallback catch-all, not in the
 *   original spec)
 *
 * v2 — fixed after the first dry run:
 *   - CRITICAL: bare "SWITCH" never matched at all. The regex was written
 *     as SWITCHES? (SWITCH + E + optional S), which requires a literal "E"
 *     right after SWITCH — matching only "switches," never bare singular
 *     "switch." Since "switch" pluralizes with "-es" not just "-s", the ES
 *     needs to be grouped as one optional unit: SWITCH(ES)?. This silently
 *     dropped a huge fraction of the old 566-row "Switches & Controls"
 *     bucket into the fallback.
 *   - "Stator" (the alternator's coil component, sold separately) isn't
 *     covered by "alternator" as a keyword — added as its own term.
 *   - "Breaker Plate" (ignition points mounting plate) is classic
 *     points/distributor terminology that doesn't say "points" or
 *     "distributor" literally — added to that subcategory.
 *   - Added Audio & Communication (Bluetooth headsets, intercoms, speakers,
 *     amplifiers) — the old bucket had zero keyword coverage, same pattern
 *     as Engine's Oil System / Transmission's Kickstarters gaps.
 *
 * Design notes / assumptions (flag if wrong):
 *   - "Universal Horn, Horn Cover, Horn Mounting Bracket" appear at the tail
 *     of the Batteries section in the spec, right before the dedicated
 *     Horns section — reads like a copy-paste spillover. Routed to Horns
 *     (bare "horn" catches them) rather than Batteries.
 *   - "Switch" is the hardest word in this category: it's both its own
 *     dedicated subcategory (Ignition Switches) and a generic term across
 *     a dozen other switch types (Sensors & Switches). Ignition Switches
 *     requires the exact phrase "ignition switch"; Sensors & Switches is
 *     the broad bare "switch"/"sensor" catch-all and runs LAST among the
 *     named subcategories so it only picks up what nothing more specific
 *     claimed first.
 *   - "Generator Relay" is explicitly a Charging System item per the spec,
 *     not Relays — Charging System runs before Relays so it claims that
 *     phrase first.
 *   - "Starter Switch" needs to land in Sensors & Switches, not Starter
 *     Motors — bare "starter" explicitly excludes anything that also says
 *     "switch."
 *   - Bare COVER is never used anywhere — "cover" appears in nearly every
 *     subcategory (Ignition Module Cover, Relay Covers, Regulator Covers,
 *     Battery Top Cover, Horn Cover, Ignition Switch Cover) with a
 *     different qualifier each time, so every cover-related keyword is a
 *     full compound phrase, not bare "cover" (same lesson as Engine, where
 *     bare cover only worked because Accessories was meant to be one broad
 *     catch-all — here there are too many different specific homes).
 *
 * Every countable-noun keyword allows an optional trailing S, same lesson
 * carried over from every previous rebuild.
 *
 * Pattern: audit → dry run → sample review → apply → sync → reindex.
 *
 * Usage:
 *   node fix_electrical_taxonomy.mjs                  # dry run
 *   node fix_electrical_taxonomy.mjs --sample=50      # bigger sample
 *   node fix_electrical_taxonomy.mjs --apply          # writes the rows
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

const CATEGORY = 'Electrical';

// ---------------------------------------------------------------------------
// Classification rules — checked in priority order, first match wins.
// Each test runs against UPPERCASE product name (n).
// Order matters:
//   1. Spark Plug and Horns run first — narrow, unambiguous phrases.
//   2. Charging System runs before Relays (claims "Generator Relay" first)
//      and before Ignition Coils (protects against any generator/alternator
//      "coil" naming overlap, though none confirmed yet).
//   3. Ignition Switches runs before Sensors & Switches (claims "ignition
//      switch" before the broad bare "switch" catch grabs it).
//   4. Wiring & Components runs before Sensors & Switches (claims
//      "T-MAP Sensor Connector" — a connector product — before the broad
//      bare "sensor" catch grabs it).
//   5. Sensors & Switches is the broadest bare "switch"/"sensor" catch-all
//      and runs LAST among the named subcategories, same pattern as every
//      previous rebuild's generic bucket.
// ---------------------------------------------------------------------------
const RULES = [
  {
    subcategory: 'Spark Plug',
    test: (n, b) => /\bSPARK PLUGS?\b/.test(n) || b === 'AUTOLITE',
  },
  {
    subcategory: 'Horns',
    test: (n) => /\bHORNS?\b/.test(n),
  },
  {
    // Added after the first dry run — not in the original spec, but the old
    // "Audio & Communication" bucket (332 rows) had zero keyword coverage:
    // Bluetooth headsets, intercoms, speakers, amplifiers with nowhere to
    // go. Same pattern as Engine's Oil System / Transmission's Kickstarters
    // gaps. Runs early since these terms are specific and unlikely to
    // collide with anything else in Electrical.
    subcategory: 'Audio & Communication',
    test: (n, b) =>
      /\bAUDIO\b/.test(n) ||
      /\bBLUETOOTH\b/.test(n) ||
      /\bHEADSETS?\b/.test(n) ||
      /\bINTERCOMS?\b/.test(n) ||
      /\bSPEAKERS?\b/.test(n) ||
      /\bAMPLIFIERS?\b/.test(n) ||
      /\bCOMMUNICATION\b/.test(n) ||
      /\bANTENNAS?\b/.test(n) ||
      ['CARDO', 'SENA', 'J&M', 'CERWIN VEGA', 'AQUATIC AV', 'WILD BOAR AUDIO', 'DIAMOND AUDIO', 'JENSEN', 'HOGTUNES'].includes(b),
  },
  {
    subcategory: 'Charging System & Components',
    test: (n) =>
      /\bCHARGING\b/.test(n) ||
      /\bCHARGE\b/.test(n) ||
      /\bALTERNATORS?\b/.test(n) ||
      /\bSTATORS?\b/.test(n) ||
      /\bGENERATORS?\b/.test(n) ||
      /\bREGULATORS?\b/.test(n) ||
      /\bREGLTR\b/.test(n) ||
      /\bVOLT REG\b/.test(n) ||
      /\bREG\.\s/.test(n) ||
      /\bRECTIFI(ER|ERS|YING)\b/.test(n) ||
      /\bARMATURES?\b/.test(n) ||
      /\bDELCO ?REMY\b/.test(n) ||
      /\b12V CONVERSION\b/.test(n) ||
      /\b3.?PHASE\b/.test(n),
  },
  {
    subcategory: 'Ignition Switches & Accessories',
    test: (n) => /\bIGNITION SWITCH(ES)?\b/.test(n) || /\bBARREL KEYS?\b/.test(n) || /\bPOST KEYS?\b/.test(n),
  },
  {
    subcategory: 'Points, Distributors & Accessories',
    test: (n) => /\bPOINTS?\b/.test(n) || /\bDISTRIBUTORS?\b/.test(n) || /\bADVANCE UNITS?\b/.test(n) || /\bV-?FIRE\b/.test(n) || /\bBREAKER PLATES?\b/.test(n) || /\bMAGNETOS?\b/.test(n) || /\bCONDENSORS?\b/.test(n) || /\bCONDENSERS?\b/.test(n),
  },
  {
    subcategory: 'Ignition Coils',
    test: (n, b) =>
      b === 'DAYTONA TWIN TEC' ||
      /\bIGNITION COILS?\b/.test(n) ||
      /\bIGNITION MODULES?\b/.test(n) ||
      /\bTWIN FIRE\b/.test(n) ||
      /\bDUAL.?OUTPUT\b/.test(n) ||
      /\bSINGLE FIRE\b/.test(n) ||
      /\bSUPERVOLT\b/.test(n) ||
      /\bCOIL RELOCATION\b/.test(n) ||
      /\bCOIL MOUNT\b/.test(n) ||
      /\bDYNA ?2000(TC)?\b/.test(n) ||
      /\bEXTERNAL (MODULE )?IGNITION\b/.test(n) ||
      /\b2000I\b/.test(n) ||
      /\bELECTRONIC IGNITION\b/.test(n) ||
      /\bINTERNAL IGNITION\b/.test(n) ||
      /\bIGNITION SENSORS?\b/.test(n) ||
      /\bREV LIMITERS?\b/.test(n) ||
      /\bIGNITION ROTORS?\b/.test(n) ||
      /\bIGNITION SYSTEMS?\b/.test(n) ||
      /\bIGNITION CONVERSION\b/.test(n) ||
      /\bIGNITION KITS?\b/.test(n) ||
      /\bMINIATURE SERIES\b/.test(n) ||
      /\bCOILS?\b/.test(n),
  },
  {
    subcategory: 'Relays',
    test: (n) => /\bRELAYS?\b/.test(n),
  },
  {
    subcategory: 'Starter Motors, Solenoids & Accessories',
    test: (n) =>
      (/\bSTARTERS?\b/.test(n) && !/\bSWITCH(ES)?\b/.test(n)) ||
      /\bSOLENOIDS?\b/.test(n) ||
      /\bHITACHI\b/.test(n) ||
      /\bPRESTOLITE\b/.test(n) ||
      /\bELECTRIC START\b/.test(n) ||
      /\bJACKSHAFTS?\b/.test(n),
  },
  {
    subcategory: 'Batteries, Cables & Accessories',
    test: (n, b) => /\bBATTER(Y|IES)\b/.test(n) || /\bBATT\.?\b/.test(n) || /\bYUASA\b/.test(n) || /\bAGM\b/.test(n) || /\bYUMICRON\b/.test(n) || /\bSOLAR PANELS?\b/.test(n) || b === 'BATTERY TENDER',
  },
  {
    // Broad wiring/connector/terminal catch-all — runs before Sensors &
    // Switches so connector products claim themselves first.
    subcategory: 'Wiring & Components',
    test: (n) =>
      /\bWIRES?\b/.test(n) ||
      /\bWIRING\b/.test(n) ||
      /\bHARNESS(ES)?\b/.test(n) ||
      /\bPIGTAILS?\b/.test(n) ||
      /\bCONNECTORS?\b/.test(n) ||
      /\bTERMINALS?\b/.test(n) ||
      /\bFUSES?\b/.test(n) ||
      /\bCIRCUIT BREAKERS?\b/.test(n) ||
      /\bJUNCTION BLOCKS?\b/.test(n) ||
      /\bBUTT SPLICES?\b/.test(n) ||
      /\bSHRINK\b/.test(n) ||
      /\bSLEEVING\b/.test(n) ||
      /\bPLUGS?\b/.test(n) ||
      /\bRECEPTACLES?\b/.test(n) ||
      /\bPOWER ?PORTS?\b/.test(n) ||
      /\bCRIMP\b/.test(n) ||
      /\bCONN\.?\b/.test(n) ||
      /\bHOSE CLAMPS?\b/.test(n) ||
      /\bEXTENSIONS?\b/.test(n) ||
      /\bDEUTSCH\b/.test(n) ||
      /\bMOLEX\b/.test(n) ||
      /\bDELPHI\b/.test(n) ||
      /\bJST\b/.test(n) ||
      /\bDTM\b/.test(n) ||
      /\bY.?SPLITTER\b/.test(n) ||
      /\bQUICK DISCONNECT\b/.test(n) ||
      /\bWIRE LOOM\b/.test(n) ||
      /\bAUDIO CONNECTOR\b/.test(n) ||
      /\bRADIO STATIC FILTER\b/.test(n) ||
      /\bLOAD ISOLATOR\b/.test(n),
  },
  {
    // Broadest bare switch/sensor catch-all — runs LAST among named
    // subcategories, same pattern as every previous rebuild's generic bucket.
    subcategory: 'Sensors & Switches',
    test: (n) => /\bSWITCH(ES)?\b/.test(n) || /\bSENSORS?\b/.test(n) || /\bFLASHERS?\b/.test(n) || /\bVOES\b/.test(n),
  },
];

// Fallback net — informed by the real old-subcategory names from the audit.
// 'Ignition' deliberately has no mapping — it's a large, genuinely mixed
// bucket (spark plugs, coils, points, switches all lived there together),
// so keyword refinement is the right tool, not a single blanket destination.
const FALLBACK_BY_OLD_SUBCAT = {
  'Wiring & Harnesses': 'Wiring & Components',
  'Charging & Alternators': 'Charging System & Components',
  'Switches & Controls': 'Sensors & Switches',
  'Batteries': 'Batteries, Cables & Accessories',
  'Starters & Solenoids': 'Starter Motors, Solenoids & Accessories',
  'Audio & Communication': 'Audio & Communication',
  'Horns': 'Horns',
};
const DEFAULT_FALLBACK = 'Electrical Parts'; // not in the original spec — added so nothing is left unclassified

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

    const candidates = await client.query(
      `SELECT id, name, brand, COALESCE(display_subcategory, '') AS display_subcategory
       FROM catalog_unified
       WHERE display_category = $1 AND is_active = true`,
      [CATEGORY],
    );
    console.log(`\nTotal active rows in category: ${candidates.rows.length}`);

    const byRule = {};
    const fallbackAssigned = [];
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
    console.log('These didn\'t match any rule and were force-assigned so nothing is left blank. Review before applying — this is where a missing keyword shows up.');
    console.table(fallbackAssigned.slice(0, SAMPLE_SIZE).map((r) => ({ id: r.id, name: r.name, brand: r.brand, old: r.display_subcategory || '(blank)', fallback_new: r.fallbackSubcat })));

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
