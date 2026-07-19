// sample_dash_subcats.mjs
//
// Before merging Instrumentation's "Dash & Trim" rows (Fairing Mirror
// Removal Plug, Fuel Tank Console, Regulator Mount, Y-Bracket) into Dashes
// & Gauges, need to see what's actually IN "Dash & Panel" vs "Decals &
// Trim" to know which one is the real semantic fit, since "Dash & Trim"
// doesn't exist verbatim in Dashes & Gauges.
//
// Read-only. No writes.
//
// Run: node sample_dash_subcats.mjs

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
    for (const subcat of ['Dash & Panel', 'Decals & Trim']) {
      const res = await client.query(
        `
        SELECT id, name
        FROM catalog_unified
        WHERE display_category = 'Dashes & Gauges' AND display_subcategory = $1 AND is_active = true
        ORDER BY name
        LIMIT 25
        `,
        [subcat]
      );
      console.log(`\n=== Sample of "${subcat}" (showing up to 25) ===`);
      for (const r of res.rows) {
        console.log(`  [${r.id}] ${r.name}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Sample failed:', err);
  process.exit(1);
});
