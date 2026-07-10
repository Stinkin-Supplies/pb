// audit_brakes_holdback.mjs
// Read-only. Pulls full untruncated context for the 96 rows held back at the
// end of session 78 (display_category='Brakes' AND display_subcategory IS NULL),
// plus the specifically-flagged one-off ids from HANDOFF_LOG.
//
// Run: node scripts/ingest/audit_brakes_holdback.mjs > brakes_holdback_audit.txt 2>&1

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== 1. Current count check: display_category=Brakes AND display_subcategory IS NULL ===');
    const countRes = await client.query(`
      SELECT count(*) FROM catalog_unified
      WHERE display_category = 'Brakes' AND display_subcategory IS NULL AND is_active = true
    `);
    console.log(`Count: ${countRes.rows[0].count} (expect 96 if nothing has touched this since session 78)`);

    console.log('\n=== 2. Full untruncated rows, grouped by source_vendor ===');
    const rowsRes = await client.query(`
      SELECT id, source_vendor, sku, vendor_sku, name, category AS raw_category,
             subcategory AS raw_subcategory, brand, price
      FROM catalog_unified
      WHERE display_category = 'Brakes' AND display_subcategory IS NULL AND is_active = true
      ORDER BY source_vendor, raw_category, name
    `);
    for (const r of rowsRes.rows) {
      console.log(JSON.stringify(r));
    }

    console.log('\n=== 3. Specifically flagged one-off ids (untruncated names) ===');
    const flaggedIds = [
      // "Floating Stainless Steel Mirror..." truncated name check
    ];
    const nameLikeRes = await client.query(`
      SELECT id, source_vendor, sku, name, category AS raw_category, subcategory AS raw_subcategory, price
      FROM catalog_unified
      WHERE is_active = true AND (
        name ILIKE '%DOT 4%Brake Fluid%'
        OR name ILIKE '%280MM%PAN AMERICAN%'
        OR name ILIKE '%Front Bra%'  -- catches the truncated "mirror" name regardless of actual ending
        OR name ILIKE '%Reservoir Assembly Chrome%'
        OR name ILIKE '%Dust Shield Set Zinc%'
      )
      ORDER BY name
    `);
    for (const r of nameLikeRes.rows) {
      console.log(JSON.stringify(r));
    }

    console.log('\n=== 4. Lever-set ambiguous rows (brake+clutch combined SKUs) ===');
    const leverSetRes = await client.query(`
      SELECT id, source_vendor, sku, name, category AS raw_category, subcategory AS raw_subcategory,
             display_category, display_subcategory, price
      FROM catalog_unified
      WHERE is_active = true
        AND (name ILIKE '%lever set%' OR name ILIKE '%RACE LEVERS%' OR name ILIKE '%ANTHEM%LEVER%')
      ORDER BY name
    `);
    for (const r of leverSetRes.rows) {
      console.log(JSON.stringify(r));
    }

    console.log('\n=== 5. Confirmed non-brake rows sitting in display_category=Brakes (clutch/shifter/air-cleaner) ===');
    const wrongCatRes = await client.query(`
      SELECT id, source_vendor, sku, name, category AS raw_category, subcategory AS raw_subcategory, price
      FROM catalog_unified
      WHERE is_active = true AND display_category = 'Brakes'
        AND (
          name ILIKE '%CLUTCH LEVER%' OR name ILIKE '%TORQ-DRIVE CLUTCH%'
          OR name ILIKE '%SHIFT ARM%' OR name ILIKE '%SHIFT LEVER%'
          OR name ILIKE '%Air Cleaner Backing Plate%'
        )
      ORDER BY name
    `);
    for (const r of wrongCatRes.rows) {
      console.log(JSON.stringify(r));
    }

    console.log('\n=== 6. Still-carried-forward out-of-scope items (Colony tool, Spring Fork Cable Kit) ===');
    const carriedRes = await client.query(`
      SELECT id, source_vendor, sku, name, display_category, display_subcategory, price
      FROM catalog_unified
      WHERE is_active = true AND (
        name ILIKE '%Brake Shaft Crossover Bushing Tool%'
        OR name ILIKE '%Spring Fork Brake Cable Kit%'
      )
    `);
    for (const r of carriedRes.rows) {
      console.log(JSON.stringify(r));
    }

    console.log('\n=== 7. Sanity check: 6 Cable Clamp rows still correctly in Handlebar & Controls (should NOT need action) ===');
    const clampRes = await client.query(`
      SELECT id, source_vendor, sku, name, display_category, display_subcategory
      FROM catalog_unified
      WHERE is_active = true AND name ILIKE '%Cable Clamp%Throttle%'
      ORDER BY name
    `);
    for (const r of clampRes.rows) {
      console.log(JSON.stringify(r));
    }

  } finally {
    client.release();
    // per standing rule: never call .end() on the pool from getCatalogDb();
    // this script owns its own pool via `new Pool(...)`, not getCatalogDb(),
    // so ending it here is fine and necessary for the process to exit.
    await pool.end();
  }
}

main().catch(e => {
  console.error('AUDIT FAILED:', e);
  process.exit(1);
});
