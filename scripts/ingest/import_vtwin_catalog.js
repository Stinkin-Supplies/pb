#!/usr/bin/env node
// import_vtwin_catalog.js
// Ingests VTwin data into vtwin_catalog
// Sources:
//   scripts/data/vtwin/vtwin-master.csv      — all product data
//   scripts/data/vtwin/vtwin_catagory.csv    — page number → category/family map

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';

const { Pool } = pg;

const VTWIN_DIR  = path.resolve('scripts/data/vtwin');
const MASTER     = path.join(VTWIN_DIR, 'vtwin-master.csv');
const CATEGORIES = path.join(VTWIN_DIR, 'vtwin_catagory.csv');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

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
  // MM/DD/YYYY
  const parts = s.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  return null;
}

function cleanStr(val) {
  if (!val) return null;
  const s = val.toString().trim();
  return s === '' ? null : s;
}

// Build page → {category, family} map from vtwin_catagory.csv
// Format: ,Category,Pg_Number,FAMILY
// FAMILY rows have no page, category rows have page ranges like "94-105"
function loadCategoryMap() {
  const raw = fs.readFileSync(CATEGORIES, 'utf8');
  const rows = parse(raw, { columns: false, skip_empty_lines: true, trim: true });

  const pageMap = new Map(); // page_number → {category, family}
  let currentFamily = null;
  let currentCategory = null;

  for (const row of rows) {
    // Skip header row
    if (row[1] === 'Category') continue;

    const col0 = (row[0] || '').trim();
    const col1 = (row[1] || '').trim();
    const col2 = (row[2] || '').trim();
    const col3 = (row[3] || '').trim();

    // Family row: col3 has family name, col1 empty or family name, col2 empty
    if (col3 && !col2) {
      currentFamily = col3;
      currentCategory = null;
      continue;
    }

    // Category row: col1 has category, col2 has page range
    if (col1 && col2) {
      currentCategory = col1;
      // Parse page range: "94-105" or single "94"
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
  const client = await pool.connect();

  try {
    // Create table if not exists
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
        category            VARCHAR(200),
        family              VARCHAR(200),
        update_date         DATE,
        date_added          DATE,
        created_at          TIMESTAMPTZ   DEFAULT now(),
        updated_at          TIMESTAMPTZ   DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_vtwin_catalog_sku ON vtwin_catalog(sku);
      CREATE INDEX IF NOT EXISTS idx_vtwin_catalog_manufacturer ON vtwin_catalog(manufacturer);
      CREATE INDEX IF NOT EXISTS idx_vtwin_catalog_category ON vtwin_catalog(category);
      CREATE INDEX IF NOT EXISTS idx_vtwin_catalog_family ON vtwin_catalog(family);
    `);

    console.log('Loading category map...');
    const pageMap = loadCategoryMap();
    console.log(`Category map: ${pageMap.size} pages mapped`);

    console.log('Loading vtwin-master.csv...');
    const raw = fs.readFileSync(MASTER, 'utf8');
    const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
    console.log(`Master rows: ${rows.length}`);

    await client.query('TRUNCATE vtwin_catalog RESTART IDENTITY');
    console.log('vtwin_catalog truncated');

    let inserted = 0;
    let errors = 0;

    for (const row of rows) {
      const sku = cleanStr(row['ITEM']);
      if (!sku) continue;

      const page = parseInt2(row['THIS_YR_CATPAGE']);
      const catInfo = page ? (pageMap.get(page) || {}) : {};

      try {
        await client.query(`
          INSERT INTO vtwin_catalog (
            sku, name, dealer_price, retail_price, has_stock, uom,
            this_yr_catpage, last_yr_catpage,
            vendor_part_no, manufacturer, country_of_origin,
            weight_lbs, length_in, width_in, height_in,
            oem_xref1, oem_xref2, oem_xref3,
            thumb_pic, full_pic1, full_pic2, full_pic3, full_pic4,
            category, family,
            update_date, date_added
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27
          )
          ON CONFLICT (sku) DO UPDATE SET
            dealer_price = EXCLUDED.dealer_price,
            retail_price = EXCLUDED.retail_price,
            has_stock = EXCLUDED.has_stock,
            update_date = EXCLUDED.update_date,
            updated_at = now()
        `, [
          sku,                                                    // $1
          cleanStr(row['DESCRIPTION']),                           // $2
          parseDecimal(row['DEALER_PRICE']),                      // $3
          parseDecimal(row['RETAIL_PRICE']),                      // $4
          (row['HAS_STOCK'] || '').trim().toLowerCase() === 'yes',// $5
          cleanStr(row['UOM']),                                   // $6
          parseInt2(row['THIS_YR_CATPAGE']),                      // $7
          parseInt2(row['LAST_YR_CATPAGE']),                      // $8
          cleanStr(row['VENDOR_PARTNO']),                         // $9
          cleanStr(row['MANUFACTURER']),                          // $10
          cleanStr(row['CNTRY_OF_ORIGIN']),                       // $11
          parseDecimal(row['WEIGHT_LBS']),                        // $12
          parseDecimal(row['LENGTH_INCH']),                       // $13
          parseDecimal(row['WIDTH_INCH']),                        // $14
          parseDecimal(row['HEIGHT_INCH']),                       // $15
          cleanStr(row['OEM_XREF1']),                             // $16
          cleanStr(row['OEM_XREF2']),                             // $17
          cleanStr(row['OEM_XREF3']),                             // $18
          cleanStr(row['THUMB_PIC']),                             // $19
          cleanStr(row['FULL_PIC1']),                             // $20
          cleanStr(row['FULL_PIC2']),                             // $21
          cleanStr(row['FULL_PIC3']),                             // $22
          cleanStr(row['FULL_PIC4']),                             // $23
          catInfo.category || null,                               // $24
          catInfo.family || null,                                 // $25
          parseDate(row['UPDATE_DATE']),                          // $26
          parseDate(row['DATE_ADDED']),                           // $27
        ]);
        inserted++;
      } catch (e) {
        errors++;
        if (errors <= 5) console.error(`Error on SKU ${sku}:`, e.message);
      }

      if (inserted % 1000 === 0) {
        process.stdout.write(`\r  ${inserted} inserted, ${errors} errors...`);
      }
    }

    console.log(`\n✅ Done — ${inserted} rows inserted into vtwin_catalog, ${errors} errors`);

    // Quick summary
    const res = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(category) as has_category,
        COUNT(CASE WHEN has_stock THEN 1 END) as in_stock,
        COUNT(oem_xref1) as has_oem
      FROM vtwin_catalog
    `);
    console.log('Summary:', res.rows[0]);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
