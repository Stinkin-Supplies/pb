// sample_camchest.mjs
//
// Checking whether Engine/Camchest (1,361 rows) contains points covers,
// timer covers, or docking points hardware -- Laken's instinct that these
// belong near cam/points internals rather than the imperfect-fit "Timing
// Drain Plugs" bucket in Hardware, Covers & General.
//
// Read-only. No writes.
//
// Run: node sample_camchest.mjs

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
    // Sample of Camchest generally
    const res = await client.query(`
      SELECT id, name
      FROM catalog_unified
      WHERE display_category = 'Engine' AND display_subcategory = 'Camchest' AND is_active = true
      ORDER BY name
      LIMIT 30
    `);
    console.log('=== Sample of Engine/Camchest (up to 30) ===');
    for (const r of res.rows) {
      console.log(`  [${r.id}] ${r.name}`);
    }

    // Specific search for points/timer/cover vocabulary within Camchest
    const pointsRes = await client.query(`
      SELECT id, name
      FROM catalog_unified
      WHERE display_category = 'Engine' AND display_subcategory = 'Camchest' AND is_active = true
        AND (name ILIKE '%point%' OR name ILIKE '%timer%' OR name ILIKE '%timing%' OR name ILIKE '%docking%')
      ORDER BY name
    `);
    console.log(`\n=== Camchest rows matching point/timer/timing/docking: ${pointsRes.rows.length} ===`);
    for (const r of pointsRes.rows) {
      console.log(`  [${r.id}] ${r.name}`);
    }

    // Also check Engine Accessories and Engine Parts for the same vocabulary
    for (const subcat of ['Engine Accessories', 'Engine Parts']) {
      const res2 = await client.query(
        `
        SELECT id, name
        FROM catalog_unified
        WHERE display_category = 'Engine' AND display_subcategory = $1 AND is_active = true
          AND (name ILIKE '%point%' OR name ILIKE '%timer%' OR name ILIKE '%timing%' OR name ILIKE '%docking%')
        ORDER BY name
        `,
        [subcat]
      );
      console.log(`\n=== "${subcat}" rows matching point/timer/timing/docking: ${res2.rows.length} ===`);
      for (const r of res2.rows) {
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
