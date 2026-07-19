#!/usr/bin/env node
/**
 * pull_vtwin_catalog.mjs
 *
 * Replaces import_vtwin_catalog.js (same truncate-then-reload pattern that
 * caused catalog_unified's data loss -- see HANDOFF_LOG.md). The per-row
 * logic here is unchanged from the original (it already used
 * ON CONFLICT (sku) DO UPDATE correctly); the only structural change is
 * removing the unconditional full-table wipe that ran before the
 * loop, and adding the same dry-run-by-default / --apply / single-transaction
 * guards as every other script in this recovery pass.
 *
 * Sources (unchanged):
 *   scripts/data/vtwin/vtwin-master.csv      — all product data
 *   scripts/data/vtwin/vtwin_catagory.csv    — page number → category/family map
 *
 * Usage:
 *   node pull_vtwin_catalog.mjs                    # dry run
 *   node pull_vtwin_catalog.mjs --apply             # writes rows
 *   node pull_vtwin_catalog.mjs --file path.csv     # use a different source file
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');

const VTWIN_DIR  = path.resolve('scripts/data/vtwin');
const CATEGORIES = path.join(VTWIN_DIR, 'vtwin_catagory.csv');

const fileArgIdx = process.argv.indexOf('--file');
const MASTER = fileArgIdx !== -1
  ? path.resolve(process.argv[fileArgIdx + 1])
  : path.join(VTWIN_DIR, 'vtwin-master.csv');

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function parseDecimal(val) {
  if (!val || val.toString().trim() === '') return null;
  const n = parseFloat(val.toString().replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function parseInt2(val) {
  if (!val || val.toString().trim() === '') return null;
  const n = parseInt(val.toString().trim());
  return isNaN(n) ? null : n;
}

function parseDate(val) {
  if (!val || val.toString().trim() === '' || val.toString().trim() === '20000101') return null;
  const s = val.toString().trim();
  const parts = s.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  return null;
}

function cleanStr(val) {
  if (!val) return null;
  const s = val.toString().trim();
  return s === '' ? null : s;
}

function loadCategoryMap() {
  if (!fs.existsSync(CATEGORIES)) {
    console.warn('vtwin_catagory.csv not found -- skipping category mapping');
    return new Map();
  }
  const rows = parse(fs.readFileSync(CATEGORIES, 'utf8'), { columns: false, skip_empty_lines: true, trim: true });

  const pageMap = new Map();
  let currentFamily = null;
  let currentCategory = null;

  for (const row of rows) {
    if (row[1] === 'Category') continue;
    const col1 = (row[1] || '').trim();
    const col2 = (row[2] || '').trim();
    const col3 = (row[3] || '').trim();

    if (col3 && !col2) {
      currentFamily = col3;
      currentCategory = null;
      continue;
    }
    if (col1 && col2) {
      currentCategory = col1;
      const rangeParts = col2.split('-');
      const start = parseInt(rangeParts[0]);
      const end = rangeParts[1] ? parseInt(rangeParts[1]) : start;
      if (!isNaN(start)) {
        for (let p = start; p <= end; p++) {
          pageMap.set(p, { category: currentCategory, family: currentFamily });
        }
      }
    }
  }
  return pageMap;
}

async function main() {
  if (!fs.existsSync(MASTER)) {
    console.error(`Missing source file: ${MASTER}`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    // Idempotent -- safe to run even if the table already exists.
    await client.query(`
      CREATE TABLE IF NOT EXISTS vtwin_catalog (
        id                  SERIAL PRIMARY KEY,
        sku                 VARCHAR(50)   NOT NULL UNIQUE,
        name                TEXT          NOT NULL,
        dealer_price        NUMERIC(10,2),
        retail_price        NUMERIC(10,2),
        has_stock           BOOLEAN       DEFAULT false,
        uom                 VARCHAR(20),
        this_yr_catpage     INTEGER,
        last_yr_catpage     INTEGER,
        vendor_part_no      VARCHAR(100),
        manufacturer        VARCHAR(200),
        country_of_origin   VARCHAR(50),
        weight_lbs          NUMERIC(8,3),
        length_in           NUMERIC(8,3),
        width_in            NUMERIC(8,3),
        height_in           NUMERIC(8,3),
        oem_xref1           VARCHAR(100),
        oem_xref2           VARCHAR(100),
        oem_xref3           VARCHAR(100),
        thumb_pic           TEXT,
        full_pic1           TEXT,
        full_pic2           TEXT,
        full_pic3           TEXT,
        full_pic4           TEXT,
        update_date         DATE,
        date_added          DATE,
        created_at          TIMESTAMPTZ   DEFAULT now(),
        updated_at          TIMESTAMPTZ   DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_vtwin_catalog_sku ON vtwin_catalog(sku);
      CREATE INDEX IF NOT EXISTS idx_vtwin_catalog_manufacturer ON vtwin_catalog(manufacturer);
    `);

    console.log('Loading category map...');
    const pageMap = loadCategoryMap();
    console.log(`Category map: ${pageMap.size} pages mapped`);

    console.log('Loading vtwin master file...');
    const rows = parse(fs.readFileSync(MASTER, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
    console.log(`Master rows: ${rows.length}`);

    const validRows = rows.filter((row) => cleanStr(row['ITEM']));
    const existing = await client.query(`SELECT sku FROM vtwin_catalog`);
    const existingSkus = new Set(existing.rows.map((r) => r.sku));
    const newCount = validRows.filter((r) => !existingSkus.has(cleanStr(r['ITEM']))).length;

    console.log(`\n=== Sync plan ===`);
    console.log(`  vtwin_catalog currently has ${existingSkus.size} rows`);
    console.log(`  ${newCount} new inserts, ${validRows.length - newCount} existing rows refreshed`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    console.log('\nApplying (single transaction)...');
    await client.query('BEGIN');

    let inserted = 0, errors = 0;
    for (const row of validRows) {
      const sku = cleanStr(row['ITEM']);

      try {
        await client.query('SAVEPOINT row_sp');
        await client.query(`
          INSERT INTO vtwin_catalog (
            sku, name, dealer_price, retail_price, has_stock, uom,
            this_yr_catpage, last_yr_catpage,
            vendor_part_no, manufacturer, country_of_origin,
            weight_lbs, length_in, width_in, height_in,
            oem_xref1, oem_xref2, oem_xref3,
            thumb_pic, full_pic1, full_pic2, full_pic3, full_pic4,
            update_date, date_added
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25
          )
          ON CONFLICT (sku) DO UPDATE SET
            name               = EXCLUDED.name,
            dealer_price       = EXCLUDED.dealer_price,
            retail_price       = EXCLUDED.retail_price,
            has_stock          = EXCLUDED.has_stock,
            uom                = EXCLUDED.uom,
            this_yr_catpage    = EXCLUDED.this_yr_catpage,
            last_yr_catpage    = EXCLUDED.last_yr_catpage,
            vendor_part_no     = EXCLUDED.vendor_part_no,
            manufacturer       = EXCLUDED.manufacturer,
            country_of_origin  = EXCLUDED.country_of_origin,
            weight_lbs         = EXCLUDED.weight_lbs,
            length_in          = EXCLUDED.length_in,
            width_in           = EXCLUDED.width_in,
            height_in          = EXCLUDED.height_in,
            oem_xref1          = EXCLUDED.oem_xref1,
            oem_xref2          = EXCLUDED.oem_xref2,
            oem_xref3          = EXCLUDED.oem_xref3,
            thumb_pic          = EXCLUDED.thumb_pic,
            full_pic1          = EXCLUDED.full_pic1,
            full_pic2          = EXCLUDED.full_pic2,
            full_pic3          = EXCLUDED.full_pic3,
            full_pic4          = EXCLUDED.full_pic4,
            update_date        = EXCLUDED.update_date,
            updated_at         = now()
        `, [
          sku, cleanStr(row['DESCRIPTION']), parseDecimal(row['DEALER_PRICE']), parseDecimal(row['RETAIL_PRICE']),
          (row['HAS_STOCK'] || '').trim().toLowerCase() === 'yes', cleanStr(row['UOM']),
          parseInt2(row['THIS_YR_CATPAGE']), parseInt2(row['LAST_YR_CATPAGE']),
          cleanStr(row['VENDOR_PARTNO']), cleanStr(row['MANUFACTURER']), cleanStr(row['CNTRY_OF_ORIGIN']),
          parseDecimal(row['WEIGHT_LBS']), parseDecimal(row['LENGTH_INCH']), parseDecimal(row['WIDTH_INCH']), parseDecimal(row['HEIGHT_INCH']),
          cleanStr(row['OEM_XREF1']), cleanStr(row['OEM_XREF2']), cleanStr(row['OEM_XREF3']),
          cleanStr(row['THUMB_PIC']), cleanStr(row['FULL_PIC1']), cleanStr(row['FULL_PIC2']), cleanStr(row['FULL_PIC3']), cleanStr(row['FULL_PIC4']),
          parseDate(row['UPDATE_DATE']), parseDate(row['DATE_ADDED']),
        ]);
        await client.query('RELEASE SAVEPOINT row_sp');
        inserted++;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp').catch(() => {});
        errors++;
        if (errors <= 5) console.error(`\n  Error on SKU ${sku}:`, e.message);
      }
      if ((inserted + errors) % 1000 === 0) process.stdout.write(`\r  ${inserted}/${validRows.length} synced, ${errors} errors`);
    }
    console.log(`\n  ${inserted}/${validRows.length} synced, ${errors} errors`);

    console.log('\nRebuilding oem_numbers from xref columns...');
    const { rowCount: oemUpdated } = await client.query(`
      UPDATE vtwin_catalog
      SET oem_numbers = ARRAY(
        SELECT x FROM unnest(ARRAY[
          NULLIF(TRIM(oem_xref1), ''),
          NULLIF(TRIM(oem_xref2), ''),
          NULLIF(TRIM(oem_xref3), '')
        ]) AS x
        WHERE x IS NOT NULL
      )
      WHERE oem_xref1 IS NOT NULL OR oem_xref2 IS NOT NULL OR oem_xref3 IS NOT NULL
    `);
    console.log(`oem_numbers rebuilt for ${oemUpdated} products`);

    const finalCount = await client.query(`SELECT COUNT(*) FROM vtwin_catalog`);
    console.log(`\nCommitting. vtwin_catalog now has ${finalCount.rows[0].count} rows.`);
    await client.query('COMMIT');
    console.log('Done.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nRolled back due to error -- vtwin_catalog is unchanged from before this run:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
