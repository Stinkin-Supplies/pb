#!/usr/bin/env node
/**
 * audit_engine_footcontrols_general.mjs
 *
 * Full-read audit of Engine's General (30 rows) and Foot Controls & Pegs'
 * General (34 rows) leftover buckets -- same treatment as the Fuel, Air &
 * Carburetors General audit: hand-verified moves for anything with a real
 * home, remaining genuine stragglers pushed to the catalog_review_flags
 * admin review queue instead of left silent.
 *
 * Usage:
 *   node scripts/ingest/audit_engine_footcontrols_general.mjs            # dry run
 *   node scripts/ingest/audit_engine_footcontrols_general.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// [id, destCategory, destSubcategory, reason]
const MOVES = [
  // Engine
  [59332, 'Engine', 'Bottom End', 'Crankcase case set for a 45"/WL flathead motor'],
  [59393, 'Engine', 'Bottom End', 'Crankcase case set for a Shovelhead motor'],
  [58956, 'Gaskets & Seals', 'Engine', 'Cometic "T/E KIT ... H/G" = Top End gasket Kit w/ head gasket'],
  [39629, 'Engine', 'Cam Chest', 'HOT CAMS is a camshaft brand -- this is a cam installation kit'],
  [569, 'Engine', 'Oil Pump & System', 'Oil pump strainer screen separator plate'],
  [84293, 'Engine', 'Oil Pump & System', 'Plunger/ball/spring is an oil pump check-valve assembly'],
  // Foot Controls & Pegs
  [55650, 'Foot Controls & Pegs', 'Shifter Lever, Shaft & Hardware', 'SANTORO "Shifter" product'],
  [55651, 'Foot Controls & Pegs', 'Shifter Lever, Shaft & Hardware', 'SANTORO "Shifter" product'],
  [88870, 'Foot Controls & Pegs', 'Floorboard Mounts, Bracket, Hardware', 'Heel rest bracket pairs with floorboards'],
  [13622, 'Foot Controls & Pegs', 'Highway Bars & Pegs', 'Highway peg clamp, same family as the kept Highway Bars & Pegs bucket'],
  [68004, 'Foot Controls & Pegs', 'Accessories', 'Replacement rubber pad, small trim accessory'],
  [68008, 'Foot Controls & Pegs', 'Accessories', 'Replacement rubber pad, small trim accessory'],
  [20982, 'Foot Controls & Pegs', 'Shifter Lever, Shaft & Hardware', 'Shifter spline cover'],
  [36388, 'Foot Controls & Pegs', 'Shifter Lever, Shaft & Hardware', 'Shifter spline cover'],
  [67959, 'Foot Controls & Pegs', 'Foot Pegs & Passenger Peg', 'Heel stirrup peg accessory'],
  [67960, 'Foot Controls & Pegs', 'Foot Pegs & Passenger Peg', 'Heel stirrup peg accessory'],
  [11429, 'Foot Controls & Pegs', 'Shifter Lever, Shaft & Hardware', 'Typo "Shfiter Arm" -- shifter arm, missed by the original rebuild regex'],
  [7705, 'Foot Controls & Pegs', 'Highway Bars & Pegs', 'Engine guard clamp, same family as the kept Highway Bars & Pegs bucket'],
  [51137, 'Foot Controls & Pegs', 'Accessories', 'FLO Motorsports peg-tip trim accessory'],
  [53285, 'Foot Controls & Pegs', 'Accessories', 'FLO Motorsports peg-tip trim accessory'],
  [51140, 'Foot Controls & Pegs', 'Accessories', 'FLO Motorsports peg-tip trim accessory'],
  [51139, 'Foot Controls & Pegs', 'Accessories', 'FLO Motorsports peg-tip trim accessory'],
  [51141, 'Foot Controls & Pegs', 'Accessories', 'FLO Motorsports peg-tip trim accessory'],
  [51138, 'Foot Controls & Pegs', 'Accessories', 'FLO Motorsports peg-tip trim accessory'],
];

// [id, notes] -- genuine stragglers, pushed to review queue instead of left silent
const STRAGGLERS = [
  [94017, 'Engine', 'Bell Crank -- ambiguous linkage part, no system named'],
  [70786, 'Engine', 'Blank ignition/switch key set -- possibly Electrical, not confident enough to move'],
  [90123, 'Engine', '"Brush End Outer Oil Retainer" -- ambiguous between generator (Electrical) and engine seal (Gaskets & Seals)'],
  [95015, 'Engine', '"ULH Retainer Clip" -- unclear what ULH abbreviates, possibly a valve keeper'],
  [83271, 'Engine', 'Generic cast kit, no system named'],
  [3436, 'Engine', '"Exhaust Studs" -- ambiguous between Engine (cylinder head studs) and Exhaust category'],
  [79909, 'Engine', 'Generic reinforcement ring, no system named'],
  [59253, 'Engine', 'Generic cast tab set, no system named'],
  [82037, 'Engine', '"MACHINING PROCESS" -- reads like a broken/incomplete product name, not a real part'],
  [14625, 'Engine', 'Generic plate separator, no system named'],
  [64295, 'Engine', 'Generic support plate, no system named'],
  [95200, 'Engine', 'Generic pivot lock plate, no system named'],
  [79751, 'Engine', 'Bare "Rebuild Kit" with zero descriptor'],
  [82663, 'Engine', 'Bare "Rebuild Kit" with zero descriptor'],
  [78510, 'Engine', 'Generic replacement tube, no system named'],
  [60247, 'Engine', 'Bare "RETAINER, STEEL" with zero descriptor'],
  [61316, 'Engine', 'Bare "RETAINING RING" with zero descriptor'],
  [95197, 'Engine', 'Generic rod pivot retainer plate, could be shift linkage or connecting rod'],
  [68062, 'Engine', 'Generic splash guard, no system named'],
  [83223, 'Engine', 'Generic support rod mount kit, no system named'],
  [90458, 'Engine', 'Generic T-stud retainer, no system named'],
  [90075, 'Engine', '"Wick and Holder" -- ambiguous between cam-lube wick (Cam Chest) and distributor wick (Electrical)'],
  [79752, 'Engine', 'Generic clevis pin, no system named'],
  [95016, 'Engine', 'Same "ULH Retainer Clip" ambiguity as above'],
  [2630, 'Foot Controls & Pegs', 'Generic "Conversion Mount," no system named'],
  [5097, 'Foot Controls & Pegs', '"Foot Control Kit" with no Mid/Forward qualifier -- genuinely ambiguous which bucket'],
  [26375, 'Foot Controls & Pegs', 'Same Foot Control Kit ambiguity'],
  [43376, 'Foot Controls & Pegs', 'Rebuild kit referencing an unlabeled part number'],
  [14003, 'Foot Controls & Pegs', 'Generic "Replacement Mounting Bracket," no system named'],
  [5187, 'Foot Controls & Pegs', 'Same Foot Control Kit ambiguity (SpeedLiner Solo)'],
  [5004, 'Foot Controls & Pegs', 'Same Foot Control Kit ambiguity (SpeedLiner Solo)'],
  [21286, 'Foot Controls & Pegs', 'Same Foot Control Kit ambiguity (SpeedLiner Solo)'],
  [67332, 'Foot Controls & Pegs', '"Finger Lever Control Set" -- ambiguous between Shifter Lever and Brake Arm & Pedals'],
  [67330, 'Foot Controls & Pegs', 'Same Finger Lever Control ambiguity'],
  [67334, 'Foot Controls & Pegs', 'Same Finger Lever Control ambiguity'],
  [67331, 'Foot Controls & Pegs', 'Same Finger Lever Control ambiguity'],
  [67333, 'Foot Controls & Pegs', 'Same Finger Lever Control ambiguity'],
  [67335, 'Foot Controls & Pegs', 'Same Finger Lever Control ambiguity'],
  [68327, 'Foot Controls & Pegs', 'Bare "Top Bushing Set" with zero descriptor'],
  [68640, 'Foot Controls & Pegs', 'Generic side mount bracket, no system named'],
];

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Moves staged: ${MOVES.length}`);
    for (const [id, cat, subcat, reason] of MOVES) console.log(`  ${id} -> ${cat}/${subcat} (${reason})`);
    console.log(`\nStragglers to flag: ${STRAGGLERS.length}`);
    for (const [id, cat, notes] of STRAGGLERS) console.log(`  ${id} [${cat}] ${notes}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    for (const [id, cat, subcat] of MOVES) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, display_subcategory_detail = NULL WHERE id = $3`,
        [cat, subcat, id]
      );
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS catalog_review_flags (
        id           SERIAL PRIMARY KEY,
        product_id   INT NOT NULL,
        flag_type    TEXT NOT NULL,
        flag_notes   TEXT,
        flagged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        resolved     BOOLEAN NOT NULL DEFAULT false,
        resolved_at  TIMESTAMPTZ,
        CONSTRAINT catalog_review_flags_product_flag UNIQUE (product_id, flag_type)
      )
    `);
    for (const [id, cat, notes] of STRAGGLERS) {
      await client.query(
        `INSERT INTO catalog_review_flags (product_id, flag_type, flag_notes)
         VALUES ($1, 'wrong_subcategory', $2)
         ON CONFLICT (product_id, flag_type)
         DO UPDATE SET flag_notes = EXCLUDED.flag_notes, flagged_at = now(), resolved = false, resolved_at = NULL`,
        [id, `[${cat}] ${notes}`]
      );
    }
    await client.query('COMMIT');
    console.log(`\nApplied ${MOVES.length} moves + ${STRAGGLERS.length} review flags. Committed.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
