#!/usr/bin/env node
/**
 * scripts/ingest/importPuPriceFile.js
 *
 * Downloads the latest Parts Unlimited price file via the PU API,
 * parses it, and upserts into the products table in Supabase.
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
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Config ────────────────────────────────────────────────────────────────────

const DEALER   = process.env.PARTS_UNLIMITED_DEALER_NUMBER;
const USERNAME = process.env.PARTS_UNLIMITED_USERNAME;
const PASSWORD = process.env.PARTS_UNLIMITED_PASSWORD;

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DRY_RUN      = process.argv.includes('--dry-run');
const SKIP_REINDEX = process.argv.includes('--skip-reindex');
const BATCH_SIZE   = 500;
const TMP_DIR      = path.join(__dirname, '../../tmp');

// ── Validation ────────────────────────────────────────────────────────────────

if (!DEALER || !USERNAME || !PASSWORD) {
  console.error('❌  Missing PU credentials in .env.local');
  console.error('    Required: PARTS_UNLIMITED_DEALER_NUMBER, PARTS_UNLIMITED_USERNAME, PARTS_UNLIMITED_PASSWORD');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing Supabase credentials in .env.local');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) { console.log(msg); }

function buildAuth() {
  const raw = `${DEALER}/${USERNAME}:${PASSWORD}`;
  return 'Basic ' + Buffer.from(raw).toString('base64');
}

function fetchPriceFileZip() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

    const today = new Date().toISOString().slice(0, 10); // "2026-04-01"
    const cachedZip = path.join(TMP_DIR, `pu_pricefile_${today}.zip`);

    if (fs.existsSync(cachedZip)) {
      log(`   Using cached file from today (${today})`);
      return resolve(fs.readFileSync(cachedZip));
    }

    log('📥  Requesting price file from Parts Unlimited API...');

    const body = JSON.stringify({
      dealerCodes: [DEALER],
      headersPrepended: true,
      auxillaryColumns: ['BRAND_NAME', 'WEIGHT', 'DROPSHIP_FEE'],
      attachingCatalogs: ['STREET', 'ATV', 'OFFROAD', 'SNOW', 'WATERCRAFT'],
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
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const zipPath = path.join(TMP_DIR, 'pu_pricefile.zip');
  const extractDir = path.join(TMP_DIR, 'pu_pricefile');

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

  return {
    mfr_sku:        sku,
    best_price:     isNaN(ourPrice) || ourPrice === 0 ? null : ourPrice,
    msrp:           isNaN(msrp) || msrp === 0 ? null : msrp,
    total_qty:      isNaN(nationalAvail) ? 0 : nationalAvail,
    in_stock:       nationalAvail > 0,
    hazardous_code: hazardous || null,
    no_ship_ca:     noShipCa,
    is_atv:         isAtv,
    is_street:      isStreet,
    is_snow:        isSnow,
    is_offroad:     isOffroad,
    is_watercraft:  isWatercraft,
    weight_lbs:     isNaN(weight) || weight === 0 ? null : weight,
    dropship_fee_pu: isNaN(dropshipFee) || dropshipFee === 0 ? null : dropshipFee,
  };
}

async function upsertBatch(batch) {
  const url = `${SUPABASE_URL}/rest/v1/products`;
  const body = JSON.stringify(batch);

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + '?on_conflict=mfr_sku',
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const chunks = [];
    const req = https.request(options, (res) => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Supabase error ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
        } else {
          resolve();
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
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
  log('💾  Upserting to Supabase...');
  let updated = 0;
  let failed  = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    try {
      await upsertBatch(batch);
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

  // 7. Reindex Typesense
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

  // 8. Cleanup tmp
  try { fs.rmSync(TMP_DIR, { recursive: true }); } catch {}

  console.log('\n✅  PU price file import complete!');
}

main().catch(err => {
  console.error('\n❌  Import failed:', err.message);
  process.exit(1);
});
