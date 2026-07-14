// audit_fenders_body.mjs
// READ-ONLY. Fenders & Body has only 124 total rows, 98 of them NULL (79%).
// Vendor category/subcategory breakdown for the NULL rows, same approach as before.
//
// Run: node audit_fenders_body.mjs > fenders_body_output.txt 2>&1

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
    const totalRes = await client.query(`
      SELECT COUNT(*)::int AS n FROM catalog_unified
      WHERE is_active = true AND display_category = 'Fenders & Body'
    `);
    console.log(`Total Fenders & Body rows (any subcategory): ${totalRes.rows[0].n}\n`);

    const existingRes = await client.query(`
      SELECT display_subcategory, COUNT(*)::int AS n
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Fenders & Body' AND display_subcategory IS NOT NULL
      GROUP BY display_subcategory
      ORDER BY n DESC
    `);
    console.log('--- Existing confirmed subcats ---');
    for (const row of existingRes.rows) {
      console.log(`  ${row.n.toString().padStart(4)}  ${row.display_subcategory}`);
    }

    const nullTotalRes = await client.query(`
      SELECT COUNT(*)::int AS n FROM catalog_unified
      WHERE is_active = true AND display_category = 'Fenders & Body' AND display_subcategory IS NULL
    `);
    console.log(`\nNULL rows: ${nullTotalRes.rows[0].n}\n`);

    const groupRes = await client.query(`
      SELECT category, subcategory, COUNT(*)::int AS n
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Fenders & Body' AND display_subcategory IS NULL
      GROUP BY category, subcategory
      ORDER BY n DESC
    `);
    for (const row of groupRes.rows) {
      console.log(`${row.n.toString().padStart(5)}  category="${row.category}"  subcategory="${row.subcategory}"`);
    }

    console.log(`\n--- Full list of all NULL rows ---\n`);
    const allRes = await client.query(`
      SELECT id, name, source_vendor, category, subcategory
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Fenders & Body' AND display_subcategory IS NULL
      ORDER BY category, name
    `);
    for (const row of allRes.rows) {
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
