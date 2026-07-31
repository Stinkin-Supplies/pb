#!/usr/bin/env node
/**
 * fix_null_subcategory_transmission.mjs
 *
 * Transmission & Clutch has 88 active rows with display_subcategory IS NULL
 * -- never classified by rebuild_transmission_taxonomy_v2.mjs (which already
 * ran once, 2026-07-18, and fully classified the other 7,306 active rows).
 * Re-running that script wholesale would rewrite all 7,306 already-good rows
 * to fix these 88, so this reuses its classification rules verbatim but
 * scopes the query to WHERE display_subcategory IS NULL only.
 *
 * Usage:
 *   node scripts/ingest/fix_null_subcategory_transmission.mjs            # dry run
 *   node scripts/ingest/fix_null_subcategory_transmission.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const CATEGORY = 'Transmission & Clutch';

// Verbatim from rebuild_transmission_taxonomy_v2.mjs
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
    label: 'Electrical > Sensors & Switches',
    display_category: 'Electrical',
    display_subcategory: 'Sensors & Switches',
    test: (n) => /SPEEDOMETER/.test(n) || /\bSPEEDO\b/.test(n),
  },
  {
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

const RULES = [
  { subcategory: 'Rebuild Kits', test: (n) => /\bREBUILD\b/.test(n) },
  {
    subcategory: 'Bearings & Seals',
    test: (n) =>
      (/\bBEARINGS?\b/.test(n) && !/WITHOUT BEARINGS?/.test(n)) ||
      (/\bRACES?\b/.test(n) && !/RACE SERIES/.test(n)) ||
      /\bBRG\b/.test(n),
  },
  { subcategory: 'Derby Covers', test: (n) => /\bDERBY\b/.test(n) || /\bDRBY\b/.test(n) },
  { subcategory: 'Clutch Kits', test: (n) => /\bCLUTCH\b/.test(n) && /\bKITS?\b/.test(n) },
  { subcategory: 'Clutch Plates', test: (n) => /\bCLUTCH\b/.test(n) && /\bPLATES?\b/.test(n) },
  { subcategory: 'Clutch Components', test: (n) => /\bCLUTCH\b/.test(n) || /\bPRESSURE PLATES?\b/.test(n) },
  {
    subcategory: 'Clutch Plates',
    test: (n, old) => old === 'Clutch Kits & Components' && /\bPLATES?\b/.test(n),
  },
  {
    subcategory: 'Dip Sticks',
    test: (n) => /\bDIP ?STICKS?\b/.test(n) || /\bDRAIN PLUGS?\b/.test(n) || /\bFILL PLUGS?\b/.test(n) || /\bPLUG CAPS?\b/.test(n),
  },
  { subcategory: 'Kickstarters', test: (n) => /\bKICK/.test(n) || /START/.test(n) },
  {
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
    subcategory: 'Chains',
    test: (n) => /\bCHAINS?\b/.test(n) || /\bLINKS?\b/.test(n) || /\bTENSIONERS?\b/.test(n) || /\bPRI CHN?\b/.test(n),
  },
  { subcategory: 'Belts', test: (n) => /\bBELT/.test(n) },
  { subcategory: 'Primary Inner & Outer', test: (n) => /\bPRIMARY\b/.test(n) || /\bSIDE COVERS?\b/.test(n) },
  { subcategory: 'Covers & Guards', test: (n) => /\bGUARDS?\b/.test(n) || /\bCOVERS?\b/.test(n) || /\bCASES?\b/.test(n) || /\bDOORS?\b/.test(n) },
  { subcategory: 'Shifter Forks', test: (n) => /\bSHIFT/.test(n) || /\bFORKS?\b/.test(n) || /\bJOCKEY\b/.test(n) || /\bRATCHET TOPS?\b/.test(n) },
  { subcategory: 'Gear Sets', test: (n) => /\bGEARS?\b/.test(n) },
  {
    subcategory: 'Mainshaft',
    test: (n) => /\bMAIN ?SHAFTS?\b/.test(n) || /\bCOUNTER ?SHAFTS?\b/.test(n) || /\bMAIN DRIVE\b/.test(n) || /\bTRANSMISSIONS?\b/.test(n),
  },
  { subcategory: 'Clutch Components', test: (n, old) => old === 'Clutch Kits & Components' },
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
    `SELECT id, name, brand FROM catalog_unified
     WHERE display_category = $1 AND is_active = true AND display_subcategory IS NULL`,
    [CATEGORY]
  );
  console.log(`Loaded ${rows.length} NULL-subcategory active rows from ${CATEGORY}\n`);

  const crossMoves = [];
  const subMoves = [];
  const tally = {};

  for (const row of rows) {
    const cross = classifyCrossCategory(row.name);
    if (cross) {
      crossMoves.push({ ...row, ...cross });
      const label = `-> ${cross.display_category} / ${cross.display_subcategory}`;
      tally[label] = (tally[label] || 0) + 1;
      continue;
    }
    const sub = classifySubcategory(row.name, null);
    subMoves.push({ ...row, new_subcategory: sub });
    tally[sub] = (tally[sub] || 0) + 1;
  }

  console.log('=== Classification tally ===');
  for (const [label, count] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)}  ${label}`);
  }

  console.log(`\n=== Rows landing in General (fallback) ===`);
  subMoves.filter((r) => r.new_subcategory === 'General').forEach((r) => console.log(`  ${r.name}`));

  if (!APPLY) {
    console.log(`\nDry run only. Re-run with --apply to write changes.`);
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_unified_backup_transmission_nullfix_20260730 AS
      SELECT id, display_category, display_subcategory FROM catalog_unified WHERE id = ANY($1::int[])
    `, [rows.map((r) => r.id)]);

    for (const move of crossMoves) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, updated_at = now() WHERE id = $3`,
        [move.display_category, move.display_subcategory, move.id]
      );
    }
    for (const move of subMoves) {
      await client.query(
        `UPDATE catalog_unified SET display_subcategory = $1, updated_at = now() WHERE id = $2`,
        [move.new_subcategory, move.id]
      );
    }
    await client.query('COMMIT');
    console.log(`\nApplied: ${crossMoves.length} cross-category moves, ${subMoves.length} subcategory assignments. Backup: catalog_unified_backup_transmission_nullfix_20260730`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Rolled back due to error:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
