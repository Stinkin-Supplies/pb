// fix_security_covers.mjs
// Reclassifies Security & Covers' 36 NULL rows per session-84 analysis.
//
// DRY RUN (default): node fix_security_covers.mjs > output.txt 2>&1
// APPLY:             node fix_security_covers.mjs --apply > output.txt 2>&1

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

const FP_ELITE_COVERS = [55993,55994,55995,55996,55997,55991,55992,55998,55999];
const PHONE_MOUNTS = [56823, 56826];
const TRANS_COVERS = [42262,42261,42263,42265,42264];

const STRAYS = [
  { id: 58490, cat: 'Brakes', sub: 'Brake Hardware' }, // Reservoir Cover Chrome FLT
  { id: 51861, cat: 'Foot Controls', sub: 'Kickstands' }, // Side Stand Switch Cover
  { id: 57226, cat: 'Tanks & Body', sub: 'Fender Parts & Accessories' }, // Carbon Fiber FXR Side Covers
  { id: 57222, cat: 'Tanks & Body', sub: 'Fender Parts & Accessories' }, // Carbon Fiber Side Covers
  { id: 54482, cat: 'Tanks & Body', sub: 'Oil Tank, Dipstick, Hoses' }, // Carbon Fiber Oil Cooler Cover
];

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);
  const client = await pool.connect();
  try {
    if (APPLY) await client.query('BEGIN');

    async function idListUpdate(label, ids, newCat, newSub) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified WHERE id = ANY($1::int[]) AND is_active = true AND display_subcategory IS NULL`,
        [ids]
      );
      const foundIds = checkRes.rows.map((r) => r.id);
      const missing = ids.filter((id) => !foundIds.includes(id));
      console.log(`--- ${label}: expected ${ids.length}, found ${foundIds.length} ---`);
      if (missing.length) console.log(`  MISSING/ALREADY-CHANGED (skipped): ${missing.join(', ')}`);
      if (foundIds.length && APPLY) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = ANY($1::int[])`,
          [foundIds, newCat, newSub]
        );
      }
      console.log(`  ${APPLY ? 'updated' : 'would update'} ${foundIds.length} -> category="${newCat}" subcategory="${newSub}"\n`);
    }

    async function categoryUpdate(label, vendorCat, newCat, newSub) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified
         WHERE is_active = true AND display_category = 'Security & Covers'
           AND display_subcategory IS NULL AND category = $1`,
        [vendorCat]
      );
      console.log(`--- ${label}: ${checkRes.rows.length} rows ---`);
      if (checkRes.rows.length && APPLY) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = ANY($1::int[])`,
          [checkRes.rows.map((r) => r.id), newCat, newSub]
        );
      }
      console.log(`  ${APPLY ? 'updated' : 'would update'} -> category="${newCat}" subcategory="${newSub}"\n`);
    }

    await categoryUpdate('Security -> Security & Covers/Security', 'Security', 'Security & Covers', 'Security');
    await idListUpdate('FP Elite Series Covers -> Bike Covers', FP_ELITE_COVERS, 'Security & Covers', 'Bike Covers');
    await idListUpdate('Tough Lock Phone Mounts -> Handlebar & Controls', PHONE_MOUNTS, 'Handlebar & Controls', 'Risers, Clamps & Components');
    await idListUpdate('Trans End/Top Covers -> Transmission Covers & Dipsticks', TRANS_COVERS, 'Transmission & Clutch', 'Transmission Covers & Dipsticks');

    console.log('--- Individual part strays ---');
    for (const s of STRAYS) {
      const checkRes = await client.query(
        `SELECT id FROM catalog_unified WHERE id = $1 AND is_active = true AND display_subcategory IS NULL`,
        [s.id]
      );
      if (checkRes.rows.length === 0) {
        console.log(`  [${s.id}] MISSING/ALREADY-CHANGED (skipped)`);
        continue;
      }
      if (APPLY) {
        await client.query(
          `UPDATE catalog_unified SET display_category = $2, display_subcategory = $3 WHERE id = $1`,
          [s.id, s.cat, s.sub]
        );
      }
      console.log(`  [${s.id}] ${APPLY ? 'updated' : 'would update'} -> category="${s.cat}" subcategory="${s.sub}"`);
    }
    console.log('');

    if (APPLY) {
      await client.query('COMMIT');
      console.log('=== COMMITTED ===');
    } else {
      console.log('=== DRY RUN COMPLETE — no changes made. Re-run with --apply to execute. ===');
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
