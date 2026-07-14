// lookup_final_batch_categories.mjs
//
// Confirm real subcategory names for Gaskets & Seals and Seating.
//
// Read-only. No writes.
//
// Run: node lookup_final_batch_categories.mjs

import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.CATALOG_DATABASE_URL;
if (!connectionString) {
  console.error('CATALOG_DATABASE_URL not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function main() {
  const client = await pool.connect();
  try {
    for (const cat of ['Gaskets & Seals', 'Seating']) {
      const subRes = await client.query(
        `
        SELECT display_subcategory, COUNT(*)::int AS n
        FROM catalog_unified
        WHERE is_active = true AND display_category = $1 AND display_subcategory IS NOT NULL
        GROUP BY display_subcategory
        ORDER BY n DESC
        `,
        [cat]
      );
      console.log(`\n=== Subcategories under "${cat}" ===`);
      for (const r of subRes.rows) {
        console.log(`  ${r.n.toString().padStart(6)}  ${r.display_subcategory}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Lookup failed:', err);
  process.exit(1);
});
