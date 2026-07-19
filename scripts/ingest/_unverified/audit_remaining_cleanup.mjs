// audit_remaining_cleanup.mjs
//
// One-shot audit covering everything still open in the taxonomy rebuild:
//   1. Category-only-move rows (subcategory IS NULL but category is a real,
//      already-decided category from prior waves) in Wheels & Tires,
//      Tanks & Body, Frames & Suspension, Carburetion & Fuel, Brakes,
//      Hardware Covers & General -- these need subcategory names decided.
//   2. Chopper Supplies -- full row list (only 3 expected), to design a
//      subcategory scheme from actual data instead of guessing blind.
//   3. Dashes & Gauges -- the 47 held-back rows, to see if they're
//      resolvable or genuine long-tail.
//   4. Instrumentation category -- current row count, to confirm whether
//      it's safe to retire (should be near-empty per memory).
//   5. Row 77227 -- current state, the flagged mismatch from wave-4b.
//
// Read-only. No writes.
//
// Run: node audit_remaining_cleanup.mjs

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
    // --- 1. Category-only-move candidates ---
    // These are categories where we KNOW some rows were deliberately moved
    // in without a subcategory during wave-4/4b/65-fix. Pull all current
    // NULL-subcategory rows in each -- some may be older/unrelated NULLs,
    // so this also re-scopes the true count.
    const checkCats = [
      'Wheels & Tires',
      'Tanks & Body',
      'Frames & Suspension',
      'Carburetion & Fuel',
      'Brakes',
      'Hardware, Covers & General',
    ];
    for (const cat of checkCats) {
      const res = await client.query(
        `
        SELECT id, name
        FROM catalog_unified
        WHERE display_category = $1 AND display_subcategory IS NULL AND is_active = true
        ORDER BY name
        `,
        [cat]
      );
      console.log(`\n=== "${cat}" NULL-subcategory rows: ${res.rows.length} ===`);
      for (const r of res.rows) {
        console.log(`  [${r.id}] ${r.name}`);
      }
    }

    // --- 2. Chopper Supplies full list ---
    const chopperRes = await client.query(`
      SELECT id, name, display_subcategory
      FROM catalog_unified
      WHERE display_category = 'Chopper Supplies' AND is_active = true
      ORDER BY name
    `);
    console.log(`\n=== Chopper Supplies: ${chopperRes.rows.length} rows ===`);
    for (const r of chopperRes.rows) {
      console.log(`  [${r.id}] ${r.name} (subcat: ${r.display_subcategory ?? 'NULL'})`);
    }

    // --- 3. Dashes & Gauges held-back rows ---
    const dashRes = await client.query(`
      SELECT id, name
      FROM catalog_unified
      WHERE display_category = 'Dashes & Gauges' AND display_subcategory IS NULL AND is_active = true
      ORDER BY name
    `);
    console.log(`\n=== Dashes & Gauges NULL-subcategory rows: ${dashRes.rows.length} ===`);
    for (const r of dashRes.rows) {
      console.log(`  [${r.id}] ${r.name}`);
    }

    // --- 4. Instrumentation category status ---
    const instRes = await client.query(`
      SELECT id, name, display_subcategory
      FROM catalog_unified
      WHERE display_category = 'Instrumentation' AND is_active = true
      ORDER BY name
    `);
    console.log(`\n=== Instrumentation category: ${instRes.rows.length} rows ===`);
    for (const r of instRes.rows) {
      console.log(`  [${r.id}] ${r.name} (subcat: ${r.display_subcategory ?? 'NULL'})`);
    }

    // --- 5. Row 77227 ---
    const flagRes = await client.query(`
      SELECT id, name, vendor_sku, display_category, display_subcategory
      FROM catalog_unified
      WHERE id = 77227
    `);
    console.log(`\n=== Row 77227 current state ===`);
    for (const r of flagRes.rows) {
      console.log(`  [${r.id}] ${r.name} | vendor_sku: ${r.vendor_sku} | ${r.display_category}/${r.display_subcategory ?? 'NULL'}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
