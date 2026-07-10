#!/usr/bin/env node
/**
 * fix_lighting_taxonomy.mjs
 *
 * Lighting — subcategory classification pass, v1.
 *
 * Target structure (9 subcategories + 1 fallback catch-all, from Laken's spec):
 *   Headlights | Turn Signals | Taillights | Running Lights | License Plate
 *   Lights | Reflectors & Lenses | Lighting Covers | Lighting Components &
 *   Accessories | Underglow & Neon | Lighting Parts (fallback catch-all, not
 *   in the original spec)
 *
 * First draft, not yet run against real data. No brand list was given this
 * time (list provided is for reference/context only), so this is pure
 * keyword/name matching — no brand-hit logic in v1.
 *
 * Design notes / assumptions (flag if wrong):
 *   - Bare LIGHT is never used anywhere — too broad, would claim everything.
 *     Every rule is compound or specific (HEADLIGHT, TURN SIGNAL, TAILLIGHT,
 *     RUNNING LIGHT, LICENSE PLATE, REFLECTOR, LENS, etc.).
 *   - Order matters heavily:
 *       1. Underglow & Neon runs early (UNDERGLOW/NEON are specific).
 *       2. Headlights runs before any catch-all (HEADLIGHT + variants).
 *       3. Turn Signals runs before a bare LIGHT catch (TURN SIGNAL).
 *       4. Taillights (TAILLIGHT).
 *       5. Running Lights (RUNNING LIGHT).
 *       6. License Plate Lights (LICENSE PLATE).
 *       7. Reflectors & Lenses (REFLECTOR or LENS, but NOT "Headlight Lens"
 *          which is a headlight variant — excluded via NOT HEADLIGHT check).
 *       8. Lighting Covers (COVER paired with HEADLIGHT/LIGHT-related terms,
 *          but NOT generic BRACKET/HOUSING which appear as their own words
 *          in the Covers bucket, yet the spec doesn't list them as keywords
 *          — a minor gap, may need adjustment based on real data).
 *       9. Lighting Components & Accessories (broadest bucket — BULB, SOCKET,
 *          WIRE, CONNECTOR, etc. — runs LAST so specific names claim
 *          themselves first).
 *
 * Every countable-noun keyword allows an optional trailing S, same lesson
 * carried over from every previous rebuild.
 *
 * Pattern: audit → dry run → sample review → apply → sync → reindex.
 *
 * Usage:
 *   node fix_lighting_taxonomy.mjs                  # dry run
 *   node fix_lighting_taxonomy.mjs --sample=50      # bigger sample
 *   node fix_lighting_taxonomy.mjs --apply          # writes the rows
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

const CATEGORY = 'Lighting';

// ---------------------------------------------------------------------------
// Classification rules — checked in priority order, first match wins.
// Each test runs against UPPERCASE product name (n).
// Order matters — see design notes above.
// ---------------------------------------------------------------------------
const RULES = [
  {
    subcategory: 'Underglow & Neon',
    test: (n) => /\bUNDERGLOW\b/.test(n) || /\bNEONS?\b/.test(n) || /\bACCENT LIGHTING\b/.test(n) || /\bCHASSIS MOUNT\b/.test(n),
  },
  {
    subcategory: 'Headlights',
    test: (n) =>
      /\bHEADLIGHTS?\b/.test(n) ||
      /\bHEADLAMPS?\b/.test(n) ||
      /\bHDLGT\b/.test(n) ||
      /\bSEALED BEAMS?\b/.test(n) ||
      /\bCRYSTAL HEADLIGHTS?\b/.test(n) ||
      /\bLED HEADLIGHTS?\b/.test(n) ||
      /\bH4\b/.test(n) ||
      /\b7.?\s?ROUND\b/.test(n) ||
      /\bAUXILIARY HEADLIGHTS?\b/.test(n) ||
      /\bAUXILIARY (LIGHTS?|LAMPS?|HIGH BEAM)\b/.test(n) ||
      /\bPASSING LIGHTS?\b/.test(n) ||
      /\bPASSING LAMPS?\b/.test(n) ||
      /\bFOG LIGHTS?\b/.test(n) ||
      /\bFOG LAMPS?\b/.test(n) ||
      /\bSPOTLIGHTS?\b/.test(n) ||
      /\bSPOT LIGHTS?\b/.test(n) ||
      /\bSPOTLAMPS?\b/.test(n),
  },
  {
    subcategory: 'Turn Signals',
    test: (n) =>
      /\bTURN SIGNALS?\b/.test(n) ||
      /\bT\/S\b/.test(n) ||
      /\bTS\s/.test(n) ||
      /\bAMBER (TURN )?SIGNALS?\b/.test(n) ||
      /\bLED TURN SIGNALS?\b/.test(n) ||
      /\bBULLET (STYLE )?TURN SIGNALS?\b/.test(n) ||
      /\bSMOKE (TURN )?SIGNALS?\b/.test(n) ||
      /\bMINI TURN SIGNALS?\b/.test(n) ||
      /\bCLEAR TURN SIGNALS?\b/.test(n) ||
      /\bINDICATOR LIGHTS?\b/.test(n) ||
      /\bRELOCATION KITS?\b/.test(n),
  },
  {
    subcategory: 'Taillights',
    test: (n) =>
      /\bTAILLIGHTS?\b/.test(n) ||
      /\bTAILLAMPS?\b/.test(n) ||
      /\bBRAKE LIGHTS?\b/.test(n) ||
      /\bBRAKE LAMPS?\b/.test(n) ||
      /\bLED TAILLIGHTS?\b/.test(n) ||
      /\bTAIL LAMP\b/.test(n),
  },
  {
    subcategory: 'Running Lights',
    test: (n, b) =>
      /\bRUNNING LIGHTS?\b/.test(n) ||
      /\bRUNNING LAMPS?\b/.test(n) ||
      /\bLED RUNNING LIGHTS?\b/.test(n) ||
      /\bDAYTIME RUNNING LIGHTS?\b/.test(n) ||
      /\bSTRIP LIGHTS?\b/.test(n) ||
      /\bSTRIP LAMPS?\b/.test(n) ||
      /\bSTRIP LIGHTING\b/.test(n) ||
      /\bFENDER LIGHTS?\b/.test(n) ||
      /\bFENDER LAMPS?\b/.test(n) ||
      /\bFENDER TIP\b/.test(n) ||
      /\bLED DAYTIME\b/.test(n) ||
      /\bSADDLEBAG LIGHTS?\b/.test(n) ||
      /\bBAG LIGHTS?\b/.test(n) ||
      /\bWHEEL LIGHTS?\b/.test(n) ||
      /\bWHEEL LAMPS?\b/.test(n) ||
      /\bPANEL LIGHTS?\b/.test(n) ||
      /\bTOUR PACK LIGHTS?\b/.test(n) ||
      /\bTOURPACK\b/.test(n) ||
      /\bLATCH LIGHTS?\b/.test(n) ||
      /\bANTENNA LIGHTS?\b/.test(n) ||
      /\bSTRUT LIGHTS?\b/.test(n) ||
      /\bACCENT LIGHTS?\b/.test(n) ||
      /\bWIZARD LIGHTS?\b/.test(n) ||
      /\bLUCIFER LIGHTS?\b/.test(n) ||
      /\bMARKER LIGHTS?\b/.test(n) ||
      /\bMARKER LAMPS?\b/.test(n) ||
      /\bFAIRING LIGHTS?\b/.test(n) ||
      /\bFAIRING LAMPS?\b/.test(n) ||
      /\bBLADE LIGHTS?\b/.test(n) ||
      /\bSIGNAL LIGHTS?\b/.test(n) ||
      /\bSIGNAL INSERTS?\b/.test(n) ||
      /\bEGG STYLE\b/.test(n) ||
      /\bHANDLEBAR\b/.test(n) ||
      /\bBULLET LAMPS?\b/.test(n) ||
      /\bBLACKOUT\b/.test(n) ||
      /\bHOT SPOT\b/.test(n) ||
      /\bPAWN\b/.test(n) ||
      /\bLIGHTNING BOLTS?\b/.test(n) ||
      /\bASTRO\b/.test(n) ||
      b === 'CUSTOM DYNAMICS',
  },
  {
    subcategory: 'License Plate Lights',
    test: (n) =>
      /\bLICENSE PLATES?\b/.test(n) ||
      /\bPLATE LIGHTS?\b/.test(n) ||
      /\bLED PLATE\b/.test(n) ||
      /\bLIGHTED.*LIC\b/.test(n),
  },
  {
    subcategory: 'Reflectors & Lenses',
    test: (n) =>
      (/\bREFLECTORS?\b/.test(n) || /\bLENSES?\b/.test(n) || /\bREPLACEMENT\b/.test(n)) &&
      !/\bHEADLIGHT/.test(n),
  },
  {
    subcategory: 'Lighting Covers',
    test: (n) =>
      /\bHEADLIGHT (COVERS?|VISORS?|TRIM RINGS?|FACEPLATES?|BUCKET COVERS?|BRACKETS?|BUCKETS?|HOUSINGS?|SHELLS?|TRIMS?)\b/.test(n) ||
      /\bLED VISORS?\b/.test(n) ||
      /\bMOUNT KITS?\b/.test(n) ||
      /\bCOWLS?\b/.test(n),
  },
  {
    // Broadest catch-all — runs LAST so specific names claim themselves first.
    subcategory: 'Lighting Components & Accessories',
    test: (n) =>
      /\bBULBS?\b/.test(n) ||
      /\bLED INSERTS?\b/.test(n) ||
      /\bLED BAU\b/.test(n) ||
      /\bFILAMENT\b/.test(n) ||
      /\bSOCKETS?\b/.test(n) ||
      /\bWIRES?\b/.test(n) ||
      /\bWIRING\b/.test(n) ||
      /\bCONNECTORS?\b/.test(n) ||
      /\bCONNECTIONS?\b/.test(n) ||
      /\bADAPTERS?\b/.test(n) ||
      /\bHARNESS(ES)?\b/.test(n) ||
      /\bSEALED HEADLIGHT KITS?\b/.test(n) ||
      /\bLENS COVERS?\b/.test(n) ||
      /\bLIGHTING TRIM\b/.test(n) ||
      /\bLIGHTING HARDWARE\b/.test(n),
  },
];

// Fallback net — informed by the real old-subcategory names from the audit.
const FALLBACK_BY_OLD_SUBCAT = {
  'Auxiliary Lighting': 'Running Lights',
  'Headlights': 'Headlights',
  'Taillights': 'Taillights',
  'Bulbs': 'Lighting Components & Accessories',
  'Lighting Controls': 'Lighting Parts',  // Control modules are cross-category (Electrical), not a real Lighting subcategory
  'License Plate Lighting': 'License Plate Lights',
  'Turn Signals': 'Turn Signals',
};
const DEFAULT_FALLBACK = 'Lighting Parts'; // not in the original spec — added so nothing is left unclassified

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
