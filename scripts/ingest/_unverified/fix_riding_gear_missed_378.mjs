// fix_riding_gear_missed_378.mjs
// Reclassifies the 378 rows (vendor category "Riding Gear" + null + "HELMET AND
// SHIELD") missed during the original Helmets/Apparel/Accessories triage, session 84.
// Includes a final unmatched-check so nothing silently slips through this time.
//
// DRY RUN (default): node fix_riding_gear_missed_378.mjs > output.txt 2>&1
// APPLY:             node fix_riding_gear_missed_378.mjs --apply > output.txt 2>&1

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set — check .env location/name.');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const SCOPE = `category = 'Riding Gear' OR category IS NULL`;

// Order matters — first match wins.
const PATTERNS = [
  { label: 'Crash bars/engine guards/hand guards -> Foot Controls/Highway Bars & Pegs',
    pattern: `(ENGINE\\s*GUARD|CRASH\\s*BAR|CRASHBAR|BAG\\s*GUARD|HAND\\s*GUARD|CHAIN\\s*GUARD|RESERVOIR\\s*GUARD|X-FORCE\\s*REPLACEMENT\\s*MOUNTING\\s*KIT)`,
    cat: 'Foot Controls', sub: 'Highway Bars & Pegs' },
  { label: 'Whole helmets -> Riding Gear & Apparel/Helmets',
    pattern: `HELMET`,
    cat: 'Riding Gear & Apparel', sub: 'Helmets' },
  { label: 'Gloves',
    pattern: `GLOVE`,
    cat: 'Riding Gear & Apparel', sub: 'Gloves' },
  { label: 'Sunglasses/goggles -> Accessories',
    pattern: `(SUNGLASS|GOGGLE|GLASSES)`,
    cat: 'Riding Gear & Apparel', sub: 'Accessories' },
  { label: 'Armor -> Accessories',
    pattern: `ARMOR`,
    cat: 'Riding Gear & Apparel', sub: 'Accessories' },
];

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const client = await pool.connect();
  try {
    if (APPLY) await client.query('BEGIN');

    // HELMET AND SHIELD -> Helmet Accessories & Parts (separate vendor category, 1 row)
    const hasRes = await client.query(
      `SELECT id FROM catalog_unified
       WHERE is_active = true AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL AND category = 'HELMET AND SHIELD'`
    );
    console.log(`--- HELMET AND SHIELD -> Helmet Accessories & Parts: ${hasRes.rows.length} rows ---`);
    if (hasRes.rows.length && APPLY) {
      await client.query(
        `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = ANY($1::int[])`,
        [hasRes.rows.map((r) => r.id), 'Riding Gear & Apparel', 'Helmet Accessories & Parts']
      );
    }
    console.log(`  ${APPLY ? 'updated' : 'would update'} -> subcategory="Helmet Accessories & Parts"\n`);

    for (const p of PATTERNS) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified
         WHERE is_active = true AND display_category = 'Riding Gear & Apparel'
           AND display_subcategory IS NULL AND (${SCOPE})
           AND name ~* $1`,
        [p.pattern]
      );
      console.log(`--- ${p.label}: ${checkRes.rows.length} rows ---`);
      if (checkRes.rows.length && APPLY) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = ANY($1::int[])`,
          [checkRes.rows.map((r) => r.id), p.cat, p.sub]
        );
      }
      console.log(`  ${APPLY ? 'updated' : 'would update'} -> category="${p.cat}" subcategory="${p.sub}"\n`);
    }

    // Final unmatched-check — should be 0 (dry-run: nothing removed yet, so this will
    // show the leftover only in --apply mode where prior UPDATEs already committed)
    const unmatchedRes = await client.query(
      `SELECT id, name FROM catalog_unified
       WHERE is_active = true AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL AND (${SCOPE})`
    );
    console.log(`--- UNMATCHED remainder: ${unmatchedRes.rows.length} ---`);
    for (const row of unmatchedRes.rows) {
      console.log(`  [${row.id}] ${row.name}`);
    }

    if (APPLY) {
      await client.query('COMMIT');
      console.log('\n=== COMMITTED ===');
    } else {
      console.log('\n=== DRY RUN COMPLETE — no changes made. Re-run with --apply to execute. ===');
    }
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK');
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
