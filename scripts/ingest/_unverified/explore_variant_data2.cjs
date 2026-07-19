#!/usr/bin/env node
// explore_variant_data2.cjs — fixed column names
const { Pool } = require('pg');
const pool = new Pool({ host: '2a01:4ff:f0:fa6f::1', port: 5432, database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly' });
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

async function main() {

  // ── 1. WPS cable grouping (correct column: brand) ─────────────────────────
  console.log('\n── 1. WPS CABLE GROUPS — same brand+name, multiple SKUs ──');
  const wpsGroups = await q(`
    SELECT
      brand,
      product_type,
      COUNT(*) as sku_count,
      array_agg(sku ORDER BY name) as skus,
      array_agg(name ORDER BY name) as names,
      array_agg(list_price::text ORDER BY name) as prices,
      array_agg(length_in::text ORDER BY name) as lengths,
      array_agg(weight::text ORDER BY name) as weights
    FROM wps_catalog
    WHERE lower(name) LIKE '%cable%'
      AND brand IS NOT NULL
      AND harddrive_catalog IS NOT FALSE
    GROUP BY brand, product_type, name
    HAVING COUNT(*) > 1
    ORDER BY sku_count DESC
    LIMIT 15
  `);
  wpsGroups.forEach(r => {
    console.log(`\n  [${r.brand}] "${r.names[0]}" — ${r.sku_count} SKUs`);
    r.skus.forEach((sku, i) => console.log(`    ${sku}  price=$${r.prices[i]}  len=${r.lengths[i]}in  wt=${r.weights[i]}lb`));
  });

  // ── 2. WPS — Motion Pro blackout cables specifically ──────────────────────
  console.log('\n\n── 2. WPS MOTION PRO BLACKOUT CABLES ──');
  const blackout = await q(`
    SELECT sku, name, product_type, list_price, dealer_price,
           length_in, width_in, height_in, weight,
           supplier_item_id, in_stock, stock_quantity
    FROM wps_catalog
    WHERE brand = 'MOTION PRO'
      AND lower(name) LIKE '%blackout%'
    ORDER BY name, list_price
  `);
  blackout.forEach(r => console.log(`  [${r.sku}] ${r.name} — $${r.list_price} | len=${r.length_in}" wt=${r.weight}lb | stock=${r.stock_quantity}`));

  // ── 3. WPS — All Motion Pro cables, look at name patterns ─────────────────
  console.log('\n\n── 3. ALL WPS MOTION PRO CABLES (distinct names) ──');
  const mpCables = await q(`
    SELECT name, COUNT(*) as sku_count, array_agg(sku) as skus
    FROM wps_catalog
    WHERE brand = 'MOTION PRO'
      AND lower(product_type) LIKE '%cable%'
    GROUP BY name
    ORDER BY sku_count DESC, name
    LIMIT 30
  `);
  mpCables.forEach(r => console.log(`  [${r.sku_count} skus] "${r.name}"  ${r.skus.join(', ')}`));

  // ── 4. WPS — supplier_item_id pattern (Motion Pro part number structure) ──
  console.log('\n\n── 4. WPS MOTION PRO PART NUMBER PATTERNS ──');
  const mpParts = await q(`
    SELECT sku, vendor_number, supplier_item_id, name, list_price
    FROM wps_catalog
    WHERE brand = 'MOTION PRO'
      AND lower(product_type) LIKE '%cable%'
    ORDER BY supplier_item_id
    LIMIT 30
  `);
  mpParts.forEach(r => console.log(`  WPS:${r.sku}  VN:${r.vendor_number}  MP:${r.supplier_item_id}  $${r.list_price}  "${r.name}"`));

  // ── 5. PU catalog — cable groups ─────────────────────────────────────────
  console.log('\n\n── 5. PU CATALOG SCHEMA (relevant cols) ──');
  const puCols = await q(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'pu_catalog'
    ORDER BY ordinal_position
  `);
  puCols.forEach(r => console.log(`  ${r.column_name.padEnd(35)} ${r.data_type}`));

  // ── 6. PU cable sample ────────────────────────────────────────────────────
  console.log('\n\n── 6. PU MOTION PRO BLACKOUT CABLES ──');
  const puBlackout = await q(`
    SELECT sku, name, brand_name, features, description
    FROM pu_catalog
    WHERE lower(name) LIKE '%blackout%' AND lower(name) LIKE '%cable%'
    ORDER BY name
    LIMIT 20
  `);
  if (puBlackout.length) {
    puBlackout.forEach(r => {
      console.log(`\n  [${r.sku}] ${r.name}`);
      if (r.features) console.log(`  features: ${JSON.stringify(r.features).slice(0, 400)}`);
    });
  } else {
    console.log('  (none — checking all PU cables)');
    const puCables = await q(`
      SELECT sku, name, brand_name, features
      FROM pu_catalog
      WHERE lower(name) LIKE '%cable%' AND brand_name IS NOT NULL
      ORDER BY brand_name, name
      LIMIT 20
    `);
    puCables.forEach(r => {
      console.log(`\n  [${r.sku}] ${r.name} (${r.brand_name})`);
      if (r.features) console.log(`  features: ${JSON.stringify(r.features).slice(0, 300)}`);
    });
  }

  // ── 7. PU — group by base name to find variant clusters ──────────────────
  console.log('\n\n── 7. PU CABLE GROUPS — same base name, multiple SKUs ──');
  const puGroups = await q(`
    SELECT
      brand_name,
      COUNT(*) as sku_count,
      array_agg(sku ORDER BY name) as skus,
      array_agg(name ORDER BY name) as names
    FROM pu_catalog
    WHERE lower(name) LIKE '%cable%' AND brand_name IS NOT NULL
    GROUP BY brand_name,
      regexp_replace(lower(name), '[\\s\\-]*(\\d+["\\'']?\\s*(in|inch|cm|mm|ft)?|std|standard|ext|extended|+[0-9]|[0-9]+cm|[0-9]+mm|stainless|black|chrome|braided)\\s*$', '', 'ig')
    HAVING COUNT(*) > 1
    ORDER BY sku_count DESC
    LIMIT 15
  `);
  puGroups.forEach(r => {
    console.log(`\n  [${r.brand_name}] ${r.sku_count} SKUs`);
    r.names.forEach((n, i) => console.log(`    [${r.skus[i]}] ${n}`));
  });

  // ── 8. catalog_unified — Motion Pro blackout to see what survives merge ───
  console.log('\n\n── 8. CATALOG_UNIFIED — MOTION PRO BLACKOUT CABLES ──');
  const cuBlackout = await q(`
    SELECT cu.sku, cu.name, cu.brand_name, cu.source_vendor,
           cu.description, cu.features
    FROM catalog_unified cu
    WHERE lower(cu.brand_name) LIKE '%motion pro%'
      AND lower(cu.name) LIKE '%blackout%'
    ORDER BY cu.name
    LIMIT 20
  `);
  if (cuBlackout.length) {
    cuBlackout.forEach(r => {
      console.log(`\n  [${r.sku}] ${r.name} (${r.source_vendor})`);
      if (r.features) console.log(`  features: ${JSON.stringify(r.features).slice(0, 300)}`);
      if (r.description) console.log(`  desc: ${r.description.slice(0, 200)}`);
    });
  } else {
    console.log('  (no blackout cables in catalog_unified)');
  }

  // ── 9. catalog_unified columns ────────────────────────────────────────────
  console.log('\n\n── 9. CATALOG_UNIFIED COLUMNS ──');
  const cuCols = await q(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'catalog_unified'
    ORDER BY ordinal_position
  `);
  cuCols.forEach(r => console.log(`  ${r.column_name.padEnd(35)} ${r.data_type}`));

  // ── 10. WPS API — check if attributes table exists from any prior pull ────
  console.log('\n\n── 10. ALL TABLES (looking for attrs/options/variants) ──');
  const tables = await q(`
    SELECT table_name, 
      (SELECT reltuples::bigint FROM pg_class WHERE relname = table_name) as est_rows
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  tables.forEach(r => console.log(`  ${r.table_name.padEnd(45)} ~${r.est_rows} rows`));

  await pool.end();
  console.log('\nDone.');
}
main().catch(e => { console.error(e); process.exit(1); });
