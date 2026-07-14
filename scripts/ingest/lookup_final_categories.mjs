// lookup_final_categories.mjs
//
// Last lookup pass for the 65-row wrong-category fix -- confirms real
// subcategory names for Handlebar & Controls (Grip Set), Fenders & Body /
// Tanks & Body (Contour Side Cover), Carburetion & Fuel (Fuel Hose Lock),
// Wheels & Tires (Front Disc Spoke), Foot Controls (Brake Pedal Return
// Spring -- confirming Brake Arm & Pedal Hardware still exists).
//
// Read-only. No writes.
//
// Run: node lookup_final_categories.mjs

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
      'Handlebar & Controls',
      'Fenders & Body',
      'Tanks & Body',
      'Carburetion & Fuel',
      'Wheels & Tires',
      'Foot Controls',
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
