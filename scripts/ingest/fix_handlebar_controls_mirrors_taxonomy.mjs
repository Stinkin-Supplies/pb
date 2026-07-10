#!/usr/bin/env node
/**
 * fix_handlebar_controls_mirrors_taxonomy.mjs
 *
 * Handlebar & Controls — subcategory classification pass, v1.
 *
 * Target structure (6 subcategories + 1 fallback catch-all, from Laken's spec):
 *   Handlebars & Components | Risers, Clamps & Components | Hand Control
 *   Sets, Levers | Grips, Heated Grips | Bar Ends, Throttle Tubes, Throttle
 *   Assists, Hand Control Hardware | Mirrors | Handlebar & Controls Parts
 *   (fallback catch-all, not in the original spec)
 *
 * First draft, not yet run against real data.
 *
 * Design notes / assumptions (flag if wrong):
 *   - Handlebars & Components: The 100+ style names (Ape Hangers, T-Bar,
 *     Z-Bar, Touring Handlebar, Monkey Bagger, Prime Ape, etc.) are the
 *     primary signal. Bare HANDLEBAR only if NOT followed by RISER/CLAMP
 *     (which would belong to Risers bucket). Compound phrases (APE HANGERS,
 *     T-BAR, Z-BAR, TOURING HANDLEBAR, MONKEY variants, etc.) are the core
 *     strategy.
 *   - Risers, Clamps & Components: Unambiguous (RISER, CLAMP) with variants.
 *   - Hand Control Sets, Levers: BRAKE/CLUTCH + CONTROL, LEVER, MASTER
 *     CYLINDER.
 *   - Grips, Heated Grips: GRIP (bare or with modifiers), HEATED GRIP,
 *     specific grip brand/model lines.
 *   - Bar Ends, Throttle Tubes, etc.: Compound phrases only (THROTTLE TUBE,
 *     THROTTLE SLEEVE, THROTTLE ASSEMBLY, THROTTLE HOUSING, WHISKEY
 *     THROTTLE, HAND GUARD, GRIP SPACER, BAR END). Bare THROTTLE avoided to
 *     prevent collision with Carburetion & Fuel EFI throttle bodies.
 *   - Mirrors: MIRROR + variants (MIRROR MOUNT, MIRROR HOLE PLUG, MIRROR
 *     CLAMP, etc.).
 *
 * Every countable-noun keyword allows an optional trailing S, same lesson
 * carried over from every previous rebuild.
 *
 * Pattern: audit → dry run → sample review → apply → sync → reindex.
 *
 * Usage:
 *   node fix_handlebar_controls_mirrors_taxonomy.mjs                  # dry run
 *   node fix_handlebar_controls_mirrors_taxonomy.mjs --sample=50      # bigger sample
 *   node fix_handlebar_controls_mirrors_taxonomy.mjs --apply          # writes the rows
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

const CATEGORY = 'Handlebar & Controls';

// ---------------------------------------------------------------------------
// Classification rules — checked in priority order, first match wins.
// Each test runs against UPPERCASE product name (n).
// Order matters: Mirrors and specific control types run first, then
// Handlebars (which use broad compound phrases), then Risers/Clamps (which
// can overlap with handlebar terms), then generic Grips and Throttle.
// ---------------------------------------------------------------------------
const RULES = [
  {
    subcategory: 'Mirrors',
    test: (n) =>
      /\bMIRRORS?\b/.test(n) ||
      /\bMIRROR MOUNTS?\b/.test(n) ||
      /\bMIRROR HOLE PLUGS?\b/.test(n) ||
      /\bMIRROR CLAMPS?\b/.test(n) ||
      /\bSHOOTERS?\b/.test(n),
  },
  {
    subcategory: 'Hand Control Sets, Levers',
    test: (n) =>
      /\bBRAKE CONTROLS?\b/.test(n) ||
      /\bCLUTCH CONTROLS?\b/.test(n) ||
      /\bBRAKE MASTER CYLINDERS?\b/.test(n) ||
      /\bCLUTCH MASTER CYLINDERS?\b/.test(n) ||
      /\bREBUILD KITS?\b/.test(n) ||
      /\bHANDLEBAR CONTROL KITS?\b/.test(n) ||
      /\bCAN.?BUS CONTROL\b/.test(n) ||
      /\bLEVERS?\b/.test(n) ||
      /\bLEVER SETS?\b/.test(n) ||
      /\bLEVER PERCH\b/.test(n) ||
      /\bCLUTCH LEVER BRACKETS?\b/.test(n) ||
      /\bPERCH CLAMPS?\b/.test(n) ||
      /\bCLAMP HALVES?\b/.test(n) ||
      /\bLEATHER LEVER COVERS?\b/.test(n) ||
      /\bFOAM LEVER GRIPS?\b/.test(n),
  },
  {
    subcategory: 'Grips, Heated Grips',
    test: (n) =>
      /\bGRIPS?\b/.test(n) ||
      /\bHEATED GRIPS?\b/.test(n) ||
      /\bRUBBER INSERT\b/.test(n) ||
      /\bGEL GRIPS?\b/.test(n) ||
      /\bMEMORY FOAM\b/.test(n),
  },
  {
    subcategory: 'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware',
    test: (n) =>
      /\bBAR ENDS?\b/.test(n) ||
      /\bTHROTTLE TUBES?\b/.test(n) ||
      /\bTHROTTLE SLEEVES?\b/.test(n) ||
      /\bTHROTTLE ASSEMBLIES?\b/.test(n) ||
      /\bTHROTTLE HOUSINGS?\b/.test(n) ||
      /\bVARIABLE RATE THROTTLE\b/.test(n) ||
      /\bWHISKEY THROTTLE\b/.test(n) ||
      /\bHAND GUARDS?\b/.test(n) ||
      /\bGRIP SPACERS?\b/.test(n),
  },
  {
    subcategory: 'Handlebars & Components',
    test: (n) =>
      /\bAPE HANGERS?\b/.test(n) ||
      /\bT-?BARS?\b/.test(n) ||
      /\bZ-?BARS?\b/.test(n) ||
      /\bTOURING HANDLEBARS?\b/.test(n) ||
      /\bMONKEY\b/.test(n) ||
      /\bPRIME APES?\b/.test(n) ||
      /\bGORILLA APES?\b/.test(n) ||
      /\bTWIN PEAKS?\b/.test(n) ||
      /\bBUFFALO BARS?\b/.test(n) ||
      /\bVALLEY\b/.test(n) ||
      /\bHAMMERHEAD\b/.test(n) ||
      /\bTHRESHER\b/.test(n) ||
      /\bTREE HUGGERS?\b/.test(n) ||
      /\bKAGE FIGHTERS?\b/.test(n) ||
      /\bMOOSE KNUCKLES?\b/.test(n) ||
      /\bCLASSIC\b/.test(n) ||
      /\bBIGG?S?\s(JOHNSON|BUFFALO|BLK)\b/.test(n) ||
      /\bBEATER BARS?\b/.test(n) ||
      /\bBLACKLINE CLUBS?\b/.test(n) ||
      /\bCRUSADERS?\b/.test(n) ||
      /\bVIKINGS?\b/.test(n) ||
      /\bCALIBER HANDLEBARS?\b/.test(n) ||
      /\bPHATBARS?\b/.test(n) ||
      /\bV-?LINES?\b/.test(n) ||
      /\bBUCKS?\b/.test(n) ||
      /\bBOBBERS?\b/.test(n) ||
      /\bCHUBBY\b/.test(n) ||
      /\bDOMINATORS?\b/.test(n) ||
      /\bBURLY\b/.test(n) ||
      /\bOLD SCHOOLS?\b/.test(n) ||
      /\bSPEED CAFES?\b/.test(n) ||
      /\bMOTO\b/.test(n) ||
      /\bERGO BARS?\b/.test(n) ||
      /\bJIM BARS?\b/.test(n) ||
      /\bSID BARS?\b/.test(n) ||
      /\bSCRAMBLERS?\b/.test(n) ||
      /\bCLUBMANS?\b/.test(n) ||
      /\bPODIUM FLIGHTS?\b/.test(n) ||
      (/\bHANDLEBARS?\b/.test(n) && !/\bRISERS?\b/.test(n) && !/\bCLAMPS?\b/.test(n)),
  },
  {
    subcategory: 'Risers, Clamps & Components',
    test: (n) =>
      /\bRISERS?\b/.test(n) ||
      /\bRISER CLAMPS?\b/.test(n) ||
      /\bRISER SPACERS?\b/.test(n) ||
      /\bRISER ADAPTERS?\b/.test(n) ||
      /\bRISER EXTENSIONS?\b/.test(n) ||
      /\bRISER BUSHINGS?\b/.test(n) ||
      /\bRISER STUDS?\b/.test(n) ||
      /\bCLAMPS?\b/.test(n) ||
      /\bCLAMP SETS?\b/.test(n) ||
      /\bDVAMPNER KITS?\b/.test(n),
  },
];

// Fallback net — informed by the real old-subcategory names from the audit.
// 'Cables & Lines' deliberately has NO specific routing — it's a cross-category
// bucket (4,117 rows) that will become its own top-level category later.
// Route it to DEFAULT_FALLBACK so cables bypass keyword matching entirely.
const FALLBACK_BY_OLD_SUBCAT = {
  'Handlebars': 'Handlebars & Components',
  'Risers & Clamps': 'Risers, Clamps & Components',
  'Levers & Controls': 'Hand Control Sets, Levers',
  'Grips': 'Grips, Heated Grips',
  'Throttle & Accessories': 'Bar Ends, Throttle Tubes, Throttle Assists, Hand Control Hardware',
  'Mirrors': 'Mirrors',
  'Cables & Lines': undefined,  // Force to DEFAULT_FALLBACK; cables have their own category coming
  'Switches & Wiring': undefined,  // Cross-category, also goes to DEFAULT_FALLBACK
};
const DEFAULT_FALLBACK = 'Handlebar & Controls Parts'; // not in the original spec — added so nothing is left unclassified

function classify(name) {
  const n = (name || '').toUpperCase();
  for (const rule of RULES) {
    if (rule.test(n)) return rule.subcategory;
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
      let result = classify(row.name);
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
