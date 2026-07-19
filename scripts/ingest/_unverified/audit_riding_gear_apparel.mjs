// audit_riding_gear_apparel.mjs
// READ-ONLY. Splits the 389-row vendor category="Apparel" group into existing
// confirmed subcats vs the casual-apparel cluster (shirts/flannels/tees/hoodies)
// that needs the new subcat Laken called for (session 84, name TBD).
//
// Run: node audit_riding_gear_apparel.mjs > riding_gear_apparel_output.txt 2>&1

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

const GROUPS = [
  { label: 'Jackets & Vests', pattern: `(JACKET|VEST|CHAP)(S)?` },
  { label: 'Pants & Base Layers', pattern: `(PANT|JEAN|BASE\\s*LAYER|LONG\\s*JOHN)(S)?` },
  { label: 'Casual apparel (needs new subcat)', pattern: `(SHIRT|FLANNEL|TEE|HOODIE|JERSEY|HENLEY|TANK\\s*TOP)(S)?` },
  { label: 'Rain gear', pattern: `RAIN\\s*(SUIT|GEAR)` },
];

async function main() {
  const client = await pool.connect();
  try {
    const totalRes = await client.query(`
      SELECT COUNT(*)::int AS n FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Riding Gear & Apparel'
        AND display_subcategory IS NULL
        AND category = 'Apparel'
    `);
    console.log(`Total rows in vendor category="Apparel": ${totalRes.rows[0].n}\n`);

    let matchedIds = new Set();
    for (const g of GROUPS) {
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Riding Gear & Apparel'
           AND display_subcategory IS NULL
           AND category = 'Apparel'
           AND name ~* $1`,
        [g.pattern]
      );
      console.log(`--- ${g.label}: ${countRes.rows[0].n} ---`);
      const sampleRes = await client.query(
        `SELECT id, name FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Riding Gear & Apparel'
           AND display_subcategory IS NULL
           AND category = 'Apparel'
           AND name ~* $1
         ORDER BY random() LIMIT 8`,
        [g.pattern]
      );
      for (const row of sampleRes.rows) {
        console.log(`  [${row.id}] ${row.name}`);
        matchedIds.add(row.id);
      }
      console.log('');
    }

    const patterns = GROUPS.map((g) => g.pattern);
    const unmatchedRes = await client.query(
      `SELECT id, name FROM catalog_unified
       WHERE is_active = true
         AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL
         AND category = 'Apparel'
         AND name !~* $1 AND name !~* $2 AND name !~* $3 AND name !~* $4
       ORDER BY name`,
      patterns
    );
    console.log(`--- UNMATCHED (no group hit): ${unmatchedRes.rows.length} — full list ---`);
    for (const row of unmatchedRes.rows) console.log(`  [${row.id}] ${row.name}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
