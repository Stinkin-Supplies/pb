// lookup_more_categories.mjs
//
// Second lookup pass -- confirm real subcategory names for the remaining
// categories needed to finish the wave-4 annotated mapping: Electrical,
// Transmission & Clutch, Hardware Covers & General, Tools & Chemicals,
// Engine.
//
// Read-only. No writes.
//
// Run: node lookup_more_categories.mjs

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
    const checkCats = [
      'Electrical',
      'Transmission & Clutch',
      'Hardware, Covers & General',
      'Tools & Chemicals',
      'Engine',
    ];
    for (const cat of checkCats) {
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
