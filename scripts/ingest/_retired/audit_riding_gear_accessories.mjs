// audit_riding_gear_accessories.mjs
// READ-ONLY. Full dump of the 157 rows where vendor category="Accessories" within
// Riding Gear & Apparel/NULL — the wrong-category candidate pool. Also tags each row
// with a proposed destination guess based on keyword match against EXISTING confirmed
// subcats elsewhere in the catalog (not invented names) so Laken can eyeball and correct.
//
// Run: node audit_riding_gear_accessories.mjs > riding_gear_accessories_output.txt 2>&1

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

// Proposed destination guesses — all against EXISTING confirmed subcats, no new names invented.
// Order matters: first match wins.
const GUESSES = [
  { label: 'Lighting / Reflectors & Lenses', pattern: `REFLECTOR` },
  { label: 'Handlebar & Controls / Risers, Clamps & Components', pattern: `(CLAMP|MOUNT\\s*HOLDER)` },
  { label: 'Handlebar & Controls / Switches & Controls', pattern: `SWITCH` },
  { label: 'UNCERTAIN — crash bar, no obvious existing subcat', pattern: `CRASH\\s*BAR` },
];

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT id, name, source_vendor
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Riding Gear & Apparel'
        AND display_subcategory IS NULL
        AND category = 'Accessories'
      ORDER BY name
    `);

    console.log(`Total rows: ${res.rows.length}\n`);

    for (const row of res.rows) {
      let tag = 'UNTAGGED — needs manual look';
      for (const g of GUESSES) {
        const re = new RegExp(g.pattern, 'i');
        if (re.test(row.name)) {
          tag = g.label;
          break;
        }
      }
      console.log(`[${row.id}] (${row.source_vendor}) ${row.name}  =>  ${tag}`);
    }

    console.log(`\n=== Tag summary ===`);
    const counts = {};
    for (const row of res.rows) {
      let tag = 'UNTAGGED — needs manual look';
      for (const g of GUESSES) {
        const re = new RegExp(g.pattern, 'i');
        if (re.test(row.name)) {
          tag = g.label;
          break;
        }
      }
      counts[tag] = (counts[tag] || 0) + 1;
    }
    for (const [tag, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(4)}  ${tag}`);
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
