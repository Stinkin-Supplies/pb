#!/usr/bin/env node
/**
 * scripts/ingest/importPuPriceFile.js
 *
 * Downloads the latest Parts Unlimited price file via the PU API,
 * stages it in vendor.pu_pricefile_staging, then mirrors the useful
 * fields into vendor.vendor_products for downstream catalog merges.
 *
 * Fields updated:
 *   our_price, msrp, stock_quantity, hazardous_code,
 *   no_ship_ca, is_atv, is_street, is_snow, is_offroad,
 *   is_watercraft, dropship_fee_pu, weight_lbs
 *
 * After import, triggers Typesense reindex automatically.
 *
 * Usage:
 *   node scripts/ingest/importPuPriceFile.js
 *   node scripts/ingest/importPuPriceFile.js --dry-run
 *   node scripts/ingest/importPuPriceFile.js --skip-reindex
 */

require('dotenv').config({ path: '.env.local' });

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Pool } = require('pg');

// ── Config ────────────────────────────────────────────────────────────────────

const DEALER   = process.env.PARTS_UNLIMITED_DEALER_NUMBER;
const USERNAME = process.env.PARTS_UNLIMITED_USERNAME;
const PASSWORD = process.env.PARTS_UNLIMITED_PASSWORD;

const CATALOG_DATABASE_URL = process.env.CATALOG_DATABASE_URL;

const DRY_RUN      = process.argv.includes('--dry-run');
const SKIP_REINDEX = process.argv.includes('--skip-reindex');
const ZIP_ARG      = process.argv.find(arg => arg.startsWith('--zip='));
const INPUT_ZIP    = ZIP_ARG ? ZIP_ARG.slice('--zip='.length) : null;
const BATCH_SIZE   = 500;
const CACHE_DIR    = path.join(__dirname, '../data');
const WORK_DIR     = path.join(__dirname, '../tmp');
const pool         = new Pool({ connectionString: CATALOG_DATABASE_URL });

let SOURCE_FILE = null;

// ── Validation ────────────────────────────────────────────────────────────────

if (!DEALER || !USERNAME || !PASSWORD) {
  console.error('❌  Missing PU credentials in .env.local');
  console.error('    Required: PARTS_UNLIMITED_DEALER_NUMBER, PARTS_UNLIMITED_USERNAME, PARTS_UNLIMITED_PASSWORD');
  process.exit(1);
}
if (!CATALOG_DATABASE_URL) {
  console.error('❌  Missing CATALOG_DATABASE_URL in .env.local');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); }

function buildAuth() {
  const raw = `${DEALER}/${USERNAME}:${PASSWORD}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

function fetchPriceFileZip() {
  if (INPUT_ZIP) {
    if (!fs.existsSync(INPUT_ZIP)) {
      throw new Error(`Input ZIP not found: ${INPUT_ZIP}`);
    }
    SOURCE_FILE = path.basename(INPUT_ZIP);
    log(`   Using provided ZIP: ${INPUT_ZIP}`);
    return Promise.resolve(fs.readFileSync(INPUT_ZIP));
  }

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

    const today = new Date().toISOString().slice(0, 10); // "2026-04-01"
    const cachedZip = path.join(CACHE_DIR, `pu_pricefile_${today}.zip`);
    SOURCE_FILE = path.basename(cachedZip);

    if (fs.existsSync(cachedZip)) {
      log(`   Using cached file from today (${today})`);
      return resolve(fs.readFileSync(cachedZip));
    }

    log('📥  Requesting price file from Parts Unlimited API...');

    const body = JSON.stringify({
      dealerCodes: [DEALER],
      headersPrepended: true,
      auxillaryColumns: [
        'UPC_CODE',
        'BRAND_NAME',
        'COUNTRY_OF_ORIGIN',
        'PRODUCT_CODE',
        'DRAG_PART',
        'WEIGHT',
        'CLOSEOUT_CATALOG_INDICATOR',
        'RACE_ONLY',
        'DROPSHIP_FEE',
        'HEIGHT',
        'LENGTH',
        'WIDTH',
        'PFAS',
        'HARMONIZED_US',
      ],
      attachingCatalogs: [
        'STREET',
        'ATV',
        'OFFROAD',
        'SNOW',
        'WATERCRAFT',
        'FATBOOK',
        'HELMET_AND_APPAREL',
        'TIRE',
        'STREET_MIDYEAR',
      ],
    });

    const options = {
      hostname: 'dealer.parts-unlimited.com',
      path: '/api/quotes/v2/pricefile',
      method: 'POST',
      headers: {
        'Authorization': buildAuth(),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const chunks = [];
    const req = https.request(options, (res) => {
      log(`   HTTP ${res.statusCode}`);
      if (res.statusCode !== 200) {
        return reject(new Error(`PU API returned HTTP ${res.statusCode}`));
      }
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const zipBuffer = Buffer.concat(chunks);
        fs.writeFileSync(cachedZip, zipBuffer);
        resolve(zipBuffer);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractCsv(zipBuffer) {
  if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });

  const zipPath = path.join(WORK_DIR, 'pu_pricefile.zip');
  const extractDir = path.join(WORK_DIR, 'pu_pricefile');

  fs.writeFileSync(zipPath, zipBuffer);
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
  fs.mkdirSync(extractDir);

  execSync(`unzip -q "${zipPath}" -d "${extractDir}"`);

  const files = fs.readdirSync(extractDir).filter(f => f.endsWith('.csv'));
  if (!files.length) throw new Error('No CSV found in price file zip');

  log(`   Extracted: ${files[0]}`);
  return path.join(extractDir, files[0]);
}

function parseCsv(filePath) {
  log('📊  Parsing CSV...');
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  // Find header row (skip prepended info headers)
  let headerIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('"Part Number"') || lines[i].startsWith('"Part Number"')) {
      headerIdx = i;
      break;
    }
  }

  const headers = parseRow(lines[headerIdx]);
  const rows = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseRow(lines[i]);
    if (vals.length < headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = (vals[idx] || '').trim(); });
    rows.push(row);
  }

  log(`   ${rows.length.toLocaleString()} rows parsed`);
  return rows;
}

function parseRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function catalogFlag(val) {
  // Catalog code present and non-zero means product is in that catalog
  return val && val !== '0' && val !== '' && val !== 'N/A';
}

function slugifyPart(description, partNumber) {
  const base = (description ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 60)
    .replace(/-$/, '');

  const suffix = (partNumber ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-');

  return `${base}-${suffix}`;
}

function mapRowToProduct(row) {
  const sku = row['Part Number'];
  if (!sku) return null;

  const nationalAvail = parseInt(row['National Availability'] || '0', 10);
  const ourPrice      = parseFloat(row['Your Dealer Price'] || '0') ||
                        parseFloat(row['Base Dealer Price'] || '0');
  const msrp          = parseFloat(row['Current Suggested Retail'] || '0');
  const weight        = parseFloat(row['Weight'] || '0');
  const dropshipFee   = parseFloat(row['Dropship Fee'] || '0');
  const hazardous     = row['Hazardous Code'] || null;
  const noShipCa      = row['No Ship to CA'] === 'Y';

  // Catalog flags — any non-zero catalog code = active in that catalog
  const isStreet     = catalogFlag(row['Street Catalog Code']);
  const isAtv        = catalogFlag(row['ATV Catalog Code']);
  const isOffroad    = catalogFlag(row['Offroad Catalog Code']);
  const isSnow       = catalogFlag(row['Snow Catalog Code']);
  const isWatercraft = catalogFlag(row['Watercraft Catalog Code']);
  const name         = row['Part Description'] || row['Product Description'] || sku;
  const slug         = slugifyPart(name, sku);
  const bestPrice    = isNaN(ourPrice) || ourPrice === 0 ? null : ourPrice;
  const description  = row['Product Description'] || row['Part Description'] || null;
  const brand        = row['BRAND_NAME'] || null;
  const categories   = [
    isStreet ? 'street' : null,
    isAtv ? 'atv' : null,
    isOffroad ? 'offroad' : null,
    isSnow ? 'snow' : null,
    isWatercraft ? 'watercraft' : null,
  ].filter(Boolean);

  return {
    sku,
    mfr_sku:        sku,
    name,
    slug,
    description_raw: description,
    brand,
    categories_raw: categories,
    attributes_raw:  row,
    best_price:     bestPrice,
    msrp:           isNaN(msrp) || msrp === 0 ? null : msrp,
    total_qty:      isNaN(nationalAvail) ? 0 : nationalAvail,
    in_stock:       nationalAvail > 0 ? 1 : 0,
    hazardous_code: hazardous || null,
    no_ship_ca:     noShipCa,
    is_atv:         isAtv,
    is_street:      isStreet,
    is_snow:        isSnow,
    is_offroad:     isOffroad,
    is_watercraft:  isWatercraft,
    weight_lbs:     isNaN(weight) || weight === 0 ? null : weight,
    dropship_fee_pu: isNaN(dropshipFee) || dropshipFee === 0 ? null : dropshipFee,
    source_file:    SOURCE_FILE,
    source_row:     row,
  };
}

function buildBatchUpsertSql(tableName, columns, conflictColumn, updateColumns, rows) {
  const values = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((col) => {
      values.push(row[col] ?? null);
      return `$${values.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  const updates = updateColumns.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

  return {
    text: `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${tuples.join(', ')}
      ON CONFLICT (${conflictColumn}) DO UPDATE SET
        ${updates}
    `,
    values,
  };
}

async function upsertStagingBatch(batch) {
  const columns = [
    'mfr_sku',
    'sku',
    'name',
    'slug',
    'description_raw',
    'brand',
    'categories_raw',
    'attributes_raw',
    'best_price',
    'msrp',
    'total_qty',
    'in_stock',
    'hazardous_code',
    'no_ship_ca',
    'is_atv',
    'is_street',
    'is_snow',
    'is_offroad',
    'is_watercraft',
    'weight_lbs',
    'dropship_fee_pu',
    'source_file',
    'source_row',
    'imported_at',
    'updated_at',
  ];

  const now = new Date().toISOString();
  const rows = batch.map((row) => ({
    ...row,
    categories_raw: JSON.stringify(row.categories_raw ?? []),
    attributes_raw: JSON.stringify(row.attributes_raw ?? {}),
    source_row: JSON.stringify(row.source_row ?? {}),
    imported_at: now,
    updated_at: now,
  }));

  const updateColumns = columns.filter((col) => !['mfr_sku', 'imported_at'].includes(col));
  const { text, values } = buildBatchUpsertSql(
    'vendor.pu_pricefile_staging',
    columns,
    'mfr_sku',
    updateColumns,
    rows,
  );
  await pool.query(text, values);
}

async function mergeVendorBatch(batch) {
  const columns = [
    'vendor_code',
    'vendor_part_number',
    'manufacturer_part_number',
    'title',
    'description_raw',
    'brand',
    'categories_raw',
    'attributes_raw',
    'msrp',
    'map_price',
    'wholesale_cost',
    'vendor_fees',
    'drop_ship_fee',
    'images_raw',
    'fitment_raw',
    'status',
    'unit_of_measurement',
    'weight',
    'length',
    'width',
    'height',
    'created_at',
    'updated_at',
  ];

  const now = new Date().toISOString();
  const rows = batch.map((row) => ({
    vendor_code: 'pu',
    vendor_part_number: row.mfr_sku,
    manufacturer_part_number: row.sku,
    title: row.name,
    description_raw: row.description_raw,
    brand: row.brand,
    categories_raw: JSON.stringify(row.categories_raw ?? []),
    attributes_raw: JSON.stringify(row.attributes_raw ?? {}),
    msrp: row.msrp,
    map_price: row.best_price,
    wholesale_cost: row.best_price,
    vendor_fees: JSON.stringify({
      dropship_fee_pu: row.dropship_fee_pu,
    }),
    drop_ship_fee: row.dropship_fee_pu,
    images_raw: JSON.stringify([]),
    fitment_raw: JSON.stringify([]),
    status: null,
    unit_of_measurement: null,
    weight: row.weight_lbs,
    length: null,
    width: null,
    height: null,
    created_at: now,
    updated_at: now,
  }));

  const updateColumns = columns.filter((col) => !['vendor_code', 'vendor_part_number', 'created_at'].includes(col));
  const { text, values } = buildBatchUpsertSql(
    'vendor.vendor_products',
    columns,
    'vendor_part_number',
    updateColumns,
    rows,
  );
  await pool.query(text, values);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🏍️   PU Price File Import');
  console.log('════════════════════════════════════════');
  if (DRY_RUN) log('⚠️   DRY RUN — no DB writes\n');

  const startTime = Date.now();

  // 1. Download
  const zipBuffer = await fetchPriceFileZip();
  log(`   Downloaded: ${(zipBuffer.length / 1024 / 1024).toFixed(1)} MB`);

  // 2. Extract
  const csvPath = extractCsv(zipBuffer);

  // 3. Parse
  const rows = parseCsv(csvPath);

  // 4. Map rows to product updates
  const products = rows.map(mapRowToProduct).filter(Boolean);
  log(`   ${products.length.toLocaleString()} valid products to upsert\n`);

  if (DRY_RUN) {
    log('Sample (first 3 rows):');
    console.log(JSON.stringify(products.slice(0, 3), null, 2));
    log('\n✅  Dry run complete — no changes made');
    return;
  }

  // 5. Upsert in batches
  log('💾  Upserting into PU staging and vendor catalog...');
  let updated = 0;
  let failed  = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    try {
      await upsertStagingBatch(batch);
      await mergeVendorBatch(batch);
      updated += batch.length;
    } catch (err) {
      failed += batch.length;
      console.error(`   ❌ Batch at offset ${i} failed:`, err.message);
    }

    const pct = Math.round(((i + batch.length) / products.length) * 100);
    process.stdout.write(`\r   Progress: ${(i + batch.length).toLocaleString()} / ${products.length.toLocaleString()} (${pct}%)`);
  }

  console.log('\n');
  log(`   Updated: ${updated.toLocaleString()}`);
  log(`   Failed:  ${failed}`);

  // 6. Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`   Time:    ${elapsed}s`);

  // 7. Merge into catalog
  if (failed === 0) {
    log('\n🔗  Merging PU vendor rows into catalog...');
    try {
      execSync('node scripts/ingest/phase2-merge.js', { stdio: 'inherit' });
    } catch (err) {
      failed = products.length;
      console.error('❌  Catalog merge failed:', err.message);
    }
  }

  // 8. Reindex Typesense
  if (!SKIP_REINDEX && failed === 0) {
    log('\n🔍  Triggering Typesense reindex...');
    try {
      execSync('node scripts/ingest/indexTypesense.js', { stdio: 'inherit' });
    } catch (err) {
      console.error('❌  Reindex failed:', err.message);
    }
  } else if (failed > 0) {
    log('\n⚠️   Skipping reindex — there were failures. Fix and re-run.');
  } else {
    log('\n⏭️   Skipping reindex (--skip-reindex flag)');
  }

  // 9. Cleanup tmp
  try { fs.rmSync(WORK_DIR, { recursive: true, force: true }); } catch {}

  console.log('\n✅  PU price file import complete!');
}

main()
  .catch(err => {
    console.error('\n❌  Import failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
