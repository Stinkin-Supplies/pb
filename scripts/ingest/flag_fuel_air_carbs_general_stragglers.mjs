#!/usr/bin/env node
/**
 * flag_fuel_air_carbs_general_stragglers.mjs
 *
 * Pushes the 9 genuine stragglers left in Fuel, Air & Carburetors/General
 * after the full-read audit (scripts/ingest/audit_fuel_air_carbs_general.mjs)
 * into the admin review queue (catalog_review_flags table, same one used
 * for the 47 flagged Hardware leftovers in session 87) instead of leaving
 * them as a silent leftover pile. Additive -- does not touch
 * display_category/display_subcategory, just flags each row for a human
 * to make the final call.
 *
 * Usage:
 *   node scripts/ingest/flag_fuel_air_carbs_general_stragglers.mjs            # dry run
 *   node scripts/ingest/flag_fuel_air_carbs_general_stragglers.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const STRAGGLERS = [
  [51184, 'No clear signal in the name for which of the 17 Fuel/Air/Carb buckets this belongs in (compression-related cap, ambiguous whether Engine or Carburetor).'],
  [75184, 'Bare generic spacer, no system/part-family named -- could be almost any bucket.'],
  [34349, 'Generic hose clamp, unclear whether it belongs with Fuel Filters (fuel line hardware) or Manifold (clamps).'],
  [75968, 'Cap for an unspecified part number (38-0176) -- no other signal to classify against.'],
  [36282, 'Generic hardware adapter, no system named.'],
  [44294, '"Tank Seal" with no further context -- could be a carb float-bowl seal or a fuel-tank seal (Tanks & Body).'],
  [76362, '"Weld-In Gas EFI Plate" -- ambiguous between Manifold and a Modules/EFI-adjacent bucket.'],
  [46908, '"Deluxe Auxiliary Tank" -- borderline whether this belongs in this category at all vs. Tanks & Body.'],
  [47455, 'Product name reads like a truncated fitment note ("ALL TWIN CAM & FUEL INJECTED EVO MODELS") with the actual product type missing -- looks like a data-quality issue, not a categorization one.'],
];

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Flagging ${STRAGGLERS.length} rows for review (flag_type: wrong_subcategory)`);
    for (const [id, notes] of STRAGGLERS) console.log(`  ${id}: ${notes}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
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

    let count = 0;
    for (const [id, notes] of STRAGGLERS) {
      await client.query(
        `INSERT INTO catalog_review_flags (product_id, flag_type, flag_notes)
         VALUES ($1, $2, $3)
         ON CONFLICT (product_id, flag_type)
         DO UPDATE SET flag_notes = EXCLUDED.flag_notes, flagged_at = now(), resolved = false, resolved_at = NULL`,
        [id, 'wrong_subcategory', notes]
      );
      count++;
    }
    console.log(`\nFlagged ${count} rows.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
