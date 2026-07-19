#!/usr/bin/env node
/**
 * import_harddrive_crossref.js
 * Imports HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv
 * Maps HD OEM numbers → WPS SKUs → catalog_unified products
 * Adds to catalog_oem_crossref and enriches oem_numbers[]
 *
 * Place in scripts/ingest/
 * Data file: scripts/data/HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv
 */

import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { ProgressBar } from './progress_bar.js';

dotenv.config({ path: '.env.local', override: true });

const pool = new pg.Pool({
  host:     process.env.CATALOG_DB_HOST,
  port:     parseInt(process.env.CATALOG_DB_PORT || '5432'),
  database: process.env.CATALOG_DB_NAME     || 'stinkin_catalog',
  user:     process.env.CATALOG_DB_USER,
  password: process.env.CATALOG_DB_PASSWORD,
});

const DRY      = process.argv.includes('--dry');
const DATA_DIR = path.join(process.cwd(), 'scripts', 'data');
const CSV_FILE = path.join(DATA_DIR, 'HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv');

async function main() {
  console.log('\n🔗 HardDrive OEM Cross-Reference Import\n');
  console.log(`   Mode: ${DRY ? 'DRY RUN' : 'LIVE'}\n`);

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ Missing: ${CSV_FILE}`);
    console.error('   Copy HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv to scripts/data/');
    process.exit(1);
  }

  const rows = parse(fs.readFileSync(CSV_FILE, 'utf8'), {
    columns: true, skip_empty_lines: true,
  });
  console.log(`📄 Loaded ${rows.length.toLocaleString()} rows\n`);

  // Build normalized insert list
  // hd_oem → HD OEM number, wps_id → WPS SKU in catalog_unified
  const toInsert = rows
    .filter(r => r.hd_oem && r.wps_id)
    .map(r => ({
      sku:              r.wps_id.trim(),        // WPS SKU = aftermarket part
      oem_number:       r.hd_oem.trim(),        // HD OEM number it replaces
      oem_manufacturer: 'Harley-Davidson',
      source_file:      'HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv',
      brand_id:         r.brand_id?.trim() || null,
      brand_prod_id:    r.brand_prod_id?.trim() || null,
    }));

  if (DRY) {
    console.log(`✓ ${toInsert.length} rows to insert\n`);
    console.log('Sample:');
    toInsert.slice(0, 8).forEach(r =>
      console.log(`  WPS ${r.sku.padEnd(14)} replaces HD OEM ${r.oem_number.padEnd(12)} (${r.brand_id || ''})`)
    );
    console.log('\nRe-run without --dry to execute.');
    await pool.end();
    return;
  }

  // Insert into catalog_oem_crossref
  console.log('📥 Inserting into catalog_oem_crossref...');
  const bar = new ProgressBar(toInsert.length, 'Inserting');
  let inserted = 0, skipped = 0;

  for (let i = 0; i < toInsert.length; i++) {
    const r = toInsert[i];
    try {
      await pool.query(`
        INSERT INTO catalog_oem_crossref
          (sku, oem_number, oem_manufacturer, source_file)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (sku, oem_number) DO UPDATE SET
          source_file = EXCLUDED.source_file
      `, [r.sku, r.oem_number, r.oem_manufacturer, r.source_file]);
      inserted++;
    } catch {
      skipped++;
    }
    bar.update(i + 1);
  }
  bar.finish('Inserted');

  // Enrich oem_numbers[] on catalog_unified
  console.log('\n🔗 Enriching catalog_unified with OEM numbers...');
  const { rowCount: enriched } = await pool.query(`
    UPDATE catalog_unified cu
    SET oem_numbers = subq.oem_arr
    FROM (
      SELECT
        cu2.internal_sku,
        array_agg(DISTINCT cx.oem_number ORDER BY cx.oem_number) AS oem_arr
      FROM catalog_oem_crossref cx
      JOIN catalog_unified cu2 ON (
        cu2.sku = cx.sku
        OR cu2.brand_part_number = cx.sku
      )
      WHERE cu2.internal_sku IS NOT NULL
      GROUP BY cu2.internal_sku
    ) subq
    WHERE cu.internal_sku = subq.internal_sku
  `);

  // Also insert into vendor_sku_crossref to link WPS SKU → internal_sku
  console.log('🔗 Updating vendor_sku_crossref...');
  const { rowCount: crossrefAdded } = await pool.query(`
    INSERT INTO vendor_sku_crossref (internal_sku, vendor_code, vendor_sku, source)
    SELECT DISTINCT
      cu.internal_sku,
      'wps',
      cu.sku,
      'harddrive_crossref'
    FROM catalog_unified cu
    WHERE cu.source_vendor = 'WPS'
      AND cu.internal_sku IS NOT NULL
      AND cu.sku IN (
        SELECT DISTINCT sku FROM catalog_oem_crossref
        WHERE source_file = 'HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv'
      )
    ON CONFLICT (internal_sku, vendor_code) DO NOTHING
  `);

  // Summary stats
  const { rows: stats } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM catalog_oem_crossref
       WHERE source_file = 'HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv')::int AS hd_rows,
      (SELECT COUNT(*) FROM catalog_oem_crossref)::int AS total_crossref,
      (SELECT COUNT(*) FROM catalog_unified
       WHERE oem_numbers IS NOT NULL
       AND array_length(oem_numbers,1) > 0)::int AS products_enriched
  `);
  const s = stats[0];

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  HardDrive Crossref Import Complete!

  Rows inserted:       ${inserted.toLocaleString()}
  Skipped (dupes):     ${skipped.toLocaleString()}
  HD crossref rows:    ${s.hd_rows.toLocaleString()}
  Total crossref:      ${s.total_crossref.toLocaleString()}
  Products enriched:   ${s.products_enriched.toLocaleString()}
  Crossref links added:${crossrefAdded.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  await pool.end();
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
