#!/usr/bin/env node
/**
 * fix_transmission_taxonomy.mjs
 *
 * Transmission & Clutch — subcategory classification pass, v1.
 *
 * Target structure (16 subcategories + 1 fallback catch-all, from Laken's spec):
 *   Gear Sets | Mechanical Reverse Kits | Mainshaft & Components |
 *   Transmission Rebuild Kits & Components | Transmission Covers & Dipsticks |
 *   Primary & Derby Covers | Primary Belt Drives | Primary Chain Drives |
 *   Clutch Kits & Components | Clutch Cables & Components |
 *   Hydraulic Clutch Kits | Electric Shift Kits | Shift Linkages & Levers |
 *   Rear Belts & Chains | Pulleys & Sprockets | Chain Belts & Guards |
 *   Transmission Parts (fallback catch-all, not in the original spec — added
 *   so the "nothing left blank" net has somewhere sensible to land)
 *
 * This is a first draft, not yet run against real data. Assumptions made
 * up front (flag if wrong):
 *   - Category name is 'Transmission & Clutch' (the confirmed display_category
 *     value), not the working title "Transmission and Driveline" used in the
 *     spec — flag if this is meant to become its own renamed category like
 *     Gaskets & Seals.
 *   - "5 Speed"/"6 Speed" are NOT used as standalone triggers — same trap as
 *     "Twin Cam" in the Engine rebuild: these are fitment descriptors that
 *     show up on many unrelated parts, not a signal the product itself is a
 *     gear set or rebuild kit. Gear Sets requires the actual phrase "gear set."
 *   - Primary vs. Rear disambiguation (Primary Belt/Chain Drives vs. Rear
 *     Belts & Chains) relies on the word "primary" vs. "rear"/"drive" being
 *     present — genuinely ambiguous bare mentions will show up in the dry run.
 *   - Chain Belts & Guards runs early, before Rear Belts & Chains — "Rear
 *     Belt Guard" contains "Rear Belt" as a substring and would otherwise be
 *     grabbed by the more generic rule.
 *   - No brand is wired to a bare-brand match. Baker and JIMS both span
 *     multiple subcategories internally (Baker makes transmissions AND
 *     clutches; JIMS makes parts across everything). Diamond, RK Takasago,
 *     and Regina are chain brands that could mean primary or rear/final-drive
 *     chain — ambiguous either way. All five are flagged, not matched.
 *
 * Every countable-noun keyword allows an optional trailing S from the start,
 * same lesson carried over from Fuel/Air and Engine.
 *
 * Pattern: audit → dry run → sample review → apply → sync → reindex.
 *
 * Usage:
 *   node fix_transmission_taxonomy.mjs                  # dry run: audit + classify + sample
 *   node fix_transmission_taxonomy.mjs --sample=50      # bigger sample in dry run
 *   node fix_transmission_taxonomy.mjs --apply          # writes the classified rows
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

const CATEGORY = 'Transmission & Clutch';

// ---------------------------------------------------------------------------
// Classification rules — checked in priority order, first match wins.
// Each test runs against UPPERCASE product name (n) and UPPERCASE brand (b).
// Order matters:
//   1. Named-kit subcategories (Mechanical Reverse, Electric Shift, Hydraulic
//      Clutch) run first — narrow, unambiguous phrases.
//   2. Chain Belts & Guards runs before Rear Belts & Chains — "Rear Belt
//      Guard" contains "Rear Belt" as a substring.
//   3. Pulleys & Sprockets runs before Mainshaft & Components — "Transmission
//      Mainshaft Sprocket" contains "Mainshaft," but per the spec that's a
//      Pulleys & Sprockets item, not Mainshaft & Components.
//   4. Clutch Cables & Components runs before Clutch Kits & Components so
//      cable/lever-specific items claim themselves first.
// ---------------------------------------------------------------------------
const RULES = [
  {
    subcategory: 'Mechanical Reverse Kits',
    test: (n) => /\bMECHANICAL REVERSE\b/.test(n) || (/\bREVERSE\b/.test(n) && (/\bKITS?\b/.test(n) || /\bGEARS?\b/.test(n))),
  },
  {
    subcategory: 'Electric Shift Kits',
    test: (n) => /\bELECTRIC SHIFT\b/.test(n) || (/\bE-?SHIFT\b/.test(n) && /\bKITS?\b/.test(n)),
  },
  {
    subcategory: 'Hydraulic Clutch Kits',
    test: (n) => (/\bHYDRAULIC CLUTCH\b/.test(n) || /\bHYDRO CLUTCH\b/.test(n)) && /\bKITS?\b/.test(n),
  },
  {
    // Runs early — "Rear Belt Guard" would otherwise be grabbed by the more
    // generic "Rear Belt" phrase in Rear Belts & Chains.
    subcategory: 'Chain Belts & Guards',
    test: (n) => /\bBELT GUARDS?\b/.test(n) || /\bSPROCKET COVERS?\b/.test(n) || /\bREAR BELT GUARDS?\b/.test(n),
  },
  {
    subcategory: 'Transmission Covers & Dipsticks',
    test: (n) =>
      /\bTRANSMISSION SIDE COVERS?\b/.test(n) ||
      /\bTRANSMISSION TOP COVERS?\b/.test(n) ||
      /\bOIL FILL PLUGS?\b/.test(n) ||
      /\bDIPSTICKS?\b/.test(n) ||
      /\bTRANS\.? ?DIPSTICKS?\b/.test(n) ||
      /\bTRANS\.? ?DOORS?\b/.test(n) ||
      /\bTRANSMISSION DOORS?\b/.test(n) ||
      /\bTRANSMISSION CASES?\b/.test(n),
  },
  {
    // Added after the first dry run — not in the original spec, but the old
    // "Oil System" bucket (736 rows) had virtually no coverage otherwise:
    // oil filters, lines, screens, and drain items with nowhere to go beyond
    // the narrow dipstick/fill-plug scope of Transmission Covers & Dipsticks.
    subcategory: 'Oil System',
    test: (n) =>
      /\bOIL FILTERS?\b/.test(n) ||
      /\bOIL LINES?\b/.test(n) ||
      /\bOIL SCREENS?\b/.test(n) ||
      /\bOIL DRAIN\b/.test(n) ||
      /\bOIL TANKS?\b/.test(n) ||
      (/\bOIL\b/.test(n) && /\bPUMPS?\b/.test(n)),
  },
  {
    subcategory: 'Primary & Derby Covers',
    test: (n) =>
      /\bOUTER PRIMARY COVERS?\b/.test(n) ||
      /\bINNER PRIMARY\b/.test(n) ||
      /\bINNER PRIMARY SPACERS?\b/.test(n) ||
      /\bDERBY COVERS?\b/.test(n) ||
      /\bSPORTSTER INSPECTION COVERS?\b/.test(n) ||
      /\bPRIMARY CHAIN INSPECTION COVERS?\b/.test(n) ||
      /\bINSPECTION COVERS?\b/.test(n),
  },
  {
    subcategory: 'Primary Belt Drives',
    test: (n) => /\bOPEN BELT DRIVES?\b/.test(n) || /\bENCLOSED BELT DRIVES?\b/.test(n) || /\bPRIMARY BELT\b/.test(n) || /\bBELT DRIVES?\b/.test(n),
  },
  {
    subcategory: 'Primary Chain Drives',
    test: (n) =>
      /\bCOMPENSAT(OR|ING)S?\b/.test(n) ||
      /\bPRIMARY SPROCKETS?\b/.test(n) ||
      /\bCOMPENSATOR RAMPS?\b/.test(n) ||
      /\bCOMPENSATOR SPRINGS?\b/.test(n) ||
      /\bPRIMARY CHAINS?\b/.test(n) ||
      /\bCHAIN TENSIONERS?\b/.test(n),
  },
  {
    // Runs before Mainshaft & Components — "Transmission Mainshaft Sprocket"
    // contains "Mainshaft" but is a Pulleys & Sprockets item per the spec.
    // Bare SPROCKET and TRANSMISSION PULLEY added after the first dry run —
    // lots of plain "Front/Rear Sprocket" and "Transmission Pulley" listings
    // weren't covered by the narrower compound phrases alone. Safe to run
    // this broad since Chain Belts & Guards (SPROCKET COVER) and Primary
    // Chain Drives (PRIMARY SPROCKET) both run earlier and already claim
    // their more specific cases.
    subcategory: 'Pulleys & Sprockets',
    test: (n) =>
      /\bOFFSET TRANSMISSION SPROCKETS?\b/.test(n) ||
      /\bTRANSMISSION MAINSHAFT SPROCKETS?\b/.test(n) ||
      /\bTRANSMISSION PULLEYS?\b/.test(n) ||
      /\bCUSH.?DRIVER?\b/.test(n) ||
      /\bCUSH DRIVE DAMPENERS?\b/.test(n) ||
      /\bCUSH DRIVE ISOLATORS?\b/.test(n) ||
      /\bREAR PULLEY SPACERS?\b/.test(n) ||
      /\bMOTOR PULLEYS?\b/.test(n) ||
      /\bSPROCKETS?\b/.test(n),
  },
  {
    subcategory: 'Rear Belts & Chains',
    test: (n) => /\bREAR BELTS?\b/.test(n) || /\bREAR CHAINS?\b/.test(n) || /\bDRIVE BELTS?\b/.test(n) || /\bFINAL DRIVE\b/.test(n) || /\bREAR (DRIVE )?PULLEYS?\b/.test(n),
  },
  {
    // Runs before Clutch Kits & Components so cable/lever items claim
    // themselves first.
    subcategory: 'Clutch Cables & Components',
    test: (n) => /\bCLUTCH CABLES?\b/.test(n) || /\bCLUTCH LEVERS?\b/.test(n) || /\bCLUTCH LINES?\b/.test(n),
  },
  {
    // Broadened after the first dry run: exact adjacent phrases ("Clutch
    // Plate") missed real variants like "Clutch Friction Plates" (a word
    // between CLUTCH and PLATE) and "Clutch Push Rod" (three words, not
    // "Clutch Pushrod" as one). Now checks for CLUTCH plus any of the common
    // component words appearing anywhere in the name, not just adjacent.
    subcategory: 'Clutch Kits & Components',
    test: (n, b) => {
      const genericClutchHit =
        /\bCLUTCH\b/.test(n) &&
        /\b(PLATES?|BASKETS?|HUBS?|SHELLS?|SPRINGS?|PUSH ?RODS?|RELEASE|PRESSURE PLATES?|ADJUSTER|SLAVE|STUDS?|KITS?|COVERS?)\b/.test(n);
      const brandHit = b === 'ALTO PRODUCTS';
      const namedTermHit = /\bTORQ ?DRIVE\b|\bSCORPION LOW.?PROFILE\b|\bPOWER PLATE KITS?\b|\bJOCKEY\b|\bMOUSETRAP\b|\bROCKER\b|\bPAWL\b|\bTHROW ?OUT\b/.test(n);
      return genericClutchHit || brandHit || namedTermHit;
    },
  },
  {
    subcategory: 'Shift Linkages & Levers',
    test: (n) => /\bSHIFT RODS?\b/.test(n) || /\bSHIFT LINKAGES?\b/.test(n) || /\bSHIFTER RODS?\b/.test(n),
  },
  {
    // Added after the first dry run — not in the original spec, but the old
    // "Kickstarters & Hardware" bucket (399 rows) had zero keyword coverage
    // at all. Runs before Gear Sets so items like "Kick Starter Gear Set"
    // (which the old bucket already grouped with kickstarters, not generic
    // gear sets) get claimed here first.
    subcategory: 'Kickstarters & Hardware',
    test: (n) => /\bKICK ?START/.test(n),
  },
  {
    // "5 Speed"/"6 Speed" deliberately NOT used as standalone triggers — same
    // fitment-descriptor trap as "Twin Cam" in the Engine rebuild.
    subcategory: 'Gear Sets',
    test: (n) => /\bGEAR SETS?\b/.test(n),
  },
  {
    subcategory: 'Mainshaft & Components',
    test: (n) => /\bMAIN ?SHAFTS?\b/.test(n) || /\bCOUNTERSHAFTS?\b/.test(n),
  },
  {
    subcategory: 'Transmission Rebuild Kits & Components',
    test: (n) =>
      /\bSHIFTER DRUMS?\b/.test(n) ||
      /\bSHIFT FORKS?\b/.test(n) ||
      /\bTRANSMISSION LOCK TABS?\b/.test(n) ||
      /\bTRANSMISSION VENT HOSES?\b/.test(n) ||
      (/\bTRANSMISSION\b/.test(n) && /\bREBUILD KITS?\b/.test(n)),
  },
];

// Brands from the spec deliberately NOT wired to a bare-brand match — Baker
// and JIMS both span multiple subcategories internally (Baker makes
// transmissions AND clutches; JIMS makes parts across everything, same
// pattern as the Engine rebuild). Diamond, RK Takasago, and Regina are chain
// brands that could mean primary chain or rear/final-drive chain — ambiguous
// either way without keyword context.
const FLAGGED_BRANDS = ['BAKER', 'JIMS', 'DIAMOND CHAIN COMPANY', 'RK TAKASAGO CHAIN', 'REGINA'];

// Fallback net — informed by the real old-subcategory names from the first
// audit, same pattern as the Engine rebuild's FALLBACK_BY_OLD_SUBCAT.
const FALLBACK_BY_OLD_SUBCAT = {
  'Clutch Plates & Kits': 'Clutch Kits & Components',
  'Transmission Internals': 'Mainshaft & Components',
  'Trans Covers & Cases': 'Transmission Covers & Dipsticks',
  'Oil System': 'Oil System',
  'Drive Chains & Kits': 'Primary Chain Drives',
  'Belts & Pulleys': 'Rear Belts & Chains',
  'Sprockets': 'Pulleys & Sprockets',
  'Kickstarters & Hardware': 'Kickstarters & Hardware',
  'Primary Drive': 'Primary Chain Drives',
};
const DEFAULT_FALLBACK = 'Transmission Parts'; // not in the original spec — added so nothing is left unclassified

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
