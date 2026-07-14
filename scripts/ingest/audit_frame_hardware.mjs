// audit_frame_hardware.mjs
// READ-ONLY. Two parts:
//   1. Vendor category/subcategory breakdown for the 436 NULL display_subcategory rows
//      in Frame & Hardware (same approach as the Riding Gear & Apparel audit)
//   2. Random 80-row sample from the 1,743-row "Hardware & Fasteners" bin, which has
//      never been audited row-by-row despite being assumed mostly-correct (flagged
//      session 83)
//
// Run: node audit_frame_hardware.mjs > frame_hardware_output.txt 2>&1

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

async function main() {
  const client = await pool.connect();
  try {
    // Part 1: NULL rows, vendor category/subcategory groups
    const totalRes = await client.query(`
      SELECT COUNT(*)::int AS n FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Frame & Hardware'
        AND display_subcategory IS NULL
    `);
    console.log(`=== PART 1: Frame & Hardware NULL rows: ${totalRes.rows[0].n} ===\n`);

    const groupRes = await client.query(`
      SELECT category, subcategory, COUNT(*)::int AS n
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Frame & Hardware'
        AND display_subcategory IS NULL
      GROUP BY category, subcategory
      ORDER BY n DESC
    `);
    for (const row of groupRes.rows) {
      console.log(`${row.n.toString().padStart(5)}  category="${row.category}"  subcategory="${row.subcategory}"`);
    }

    console.log(`\n--- Samples per group (top 15) ---\n`);
    for (const g of groupRes.rows.slice(0, 15)) {
      console.log(`--- category="${g.category}" / subcategory="${g.subcategory}" (${g.n}) ---`);
      const sampleRes = await client.query(
        `SELECT id, name, source_vendor FROM catalog_unified
         WHERE is_active = true
           AND display_category = 'Frame & Hardware'
           AND display_subcategory IS NULL
           AND category IS NOT DISTINCT FROM $1
           AND subcategory IS NOT DISTINCT FROM $2
         ORDER BY random() LIMIT 6`,
        [g.category, g.subcategory]
      );
      for (const row of sampleRes.rows) {
        console.log(`  [${row.id}] (${row.source_vendor}) ${row.name}`);
      }
      console.log('');
    }

    // Part 2: sample the 1,743-row Hardware & Fasteners bin for contamination check
    const hwTotalRes = await client.query(`
      SELECT COUNT(*)::int AS n FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Frame & Hardware'
        AND display_subcategory = 'Hardware & Fasteners'
    `);
    console.log(`\n=== PART 2: "Hardware & Fasteners" bin total: ${hwTotalRes.rows[0].n} ===`);
    console.log(`Random 80-row sample for contamination check:\n`);

    const hwSampleRes = await client.query(`
      SELECT id, name, source_vendor, category, subcategory
      FROM catalog_unified
      WHERE is_active = true
        AND display_category = 'Frame & Hardware'
        AND display_subcategory = 'Hardware & Fasteners'
      ORDER BY random()
      LIMIT 80
    `);
    for (const row of hwSampleRes.rows) {
      console.log(`  [${row.id}] (${row.source_vendor}) [vendor cat: ${row.category}/${row.subcategory}] ${row.name}`);
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
