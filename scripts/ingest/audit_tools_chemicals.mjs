// audit_tools_chemicals.mjs
// READ-ONLY. Vendor category/subcategory breakdown for the 547 NULL display_subcategory
// rows in Tools & Chemicals, same approach as the Riding Gear / Frame & Hardware audits.
//
// Run: node audit_tools_chemicals.mjs > tools_chemicals_output.txt 2>&1

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
      WHERE is_active = true
        AND display_category = 'Tools & Chemicals'
        AND display_subcategory IS NULL
    `);
    console.log(`Total Tools & Chemicals NULL rows: ${totalRes.rows[0].n}\n`);

    const groupRes = await client.query(`
      SELECT category, subcategory, COUNT(*)::int AS n
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Tools & Chemicals'
        AND display_subcategory IS NULL
      GROUP BY category, subcategory
      ORDER BY n DESC
    `);
    for (const row of groupRes.rows) {
      console.log(`${row.n.toString().padStart(5)}  category="${row.category}"  subcategory="${row.subcategory}"`);
    }

    console.log(`\n--- Samples per group (top 15) ---\n`);
    for (const g of groupRes.rows.slice(0, 15)) {
      console.log(`--- category="${g.category}" / subcategory="${g.subcategory}" (${g.n}) ---`);
      const sampleRes = await client.query(
        `SELECT id, name, source_vendor FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Tools & Chemicals'
           AND display_subcategory IS NULL
           AND category IS NOT DISTINCT FROM $1
           AND subcategory IS NOT DISTINCT FROM $2
         ORDER BY random() LIMIT 8`,
        [g.category, g.subcategory]
      );
      for (const row of sampleRes.rows) {
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
