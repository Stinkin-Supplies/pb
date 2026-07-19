#!/usr/bin/env node
// explore_variant_data.cjs
// Run: node explore_variant_data.cjs
// Purpose: Audit WPS + PU data to understand what variant/option data exists

const { Pool } = require('pg');

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  database: 'stinkin_catalog',
  user: 'catalog_app',
  password: 'smelly',
});

async function q(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function main() {
  console.log('='.repeat(70));
  console.log('VARIANT DATA AUDIT');
  console.log('='.repeat(70));

  // ── 1. WPS CATALOG SCHEMA ─────────────────────────────────────────────────
  console.log('\n\n── 1. WPS_CATALOG COLUMNS ──');
  const wpsCols = await q(`
    SELECT column_name, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_name = 'wps_catalog'
    ORDER BY ordinal_position
  `);
  wpsCols.forEach(r => console.log(`  ${r.column_name.padEnd(35)} ${r.data_type}`));

  // ── 2. WPS sample clutch cable rows ──────────────────────────────────────
  console.log('\n\n── 2. WPS SAMPLE — clutch cable (all columns) ──');
  const wpsSample = await q(`
    SELECT * FROM wps_catalog
    WHERE lower(name) LIKE '%clutch cable%'
    LIMIT 3
  `);
  if (wpsSample.length) {
    console.log(JSON.stringify(wpsSample, null, 2));
  } else {
    console.log('  (no clutch cable rows in wps_catalog)');
  }

  // ── 3. WPS — look for any attribute/option/variant columns ───────────────
  console.log('\n\n── 3. WPS ATTRIBUTE-LIKE COLUMNS (non-null sample) ──');
  const attrCols = ['attributes', 'options', 'variants', 'specs', 'features',
                    'attribute1', 'attribute2', 'option1', 'option2',
                    'variant_id', 'parent_sku', 'configurable'];
  for (const col of attrCols) {
    const exists = wpsCols.find(c => c.column_name === col);
    if (exists) {
      const sample = await q(`SELECT ${col} FROM wps_catalog WHERE ${col} IS NOT NULL LIMIT 1`);
      console.log(`  ${col}: EXISTS — sample: ${JSON.stringify(sample[0]?.[col]).slice(0, 120)}`);
    }
  }

  // ── 4. WPS — cables grouped by base name (length variation pattern) ───────
  console.log('\n\n── 4. WPS CABLE GROUPING — same brand+category, varying title ──');
  const cableGroups = await q(`
    SELECT
      brand_name,
      COUNT(*) as sku_count,
      array_agg(sku ORDER BY name) as skus,
      array_agg(name ORDER BY name) as names
    FROM wps_catalog
    WHERE lower(name) LIKE '%cable%'
      AND brand_name IS NOT NULL
    GROUP BY brand_name, 
      -- Strip trailing size/length tokens to find base name groups
      regexp_replace(lower(name), '\\s+(\\d+["\\'']?\\s*(in|inch|cm|mm)?|\\d+\\.\\d+)\\s*$', '', 'i')
    HAVING COUNT(*) > 1
    ORDER BY sku_count DESC
    LIMIT 10
  `);
  cableGroups.forEach(r => {
    console.log(`\n  Brand: ${r.brand_name} — ${r.sku_count} SKUs`);
    r.names.forEach((n, i) => console.log(`    [${r.skus[i]}] ${n}`));
  });

  // ── 5. PU_CATALOG SCHEMA ──────────────────────────────────────────────────
  console.log('\n\n── 5. PU_CATALOG COLUMNS ──');
  const puCols = await q(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'pu_catalog'
    ORDER BY ordinal_position
  `);
  puCols.forEach(r => console.log(`  ${r.column_name.padEnd(35)} ${r.data_type}`));

  // ── 6. PU sample clutch cable ─────────────────────────────────────────────
  console.log('\n\n── 6. PU SAMPLE — clutch cable ──');
  const puSample = await q(`
    SELECT * FROM pu_catalog
    WHERE lower(name) LIKE '%clutch cable%'
    LIMIT 3
  `);
  if (puSample.length) {
    console.log(JSON.stringify(puSample, null, 2));
  } else {
    console.log('  (no clutch cable rows in pu_catalog)');
  }

  // ── 7. PU features column — look for structured option data ──────────────
  console.log('\n\n── 7. PU FEATURES COLUMN SAMPLES (cables) ──');
  const puFeatures = await q(`
    SELECT sku, name, features
    FROM pu_catalog
    WHERE lower(name) LIKE '%cable%'
      AND features IS NOT NULL
    LIMIT 5
  `);
  puFeatures.forEach(r => {
    console.log(`\n  [${r.sku}] ${r.name}`);
    console.log(`  features: ${JSON.stringify(r.features).slice(0, 300)}`);
  });

  // ── 8. PU — any explicit variant/parent columns? ─────────────────────────
  console.log('\n\n── 8. PU ATTRIBUTE-LIKE COLUMNS ──');
  for (const col of attrCols) {
    const exists = puCols.find(c => c.column_name === col);
    if (exists) {
      const sample = await q(`SELECT ${col} FROM pu_catalog WHERE ${col} IS NOT NULL LIMIT 1`);
      console.log(`  ${col}: EXISTS — sample: ${JSON.stringify(sample[0]?.[col]).slice(0, 120)}`);
    }
  }

  // ── 9. PU cable grouping same as WPS ──────────────────────────────────────
  console.log('\n\n── 9. PU CABLE GROUPING — same base name, multiple SKUs ──');
  const puCableGroups = await q(`
    SELECT
      brand_name,
      COUNT(*) as sku_count,
      array_agg(sku ORDER BY name) as skus,
      array_agg(name ORDER BY name) as names
    FROM pu_catalog
    WHERE lower(name) LIKE '%cable%'
      AND brand_name IS NOT NULL
    GROUP BY brand_name,
      regexp_replace(lower(name), '\\s+(\\d+["\\'']?\\s*(in|inch|cm|mm)?|\\d+\\.\\d+)\\s*$', '', 'i')
    HAVING COUNT(*) > 1
    ORDER BY sku_count DESC
    LIMIT 10
  `);
  puCableGroups.forEach(r => {
    console.log(`\n  Brand: ${r.brand_name} — ${r.sku_count} SKUs`);
    r.names.forEach((n, i) => console.log(`    [${r.skus[i]}] ${n}`));
  });

  // ── 10. catalog_unified — what option-like columns exist? ─────────────────
  console.log('\n\n── 10. CATALOG_UNIFIED COLUMNS ──');
  const cuCols = await q(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'catalog_unified'
    ORDER BY ordinal_position
  `);
  cuCols.forEach(r => console.log(`  ${r.column_name.padEnd(35)} ${r.data_type}`));

  // ── 11. Motion Pro specifically — how many SKUs, what patterns? ───────────
  console.log('\n\n── 11. MOTION PRO IN CATALOG_UNIFIED ──');
  const mpStats = await q(`
    SELECT category, COUNT(*) as cnt
    FROM catalog_unified
    WHERE lower(brand_name) LIKE '%motion pro%'
    GROUP BY category
    ORDER BY cnt DESC
    LIMIT 10
  `);
  mpStats.forEach(r => console.log(`  ${(r.category || 'NULL').padEnd(50)} ${r.cnt}`));

  console.log('\n\n── 11b. MOTION PRO CABLE SAMPLE — full rows ──');
  const mpSample = await q(`
    SELECT sku, name, brand_name, category, description
    FROM catalog_unified
    WHERE lower(brand_name) LIKE '%motion pro%'
      AND lower(name) LIKE '%cable%'
    ORDER BY name
    LIMIT 20
  `);
  mpSample.forEach(r => console.log(`  [${r.sku}] ${r.name}`));

  // ── 12. Look at pu_brand_enrichment for structured attrs ─────────────────
  console.log('\n\n── 12. PU_BRAND_ENRICHMENT COLUMNS ──');
  const pbeCols = await q(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'pu_brand_enrichment'
    ORDER BY ordinal_position
  `);
  pbeCols.forEach(r => console.log(`  ${r.column_name.padEnd(35)} ${r.data_type}`));

  console.log('\n\n── 12b. PU_BRAND_ENRICHMENT — cable sample ──');
  const pbeSample = await q(`
    SELECT * FROM pu_brand_enrichment
    WHERE lower(item_description) LIKE '%cable%'
    LIMIT 2
  `);
  if (pbeSample.length) console.log(JSON.stringify(pbeSample, null, 2));

  // ── 13. WPS API — check if we have any enriched attribute data anywhere ───
  console.log('\n\n── 13. ANY OTHER TABLES WITH "ATTRIBUTE" OR "OPTION" IN NAME ──');
  const attrTables = await q(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (lower(table_name) LIKE '%attr%' OR lower(table_name) LIKE '%option%' OR lower(table_name) LIKE '%variant%')
    ORDER BY table_name
  `);
  if (attrTables.length) attrTables.forEach(r => console.log(`  ${r.table_name}`));
  else console.log('  (none found)');

  await pool.end();
  console.log('\n\nDone.\n');
}

main().catch(e => { console.error(e); process.exit(1); });
