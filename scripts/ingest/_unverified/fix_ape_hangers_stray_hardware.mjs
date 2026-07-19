#!/usr/bin/env node
/**
 * fix_ape_hangers_stray_hardware.mjs
 *
 * Two standalone hardware items (not complete handlebars) Laken spotted
 * still sitting in Ape Hangers: MCM "Throttle by Wire Handlebar Plug" and
 * MCM "1 inch Handlebar Sleeve Raw Steel" -- a bar-end plug and a raw
 * sleeve stock piece, same product type as the "Skull Handlebar End Plug
 * Set" and "Throttle Sleeve" items already correctly sitting in Hardware &
 * Accessories > Hardware & Fasteners / Throttle Components. Full re-audit
 * of the remaining 999 Ape Hangers rows (excluding Fat Baggers) turned up
 * nothing else matching a hardware signal.
 *
 * Usage:
 *   node scripts/ingest/fix_ape_hangers_stray_hardware.mjs            # dry run
 *   node scripts/ingest/fix_ape_hangers_stray_hardware.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const FIXES = [
  { match: /throttle by wire handlebar plug/i, detail: 'Throttle Components' },
  { match: /handlebar sleeve/i, detail: 'Hardware & Fasteners' },
];

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = 'Handlebars & Hand Controls' AND display_subcategory = 'Ape Hangers'
        AND brand = 'MCM'`);

    const toMove = [];
    for (const r of rows) {
      const fix = FIXES.find(f => f.match.test(r.name));
      if (fix) toMove.push({ ...r, detail: fix.detail });
    }

    console.log(`Rows moving Ape Hangers -> Hardware & Accessories (${toMove.length}):`);
    toMove.forEach(r => console.log(`  [${r.brand}] ${r.name} -> ${r.detail}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');
    for (const r of toMove) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = $2 WHERE id = $3`,
        ['Hardware & Accessories', r.detail, r.id]);
    }
    await client.query('COMMIT');
    console.log('\nDone. All updates applied.');
    console.log('\nNEXT STEP: node scripts/ingest/index_unified.js --recreate');
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK');
    console.error('ERROR:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
