#!/usr/bin/env node
/**
 * pull_pu_pricefile.mjs
 *
 * Fresh pull of the Parts Unlimited pricefile (v2 API), requesting every
 * relevant optional column in one shot -- the account is limited to 2 API
 * calls/day, so this asks for everything useful up front rather than
 * needing a second call later.
 *
 * "Your Dealer Price" is deliberately NOT requested this round -- the spec
 * calls out TargetDealerCode/CallingDealerCode as the mechanism for it and
 * that's a different request shape than what's proven working here
 * (dealerCodes: [DEALER]), which was confirmed live (2026-06-14) to return
 * the combined file WITHOUT a "Your Dealer Price" column. Guessing at that
 * shape risks a wasted call, so dealer-specific pricing stays a separate
 * follow-up once the real request schema is confirmed. Existing dealer_price
 * values in pu_catalog are left untouched by this script.
 *
 * Like sync_catalog_unified.mjs, this never truncates. It upserts on the
 * unique `sku` column: vendor-live fields (status, pricing, availability,
 * catalog placement) are refreshed on every row; hand-enriched / LeMans
 * content fields (oem_part_number, dimensions, images, description) are
 * only ever set from a non-null value, never blanked out by a pull that
 * didn't have that data.
 *
 * Usage:
 *   node pull_pu_pricefile.mjs --csv=path/to/file.csv           # parse a local file, dry run
 *   node pull_pu_pricefile.mjs --csv=path/to/file.csv --apply   # parse local file, write
 *   node pull_pu_pricefile.mjs --live                           # hit the real API, dry run parse
 *   node pull_pu_pricefile.mjs --live --apply                   # hit the real API AND write
 *
 * --live requires typing "yes" at a confirmation prompt (spends one of the
 * 2 daily API calls). --csv never touches the network.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import readline from 'readline';
import { execSync } from 'child_process';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const APPLY = process.argv.includes('--apply');
const LIVE  = process.argv.includes('--live');
const csvArg = process.argv.find((a) => a.startsWith('--csv='));
const CSV_PATH = csvArg ? path.resolve(process.cwd(), csvArg.slice('--csv='.length)) : null;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const DEALER   = process.env.PARTS_UNLIMITED_DEALER_NUMBER;
const USERNAME = process.env.PARTS_UNLIMITED_USERNAME;
const PASSWORD = process.env.PARTS_UNLIMITED_PASSWORD;

// Every optional auxillaryColumns code from the field spec, requested in one
// shot since the daily call budget is 2.
const AUX_COLUMNS = [
  'LAST_CATALOG',
  'COMMODITY_CODE',
  'PRODUCT_CODE',
  'DRAG_OWNED',
  'WEIGHT',
  'COUNTRY_OF_ORIGIN',
  'UPC_CODE',
  'BRAND_NAME',
  'CLOSEOUT_CATALOG_INDICATOR',
];

// Proven working combo (confirmed live 2026-06-14 via sync_pu_status.cjs) --
// gives Oldbook/Fatbook + Mid-Year current/last year + page columns.
const ATTACHING_CATALOGS = ['OLDBOOK', 'OLDBOOK_MIDYEAR', 'FATBOOK', 'FATBOOK_MIDYEAR'];

function requestBody() {
  return {
    dealerCodes: [DEALER],
    headersPrepended: true,
    attachingCatalogs: ATTACHING_CATALOGS,
    auxillaryColumns: AUX_COLUMNS,
  };
}

async function confirmLiveCall() {
  console.log('\n=== About to call the live Parts Unlimited API (uses 1 of 2 daily calls) ===');
  console.log('POST https://dealer.parts-unlimited.com/api/quotes/v2/pricefile');
  console.log(JSON.stringify(requestBody(), null, 2));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question('\nType "yes" to proceed: ', resolve));
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Aborted -- no API call made.');
    process.exit(0);
  }
}

async function downloadFreshPricefile() {
  const outDir  = path.resolve(__dirname, '../data/pu_pricefile');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const zipFile = path.join(outDir, `${dateStr}pu-pricefile-full.zip`);
  const csvFile = path.join(outDir, `${dateStr}pu-pricefile-full.csv`);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const auth = Buffer.from(`${DEALER}/${USERNAME}:${PASSWORD}`).toString('base64');
  const body = JSON.stringify(requestBody());

  console.log('Downloading fresh PU pricefile...');
  await new Promise((resolve, reject) => {
    const opts = {
      hostname: 'dealer.parts-unlimited.com',
      path: '/api/quotes/v2/pricefile',
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      if (res.statusCode !== 200) {
        let err = '';
        res.on('data', (d) => (err += d));
        res.on('end', () => reject(new Error(`PU API ${res.statusCode}: ${err}`)));
        return;
      }
      const out = fs.createWriteStream(zipFile);
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        out.write(chunk);
        process.stdout.write(`  ${(bytes / 1e6).toFixed(1)} MB\r`);
      });
      res.on('end', () => out.end(() => resolve()));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
  console.log(`\n  Downloaded to ${zipFile}`);

  const tmpDir = path.join(outDir, `_unzip_${dateStr}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  execSync(`unzip -o "${zipFile}" -d "${tmpDir}"`, { stdio: 'inherit' });

  const files = fs.readdirSync(tmpDir);
  const csv = files.find((f) => f.toLowerCase().endsWith('.csv') || f.toLowerCase().endsWith('.txt'));
  if (!csv) throw new Error(`No CSV found in zip. Files: ${files.join(', ')}`);

  fs.copyFileSync(path.join(tmpDir, csv), csvFile);
  fs.rmSync(tmpDir, { recursive: true });
  console.log(`  CSV saved to ${csvFile}`);
  return csvFile;
}

// ── Value parsers ────────────────────────────────────────────────────────────

function parseBool(val) {
  if (!val) return false;
  return val.trim().toUpperCase() === 'Y' || val.trim().toUpperCase() === 'T';
}

// Distinguishes "column absent from this particular pull" (undefined --
// depends on which auxillaryColumns were requested) from "column present but
// blank/N" (a real false). Used for optional boolean columns so a pull that
// didn't request that column doesn't blank out a previously-known true value.
function parseBoolOrNull(val) {
  if (val === undefined) return null;
  return parseBool(val);
}

function parseDecimal(val) {
  if (!val || val.trim() === '' || val.trim() === 'N/A') return null;
  const n = parseFloat(val.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function parseDate(val) {
  if (!val || val.trim() === '') return null;
  const s = val.trim();
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return null;
}

function hasPage(val) {
  const s = (val || '').trim();
  return s !== '' && s !== '0';
}

// NOTE: pu_catalog.oem_part_number / brand_code / dimensions / images come
// from a separate LeMans content-enrichment process (flat-file format),
// not from this pricefile pull. The scripts/data/pu_pricefile/ directory
// currently mixes that flat format with unrelated per-brand PIES XML
// exports, so merging it here isn't safe without sorting that out first --
// out of scope for "general catalog data." This script leaves those
// columns alone (COALESCE keeps whatever's already in pu_catalog).

// Fields refreshed on an EXISTING row -- vendor-live state only, and only
// the columns guaranteed present on every pull regardless of which
// auxillaryColumns/attachingCatalogs were requested (see the field spec's
// "Always" vs "Optional" column list). Everything optional -- dealer price,
// drag/closeout flags, last-catalog, dropship fee, content/dimension fields
// -- is COALESCE'd so a pull that didn't request a given column never blanks
// out a value a previous pull did populate.
const SYNC_FIELDS = `
  sku_punctuated = EXCLUDED.sku_punctuated,
  part_status = EXCLUDED.part_status,
  name = EXCLUDED.name,
  msrp = EXCLUDED.msrp,
  original_retail = EXCLUDED.original_retail,
  base_dealer_price = EXCLUDED.base_dealer_price,
  dealer_price = COALESCE(EXCLUDED.dealer_price, pu_catalog.dealer_price),
  ad_policy = EXCLUDED.ad_policy,
  price_changed_today = EXCLUDED.price_changed_today,
  truck_only = EXCLUDED.truck_only,
  no_ship_ca = EXCLUDED.no_ship_ca,
  hazardous_code = EXCLUDED.hazardous_code,
  in_oldbook = EXCLUDED.in_oldbook,
  in_fatbook = EXCLUDED.in_fatbook,
  oldbook_current_year = EXCLUDED.oldbook_current_year,
  oldbook_current_year_page = EXCLUDED.oldbook_current_year_page,
  oldbook_last_year = EXCLUDED.oldbook_last_year,
  oldbook_last_year_page = EXCLUDED.oldbook_last_year_page,
  fatbook_current_year = EXCLUDED.fatbook_current_year,
  fatbook_current_year_page = EXCLUDED.fatbook_current_year_page,
  fatbook_last_year = EXCLUDED.fatbook_last_year,
  fatbook_last_year_page = EXCLUDED.fatbook_last_year_page,
  warehouse_wi = EXCLUDED.warehouse_wi,
  warehouse_ny = EXCLUDED.warehouse_ny,
  warehouse_tx = EXCLUDED.warehouse_tx,
  warehouse_nv = EXCLUDED.warehouse_nv,
  warehouse_nc = EXCLUDED.warehouse_nc,
  national_availability = EXCLUDED.national_availability,
  part_add_date = EXCLUDED.part_add_date,
  drag_part = COALESCE(EXCLUDED.drag_part, pu_catalog.drag_part),
  closeout = COALESCE(EXCLUDED.closeout, pu_catalog.closeout),
  last_catalog = COALESCE(EXCLUDED.last_catalog, pu_catalog.last_catalog),
  last_catalog_page = COALESCE(EXCLUDED.last_catalog_page, pu_catalog.last_catalog_page),
  dropship_fee = COALESCE(EXCLUDED.dropship_fee, pu_catalog.dropship_fee),
  brand = COALESCE(EXCLUDED.brand, pu_catalog.brand),
  brand_code = COALESCE(EXCLUDED.brand_code, pu_catalog.brand_code),
  description = COALESCE(EXCLUDED.description, pu_catalog.description),
  oem_part_number = COALESCE(EXCLUDED.oem_part_number, pu_catalog.oem_part_number),
  country_of_origin = COALESCE(EXCLUDED.country_of_origin, pu_catalog.country_of_origin),
  qty_per_uom = COALESCE(EXCLUDED.qty_per_uom, pu_catalog.qty_per_uom),
  image_zip = COALESCE(EXCLUDED.image_zip, pu_catalog.image_zip),
  warehouse_code = COALESCE(EXCLUDED.warehouse_code, pu_catalog.warehouse_code),
  image_url = COALESCE(EXCLUDED.image_url, pu_catalog.image_url),
  weight = COALESCE(EXCLUDED.weight, pu_catalog.weight),
  height_in = COALESCE(EXCLUDED.height_in, pu_catalog.height_in),
  length_in = COALESCE(EXCLUDED.length_in, pu_catalog.length_in),
  width_in = COALESCE(EXCLUDED.width_in, pu_catalog.width_in),
  updated_at = now()
`;

async function main() {
  if (!DEALER || !USERNAME || !PASSWORD) {
    console.error('Missing PARTS_UNLIMITED_DEALER_NUMBER / USERNAME / PASSWORD in .env.local');
    process.exit(1);
  }

  let csvPath = CSV_PATH;
  if (!csvPath) {
    if (!LIVE) {
      console.error('Specify --csv=path/to/file.csv for a local dry run, or --live to call the API.');
      process.exit(1);
    }
    await confirmLiveCall();
    csvPath = await downloadFreshPricefile();
  } else {
    console.log(`Using local CSV: ${csvPath} (no API call)`);
  }

  console.log('Parsing pricefile...');
  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`  ${rows.length} total rows`);

  const filtered = rows.filter(
    (row) => hasPage(row['Oldbook Current Year Page']) || hasPage(row['Fatbook Current Year Page'])
  );
  console.log(`  ${filtered.length} rows in oldbook or fatbook`);

  const client = await pool.connect();
  try {
    const existing = await client.query(`SELECT sku FROM pu_catalog`);
    const existingSkus = new Set(existing.rows.map((r) => r.sku));
    const newCount = filtered.filter((r) => !existingSkus.has(r['Part Number'])).length;

    console.log(`\n=== Sync plan ===`);
    console.log(`  pu_catalog currently has ${existingSkus.size} rows`);
    console.log(`  ${newCount} new inserts, ${filtered.length - newCount} existing rows refreshed`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    console.log('\nApplying (single transaction)...');
    await client.query('BEGIN');

    let done = 0, errors = 0;
    for (const row of filtered) {
      const sku = row['Part Number'];

      try {
        await client.query('SAVEPOINT row_sp');
        await client.query(`
          INSERT INTO pu_catalog (
            sku, sku_punctuated, vendor_part_number, vendor_part_punctuated,
            part_status, name, brand, uom, upc, commodity_code, product_code,
            trademark, notes,
            brand_code, description, oem_part_number, country_of_origin,
            qty_per_uom, image_zip, warehouse_code, image_url,
            original_retail, msrp, base_dealer_price,
            ad_policy, price_changed_today,
            drag_part, closeout, truck_only, no_ship_ca, hazardous_code,
            in_oldbook, in_fatbook,
            oldbook_current_year, oldbook_current_year_page, oldbook_last_year, oldbook_last_year_page,
            fatbook_current_year, fatbook_current_year_page, fatbook_last_year, fatbook_last_year_page,
            last_catalog, last_catalog_page,
            warehouse_wi, warehouse_ny, warehouse_tx, warehouse_nv, warehouse_nc,
            national_availability,
            weight, height_in, length_in, width_in,
            dropship_fee, part_add_date, dealer_price
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
            $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
            $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
            $51,$52,$53,$54,$55,$56
          )
          ON CONFLICT (sku) DO UPDATE SET ${SYNC_FIELDS}
        `, [
          sku, row['Punctuated Part Number'], row['Vendor Part Number'], row['Vendor Punctuated Part Number'],
          row['Part Status'], row['Part Description'], row['Brand Name'] || null,
          row['Unit of Measure'] || null, row['UPC Code'] || null, row['Commodity Code'] || null,
          row['Product Code'] || null,
          row['Trademark'] || null, row['Notes'] || null,
          null, null, null,
          row['Country of Origin'] || null,
          null, null, null, null,
          parseDecimal(row['Original Retail']), parseDecimal(row['Current Suggested Retail']), parseDecimal(row['Base Dealer Price']),
          parseBool(row['Ad Policy']), row['Price Changed Today'] || null,
          parseBoolOrNull(row['Drag Part']), parseBoolOrNull(row['Closeout Catalog Indicator']),
          parseBool(row['Truck Part Only']), row['No Ship to CA'] ? row['No Ship to CA'].trim() === 'X' : false,
          row['Hazardous Code'] || null,
          hasPage(row['Oldbook Current Year Page']), hasPage(row['Fatbook Current Year Page']),
          row['Oldbook Current Year'] || null, row['Oldbook Current Year Page'] || null,
          row['Oldbook Last Year'] || null, row['Oldbook Last Year Page'] || null,
          row['Fatbook Current Year'] || null, row['Fatbook Current Year Page'] || null,
          row['Fatbook Last Year'] || null, row['Fatbook Last Year Page'] || null,
          row['Last Catalog'] || null, row['Last Catalog Page'] || null,
          row['WI Availability'] || '0', row['NY Availability'] || '0', row['TX Availability'] || '0',
          row['NV Availability'] || '0', row['NC Availability'] || '0', row['National Availability'] || '0',
          parseDecimal(row['Weight']), null, null, null,
          parseDecimal(row['Dropship Fee']), parseDate(row['Part Add Date']), parseDecimal(row['Your Dealer Price']),
        ]);
        await client.query('RELEASE SAVEPOINT row_sp');
        done++;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp').catch(() => {});
        errors++;
        if (errors <= 5) console.error(`\n  Error on SKU ${sku}:`, e.message);
      }
      if ((done + errors) % 1000 === 0) process.stdout.write(`\r  ${done}/${filtered.length} synced, ${errors} errors`);
    }
    console.log(`\n  ${done}/${filtered.length} synced, ${errors} errors`);

    const finalCount = await client.query(`SELECT COUNT(*) FROM pu_catalog`);
    console.log(`\nCommitting. pu_catalog now has ${finalCount.rows[0].count} rows.`);
    await client.query('COMMIT');
    console.log('Done.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nRolled back due to error -- pu_catalog is unchanged from before this run:', err);
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
