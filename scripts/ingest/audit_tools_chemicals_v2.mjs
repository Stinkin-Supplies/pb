// audit_tools_chemicals_v2.mjs
// READ-ONLY. Full dump of all 547 NULL rows across the 4 vendor-category groups,
// so we can spot non-tool/non-chemical stragglers (covers, spacers, manifold parts,
// generic fasteners) before bulk-applying.
//
// Run: node audit_tools_chemicals_v2.mjs > tools_chemicals_v2_output.txt 2>&1

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

const GROUPS = ['Tools & Shop Equipment', 'Chemicals & Maintenance', 'TOOLS', 'TOOLS GROUP'];

async function main() {
  const client = await pool.connect();
  try {
    for (const cat of GROUPS) {
      const res = await client.query(
        `SELECT id, name, source_vendor FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Tools & Chemicals'
           AND display_subcategory IS NULL
           AND category = $1
         ORDER BY name`,
        [cat]
      );
      console.log(`=== category="${cat}" (${res.rows.length}) ===\n`);
      for (const row of res.rows) {
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
