// lookup_batch2_categories.mjs
//
// Confirm real subcategory names needed for the new 212-row annotated
// batch: engine hardware/covers, air cleaner components, timing/points
// covers, ignition switches, license plate mounts, crash bars/highway
// bars, docking points, generator/starter parts, pulley hardware.
//
// Read-only. No writes.
//
// Run: node lookup_batch2_categories.mjs

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
      'Engine',
      'Carburetion & Fuel',
      'Frames & Suspension',
      'Electrical',
      'Lighting',
      'Luggage & Racks',
      'Transmission & Clutch',
      'Foot Controls',
      'Tanks & Body',
      'Brakes',
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

    const fuzzyTerms = ['timing', 'points cover', 'license plate', 'crash bar', 'highway bar', 'docking', 'ape hanger'];
    for (const term of fuzzyTerms) {
      const res = await client.query(
        `
        SELECT DISTINCT display_category, display_subcategory
        FROM catalog_unified
        WHERE is_active = true AND (display_category ILIKE $1 OR display_subcategory ILIKE $1)
        `,
        [`%${term}%`]
      );
      console.log(`\n=== Fuzzy match "${term}" ===`);
      for (const r of res.rows) {
        console.log(`  ${r.display_category} / ${r.display_subcategory}`);
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
