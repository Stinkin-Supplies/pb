/**
 * scripts/ingest/stage0-pu-dealerprice.cjs
 *
 * Imports D00108_DealerPrice.csv into raw_vendor_pu.
 * This file has full catalog codes including Fatbook, Oldbook, Tire.
 *
 * Key columns used for catalog filtering:
 *   Fatbook Catalog Code  → fatbook_catalog (non-empty = Fatbook product)
 *   Oldbook Catalog Code  → oldbook_catalog (non-empty = Oldbook product)
 *   Tire Catalog Code     → tire_catalog    (non-empty = Tire/Service product)
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/stage0-pu-dealerprice.cjs
 */

'use strict';

const fs       = require('fs');
const readline = require('readline');
const path     = require('path');
const { Pool } = require('pg');

const FILE_PATH  = path.resolve(__dirname, '../data/pu_pricefile/D00108_DealerPrice.csv');
const BATCH_SIZE = 1000;
const TABLE      = 'raw_vendor_pu';
const SOURCE_PREFIX = 'dealerprice_batch_';

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsvLine(line) {
  const fields = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch   = line[i];
    const next = line[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { current += '"'; i++; }
      else if (ch === '"')             { inQuotes = false; }
      else                             { current += ch; }
    } else {
      if (ch === '"')       { inQuotes = true; }
      else if (ch === ',')  { fields.push(current.trim()); current = ''; }
      else                  { current += ch; }
    }
  }
  fields.push(current.trim());
  return fields;
}

function toNum(v) {
  if (!v || v === '' || v === 'N/A') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function toBool(v) {
  return ['y', 'yes', '1', 'true', 'x', 'n'].includes(String(v ?? '').toLowerCase().trim())
    ? String(v).toLowerCase().trim() !== 'n'
    : false;
}

function mapRow(headers, values) {
  const r = {};
  headers.forEach((h, i) => { r[h] = values[i] ?? ''; });

  return {
    sku:                   r['Part Number']                    || null,
    vendor_part_number:    r['Vendor Part Number']             || null,
    name:                  r['Part Description']               || null,
    brand:                 r['Brand Name']                     || null,
    status:                r['Part Status']                    || null,
    uom:                   r['Unit of Measure']                || null,
    weight:                toNum(r['Weight']),
    cost:                  toNum(r['Base Dealer Price']),
    your_dealer_price:     toNum(r['Your Dealer Price']),
    msrp:                  toNum(r['Current Suggested Retail']),
    original_retail:       toNum(r['Original Retail']),
    map_price:             r['Ad Policy']                      || null,
    drop_ship_fee:         toNum(r['Dropship Fee']),
    hazardous_code:        r['Hazardous Code']                 || null,
    no_ship_ca:            r['No Ship to CA'] === 'X',
    truck_only:            r['Truck Part Only'] === 'T',
    price_changed_today:   r['Price Changed Today'] === 'U' || r['Price Changed Today'] === 'D',
    product_code:          r['Product Code']?.trim()           || null,
    commodity_code:        r['Commodity Code']?.trim()         || null,
    last_catalog:          r['Last Catalog']                   || null,
    drag_part:             r['Drag Part'] === 'Y',
    closeout:              r['Closeout Catalog Indicator'] === 'Y',
    upc:                   r['UPC Code']                       || null,
    country_of_origin:     r['Country of Origin']              || null,
    part_add_date:         r['Part Add Date']                  || null,
    pfas:                  r['PFAS']                           || null,
    // Warehouse availability
    warehouse_wi:          toNum(r['WI Availability']),
    warehouse_ny:          toNum(r['NY Availability']),
    warehouse_tx:          toNum(r['TX Availability']),
    warehouse_nv:          toNum(r['NV Availability']),
    warehouse_nc:          toNum(r['NC Availability']),
    total_qty:             toNum(r['National Availability']),
    // Catalog codes — KEY FIELDS for allowlist filtering
    street_catalog:        r['Street Catalog Code']            || null,
    fatbook_catalog:       r['Fatbook Catalog Code']           || null,
    fatbook_midyear:       r['Fatbook Mid-Year Catalog Code']  || null,
    tire_catalog:          r['Tire Catalog Code']              || null,
    oldbook_catalog:       r['Oldbook Catalog Code']           || null,
    oldbook_midyear:       r['Oldbook Mid-Year Catalog Code']  || null,
    // Dimensions
    height_in:             toNum(r['Height(inches)']),
    length_in:             toNum(r['Length(inches)']),
    width_in:              toNum(r['Width(inches)']),
  };
}

// ─── DB upsert ────────────────────────────────────────────────────────────────

async function upsertBatch(batchNum, rows) {
  const sourceFile = `${SOURCE_PREFIX}${String(batchNum).padStart(6, '0')}`;
  await pool.query(
    `INSERT INTO ${TABLE} (payload, source_file, imported_at)
     VALUES ($1::jsonb, $2, NOW())
     ON CONFLICT (source_file) DO UPDATE
       SET payload = EXCLUDED.payload, imported_at = NOW()`,
    [JSON.stringify(rows), sourceFile]
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[Stage0-DealerPrice] Starting D00108_DealerPrice.csv import...');
  console.log(`[Stage0-DealerPrice] File: ${FILE_PATH}`);

  if (!fs.existsSync(FILE_PATH)) {
    console.error(`[Stage0-DealerPrice] File not found: ${FILE_PATH}`);
    process.exit(1);
  }

  // Clear existing dealerprice batches before re-import
  const { rowCount } = await pool.query(
    `DELETE FROM ${TABLE} WHERE source_file LIKE '${SOURCE_PREFIX}%'`
  );
  if (rowCount > 0) console.log(`[Stage0-DealerPrice] Cleared ${rowCount} existing batches`);

  const rl = readline.createInterface({
    input:     fs.createReadStream(FILE_PATH, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let headers   = null;
  let batch     = [];
  let batchNum  = 1;
  let totalRows = 0;
  let skipped   = 0;
  let batchCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const values = parseCsvLine(line);

    if (!headers) {
      headers = values.map(h => h.replace(/^"|"$/g, '').trim());
      console.log(`[Stage0-DealerPrice] ${headers.length} columns detected`);
      // Log catalog code columns found
      const catalogCols = headers.filter(h => h.toLowerCase().includes('catalog'));
      console.log(`[Stage0-DealerPrice] Catalog columns: ${catalogCols.join(', ')}`);
      continue;
    }

    const row = mapRow(headers, values);
    if (!row.sku) { skipped++; continue; }

    batch.push(row);
    totalRows++;

    if (batch.length >= BATCH_SIZE) {
      await upsertBatch(batchNum, batch);
      batchCount++;
      // Progress bar — estimate based on ~155k rows typical size
      const est   = 155000;
      const pct   = Math.min(totalRows / est, 1);
      const fill  = Math.round(pct * 26);
      const bar   = '█'.repeat(fill) + '░'.repeat(26 - fill);
      process.stdout.write(`\r[Stage0-DealerPrice] │${bar}│ ${(pct*100).toFixed(1).padStart(5)}% (${totalRows} rows)`);
      batch    = [];
      batchNum++;
    }
  }

  if (batch.length) {
    await upsertBatch(batchNum, batch);
    batchCount++;
  }
  console.log(''); // newline after progress bar

  await pool.end();

  console.log(`\n[Stage0-DealerPrice] Done.`);
  console.log(`  Total rows:    ${totalRows}`);
  console.log(`  Batches:       ${batchCount}`);
  console.log(`  Skipped:       ${skipped}`);
  console.log(`\n  Next: run build-catalog-allowlist.cjs to update Typesense allowlist`);
}

main().catch(err => {
  console.error('[Stage0-DealerPrice] Fatal:', err);
  process.exit(1);
});
