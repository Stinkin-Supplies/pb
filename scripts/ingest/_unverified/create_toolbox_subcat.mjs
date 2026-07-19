#!/usr/bin/env node
/**
 * create_toolbox_subcat.mjs
 *
 * Laken's finding: Tools & Chemicals > Tools has a distinct cluster of
 * on-bike mounted toolboxes (vintage rigid-frame-style, bolt to the
 * frame/fender) plus their mounting hardware (brackets, mount kits, cross
 * brackets, wing nuts, keys, lock assemblies) -- these are vehicle-mounted
 * storage, not hand tools. Full read of all 1,001 "Tools" rows confirmed
 * this is the only miscategorized cluster in that subcategory; everything
 * else (Motion Pro, Motorshop, Jims, Performance Tool, engine stands, tire
 * tools, diagnostic tools, tie-downs, tapes) is genuinely correct.
 *
 * Moves to a NEW subcategory "Tool Boxes & Mounts" under the
 * "Saddlebags, Sissy Bars & Luggage" tier-1 category (cross-category move,
 * same pattern as the Handlebar Bags -> Windshields & Fairings move in
 * session 89).
 *
 * Soft-sided tool rolls/bags/pouches (Nelson-Rigg, Pac-Kit, Performance
 * Tool, SP1, V-Twin Canvas/Nylon/Soft Leather Tool Roll) are DELIBERATELY
 * excluded per Laken's call -- different product type (tool-carrying
 * accessory, not vehicle-mounted hardware), stay in Tools. The "tool box"
 * match pattern naturally excludes them since none say "box".
 *
 * Usage:
 *   node scripts/ingest/create_toolbox_subcat.mjs            # dry run
 *   node scripts/ingest/create_toolbox_subcat.mjs --apply    # live write
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const NEW_CATEGORY = 'Saddlebags, Sissy Bars & Luggage';
const NEW_SUBCAT = 'Tool Boxes & Mounts';

async function main() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, brand, name FROM catalog_unified
      WHERE is_active = true AND display_category = 'Tools & Chemicals' AND display_subcategory = 'Tools'
        AND (name ~* 'tool\\s*box')
      ORDER BY brand, name`);

    console.log(`Rows moving to ${NEW_CATEGORY} > ${NEW_SUBCAT}: ${rows.length}\n`);
    const byBrand = {};
    rows.forEach(r => byBrand[r.brand] = (byBrand[r.brand] || 0) + 1);
    Object.entries(byBrand).sort((a, b) => b[1] - a[1]).forEach(([b, c]) => console.log(`  ${c.toString().padStart(4)}  ${b}`));

    console.log('\nFull listing:');
    rows.forEach(r => console.log(`  [${r.brand}] ${r.name}`));

    if (!APPLY) {
      console.log('\nDRY RUN — no changes written. Re-run with --apply to commit.');
      return;
    }

    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(`UPDATE catalog_unified SET display_category = $1, display_subcategory = $2, display_subcategory_detail = NULL WHERE id = $3`,
        [NEW_CATEGORY, NEW_SUBCAT, r.id]);
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
