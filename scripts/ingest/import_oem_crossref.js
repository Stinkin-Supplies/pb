#!/usr/bin/env node
/**
 * import_oem_crossref.js
 * Imports Oldbook/FatBook OEM cross-reference CSVs into catalog_oem_crossref
 * then enriches catalog_unified with oem_numbers array
 *
 * Run: node scripts/ingest/import_oem_crossref.js
 * Run (dry): node scripts/ingest/import_oem_crossref.js --dry
 *
 * Place these files in scripts/data/ before running:
 *   - oem_cross_reference.csv
 *   - oem_source_breakdown.csv
 *   - oem_base_index.csv
 */

import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { ProgressBar } from './progress_bar.js';

dotenv.config({ path: '.env.local', override: true });

const pool = new pg.Pool({
  host:     process.env.CATALOG_DB_HOST     || '5.161.100.126',
  port:     parseInt(process.env.CATALOG_DB_PORT || '5432'),
  database: process.env.CATALOG_DB_NAME     || 'stinkin_catalog',
  user:     process.env.CATALOG_DB_USER     || 'deploy',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

const DRY       = process.argv.includes('--dry');
const DATA_DIR  = path.join(process.cwd(), 'scripts', 'data');
const BATCH     = 500;

// HD OEM number pattern: 5-digit base + 2-digit suffix + optional letter(s)
const HD_OEM    = /^\d{4,6}-\d{2}[A-Z]{0,2}$/;
// DS- aftermarket prefix
const DS_PART   = /^DS-/;
// WPS 4-4 style: 0214-0323
const WPS_STYLE = /^\d{4}-\d{4}$/;

function classifyPart(s) {
  if (!s) return 'unknown';
  if (DS_PART.test(s))   return 'ds';
  if (WPS_STYLE.test(s)) return 'wps_style';
  if (HD_OEM.test(s))    return 'hd_oem';
  return 'other';
}

function normalizeRow(row) {
  const oem  = (row.oem_number  || '').trim();
  const part = (row.part_number || '').trim();
  const oemType  = classifyPart(oem);
  const partType = classifyPart(part);

  let aftermarketPart, hdOemNumber;

  if (oemType === 'ds' || oemType === 'wps_style') {
    aftermarketPart = oem;
    hdOemNumber     = part;
  } else if (partType === 'ds' || partType === 'wps_style') {
    aftermarketPart = part;
    hdOemNumber     = oem;
  } else {
    // Both ambiguous — keep as-is, let the DB views handle it
    aftermarketPart = oem;
    hdOemNumber     = part;
  }

  return { aftermarketPart, hdOemNumber, oemType, partType };
}

async function main() {
  console.log('\n🔗 OEM Cross-Reference Import\n');
  console.log(`   Mode: ${DRY ? 'DRY RUN' : 'LIVE'}\n`);

  // ── Read CSV files ──────────────────────────────────────────
  const crossrefPath = path.join(DATA_DIR, 'oem_cross_reference.csv');
  const baseIndexPath = path.join(DATA_DIR, 'oem_base_index.csv');

  if (!fs.existsSync(crossrefPath)) {
    console.error(`❌ Missing: ${crossrefPath}`);
    console.error('   Copy oem_cross_reference.csv to scripts/data/');
    process.exit(1);
  }

  const crossrefRaw = fs.readFileSync(crossrefPath, 'utf8');
  const crossrefRows = parse(crossrefRaw, { columns: true, skip_empty_lines: true });
  console.log(`📄 Loaded ${crossrefRows.length.toLocaleString()} crossref rows\n`);

  // Normalize and deduplicate
  const seen = new Set();
  const toInsert = [];

  for (const row of crossrefRows) {
    const oem  = (row.oem_number  || '').trim();
    const part = (row.part_number || '').trim();
    if (!oem || !part) continue;

    const key = `${oem}||${part}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { aftermarketPart, hdOemNumber } = normalizeRow(row);

    toInsert.push({
      sku:              aftermarketPart,
      oem_number:       hdOemNumber,
      oem_manufacturer: 'Harley-Davidson',
      page_reference:   row.page_number && row.page_number !== 'NULL' ? row.page_number : null,
      source_file:      row.source || 'oem_cross_reference.csv',
      original_oem:     row.original_oem && row.original_oem !== 'NULL' ? row.original_oem : null,
      oem_base:         row.oem_base && row.oem_base !== 'NULL' ? row.oem_base : null,
      is_cross_source:  row.is_cross_source === 'True',
      duplicate_count:  parseInt(row.duplicate_count) || 1,
    });
  }

  console.log(`✓ ${toInsert.length.toLocaleString()} unique rows to insert\n`);

  if (DRY) {
    console.log('Sample normalized rows:');
    toInsert.slice(0, 8).forEach(r =>
      console.log(`  ${r.sku.padEnd(20)} replaces HD OEM ${r.oem_number}`)
    );
    console.log('\nRe-run without --dry to execute.');
    await pool.end();
    return;
  }

  // ── Extend table schema ──────────────────────────────────────
  await pool.query(`
    ALTER TABLE catalog_oem_crossref ADD COLUMN IF NOT EXISTS original_oem    TEXT;
    ALTER TABLE catalog_oem_crossref ADD COLUMN IF NOT EXISTS oem_base        TEXT;
    ALTER TABLE catalog_oem_crossref ADD COLUMN IF NOT EXISTS is_cross_source BOOLEAN DEFAULT FALSE;
    ALTER TABLE catalog_oem_crossref ADD COLUMN IF NOT EXISTS duplicate_count INT DEFAULT 1;
  `);

  // ── Insert in batches ────────────────────────────────────────
  console.log('📥 Inserting crossref rows...');
  const bar = new ProgressBar(toInsert.length, 'Inserting');
  let inserted = 0, skipped = 0;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    for (const r of batch) {
      try {
        await pool.query(`
          INSERT INTO catalog_oem_crossref
            (sku, oem_number, oem_manufacturer, page_reference, source_file,
             original_oem, oem_base, is_cross_source, duplicate_count)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (sku, oem_number) DO UPDATE SET
            source_file      = EXCLUDED.source_file,
            original_oem     = EXCLUDED.original_oem,
            oem_base         = EXCLUDED.oem_base,
            is_cross_source  = EXCLUDED.is_cross_source,
            duplicate_count  = EXCLUDED.duplicate_count
        `, [
          r.sku, r.oem_number, r.oem_manufacturer, r.page_reference,
          r.source_file, r.original_oem, r.oem_base,
          r.is_cross_source, r.duplicate_count
        ]);
        inserted++;
      } catch (err) {
        skipped++;
      }
    }
    bar.update(i + batch.length);
  }
  bar.finish('Crossref imported');

  // ── Enrich catalog_unified with oem_numbers array ────────────
  console.log('\n🔗 Enriching catalog_unified with OEM numbers...');

  await pool.query(`
    ALTER TABLE catalog_unified ADD COLUMN IF NOT EXISTS oem_numbers TEXT[]
  `);

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
        OR cu2.vendor_sku = cx.sku
      )
      WHERE cu2.internal_sku IS NOT NULL
      GROUP BY cu2.internal_sku
    ) subq
    WHERE cu.internal_sku = subq.internal_sku
  `);

  // GIN index for OEM number array search
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_catalog_oem_numbers
    ON catalog_unified USING GIN (oem_numbers)
  `);

  console.log(`   ✓ Enriched ${enriched.toLocaleString()} products with OEM numbers\n`);

  // ── Import oem_base_index ────────────────────────────────────
  if (fs.existsSync(baseIndexPath)) {
    const baseRaw  = fs.readFileSync(baseIndexPath, 'utf8');
    const baseRows = parse(baseRaw, { columns: true, skip_empty_lines: true });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS oem_base_index (
        oem_base     TEXT PRIMARY KEY,
        record_count INT DEFAULT 0,
        unique_parts INT DEFAULT 0,
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    for (const r of baseRows) {
      if (!r.oem_base || r.oem_base === 'NULL') continue;
      await pool.query(`
        INSERT INTO oem_base_index (oem_base, record_count, unique_parts)
        VALUES ($1, $2, $3)
        ON CONFLICT (oem_base) DO UPDATE SET
          record_count = EXCLUDED.record_count,
          unique_parts = EXCLUDED.unique_parts,
          updated_at   = NOW()
      `, [r.oem_base, parseInt(r.record_count)||0, parseInt(r.unique_parts)||0]);
    }
    console.log(`   ✓ OEM base index populated (${baseRows.length} bases)\n`);
  }

  // ── Summary ──────────────────────────────────────────────────
  const { rows: stats } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM catalog_oem_crossref)::int            AS total_crossref,
      (SELECT COUNT(DISTINCT oem_number) FROM catalog_oem_crossref)::int AS unique_oem,
      (SELECT COUNT(DISTINCT sku) FROM catalog_oem_crossref)::int  AS unique_parts,
      (SELECT COUNT(*) FROM catalog_unified
       WHERE oem_numbers IS NOT NULL
       AND array_length(oem_numbers,1) > 0)::int                  AS products_enriched
  `);
  const s = stats[0];

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  OEM Cross-Reference Import Complete!

  Crossref rows:       ${s.total_crossref.toLocaleString()}
  Unique HD OEM #s:    ${s.unique_oem.toLocaleString()}
  Unique aftermarket:  ${s.unique_parts.toLocaleString()}
  Products enriched:   ${s.products_enriched.toLocaleString()}
  Insert errors:       ${skipped.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage examples:
  -- What aftermarket parts replace HD OEM 41733-88?
  SELECT * FROM catalog_oem_crossref WHERE oem_number = '41733-88';

  -- What OEM numbers does DS-097014 replace?
  SELECT * FROM catalog_oem_crossref WHERE sku = 'DS-097014';

  -- Find all catalog products that replace a given OEM
  SELECT cu.name, cu.brand, cu.msrp, cu.in_stock
  FROM catalog_oem_crossref cx
  JOIN catalog_unified cu ON cu.sku = cx.sku
  WHERE cx.oem_number = '41733-88';
`);

  await pool.end();
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
