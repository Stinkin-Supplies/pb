#!/usr/bin/env node
/**
 * fix_tanks_body_taxonomy.mjs
 *
 * Creates the "Tanks & Body" display_category — a category-level migration
 * pulling from FOUR sources (biggest yet, per session 79 scoping audit):
 *
 *   1. Fenders & Body (3,078 rows) — ENTIRE category retired. Gas tanks,
 *      gas caps, fenders, fender trim, and the 732 previously-NULL rows
 *      all get classified into Tanks & Body's own subcategories.
 *   2. Transmission & Clutch / Oil System (684 rows) — oil tank, dipstick,
 *      hose, filter portion moves out (~374-470 rows expected). Category
 *      stays alive; only this slice is pulled.
 *   3. Carburetion & Fuel / Fuel Lines & Pumps (319 rows) — fuel valve/
 *      line/regulator portion matching the Tanks & Body spec moves out
 *      (~127-172 rows expected). Category stays alive.
 *   4. Lighting — every row with "license plate" in the name moves out,
 *      per Laken's explicit call (includes combo taillight/plate-light
 *      units, not just pure mount hardware). Lighting loses its entire
 *      License Plate Lights subcategory (222 rows) plus scattered matches.
 *
 * Target subcategories (11 — 10 from Laken's spec + 1 catch-all added
 * this session after the first dry run):
 *   1. Gas Tanks & Gas Caps
 *   2. Fuel Valves, Fuel Filters (Carb)
 *   3. Fuel Lines, Regulators, Filters (EFI) — expanded to include fuel
 *      injectors, fuel rails, regulator housings (Laken's call, dry run 1)
 *   4. Oil Tank, Dipstick, Hoses
 *   5. Oil Filters, Filter Mounts, Oil Line Covers
 *   6. Fuel/Oil Line, Clamps and Finishers
 *   7. Front Fender & Hardware
 *   8. Rear Fender, Struts, Hardware
 *   9. Fender Trim
 *   10. Fender Parts & Accessories (NEW — catch-all for bare "FENDER"
 *       matches without a front/rear/trim qualifier; Laken's call, dry run 1)
 *   11. License Plate Mounts, Frames, Lighting, Hardware
 *
 * EXPLICITLY OUT OF SCOPE (Laken's call, dry run 1): the ~306 Transmission &
 * Clutch / Oil System rows that are oil coolers, oil lines (not hoses), or
 * sending units stay in Transmission & Clutch — not pulled into Tanks &
 * Body. Only the narrower oil-tank/dipstick/hose/filter slice moves.
 *
 * PATTERN (per Cables/Gaskets precedent — category-level migration, not a
 * within-category rebuild): EXCLUDE (name-level guards) -> REROUTE (mis-netted
 * rows get their own destination, not the fallback) -> FLAG (genuinely
 * ambiguous, untouched, logged). NO BLANKET FALLBACK — an unmatched row
 * has not earned its way into Tanks & Body and stays where it is.
 *
 * Known bug classes guarded against from the start (MasterRef lessons):
 *   - Trailing-S: every countable noun gets (S)? or the whole -es suffix
 *     grouped, from the first draft, not discovered via a live dry run.
 *   - Adjacency: "name contains X" and "name contains Y" are separate
 *     .test() calls ANDed together, never one adjacency-dependent pattern.
 *   - Platform names are not product descriptions (n/a here, but checked).
 *   - A raw vendor category is not a trustworthy filter on its own.
 *   - Hardware-noun-first ordering: the part-type noun is checked before
 *     generic qualifiers.
 *
 * Standing method: audit (done, session 79) -> dry run (this) -> paste for
 * review -> fix -> re-dry-run -> --apply -> sync_fitment_flat_columns.mjs
 * -> index_unified.js --recreate.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const APPLY = process.argv.includes('--apply');
const NEW_CATEGORY = 'Tanks & Body';

// Windshields & Fairings already exists as a live top-level category
// (session 74, currently at zero nulls). These are STRAGGLER rows: still
// tagged display_category='Fenders & Body' with display_subcategory NULL,
// never migrated when Windshields & Fairings was split out. They are
// REROUTED to their real existing home, not classified into Tanks & Body.
const WINDSHIELD_CATEGORY = 'Windshields & Fairings';
const WINDSHIELD_SUBCATEGORY = 'Windshields'; // matches session 74's merge precedent

// ---------------------------------------------------------------------------
// SCOPE QUERIES — one per source. Each returns rows that are CANDIDATES for
// migration; classify() below decides the actual subcategory or FLAGs them.
// ---------------------------------------------------------------------------

const SCOPE_QUERIES = {
  fenders_body_all: `
    SELECT id, source_vendor, sku, name, category AS raw_category,
           subcategory AS raw_subcategory, display_category, display_subcategory
    FROM catalog_unified
    WHERE is_active = true AND display_category = 'Fenders & Body'
  `,
  transmission_oil_system: `
    SELECT id, source_vendor, sku, name, category AS raw_category,
           subcategory AS raw_subcategory, display_category, display_subcategory
    FROM catalog_unified
    WHERE is_active = true AND display_category = 'Transmission & Clutch'
      AND display_subcategory = 'Oil System'
  `,
  carb_fuel_lines_pumps: `
    SELECT id, source_vendor, sku, name, category AS raw_category,
           subcategory AS raw_subcategory, display_category, display_subcategory
    FROM catalog_unified
    WHERE is_active = true AND display_category = 'Carburetion & Fuel'
      AND display_subcategory = 'Fuel Lines & Pumps'
  `,
  lighting_license_plate: `
    SELECT id, source_vendor, sku, name, category AS raw_category,
           subcategory AS raw_subcategory, display_category, display_subcategory
    FROM catalog_unified
    WHERE is_active = true AND display_category = 'Lighting'
      AND name ILIKE '%license plate%'
  `,
};

// ---------------------------------------------------------------------------
// EXCLUDE — name-level guards. A row matching an EXCLUDE pattern is left
// exactly where it is, regardless of which source query surfaced it.
// Mirrors Cables/Gaskets precedent: category filters alone are insufficient,
// but neither is trusting a source query without exclusions.
// ---------------------------------------------------------------------------
function isExcluded(row, sourceKey) {
  const n = (row.name || '').toUpperCase();

  // Defensive guard: a bare "BACKING PLATE" (e.g. brake/clutch backing
  // plates that leaked into these source categories) is not a license
  // plate. Kept even though source queries are already scoped, since
  // Fenders & Body / Oil System / Carb sources all contain "PLATE" a lot.
  if (sourceKey !== 'lighting_license_plate' && /\bBACKING PLATE\b/.test(n)) {
    return true; // stays put
  }

  // Oil pump internals (idler gears, drive gears, chain adjusters) — Laken's
  // call, dry run 3: these are genuine Transmission & Clutch territory
  // (engine-internal pump mechanicals), not tank/hose/cooler/line/filter
  // hardware, even though they sit in the Oil System subcategory by name
  // inheritance. Excluded before classify() ever sees them.
  if (sourceKey === 'transmission_oil_system' &&
      (/\bOIL\s*PUMP\b/.test(n) || /IDLER\s*GEAR/.test(n) || /DRIVE\s*GEAR/.test(n) ||
       /\bCHAIN\s*ADJUSTER\b/.test(n) || /\bOIL\s*CONTROL\s*VALVE\b/.test(n))) {
    return true; // stays in Transmission & Clutch
  }

  // Console/saddlebag hardware miscategorized under Gas Caps & Petcocks in
  // a prior pass — not a gas cap at all. Explicit exclusion by name.
  if (/CONSOLE\s*DOOR/.test(n)) {
    return true; // stays put, flagged for a future Luggage & Racks move
  }

  return false;
}

// ---------------------------------------------------------------------------
// WINDSHIELD STRAGGLER DETECTION — these reroute to the existing
// Windshields & Fairings category, never touched by Tanks & Body at all.
// Checked before classify() since it's a different destination category
// entirely, not a Tanks & Body subcategory choice.
// ---------------------------------------------------------------------------
function isWindshieldStraggler(row) {
  const n = (row.name || '').toUpperCase();
  return /\bWINDSHIELD(S)?\b/.test(n) || /\bWINDSCREEN(S)?\b/.test(n) ||
         /\bW\/S\b/.test(n) || /\bFLYSCREEN(S)?\b/.test(n) ||
         /\bSWITCHBLADE\b/.test(n) || /\bSPITFIRE\b/.test(n) ||
         /\bTOMBSTONE\b/.test(n) || /\bSTREET SHIELD\b/.test(n) ||
         /\bSTREET SCREEN\b/.test(n) || /\bDEFLECTOR SCREEN\b/.test(n) ||
         /\bFAIRING(S)?\b/.test(n);
}

// ---------------------------------------------------------------------------
// CLASSIFY — maps a row to one of the 10 target subcategories, or null
// (FLAG — stays in place, logged for review). No blanket fallback.
// ---------------------------------------------------------------------------
function classify(row, sourceKey) {
  const n = (row.name || '').toUpperCase();

  // Lighting source is unconditional per Laken's call — every license-plate
  // named row moves, combo unit or not.
  if (sourceKey === 'lighting_license_plate') {
    return 'License Plate Mounts, Frames, Lighting, Hardware';
  }

  // --- Gas Tanks & Gas Caps ---
  // Includes named styles from Laken's spec: legacy, rubber mount, dash-style,
  // smooth-top quickbob, quickbob, aero-style, legacy lynx, wasp-style,
  // frisco style tanks; pop-up, screw-in locking, dresser-style, vented,
  // gas kap keeper, fuel gauge gas caps.
  if (/\bGAS\s*TANK(S)?\b/.test(n) || /\bFUEL\s*TANK(S)?\b/.test(n) ||
      /\bGAS\s*CAP(S)?\b/.test(n) || /\bTANK\s*CAP(S)?\b/.test(n) ||
      /\bPETCOCK(S)?\b/.test(n) || /QUICKBOB/.test(n) ||
      (/\bWASP\b/.test(n) && /\bTANK\b/.test(n)) ||
      (/\bFRISCO\b/.test(n) && /\bTANK\b/.test(n)) ||
      (/\bLYNX\b/.test(n) && /\bTANK\b/.test(n)) ||
      /GAS KAP KEEPER/.test(n) || /FUEL GAUGE.*CAP/.test(n) ||
      (/\bDASH\b/.test(n) && /\bTANK\b/.test(n)) ||
      /\bTANK\s*BIB\b/.test(n) || /\bTANK\s*MOUNT(ING)?\b/.test(n) ||
      /\bTANK\s*EMBLEM\b/.test(n) || /\bFUEL\s*CAP\b/.test(n) ||
      /\bFUEL\s*DOOR\b/.test(n) ||
      (sourceKey === 'fenders_body_all' && row.display_subcategory === 'Gas Tanks')) {
    return 'Gas Tanks & Gas Caps';
  }

  // --- Generic tank/fuel-system plumbing hardware (Fenders & Body source
  // only) — Laken's call, dry run 3: hoses/mounts/valves/elbows/couplings
  // that don't say "gas"/"fuel"/"tank" explicitly, but arrived via the
  // fenders_body_all source query (i.e. they were already living in the
  // gas-tank-and-fuel-adjacent category, not swept in from elsewhere).
  // Scoped to this source ONLY — a bare HOSE/VALVE/ELBOW match would be
  // dangerously broad if applied catalog-wide (per session lessons on
  // category-filters-are-insufficient working both directions).
  if (sourceKey === 'fenders_body_all' &&
      (/\bHOSE\b/.test(n) || /\bVALVE\b/.test(n) || /\bELBOW\b/.test(n) ||
       /\bCOUPLING\b/.test(n) || /\bVENT\s*LINE\b/.test(n) ||
       /\bMOUNT\s*CLAMP\b/.test(n) || /\bVIBRATION\s*MOUNT\b/.test(n) ||
       /\bVAPOR\s*BLOCK\b/.test(n) || /\bFUEL\s*LN\b/.test(n))) {
    return 'Fuel/Oil Line, Clamps and Finishers';
  }

  // --- Fuel Valves, Fuel Filters (Carb) ---
  // Carb-side: bare fuel valve, or fuel filter NOT explicitly EFI-tagged.
  // Includes reversed word order ("FILTER OIL" style abbreviations seen
  // in WPS raw names).
  if (/\bFUEL\s*VALVE(S)?\b/.test(n) ||
      (/\bFUEL\s*FILTER(S)?\b/.test(n) && !/\bEFI\b/.test(n)) ||
      (/\bFILTER\s*FUEL\b/.test(n) && !/\bEFI\b/.test(n))) {
    return 'Fuel Valves, Fuel Filters (Carb)';
  }

  // --- Fuel Lines, Regulators, Filters (EFI) ---
  // Expanded per Laken's call: fuel injectors, fuel rails, and regulator
  // housings are EFI-adjacent hardware even without the literal words
  // "line"/"regulator"/"pump" in the name.
  if (/\bFUEL\s*LINE(S)?\b/.test(n) ||
      (/\bFUEL\b/.test(n) && /\bREGULATOR\b/.test(n)) || // decoupled: handles "FUEL PRESSURE REGULATOR"
      /\bFUEL\s*PUMP(S)?\b/.test(n) ||
      (/\bFUEL\s*FILTER(S)?\b/.test(n) && /\bEFI\b/.test(n)) ||
      /\bFUEL\s*INJECTOR(S)?\b/.test(n) || /\bFUEL\s*RAIL(S)?\b/.test(n) ||
      /REGULATOR\s*HOUSING/.test(n) || /\bECONO\s*SEAL\b/.test(n) ||
      /\bEFI\s*LINE\b/.test(n) || /\bFUEL\s*STRAINER\b/.test(n) ||
      /\bFUEL\s*SHUT\s*OFF\b/.test(n) || /\bTANK\s*SHUT\s*OFF\b/.test(n) ||
      /CARBURETOR\s*CONVERSION.*FITTING/.test(n)) {
    return 'Fuel Lines, Regulators, Filters (EFI)';
  }

  // --- Oil Tank, Dipstick, Hoses ---
  // Expanded this round (Laken's call, dry run 2 reversal): oil coolers,
  // oil lines (not just hoses), sending units, filler/spout kits, and
  // crankcase oil screens now included alongside tank/dipstick/hose.
  if (/\bOIL\s*TANK(S)?\b/.test(n) || /\bDIPSTICK(S)?\b/.test(n) ||
      (/\bOIL\b/.test(n) && /\bHOSE(S)?\b/.test(n)) ||
      (/\bOIL\b/.test(n) && /\bLINE(S)?\b/.test(n)) ||
      /\bOIL\s*COOLER(S)?\b/.test(n) || /\bCOOLER\s*OIL\b/.test(n) ||
      /\bOIL\s*SENDING\s*UNIT/.test(n) ||
      /\bOIL\s*FILLER\b/.test(n) || /\bOIL\s*SPOUT\b/.test(n) ||
      /\bCRANKCASE\s*OIL\s*SCREEN\b/.test(n) ||
      /\bOIL\s*DRAIN\b/.test(n) ||
      (/\bOIL\b/.test(n) && /\bGAUGE\b/.test(n)) ||
      (/\bOIL\b/.test(n) && /\bPLUG\b/.test(n)) ||
      (/\bOIL\b/.test(n) && /\bFITTING\b/.test(n)) ||
      (/\bOIL\b/.test(n) && /\bFILL\b/.test(n))) {
    return 'Oil Tank, Dipstick, Hoses';
  }

  // --- Oil Filters, Filter Mounts, Oil Line Covers ---
  // Includes reversed word order (FILTER OIL, same bug class as FUEL side).
  if (/\bOIL\s*FILTER(S)?\b/.test(n) || /\bFILTER\s*OIL\b/.test(n) ||
      /\bFILTER\s*MOUNT(S)?\b/.test(n) || /\bOIL\s*LINE\s*COVER(S)?\b/.test(n)) {
    return 'Oil Filters, Filter Mounts, Oil Line Covers';
  }

  // --- Fuel/Oil Line, Clamps and Finishers ---
  // Checked AFTER the more specific fuel/oil buckets above. Per session 78's
  // hardware-noun-first lesson, CLAMP/FINISHER is the actual product noun
  // here, so it needs its own slot rather than folding into "Fuel Lines".
  if ((/\bFUEL\b/.test(n) || /\bOIL\b/.test(n)) &&
      (/\bCLAMP(S)?\b/.test(n) || /\bFINISHER(S)?\b/.test(n))) {
    return 'Fuel/Oil Line, Clamps and Finishers';
  }

  // --- Fuel/Oil Line, Clamps and Finishers (Carburetion & Fuel source) ---
  // Laken's call, dry run 3: check valves, hose clamps, vacuum hose plugs,
  // hose protectors that arrived via the carb_fuel_lines_pumps source query
  // (i.e. already living in Fuel Lines & Pumps) but don't say "fuel"/"oil"
  // explicitly. Scoped to this source only, same reasoning as the
  // fenders_body_all-scoped rule above.
  if (sourceKey === 'carb_fuel_lines_pumps' &&
      (/\bCHECK\s*VALVE\b/.test(n) || /\bHOSE\s*CLAMP(S)?\b/.test(n) ||
       /\bVACUUM\s*HOSE\b/.test(n) || /\bHOSE\s*PROTECTOR\b/.test(n) ||
       /\bHOSE\s*END\b/.test(n) || /\bBRAIDED.*HOSE\b/.test(n) ||
       /\bFUEL\s*SHARING\b/.test(n) || /\bCROSSOVER.*LINE\b/.test(n) ||
       /\bGAS\s*LINE\b/.test(n))) {
    return 'Fuel/Oil Line, Clamps and Finishers';
  }

  // --- Front Fender & Hardware ---
  if (/\bFRONT\s*FENDER(S)?\b/.test(n) || /\bFENDER\s*FRT\b/.test(n)) {
    return 'Front Fender & Hardware';
  }

  // --- Rear Fender, Struts, Hardware ---
  if (/\bREAR\s*FENDER(S)?\b/.test(n) || /\bFENDER\s*STRUT(S)?\b/.test(n) ||
      /\bFNDR\s*RR\b/.test(n) || /\bEXTENTION\s*FNDR\s*RR\b/.test(n)) {
    return 'Rear Fender, Struts, Hardware';
  }

  // --- Fender Trim ---
  if (/\bFENDER\s*TRIM\b/.test(n) || (/\bFENDER\b/.test(n) && /\bTRIM\b/.test(n))) {
    return 'Fender Trim';
  }

  // --- Fender Parts & Accessories (catch-all) ---
  // Laken's call: any bare "FENDER" match (or its "FNDR" abbreviation, or
  // old-subcategory-label trust for rows already living in Fenders or
  // Fender Parts & Accessories with no name-level fender signal at all —
  // e.g. "Easy Mount Hoop", "BRA TRAX TRI-GLD") goes to its own catch-all
  // subcategory rather than staying flagged.
  if (/\bFENDER(S)?\b/.test(n) || /\bFNDR\b/.test(n) ||
      (sourceKey === 'fenders_body_all' &&
       (row.display_subcategory === 'Fenders' || row.display_subcategory === 'Fender Parts & Accessories'))) {
    return 'Fender Parts & Accessories';
  }

  return null; // FLAG — no match, stays where it is
}

async function main() {
  const client = await pool.connect();
  try {
    const allResults = {
      classified: [],
      flagged: [],
      excluded: [],
      windshield_reroute: [],
    };

    for (const [sourceKey, query] of Object.entries(SCOPE_QUERIES)) {
      const res = await client.query(query);
      for (const row of res.rows) {
        if (isExcluded(row, sourceKey)) {
          allResults.excluded.push({ ...row, source_key: sourceKey });
          continue;
        }
        if (isWindshieldStraggler(row)) {
          allResults.windshield_reroute.push({ ...row, source_key: sourceKey });
          continue;
        }
        const sub = classify(row, sourceKey);
        if (sub) {
          allResults.classified.push({ ...row, source_key: sourceKey, new_subcategory: sub });
        } else {
          allResults.flagged.push({ ...row, source_key: sourceKey });
        }
      }
    }

    console.log(`=== DRY RUN SUMMARY ===`);
    console.log(`Classified (will write display_category='${NEW_CATEGORY}' if --apply): ${allResults.classified.length}`);
    console.log(`Windshield stragglers (will reroute to '${WINDSHIELD_CATEGORY}' if --apply): ${allResults.windshield_reroute.length}`);
    console.log(`Excluded (stays exactly where it is): ${allResults.excluded.length}`);
    console.log(`Flagged (ambiguous, stays where it is, logged for review): ${allResults.flagged.length}`);

    console.log(`\n=== WINDSHIELD STRAGGLERS (reroute to existing '${WINDSHIELD_CATEGORY}' category, sample) ===`);
    const wsSample = allResults.windshield_reroute.slice(0, 20);
    for (const r of wsSample) {
      console.log(`  [${r.id}] ${r.source_vendor} ${r.sku} (from ${r.display_category}): ${r.name}`);
    }
    if (allResults.windshield_reroute.length > 20) {
      console.log(`  ... and ${allResults.windshield_reroute.length - 20} more`);
    }

    console.log(`\n=== CLASSIFIED BY NEW SUBCATEGORY ===`);
    const bySub = {};
    for (const r of allResults.classified) {
      bySub[r.new_subcategory] = bySub[r.new_subcategory] || [];
      bySub[r.new_subcategory].push(r);
    }
    for (const [sub, rows] of Object.entries(bySub)) {
      console.log(`\n-- ${sub} (${rows.length}) --`);
      const sample = rows.slice(0, 15);
      for (const r of sample) {
        console.log(`  [${r.id}] ${r.source_vendor} ${r.sku} (from ${r.display_category}): ${r.name}`);
      }
      if (rows.length > 15) console.log(`  ... and ${rows.length - 15} more`);
    }

    console.log(`\n=== FLAGGED BY SOURCE (needs review before this can be called complete) ===`);
    const byFlagSource = {};
    for (const r of allResults.flagged) {
      byFlagSource[r.source_key] = byFlagSource[r.source_key] || [];
      byFlagSource[r.source_key].push(r);
    }
    for (const [src, rows] of Object.entries(byFlagSource)) {
      console.log(`\n-- ${src} (${rows.length}) --`);
      const sample = rows.slice(0, 20);
      for (const r of sample) {
        console.log(`  [${r.id}] ${r.source_vendor} ${r.sku} (${r.display_category} / ${r.display_subcategory || '(null)'}): ${r.name}`);
      }
      if (rows.length > 20) console.log(`  ... and ${rows.length - 20} more`);
    }

    if (APPLY) {
      console.log(`\n=== APPLYING ${allResults.classified.length} Tanks & Body updates ===`);
      let written = 0;
      for (const r of allResults.classified) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = $3`,
          [NEW_CATEGORY, r.new_subcategory, r.id]
        );
        written++;
      }
      console.log(`Wrote ${written} rows into '${NEW_CATEGORY}'.`);

      console.log(`\n=== APPLYING ${allResults.windshield_reroute.length} windshield straggler reroutes ===`);
      let wsWritten = 0;
      for (const r of allResults.windshield_reroute) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2 WHERE id = $3`,
          [WINDSHIELD_CATEGORY, WINDSHIELD_SUBCATEGORY, r.id]
        );
        wsWritten++;
      }
      console.log(`Wrote ${wsWritten} rows into '${WINDSHIELD_CATEGORY}' / '${WINDSHIELD_SUBCATEGORY}'.`);

      console.log(`\nFlagged (${allResults.flagged.length}) and excluded (${allResults.excluded.length}) rows left untouched.`);
    } else {
      console.log(`\nDry run only. Re-run with --apply to write ${allResults.classified.length} Tanks & Body rows`);
      console.log(`and reroute ${allResults.windshield_reroute.length} windshield stragglers to '${WINDSHIELD_CATEGORY}'.`);
      console.log(`NOTE: ${allResults.flagged.length} flagged rows remain — review before deciding whether to apply as-is or add more rules first.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('SCRIPT FAILED:', e);
  process.exit(1);
});
