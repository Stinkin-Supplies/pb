#!/usr/bin/env node
/**
 * create_plain_handlebar_subcat.mjs
 *
 * Session-89 follow-up #2: Laken wants the "indeterminable" handlebars --
 * complete bars with no discernible style (no ape/Z/T/drag/moto/replica
 * signal in the name) -- broken out of the Hardware & Accessories catch-all
 * into their own proper subcategory, "Plain Handlebar", as a peer to Ape
 * Hangers/Z-Bars/T-Bars/Drag Style Bars/Moto Style/Replica Handlebars
 * rather than buried as a detail tag inside an accessories bucket.
 *
 * This is exactly the row set already tagged
 * display_subcategory_detail = 'Handlebars' inside Hardware & Accessories
 * (307 rows as of the last rebuild) -- moving them out is a straight
 * subcategory reassignment, no reclassification needed.
 *
 * Usage:
 *   node scripts/ingest/create_plain_handlebar_subcat.mjs            # dry run
 *   node scripts/ingest/create_plain_handlebar_subcat.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const CATEGORY = 'Handlebars & Hand Controls';

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = $1 AND display_subcategory = 'Hardware & Accessories'
        AND display_subcategory_detail = 'Handlebars'
      ORDER BY brand, name`, [CATEGORY]);

    console.log(`Rows moving to new "Plain Handlebar" subcategory: ${rows.length}\n`);
    const byBrand = {};
    rows.forEach(r => byBrand[r.brand] = (byBrand[r.brand] || 0) + 1);
    Object.entries(byBrand).sort((a, b) => b[1] - a[1]).forEach(([b, c]) => console.log(`  ${c.toString().padStart(4)}  ${b}`));

    console.log('\nSample (20):');
    rows.slice(0, 20).forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(`UPDATE catalog_unified SET display_subcategory = $1, display_subcategory_detail = NULL WHERE id = $2`,
        ['Plain Handlebar', r.id]);
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
