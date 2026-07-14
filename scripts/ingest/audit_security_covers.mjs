// audit_security_covers.mjs
// READ-ONLY. Security & Covers has 212 total rows (Security 90, Bike Covers 73,
// Shelters & Storage 13, NULL 36). Full dump of the NULL rows since it's small.
//
// Run: node audit_security_covers.mjs > security_covers_output.txt 2>&1

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
      WHERE is_active = true AND display_category = 'Security & Covers' AND display_subcategory IS NULL
    `);
    console.log(`Total Security & Covers NULL rows: ${totalRes.rows[0].n}\n`);

    const groupRes = await client.query(`
      SELECT category, subcategory, COUNT(*)::int AS n
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Security & Covers' AND display_subcategory IS NULL
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
      WHERE is_active = true AND display_category = 'Security & Covers' AND display_subcategory IS NULL
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
