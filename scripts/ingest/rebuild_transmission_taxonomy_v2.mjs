#!/usr/bin/env node
/**
 * rebuild_transmission_taxonomy_v2.mjs
 *
 * Transmission & Clutch — full re-spec onto Laken's finalized 17-name list
 * (2026-07-18), superseding the v1 16-subcat structure built by
 * fix_transmission_taxonomy.mjs (already live, 7,306 rows).
 *
 * Target subcategories (17):
 *   Clutch Plates | Clutch Components | Clutch Kits | Primary Inner & Outer |
 *   Derby Covers | Kickstarters | Pulley & Sprocket | Dip Sticks | Chains |
 *   Belts | Shifter Forks | Covers & Guards | Gear Sets | Rebuild Kits |
 *   Mainshaft | Bearings & Seals | General (catch-all, not on Laken's list
 *   but needed so nothing is left blank)
 *
 * "Primary- Inner & Outer" and "Inner & Outer Primary" in Laken's original
 * list were confirmed as the same bucket (typo/paste duplicate) — collapsed
 * to "Primary Inner & Outer".
 *
 * Cross-category moves confirmed with Laken before writing this script:
 *   - ~38 wheel axle spacer/kit rows (AXLE keyword, excluding kickstart
 *     pedal axles) misfiled here from a prior pass -> Wheels & Tires >
 *     Axles & Spacers (existing 842-row bucket).
 *   - ~79 specialty transmission/clutch service tools (Jims/Motorshop
 *     pullers, compressors, bearing-race tools) -> Tools & Chemicals >
 *     Engine & Drivetrain Tools (existing 257-row bucket).
 *   - Bearings & Seals here is BEARINGS/RACES only, not oil seals/gaskets —
 *     those already live in the standalone Gaskets & Seals > Transmission
 *     bucket (1,118 rows) and are left alone. The handful of loose "seal"
 *     items still in this category (~8 rows) fall through to whichever
 *     content rule matches them (e.g. "Shifter Seal Collar" -> Shifter
 *     Forks), same non-duplication precedent as session 90's Engine gasket
 *     consolidation.
 *
 * Known keyword traps handled:
 *   - "Race Series ___" (Performance Machine product line) is not a bearing
 *     race — excluded from the Bearings & Seals RACE trigger.
 *   - "___ without Bearings" (e.g. clutch hub sold minus its bearing) is
 *     excluded from the Bearings & Seals BEARING trigger.
 *   - Kickstart pedal axles ("Kick Starter Pedal and Axle Assembly") are
 *     excluded from the AXLE cross-category move — those are kickstart
 *     mechanism parts, not wheel axles, and stay in Kickstarters.
 *   - PULLEY runs before BELT so "Belt Pulley"/"Rear Pulley"/"Drive Pulley"
 *     items land in Pulley & Sprocket, not Belts (mirrors the v1 script's
 *     Mainshaft-before-Pulley lesson, same trap in reverse).
 *   - CLUTCH + COVER (e.g. "Clutch Release Cover", "Race Series Clutch
 *     Cover") is claimed by the Clutch rules before the generic Covers &
 *     Guards rule, so clutch covers don't get lumped in with transmission
 *     case/chain/sprocket covers.
 *
 * Pattern: audit -> dry run -> sample review -> apply -> reindex.
 *
 * Usage:
 *   node rebuild_transmission_taxonomy_v2.mjs                # dry run
 *   node rebuild_transmission_taxonomy_v2.mjs --sample=50     # bigger sample
 *   node rebuild_transmission_taxonomy_v2.mjs --apply          # writes rows
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
// Stage 0 — cross-category moves (checked first, remove from the pool before
// stage-1 subcategory classification runs).
// ---------------------------------------------------------------------------
const CROSS_CATEGORY_RULES = [
  {
    label: 'Wheels & Tires > Axles & Spacers',
    display_category: 'Wheels & Tires',
    display_subcategory: 'Axles & Spacers',
    test: (n) =>
      (/\bAXLES?\b/.test(n) && !/\bKICK/.test(n)) ||
      /WHEEL SPACER/.test(n) ||
      /WHEEL ADAPTER/.test(n),
  },
  {
    label: 'Wheels & Tires > Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights',
    display_category: 'Wheels & Tires',
    display_subcategory: 'Rim Strips, Valve Stems, Valve Stem Cap, Wheel Weights',
    test: (n) => /WHEEL WEIGHTS?/.test(n),
  },
  {
    label: 'Tools & Chemicals > Engine & Drivetrain Tools',
    display_category: 'Tools & Chemicals',
    display_subcategory: 'Engine & Drivetrain Tools',
    test: (n) => /\bTOOLS?\b/.test(n),
  },
  {
    // Speedometer/speedo drive gears & sensors — same precedent as the
    // session-90 sweep that consolidated speedo-related items scattered
    // across categories into Electrical > Sensors & Switches.
    label: 'Electrical > Sensors & Switches',
    display_category: 'Electrical',
    display_subcategory: 'Sensors & Switches',
    test: (n) => /SPEEDOMETER/.test(n) || /\bSPEEDO\b/.test(n),
  },
  {
    // Literal oil/lube consumable products (not oil-adjacent hardware like
    // dipsticks, funnels, deflectors, slingers, or oiler kits, which stay
    // and get classified as parts below).
    label: 'Tools & Chemicals > Engine & Motor Oil',
    display_category: 'Tools & Chemicals',
    display_subcategory: 'Engine & Motor Oil',
    test: (n) => {
      const hasOilWord = /\bOILS?\b/.test(n) || /\bLUBES?\b/.test(n) || /\bFLUIDS?\b/.test(n);
      if (!hasOilWord) return false;
      const isHardware = /(DIPSTICK|FUNNEL|DEFLECTOR|SLINGER|GUARD|PAN|PLUG|SEAL|GASKET|FILTER|KIT|CHAIN)/.test(n);
      return !isHardware;
    },
  },
  {
    // Four small (7-10 row) leftover-pile clusters confirmed with Laken as
    // genuine cross-category misfiles, not transmission parts at all.
    label: 'Frames & Suspension > Frames',
    display_category: 'Frames & Suspension',
    display_subcategory: 'Frames',
    test: (n) => /\bSTABILIZERS?\b/.test(n),
  },
  {
    label: 'Foot Controls & Pegs > Forward Control Sets',
    display_category: 'Foot Controls & Pegs',
    display_subcategory: 'Forward Control Sets',
    test: (n) => /FORWARD CONTROL/.test(n),
  },
  {
    label: 'Electrical > Sensors & Switches',
    display_category: 'Electrical',
    display_subcategory: 'Sensors & Switches',
    test: (n) => /NEUTRAL SWITCH/.test(n),
  },
  {
    label: 'Brakes > Rotors & Drums',
    display_category: 'Brakes',
    display_subcategory: 'Rotors & Drums',
    test: (n) => /\bDISC ADAPTERS?\b/.test(n) || /BRAKE ROTOR ADAPTER/.test(n),
  },
];

// ---------------------------------------------------------------------------
// Stage 1 — subcategory classification within Transmission & Clutch.
// Checked in priority order, first match wins. See header comment for the
// keyword traps each ordering decision guards against.
// ---------------------------------------------------------------------------
const RULES = [
  {
    subcategory: 'Rebuild Kits',
    test: (n) => /\bREBUILD\b/.test(n),
  },
  {
    // BRG is BAKER DRIVETRAIN's abbreviation for "Bearing" in compact names.
    subcategory: 'Bearings & Seals',
    test: (n) =>
      (/\bBEARINGS?\b/.test(n) && !/WITHOUT BEARINGS?/.test(n)) ||
      (/\bRACES?\b/.test(n) && !/RACE SERIES/.test(n)) ||
      /\bBRG\b/.test(n),
  },
  {
    // DRBY is Rekluse's abbreviation for "Derby" in compact SKU-style names
    // (e.g. "CVR DRBY GLS BK DYNA 99+").
    subcategory: 'Derby Covers',
    test: (n) => /\bDERBY\b/.test(n) || /\bDRBY\b/.test(n),
  },
  {
    subcategory: 'Clutch Kits',
    test: (n) => /\bCLUTCH\b/.test(n) && /\bKITS?\b/.test(n),
  },
  {
    subcategory: 'Clutch Plates',
    test: (n) => /\bCLUTCH\b/.test(n) && /\bPLATES?\b/.test(n),
  },
  {
    // Catch-all for remaining CLUTCH items: springs, covers, cables, levers,
    // rivets, hubs, releases, master cylinders. Must run before the generic
    // Covers & Guards rule so "Clutch Release Cover" / "Race Series Clutch
    // Cover" don't get swept into transmission-case/chain/sprocket covers.
    // PRESSURE PLATE is a clutch part even without the word "clutch" present.
    subcategory: 'Clutch Components',
    test: (n) => /\bCLUTCH\b/.test(n) || /\bPRESSURE PLATES?\b/.test(n),
  },
  {
    // Bare friction/steel plates from the old Clutch Kits & Components
    // bucket that don't repeat the word "clutch" in the name (e.g. "Steel
    // Plate - '84-'90 XL", "Drive Plate - '90-'97 Big Twin", "Aramid Fiber
    // Plates"). Scoped to the prior bucket so it doesn't grab unrelated
    // "plate" mentions elsewhere in the category.
    subcategory: 'Clutch Plates',
    test: (n, old) => old === 'Clutch Kits & Components' && /\bPLATES?\b/.test(n),
  },
  {
    subcategory: 'Dip Sticks',
    // Drain/fill plugs and plug caps are functionally bundled with dipsticks
    // in this catalog (same case-service-opening family).
    test: (n) => /\bDIP ?STICKS?\b/.test(n) || /\bDRAIN PLUGS?\b/.test(n) || /\bFILL PLUGS?\b/.test(n) || /\bPLUG CAPS?\b/.test(n),
  },
  {
    // Leading-boundary-only match (no trailing \b) catches smashed-together
    // words in compact SKU-style names: "KICKARM", "KICKPEDAL". Same for
    // START, which also catches "Kwick-Start".
    subcategory: 'Kickstarters',
    test: (n) => /\bKICK/.test(n) || /START/.test(n),
  },
  {
    // Runs before Belts/Chains/Primary so "Belt Pulley"/"Rear Pulley"/
    // "Transmission Sprocket" claim themselves before the broader rules.
    // SPRKT/SPKT are common abbreviations in compact SKU-style names (PBI,
    // HardDrive); PULLY is a recurring HardDrive misspelling. CUSH/
    // COMPENSATOR (cush-drive dampers, compensator sprocket hardware) are
    // physically part of the sprocket/pulley assembly.
    subcategory: 'Pulley & Sprocket',
    test: (n) =>
      /\bPULLEYS?\b/.test(n) ||
      /\bPULLYS?\b/.test(n) ||
      /\bSPROCKETS?\b/.test(n) ||
      /\bSPRKT\b/.test(n) ||
      /\bSPKT\b/.test(n) ||
      /\bSPRCKT\b/.test(n) ||
      /\bCUSH/.test(n) ||
      /\bCOMPENSATORS?\b/.test(n) ||
      /\bBALANCERS?\b/.test(n),
  },
  {
    // PRI CH / PRI CHN is Diamond Chain's abbreviation for "Primary Chain".
    // Bare LINK is safe to broaden to within this category — chain
    // connecting links are the only "link" products here.
    subcategory: 'Chains',
    test: (n) =>
      /\bCHAINS?\b/.test(n) ||
      /\bLINKS?\b/.test(n) ||
      /\bTENSIONERS?\b/.test(n) ||
      /\bPRI CHN?\b/.test(n),
  },
  {
    // Leading-boundary-only match catches PANTHER's smashed part-number
    // format ("BELT40012-90", "REPL BELT1 3/8W150T").
    subcategory: 'Belts',
    test: (n) => /\bBELT/.test(n),
  },
  {
    // Requires explicit PRIMARY (or SIDE COVER, which in this catalog is
    // consistently primary-case terminology per sampling) so it doesn't
    // swallow unrelated "primary" mentions.
    subcategory: 'Primary Inner & Outer',
    test: (n) => /\bPRIMARY\b/.test(n) || /\bSIDE COVERS?\b/.test(n),
  },
  {
    // CASE/DOOR cover the transmission case halves and access doors, which
    // function the same as a cover for this bucket's purposes.
    subcategory: 'Covers & Guards',
    test: (n) => /\bGUARDS?\b/.test(n) || /\bCOVERS?\b/.test(n) || /\bCASES?\b/.test(n) || /\bDOORS?\b/.test(n),
  },
  {
    // Ratchet Top is the 4-speed shift-mechanism housing/casting that sits
    // atop the transmission — shift-mechanism family, not a generic case.
    // Leading-boundary-only SHIFT catches smashed "SHIFTARM".
    subcategory: 'Shifter Forks',
    test: (n) => /\bSHIFT/.test(n) || /\bFORKS?\b/.test(n) || /\bJOCKEY\b/.test(n) || /\bRATCHET TOPS?\b/.test(n),
  },
  {
    subcategory: 'Gear Sets',
    test: (n) => /\bGEARS?\b/.test(n),
  },
  {
    subcategory: 'Mainshaft',
    // Bare TRANSMISSION is a last-resort trigger, positioned after every
    // more specific rule above already had first pick — by this point it
    // only catches genuine leftover case/assembly/shaft-system items.
    test: (n) =>
      /\bMAIN ?SHAFTS?\b/.test(n) ||
      /\bCOUNTER ?SHAFTS?\b/.test(n) ||
      /\bMAIN DRIVE\b/.test(n) ||
      /\bTRANSMISSIONS?\b/.test(n),
  },
  {
    // Last-resort fallback for the old Clutch Kits & Components bucket:
    // hubs, C-clips, release plates, pushrod kits, and a data typo
    // ("Cluctch") that have no other clean text signal but were already
    // scoped to clutch hardware by the prior classification pass.
    subcategory: 'Clutch Components',
    test: (n, old) => old === 'Clutch Kits & Components',
  },
];

const FALLBACK_SUBCATEGORY = 'General';

function classifyCrossCategory(name) {
  const n = name.toUpperCase();
  for (const rule of CROSS_CATEGORY_RULES) {
    if (rule.test(n)) return rule;
  }
  return null;
}

function classifySubcategory(name, oldSubcategory) {
  const n = name.toUpperCase();
  for (const rule of RULES) {
    if (rule.test(n, oldSubcategory)) return rule.subcategory;
  }
  return FALLBACK_SUBCATEGORY;
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, name, brand, display_subcategory AS old_subcategory
     FROM catalog_unified
     WHERE display_category = $1 AND is_active = true`,
    [CATEGORY]
  );

  console.log(`Loaded ${rows.length} active rows from ${CATEGORY}\n`);

  const crossCategoryBuckets = new Map();
  const subcategoryBuckets = new Map();
  const crossCategoryMoves = [];
  const subcategoryMoves = [];

  for (const row of rows) {
    const cross = classifyCrossCategory(row.name);
    if (cross) {
      crossCategoryBuckets.set(cross.label, (crossCategoryBuckets.get(cross.label) || 0) + 1);
      crossCategoryMoves.push({ ...row, ...cross });
      continue;
    }
    const sub = classifySubcategory(row.name, row.old_subcategory);
    subcategoryBuckets.set(sub, (subcategoryBuckets.get(sub) || 0) + 1);
    subcategoryMoves.push({ ...row, new_subcategory: sub });
  }

  console.log('=== Cross-category moves ===');
  for (const [label, count] of [...crossCategoryBuckets.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(5)}  ${label}`);
  }

  console.log('\n=== New Transmission & Clutch subcategories ===');
  for (const [sub, count] of [...subcategoryBuckets.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(5)}  ${sub}`);
  }

  if (!APPLY) {
    console.log(`\n--- Sample of ${SAMPLE_SIZE} General (fallback) rows ---`);
    const generalRows = subcategoryMoves.filter((r) => r.new_subcategory === FALLBACK_SUBCATEGORY);
    shuffle(generalRows)
      .slice(0, SAMPLE_SIZE)
      .forEach((r) => console.log(`  ${r.name}  [${r.brand}]  (was: ${r.old_subcategory})`));

    console.log(`\nDry run only. Re-run with --apply to write changes.`);
    await pool.end();
    return;
  }

  console.log('\nApplying changes...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_unified_backup_transmission_v2_20260718 AS
      SELECT id, display_category, display_subcategory
      FROM catalog_unified
      WHERE display_category = $1 AND is_active = true
    `, [CATEGORY]);

    for (const move of crossCategoryMoves) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, updated_at = now() WHERE id = $3`,
        [move.display_category, move.display_subcategory, move.id]
      );
    }

    for (const move of subcategoryMoves) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory = $1, updated_at = now() WHERE id = $2`,
        [move.new_subcategory, move.id]
      );
    }

    await client.query('COMMIT');
    console.log(`Applied: ${crossCategoryMoves.length} cross-category moves, ${subcategoryMoves.length} subcategory assignments.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rolled back due to error:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
