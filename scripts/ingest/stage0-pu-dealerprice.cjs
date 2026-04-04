/**
 * Stage 0: Import Parts Unlimited D00108 Dealer Price CSV
 * Streams CSV data and stores JSONB batches into raw_vendor_pu on the catalog DB.
 *
 * Targets: process.env.CATALOG_DATABASE_URL (Hetzner Postgres)
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/stage0-pu-dealerprice.cjs
 */

'use strict';

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const FILE_PATH = path.resolve(__dirname, '../data/pu_pricefile/D00108_DealerPrice.csv');
const TABLE = 'raw_vendor_pu';
const BATCH_SIZE = 1000;

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('Missing CATALOG_DATABASE_URL (Hetzner catalog DB connection string).');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// CSV column mapping (0-indexed)
const COLUMNS = {
  partNumber: 0,
  punctuatedPartNumber: 1,
  vendorPartNumber: 2,
  partStatus: 4,
  partDescription: 5,
  originalRetail: 6,
  currentSuggestedRetail: 7,
  baseDealerPrice: 8,
  yourDealerPrice: 9,
  hazardousCode: 10,
  upcCode: 24,
  brandName: 25,
  countryOfOrigin: 26,
  productCode: 28,
  weight: 30,
  // Catalog codes
  fatbookCatalog: 40,
  fatbookMidYearCatalog: 45,
  tireCatalog: 50,
  oldbookCatalog: 55,
  oldbookMidYearCatalog: 60,
  // Availability
  wiAvailability: 13,
  nyAvailability: 14,
  txAvailability: 15,
  caAvailability: 16,
  nvAvailability: 17,
  ncAvailability: 18,
  nationalAvailability: 19,
  // Dimensions
  height: 73,
  length: 74,
  width: 75,
  dropshipFee: 76,
};

/**
 * Parse a single CSV line respecting quoted fields.
 * Handles: "field with, comma", "field with ""quotes""", plain field
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

function toFloatOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function upsertBatch(batchNum, rows) {
  const sourceFile = `dealerprice_batch_${String(batchNum).padStart(6, '0')}`;
  const payload = JSON.stringify(rows);
  await pool.query(
    `INSERT INTO ${TABLE} (payload, source_file, imported_at)
     VALUES ($1::jsonb, $2, NOW())
     ON CONFLICT (source_file) DO UPDATE
       SET payload = EXCLUDED.payload, imported_at = NOW()`,
    [payload, sourceFile]
  );
}

async function importDealerPrice() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found: ${FILE_PATH}`);
    process.exit(1);
  }

  console.log('📥 Stage 0: Importing D00108 Dealer Price CSV into catalog DB...');
  console.log(`File: ${FILE_PATH}`);

  const rl = readline.createInterface({
    input: fs.createReadStream(FILE_PATH),
    crlfDelay: Infinity,
  });

  let isFirstLine = true;
  let rowNum = 0;
  let batchNum = 0;
  let importedRows = 0;
  let failedBatches = 0;
  let batch = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (isFirstLine) {
      // header row
      isFirstLine = false;
      continue;
    }

    rowNum++;
    const cols = parseCsvLine(line);
    batch.push({
      row_num: rowNum,
      part_number: cols[COLUMNS.partNumber] || '',
      punctuated_part_number: cols[COLUMNS.punctuatedPartNumber] || '',
      vendor_part_number: cols[COLUMNS.vendorPartNumber] || '',
      part_status: cols[COLUMNS.partStatus] || '',
      part_description: cols[COLUMNS.partDescription] || '',
      original_retail: toFloatOrNull(cols[COLUMNS.originalRetail]),
      current_suggested_retail: toFloatOrNull(cols[COLUMNS.currentSuggestedRetail]),
      base_dealer_price: toFloatOrNull(cols[COLUMNS.baseDealerPrice]),
      your_dealer_price: toFloatOrNull(cols[COLUMNS.yourDealerPrice]),
      hazardous_code: cols[COLUMNS.hazardousCode] || '',
      upc_code: cols[COLUMNS.upcCode] || '',
      brand_name: cols[COLUMNS.brandName] || '',
      country_of_origin: cols[COLUMNS.countryOfOrigin] || '',
      product_code: cols[COLUMNS.productCode] || '',
      weight: toFloatOrNull(cols[COLUMNS.weight]),
      fatbook_catalog: cols[COLUMNS.fatbookCatalog] || '',
      fatbook_midyear_catalog: cols[COLUMNS.fatbookMidYearCatalog] || '',
      tire_catalog: cols[COLUMNS.tireCatalog] || '',
      oldbook_catalog: cols[COLUMNS.oldbookCatalog] || '',
      oldbook_midyear_catalog: cols[COLUMNS.oldbookMidYearCatalog] || '',
      availability: {
        wi: cols[COLUMNS.wiAvailability] || '0',
        ny: cols[COLUMNS.nyAvailability] || '0',
        tx: cols[COLUMNS.txAvailability] || '0',
        ca: cols[COLUMNS.caAvailability] || '0',
        nv: cols[COLUMNS.nvAvailability] || '0',
        nc: cols[COLUMNS.ncAvailability] || '0',
        national: cols[COLUMNS.nationalAvailability] || '0',
      },
      dimensions: {
        height: toFloatOrNull(cols[COLUMNS.height]),
        length: toFloatOrNull(cols[COLUMNS.length]),
        width: toFloatOrNull(cols[COLUMNS.width]),
      },
      dropship_fee: toFloatOrNull(cols[COLUMNS.dropshipFee]),
    });

    if (batch.length >= BATCH_SIZE) {
      batchNum++;
      const rows = batch;
      batch = [];
      try {
        await upsertBatch(batchNum, rows);
        importedRows += rows.length;
        process.stdout.write(`\r✓ Batch ${batchNum} - ${importedRows} rows imported`);
      } catch (err) {
        failedBatches++;
        console.error(`\nBatch ${batchNum} failed: ${err.message}`);
      }
    }
  }

  if (batch.length > 0) {
    batchNum++;
    try {
      await upsertBatch(batchNum, batch);
      importedRows += batch.length;
    } catch (err) {
      failedBatches++;
      console.error(`\nBatch ${batchNum} failed: ${err.message}`);
    }
  }

  console.log('\n');
  console.log('✅ Stage 0 Complete!');
  console.log(`  Batches written: ${batchNum}`);
  console.log(`  Rows imported:   ${importedRows}`);
  console.log(`  Failed batches:  ${failedBatches}`);
}

async function main() {
  try {
    await importDealerPrice();
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Fatal:', err?.message ?? err);
  process.exit(1);
});
