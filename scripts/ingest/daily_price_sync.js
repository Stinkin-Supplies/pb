#!/usr/bin/env node
// =============================================================
// scripts/ingest/daily_price_sync.js
//
// Daily pricing pipeline — bulk SQL version
//
// MAP pricing formula:
//   1. target  = cost / 0.75          (25% margin)
//   2. floored = GREATEST(target, map_price)   (never below MAP)
//   3. capped  = LEAST(floored, NULLIF(msrp,0)) (never above MSRP)
//   4. final   = GREATEST(capped, map_price)   (if MSRP < MAP, use MAP)
//
// Step 4 handles the case where vendors set MSRP < MAP (bad data).
// In that case MAP wins — you never display below MAP.
//
// Usage:
//   node scripts/ingest/daily_price_sync.js
//   node scripts/ingest/daily_price_sync.js --vendor wps
//   node scripts/ingest/daily_price_sync.js --vendor pu
//   node scripts/ingest/daily_price_sync.js --dry-run
// =============================================================

import pg from 'pg';
const { Pool } = pg;

const DB_URL = process.env.DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog';
const pool = new Pool({ connectionString: DB_URL });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VENDOR_FILTER = args.includes('--vendor') ? args[args.indexOf('--vendor') + 1]?.toLowerCase() : null;

// Reusable SQL macro: MAP-protected price given cost, map, msrp column expressions
function mapPrice(cost, map, msrp) {
  return `
    GREATEST(
      LEAST(
        GREATEST(${cost} / 0.75, COALESCE(${map}, 0)),
        COALESCE(NULLIF(${msrp}, 0), 999999)
      ),
      COALESCE(${map}, 0)
    )
  `;
}

function mapMargin(cost, map, msrp) {
  const p = mapPrice(cost, map, msrp);
  return `ROUND(((${p} - ${cost}) / NULLIF(${p}, 0))::numeric, 4)`;
}

// =============================================================
// WPS PRICING SYNC
// =============================================================
async function syncWPS(client, dryRun) {
  console.log('\n── WPS Pricing Sync ──────────────────────────────');

  const { rows: preview } = await client.query(`
    SELECT COUNT(*) AS cnt
    FROM catalog_pricing cp_raw
    JOIN catalog_unified cu ON cu.sku = cp_raw.sku
    WHERE cu.source_vendor = 'WPS' AND cp_raw.dealer_price > 0
  `);
  console.log(`  Found ${preview[0].cnt} WPS products with pricing`);

  const priceExpr  = mapPrice('cp_raw.dealer_price', 'cu.map_price', 'cu.msrp');
  const marginExpr = mapMargin('cp_raw.dealer_price', 'cu.map_price', 'cu.msrp');

  if (dryRun) {
    const { rows: sample } = await client.query(`
      SELECT cu.sku, cp_raw.dealer_price AS cost, cu.map_price, cu.msrp,
        ROUND((${priceExpr})::numeric, 2) AS computed_price,
        ROUND(((${priceExpr} - cp_raw.dealer_price) / NULLIF(${priceExpr}, 0) * 100)::numeric, 1) AS margin_pct
      FROM catalog_pricing cp_raw
      JOIN catalog_unified cu ON cu.sku = cp_raw.sku
      WHERE cu.source_vendor = 'WPS' AND cp_raw.dealer_price > 0
      LIMIT 5
    `);
    console.log('  [DRY RUN] Sample:');
    sample.forEach(r => console.log(`    ${r.sku}: cost $${r.cost} → $${r.computed_price} (${r.margin_pct}%)`));
    return;
  }

  await client.query(`
    INSERT INTO vendor_offers (
      catalog_product_id, vendor_code,
      wholesale_cost, map_price, msrp,
      computed_price, margin_percent,
      is_active, created_at, updated_at, computed_at
    )
    SELECT
      cu.id, 'wps',
      cp_raw.dealer_price, cu.map_price, cu.msrp,
      ROUND((${priceExpr})::numeric, 2),
      ${marginExpr},
      true, NOW(), NOW(), NOW()
    FROM catalog_pricing cp_raw
    JOIN catalog_unified cu ON cu.sku = cp_raw.sku
    WHERE cu.source_vendor = 'WPS' AND cp_raw.dealer_price > 0
    ON CONFLICT (catalog_product_id, vendor_code) DO UPDATE SET
      wholesale_cost = EXCLUDED.wholesale_cost,
      map_price      = EXCLUDED.map_price,
      msrp           = EXCLUDED.msrp,
      computed_price = EXCLUDED.computed_price,
      margin_percent = EXCLUDED.margin_percent,
      updated_at     = NOW(),
      computed_at    = NOW()
  `);

  await client.query(`
    UPDATE catalog_unified cu SET
      computed_price = vo.computed_price,
      cost           = vo.wholesale_cost,
      updated_at     = NOW()
    FROM vendor_offers vo
    WHERE vo.catalog_product_id = cu.id
      AND vo.vendor_code = 'wps'
      AND cu.source_vendor = 'WPS'
  `);

  const { rows: viol } = await client.query(`
    SELECT COUNT(*) AS cnt FROM vendor_offers
    WHERE vendor_code = 'wps' AND margin_percent < 0.10
  `);
  if (parseInt(viol[0].cnt) > 0) console.log(`  ⚠️  ${viol[0].cnt} products below min margin threshold`);
  console.log(`  ✅ WPS sync complete`);
}

// =============================================================
// PU PRICING SYNC
// =============================================================
async function syncPU(client, dryRun) {
  console.log('\n── PU Pricing Sync ───────────────────────────────');

  const { rows: preview } = await client.query(`
    SELECT COUNT(*) AS cnt
    FROM pu_pricing pp
    JOIN catalog_unified cu ON cu.sku = pp.part_number OR cu.sku = pp.punctuated_part_number
    WHERE cu.source_vendor = 'PU' AND pp.dealer_price > 0
  `);
  console.log(`  Found ${preview[0].cnt} PU products with pricing`);

  const priceExpr  = mapPrice('pp.dealer_price', 'pp.suggested_retail', 'pp.original_retail');
  const marginExpr = mapMargin('pp.dealer_price', 'pp.suggested_retail', 'pp.original_retail');

  if (dryRun) {
    const { rows: sample } = await client.query(`
      SELECT DISTINCT ON (cu.id)
        cu.sku, pp.dealer_price AS cost, pp.suggested_retail AS map_price, pp.original_retail AS msrp,
        ROUND((${priceExpr})::numeric, 2) AS computed_price,
        ROUND(((${priceExpr} - pp.dealer_price) / NULLIF(${priceExpr}, 0) * 100)::numeric, 1) AS margin_pct
      FROM pu_pricing pp
      JOIN catalog_unified cu ON cu.sku = pp.part_number OR cu.sku = pp.punctuated_part_number
      WHERE cu.source_vendor = 'PU' AND pp.dealer_price > 0
      ORDER BY cu.id, pp.dealer_price DESC
      LIMIT 5
    `);
    console.log('  [DRY RUN] Sample:');
    sample.forEach(r => console.log(`    ${r.sku}: cost $${r.cost} → $${r.computed_price} (${r.margin_pct}%)`));
    return;
  }

  // DISTINCT ON cu.id handles duplicate SKUs (1001-0018 vs 10010018)
  await client.query(`
    INSERT INTO vendor_offers (
      catalog_product_id, vendor_code,
      wholesale_cost, map_price, msrp,
      computed_price, margin_percent,
      is_active, created_at, updated_at, computed_at
    )
    SELECT DISTINCT ON (cu.id)
      cu.id, 'pu',
      pp.dealer_price, pp.suggested_retail, pp.original_retail,
      ROUND((${priceExpr})::numeric, 2),
      ${marginExpr},
      true, NOW(), NOW(), NOW()
    FROM pu_pricing pp
    JOIN catalog_unified cu ON cu.sku = pp.part_number OR cu.sku = pp.punctuated_part_number
    WHERE cu.source_vendor = 'PU' AND pp.dealer_price > 0
    ORDER BY cu.id, pp.dealer_price DESC
    ON CONFLICT (catalog_product_id, vendor_code) DO UPDATE SET
      wholesale_cost = EXCLUDED.wholesale_cost,
      map_price      = EXCLUDED.map_price,
      msrp           = EXCLUDED.msrp,
      computed_price = EXCLUDED.computed_price,
      margin_percent = EXCLUDED.margin_percent,
      updated_at     = NOW(),
      computed_at    = NOW()
  `);

  await client.query(`
    UPDATE catalog_unified cu SET
      computed_price = vo.computed_price,
      map_price      = vo.map_price,
      msrp           = vo.msrp,
      cost           = vo.wholesale_cost,
      updated_at     = NOW()
    FROM vendor_offers vo
    WHERE vo.catalog_product_id = cu.id
      AND vo.vendor_code = 'pu'
      AND cu.source_vendor = 'PU'
  `);

  const { rows: viol } = await client.query(`
    SELECT COUNT(*) AS cnt FROM vendor_offers
    WHERE vendor_code = 'pu' AND margin_percent < 0.10
  `);
  if (parseInt(viol[0].cnt) > 0) console.log(`  ⚠️  ${viol[0].cnt} products below min margin threshold`);
  console.log(`  ✅ PU sync complete`);
}

// =============================================================
// MAP VIOLATION REPORT
// =============================================================
async function mapViolationReport(client) {
  console.log('\n── MAP Compliance Report ─────────────────────────');
  const { rows } = await client.query(`
    SELECT source_vendor, COUNT(*) AS violations
    FROM catalog_unified
    WHERE map_price > 0 AND computed_price < map_price AND is_active = true
    GROUP BY source_vendor ORDER BY source_vendor
  `);
  if (rows.length === 0) {
    console.log('  ✅ No MAP violations');
  } else {
    rows.forEach(r => console.log(`  ⚠️  ${r.source_vendor}: ${r.violations} products priced below MAP`));
  }
}

// =============================================================
// MAIN
// =============================================================
async function main() {
  const client = await pool.connect();
  try {
    console.log('=== Daily Price Sync ===');
    console.log(`  Mode:   ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
    console.log(`  Vendor: ${VENDOR_FILTER || 'all'}`);
    console.log(`  Time:   ${new Date().toISOString()}`);

    if (!DRY_RUN) await client.query('BEGIN');

    if (!VENDOR_FILTER || VENDOR_FILTER === 'wps') await syncWPS(client, DRY_RUN);
    if (!VENDOR_FILTER || VENDOR_FILTER === 'pu')  await syncPU(client, DRY_RUN);

    if (!DRY_RUN) {
      await client.query('COMMIT');
      await mapViolationReport(client);
    }

    console.log('\n✅ Price sync complete\n');
  } catch (err) {
    if (!DRY_RUN) await client.query('ROLLBACK');
    console.error('\n❌ Price sync failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
