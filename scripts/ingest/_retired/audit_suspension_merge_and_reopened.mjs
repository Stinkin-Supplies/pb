// audit_suspension_merge_and_reopened.mjs
// READ-ONLY.
//   Part 1: Suspension vs Frames & Suspension subcategory breakdown side by side
//   Part 2: samples of the reopened NULL rows in Riding Gear & Apparel (378) and
//           Frame & Hardware (2) to see if it's new inventory or a real regression
//
// Run: node audit_suspension_merge_and_reopened.mjs > output.txt 2>&1

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
    console.log('=== PART 1: Suspension vs Frames & Suspension subcategories ===\n');
    for (const cat of ['Suspension', 'Frames & Suspension']) {
      const res = await client.query(
        `SELECT display_subcategory, COUNT(*)::int AS n
         FROM catalog_unified
         WHERE is_active = true AND display_category = $1
         GROUP BY display_subcategory ORDER BY n DESC`,
        [cat]
      );
      console.log(`--- ${cat} ---`);
      for (const row of res.rows) {
        console.log(`  ${row.n.toString().padStart(5)}  ${row.display_subcategory}`);
      }
      console.log('');
    }

    console.log('=== PART 2: Reopened NULL rows ===\n');

    const rgaRes = await client.query(`
      SELECT category, subcategory, COUNT(*)::int AS n, MIN(id) AS sample_id
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Riding Gear & Apparel' AND display_subcategory IS NULL
      GROUP BY category, subcategory ORDER BY n DESC
    `);
    console.log(`--- Riding Gear & Apparel NULL (378 total) by vendor category ---`);
    for (const row of rgaRes.rows) {
      console.log(`  ${row.n.toString().padStart(5)}  category="${row.category}" subcategory="${row.subcategory}"`);
    }
    const rgaSample = await client.query(`
      SELECT id, name, source_vendor
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Riding Gear & Apparel' AND display_subcategory IS NULL
      ORDER BY random() LIMIT 15
    `);
    console.log(`\n  Sample rows:`);
    for (const row of rgaSample.rows) {
      console.log(`  [${row.id}] (${row.source_vendor}) ${row.name}`);
    }

    const fhRes = await client.query(`
      SELECT id, name, source_vendor, category, subcategory
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Frame & Hardware' AND display_subcategory IS NULL
    `);
    console.log(`\n--- Frame & Hardware NULL (2 total) ---`);
    for (const row of fhRes.rows) {
      console.log(`  [${row.id}] (${row.source_vendor}) [vendor: ${row.category}/${row.subcategory}] ${row.name}`);
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
