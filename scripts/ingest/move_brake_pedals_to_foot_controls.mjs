#!/usr/bin/env node
/**
 * move_brake_pedals_to_foot_controls.mjs
 *
 * Laken's ask: pull "Brake Pedals & Pads" out of the Brakes top-level
 * category -- it's entirely foot-operated brake arm/pedal/lever hardware
 * (brake arms, pedals, pedal pads/covers, brake linkage), the exact same
 * product family as Foot Controls & Pegs / Brake Arm & Pedals (built in
 * this session's Foot Controls rebuild). Consolidates into that existing
 * bucket rather than leaving a duplicate home in two top-level categories.
 *
 * Usage:
 *   node scripts/ingest/move_brake_pedals_to_foot_controls.mjs            # dry run
 *   node scripts/ingest/move_brake_pedals_to_foot_controls.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT id, name FROM catalog_unified WHERE is_active = true AND display_category = 'Brakes' AND display_subcategory = 'Brake Pedals & Pads'`
    );
    console.log(`Rows to move: ${res.rows.length}`);
    for (const r of res.rows.slice(0, 10)) console.log(`  ${r.name}`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE catalog_unified SET display_category = 'Foot Controls & Pegs', display_subcategory = 'Brake Arm & Pedals', display_subcategory_detail = NULL
       WHERE is_active = true AND display_category = 'Brakes' AND display_subcategory = 'Brake Pedals & Pads'`
    );
    await client.query('COMMIT');
    console.log(`\nMoved ${result.rowCount} rows. Committed.`);
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
