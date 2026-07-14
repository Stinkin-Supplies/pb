// audit_riding_gear_helmets.mjs
// READ-ONLY. Splits the 836-row vendor category="Helmets" group into:
//   - whole helmets (existing "Helmets" subcat)
//   - helmet parts/accessories (new "Helmet Accessories & Parts" subcat, Laken's call session 84)
// using vocabulary confirmed from the earlier unmatched-sample review (visors, vents,
// curtains, baseplates, shell trim, side plates, neck gators/tubes, face masks, spoilers).
//
// Run: node audit_riding_gear_helmets.mjs > riding_gear_helmets_output.txt 2>&1

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

// Parts/accessories vocabulary first (checked before whole-helmet), since some rows
// contain both "HELMET" and a part word (e.g. "FULL FACE HELMET" bundled with a shield).
const PARTS_PATTERN = `(VISOR|SHIELD|(^|\\s)VENT(S)?(\\s|$)|CURTAIN|SKIRT|BASEPLATE|BASE\\s*PLATE|SHELL\\s*TRIM|SIDE\\s*PLATE|JAW|NECK\\s*(GATOR|TUBE)|SUNVISOR|SUN\\s*VISOR|REAR\\s*SPOILER|FACE\\s*MASK|CHIN\\s*(VENT|CURTAIN)|LINER|PINLOCK|BASEPLATE\\s*SET)`;
const WHOLE_HELMET_PATTERN = `HELMET`;

async function main() {
  const client = await pool.connect();
  try {
    const totalRes = await client.query(`
      SELECT COUNT(*)::int AS n FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Riding Gear & Apparel'
        AND display_subcategory IS NULL
        AND category = 'Helmets'
    `);
    console.log(`Total rows in vendor category="Helmets": ${totalRes.rows[0].n}\n`);

    const partsRes = await client.query(
      `SELECT COUNT(*)::int AS n FROM catalog_unified
       WHERE is_active = true
         AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL
         AND category = 'Helmets'
         AND name ~* $1`,
      [PARTS_PATTERN]
    );
    console.log(`--- Helmet Accessories & Parts (parts vocabulary match): ${partsRes.rows[0].n} ---`);
    const partsSample = await client.query(
      `SELECT id, name FROM catalog_unified
       WHERE is_active = true
         AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL
         AND category = 'Helmets'
         AND name ~* $1
       ORDER BY random() LIMIT 15`,
      [PARTS_PATTERN]
    );
    for (const row of partsSample.rows) console.log(`  [${row.id}] ${row.name}`);

    const wholeRes = await client.query(
      `SELECT COUNT(*)::int AS n FROM catalog_unified
       WHERE is_active = true
         AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL
         AND category = 'Helmets'
         AND name !~* $1
         AND name ~* $2`,
      [PARTS_PATTERN, WHOLE_HELMET_PATTERN]
    );
    console.log(`\n--- Whole Helmets (no parts vocabulary, has "HELMET"): ${wholeRes.rows[0].n} ---`);
    const wholeSample = await client.query(
      `SELECT id, name FROM catalog_unified
       WHERE is_active = true
         AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL
         AND category = 'Helmets'
         AND name !~* $1
         AND name ~* $2
       ORDER BY random() LIMIT 10`,
      [PARTS_PATTERN, WHOLE_HELMET_PATTERN]
    );
    for (const row of wholeSample.rows) console.log(`  [${row.id}] ${row.name}`);

    const neitherRes = await client.query(
      `SELECT id, name FROM catalog_unified
       WHERE is_active = true
         AND display_category = 'Riding Gear & Apparel'
         AND display_subcategory IS NULL
         AND category = 'Helmets'
         AND name !~* $1
         AND name !~* $2
       ORDER BY name`,
      [PARTS_PATTERN, WHOLE_HELMET_PATTERN]
    );
    console.log(`\n--- NEITHER pattern matched: ${neitherRes.rows.length} — full list for review ---`);
    for (const row of neitherRes.rows) console.log(`  [${row.id}] ${row.name}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
