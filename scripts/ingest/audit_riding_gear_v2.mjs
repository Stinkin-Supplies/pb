// audit_riding_gear_v2.mjs
// READ-ONLY. Groups the 1,760 NULL display_subcategory rows (Riding Gear & Apparel)
// by the VENDOR's own category/subcategory fields, not name regex.
// Gives real-data grouping to decide: existing subcat / new "Helmet Accessories & Parts" /
// new casual-apparel subcat / flag as wrong top-level category.
//
// Run: node audit_riding_gear_v2.mjs > riding_gear_v2_output.txt 2>&1

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
    const groupRes = await client.query(`
      SELECT category, subcategory, COUNT(*)::int AS n
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Riding Gear & Apparel'
        AND display_subcategory IS NULL
      GROUP BY category, subcategory
      ORDER BY n DESC
    `);

    console.log(`=== Vendor category/subcategory groups for 1,760 NULL rows ===\n`);
    for (const row of groupRes.rows) {
      console.log(`${row.n.toString().padStart(5)}  category="${row.category}"  subcategory="${row.subcategory}"`);
    }

    console.log(`\n=== Samples per group (top 15 groups) ===\n`);
    const topGroups = groupRes.rows.slice(0, 15);
    for (const g of topGroups) {
      console.log(`--- category="${g.category}" / subcategory="${g.subcategory}" (${g.n}) ---`);
      const sampleRes = await client.query(
        `SELECT id, name, source_vendor FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Riding Gear & Apparel'
           AND display_subcategory IS NULL
           AND category IS NOT DISTINCT FROM $1
           AND subcategory IS NOT DISTINCT FROM $2
         ORDER BY random()
         LIMIT 5`,
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
