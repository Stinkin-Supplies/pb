/**
 * Stage 0 — PU Base Price File Importer
 * Streams BasePriceFile.csv in batches and stores each batch as a JSON array
 * in raw_vendor_pu (payload, source_file, imported_at).
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/stage0-pu-baseprice.cjs
 *
 * Re-run safe — ON CONFLICT (source_file) DO UPDATE replaces stale batches.
 */

'use strict';

const fs       = require('fs');
const readline = require('readline');
const path     = require('path');
const { Pool } = require('pg');

// ─── config ───────────────────────────────────────────────────────────────────

const FILE_PATH  = path.resolve(__dirname, '../data/pu_pricefile/BasePriceFile.csv');
const BATCH_SIZE = 1000;
const TABLE      = 'raw_vendor_pu';

// ─── db ───────────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function upsertBatch(batchNum, rows) {
  const sourceFile = `baseprice_batch_${String(batchNum).padStart(6, '0')}`;
  const payload    = JSON.stringify(rows);
  await pool.query(
    `INSERT INTO ${TABLE} (payload, source_file, imported_at)
     VALUES ($1::jsonb, $2, NOW())
     ON CONFLICT (source_file) DO UPDATE
       SET payload = EXCLUDED.payload, imported_at = NOW()`,
    [payload, sourceFile]
  );
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

/**
 * Parse a single CSV line respecting quoted fields.
 * Handles: "field with, comma", "field with ""quotes""", plain field
 */
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
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function toBool(v) {
  if (!v) return false;
  return ['y', 'yes', '1', 'true', 'x'].includes(String(v).toLowerCase().trim());
}

function mapRow(headers, values) {
  const r = {};
  headers.forEach((h, i) => { r[h] = values[i] ?? ''; });

  return {
    sku:                r['Part Number']              || null,
    vendor_part_number: r['Vendor Part Number']       || null,
    name:               r['Part Description']         || null,
    brand:              r['Brand Name']               || null,
    status:             r['Part Status']              || null,
    uom:                r['Unit of Measure']          || null,
    weight:             toNum(r['Weight']),
    cost:               toNum(r['Base Dealer Price']),
    msrp:               toNum(r['Current Suggested Retail']),
    original_retail:    toNum(r['Original Retail']),
    map_price:          r['Ad Policy']               || null,
    drop_ship_fee:      toNum(r['Dropship Fee']),
    hazardous_code:     r['Hazardous Code']          || null,
    no_ship_ca:         toBool(r['No Ship to CA']),
    truck_only:         toBool(r['Truck Part Only']),
    price_changed_today: toBool(r['Price Changed Today']),
    // Warehouse availability
    warehouse_wi:       toNum(r['WI Availability']),
    warehouse_ny:       toNum(r['NY Availability']),
    warehouse_tx:       toNum(r['TX Availability']),
    warehouse_nv:       toNum(r['NV Availability']),
    warehouse_nc:       toNum(r['NC Availability']),
    total_qty:          toNum(r['National Availability']),
    // Sport flags — presence of a catalog code = active in that sport
    is_street:          !!(r['Street Catalog Code']     && r['Street Catalog Code'].trim()),
    is_atv:             !!(r['ATV Catalog Code']        && r['ATV Catalog Code'].trim()),
    is_offroad:         !!(r['Offroad Catalog Code']    && r['Offroad Catalog Code'].trim()),
    is_snow:            !!(r['Snow Catalog Code']       && r['Snow Catalog Code'].trim()),
    is_watercraft:      !!(r['Watercraft Catalog Code'] && r['Watercraft Catalog Code'].trim()),
    // Catalog codes + page refs (useful for admin/search later)
    street_catalog:     r['Street Catalog Code']      || null,
    atv_catalog:        r['ATV Catalog Code']         || null,
    offroad_catalog:    r['Offroad Catalog Code']     || null,
    snow_catalog:       r['Snow Catalog Code']        || null,
    watercraft_catalog: r['Watercraft Catalog Code']  || null,
    // Trademark / notes
    trademark:          r['Trademark']                || null,
    notes:              r['Notes']                    || null,
    part_add_date:      r['Part Add Date']            || null,
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[Stage0-PU] Starting BasePriceFile import...');
  console.log(`[Stage0-PU] File: ${FILE_PATH}`);
  console.log(`[Stage0-PU] Batch size: ${BATCH_SIZE}`);

  if (!fs.existsSync(FILE_PATH)) {
    console.error(`[Stage0-PU] File not found: ${FILE_PATH}`);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input:     fs.createReadStream(FILE_PATH, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let headers    = null;
  let batch      = [];
  let batchNum   = 1;
  let totalRows  = 0;
  let skipped    = 0;
  let batchCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    const values = parseCsvLine(line);

    // First non-empty line = headers
    if (!headers) {
      headers = values.map(h => h.replace(/^"|"$/g, '').trim());
      console.log(`[Stage0-PU] Headers detected: ${headers.length} columns`);
      continue;
    }

    const row = mapRow(headers, values);

    if (!row.sku) { skipped++; continue; }

    batch.push(row);
    totalRows++;

    if (batch.length >= BATCH_SIZE) {
      await upsertBatch(batchNum, batch);
      batchCount++;
      console.log(`[Stage0-PU] Batch ${batchNum} upserted (${totalRows} rows so far)`);
      batch    = [];
      batchNum++;
    }
  }

  // Final partial batch
  if (batch.length) {
    await upsertBatch(batchNum, batch);
    batchCount++;
    console.log(`[Stage0-PU] Batch ${batchNum} upserted (${totalRows} rows total)`);
  }

  await pool.end();

  console.log(`\n[Stage0-PU] Done.`);
  console.log(`  Total rows imported: ${totalRows}`);
  console.log(`  Batches written:     ${batchCount}`);
  console.log(`  Skipped (no SKU):    ${skipped}`);
}

main().catch(err => {
  console.error('[Stage0-PU] Fatal:', err);
  process.exit(1);
});
