// audit_final_stragglers.mjs
// READ-ONLY. Full dump of NULL rows in the 5 remaining small categories flagged
// session 83: Seating (142), Foot Controls (59), Exhaust (21), Luggage & Racks (9),
// Wheels & Tires (6).
//
// Run: node audit_final_stragglers.mjs > final_stragglers_output.txt 2>&1

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

const CATEGORIES = ['Seating', 'Foot Controls', 'Exhaust', 'Luggage & Racks', 'Wheels & Tires'];

async function main() {
  const client = await pool.connect();
  try {
    for (const cat of CATEGORIES) {
      const totalRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM catalog_unified
         WHERE is_active = true AND display_category = $1 AND display_subcategory IS NULL`,
        [cat]
      );
      console.log(`\n=== ${cat}: ${totalRes.rows[0].n} NULL rows ===\n`);

      const allRes = await client.query(
        `SELECT id, name, source_vendor, category, subcategory
         FROM catalog_unified
         WHERE is_active = true AND display_category = $1 AND display_subcategory IS NULL
         ORDER BY category, name`,
        [cat]
      );
      for (const row of allRes.rows) {
        console.log(`  [${row.id}] (${row.source_vendor}) [vendor: ${row.category}/${row.subcategory}] ${row.name}`);
      }
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
