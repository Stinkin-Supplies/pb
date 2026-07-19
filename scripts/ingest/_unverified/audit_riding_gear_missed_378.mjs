// audit_riding_gear_missed_378.mjs
// READ-ONLY. Full dump of the 378 rows (vendor category "Riding Gear" + null + 
// "HELMET AND SHIELD") that were part of the original 1,760 NULL total but never
// got a fix script during the Helmets/Apparel/Accessories triage. My miss, session 84.
//
// Run: node audit_riding_gear_missed_378.mjs > riding_gear_missed_378_output.txt 2>&1

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

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    for (const cond of [
      { label: 'category = Riding Gear', where: `category = 'Riding Gear'` },
      { label: 'category IS NULL', where: `category IS NULL` },
      { label: 'category = HELMET AND SHIELD', where: `category = 'HELMET AND SHIELD'` },
    ]) {
      const res = await client.query(`
        SELECT id, name, source_vendor
        FROM catalog_unified
        WHERE is_active = true
          AND display_category = 'Riding Gear & Apparel'
          AND display_subcategory IS NULL
          AND ${cond.where}
        ORDER BY name
      `);
      console.log(`=== ${cond.label} (${res.rows.length}) ===\n`);
      for (const row of res.rows) {
        console.log(`  [${row.id}] (${row.source_vendor}) ${row.name}`);
      }
      console.log('');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
