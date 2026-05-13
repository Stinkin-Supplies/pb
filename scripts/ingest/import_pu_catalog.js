#!/usr/bin/env node
// import_pu_catalog.js
// Ingests Parts Unlimited data into pu_catalog
// Sources:
//   scripts/data/pu_pricefile/BasePriceFile.csv      — product + pricing + catalog flags
//   scripts/data/pu_pricefile/D00108_PriceFile.csv   — dealer price
//   scripts/data/pu_pricefile/*.xml                  — LeMans content enrichment
// Filter: in_oldbook=true OR in_fatbook=true (~36,684 rows)

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';

const { Pool } = pg;

const DATA_DIR = path.resolve('scripts/data/pu_pricefile');
const BASE_FILE = path.join(DATA_DIR, 'oldbook-fatbook', 'BasePriceFile.csv');
const DEALER_FILE = path.join(DATA_DIR, 'oldbook-fatbook', 'D00108_PriceFile.csv');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

// --- Helpers ---

function parseBool(val) {
  if (!val) return false;
  return val.trim().toUpperCase() === 'Y' || val.trim().toUpperCase() === 'T';
}

function parseDecimal(val) {
  if (!val || val.trim() === '' || val.trim() === 'N/A') return null;
  const n = parseFloat(val.replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function parseDate(val) {
  if (!val || val.trim() === '') return null;
  const s = val.trim();
  if (s.length === 8) {
    // YYYYMMDD
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  }
  return null;
}

function hasPage(val) {
  const s = (val || '').trim();
  return s !== '' && s !== '0';
}

// --- Load LeMans XML enrichment ---
// Format: space-delimited flat file (despite .xml extension)
// Columns: sku | brand_code | brand | name | description | oem_part_number |
//          country_of_origin | uom | qty_per_uom | height_in | length_in | width_in |
//          height_ship | length_ship | width_ship | weight | image_zip | warehouse_code | image_url

function loadLemansEnrichment() {
  const enrichment = new Map();

  const xmlFiles = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.xml') || f.endsWith('.txt'))
    .map(f => path.join(DATA_DIR, f));

  if (xmlFiles.length === 0) {
    console.warn('⚠️  No LeMans enrichment files found in', DATA_DIR);
    return enrichment;
  }

  let parsed = 0;
  let skipped = 0;

  for (const file of xmlFiles) {
    const content = fs.readFileSync(file, 'utf8');
    // Skip the file header line (starts with version like "7.2 FULL")
    const lines = content.split('\n').filter(l => l.trim() !== '');

    for (const line of lines) {
      // Skip version/header lines
      if (/^\d+\.\d+\s+(FULL|PARTIAL)/i.test(line.trim())) continue;

      // Tokenize: split on whitespace but be aware fields run together
      // Known fixed-position tail: image_zip warehouse_code image_url are last 3 tokens
      // Before that: weight width_ship length_ship height_ship width_in length_in height_in qty_per_uom uom country_of_origin oem_part_number
      // Then: name+description (merged blob)
      // Then: brand brand_code sku

      const tokens = line.trim().split(/\s+/);
      if (tokens.length < 10) { skipped++; continue; }

      try {
        const image_url      = tokens[tokens.length - 1];
        const warehouse_code = tokens[tokens.length - 2];
        const image_zip      = tokens[tokens.length - 3];
        const weight         = parseDecimal(tokens[tokens.length - 4]);
        const width_ship     = parseDecimal(tokens[tokens.length - 5]);
        const length_ship    = parseDecimal(tokens[tokens.length - 6]);
        const height_ship    = parseDecimal(tokens[tokens.length - 7]);
        const width_in       = parseDecimal(tokens[tokens.length - 8]);
        const length_in      = parseDecimal(tokens[tokens.length - 9]);
        const height_in      = parseDecimal(tokens[tokens.length - 10]);
        const qty_per_uom    = parseInt(tokens[tokens.length - 11]) || 1;
        const uom            = tokens[tokens.length - 12];
        const country_of_origin = tokens[tokens.length - 13];
        const oem_part_number   = tokens[tokens.length - 14];

        // First 3 tokens: sku brand_code brand
        const sku        = tokens[0];
        const brand_code = tokens[1];
        const brand      = tokens[2];

        // Everything between brand and oem_part_number is name+description merged
        const name_desc_tokens = tokens.slice(3, tokens.length - 14);
        const name_desc = name_desc_tokens.join(' ');

        enrichment.set(sku, {
          brand_code,
          brand,
          name_desc,
          oem_part_number,
          country_of_origin,
          uom,
          qty_per_uom,
          height_in,
          length_in,
          width_in,
          height_ship,
          length_ship,
          width_ship,
          weight,
          image_zip,
          warehouse_code,
          image_url: image_url.startsWith('http') ? image_url : null,
        });
        parsed++;
      } catch (e) {
        skipped++;
      }
    }
  }

  console.log(`LeMans enrichment: ${parsed} parsed, ${skipped} skipped from ${xmlFiles.length} files`);
  return enrichment;
}

// --- Main ---

async function main() {
  const client = await pool.connect();

  try {
    console.log('Loading LeMans enrichment...');
    const lemans = loadLemansEnrichment();

    console.log('Loading dealer prices...');
    const dealerPrices = new Map();
    const dealerRaw = fs.readFileSync(DEALER_FILE, 'utf8');
    const dealerRows = parse(dealerRaw, { columns: true, skip_empty_lines: true, trim: true });
    for (const row of dealerRows) {
      dealerPrices.set(row['Part Number'], parseDecimal(row['Your Dealer Price']));
    }
    console.log(`Dealer prices loaded: ${dealerPrices.size}`);

    console.log('Loading BasePriceFile...');
    const baseRaw = fs.readFileSync(BASE_FILE, 'utf8');
    const baseRows = parse(baseRaw, { columns: true, skip_empty_lines: true, trim: true });
    console.log(`BasePriceFile rows: ${baseRows.length}`);

    // Filter to oldbook or fatbook
    const filtered = baseRows.filter(row =>
      hasPage(row['Oldbook Current Year Page']) ||
      hasPage(row['Fatbook Current Year Page'])
    );
    console.log(`Rows in oldbook or fatbook: ${filtered.length}`);

    // Truncate and reload
    await client.query('TRUNCATE pu_catalog RESTART IDENTITY');
    console.log('pu_catalog truncated');

    let inserted = 0;
    let errors = 0;
    const BATCH = 500;

    for (let i = 0; i < filtered.length; i += BATCH) {
      const batch = filtered.slice(i, i + BATCH);

      for (const row of batch) {
        const sku = row['Part Number'];
        const enrich = lemans.get(sku) || {};

        try {
          await client.query(`
            INSERT INTO pu_catalog (
              sku, sku_punctuated, vendor_part_number, vendor_part_punctuated,
              part_status, name, brand, uom, upc, commodity_code, product_code,
              trademark, notes,
              brand_code, description, oem_part_number, country_of_origin,
              qty_per_uom, image_zip, warehouse_code, image_url,
              original_retail, msrp, base_dealer_price, dealer_price,
              ad_policy, price_changed_today,
              drag_part, closeout, race_only, truck_only, no_ship_ca, pfas, hazardous_code,
              in_oldbook, in_fatbook,
              oldbook_current_year, oldbook_current_year_page, oldbook_last_year, oldbook_last_year_page,
              fatbook_current_year, fatbook_current_year_page, fatbook_last_year, fatbook_last_year_page,
              last_catalog, last_catalog_page,
              warehouse_wi, warehouse_ny, warehouse_tx, warehouse_nv, warehouse_nc,
              national_availability,
              weight, height_in, length_in, width_in,
              height_ship, length_ship, width_ship,
              harmonized_us, harmonized_eu, harmonized_schedule_b,
              dropship_fee, part_add_date, go_live_date
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
              $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
              $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
              $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
              $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
              $61,$62,$63,$64,$65
            )
            ON CONFLICT (sku) DO UPDATE SET
              sku_punctuated = EXCLUDED.sku_punctuated,
              part_status = EXCLUDED.part_status,
              name = EXCLUDED.name,
              brand = EXCLUDED.brand,
              msrp = EXCLUDED.msrp,
              base_dealer_price = EXCLUDED.base_dealer_price,
              dealer_price = EXCLUDED.dealer_price,
              in_oldbook = EXCLUDED.in_oldbook,
              in_fatbook = EXCLUDED.in_fatbook,
              updated_at = now()
          `, [
            sku,                                              // $1
            row['Punctuated Part Number'],                    // $2
            row['Vendor Part Number'],                        // $3
            row['Vendor Punctuated Part Number'],             // $4
            row['Part Status'],                               // $5
            row['Part Description'],                          // $6
            enrich.brand || row['Brand Name'],                // $7
            enrich.uom || row['Unit of Measure'],             // $8
            row['UPC Code'] || null,                          // $9
            row['Commodity Code'] || null,                    // $10
            row['Product Code'] || null,                      // $11
            row['Trademark'] || null,                         // $12
            row['Notes'] || null,                             // $13
            enrich.brand_code || null,                        // $14
            enrich.name_desc || null,                         // $15
            enrich.oem_part_number || null,                   // $16
            enrich.country_of_origin || row['Country of Origin'] || null, // $17
            enrich.qty_per_uom || 1,                          // $18
            enrich.image_zip || null,                         // $19
            enrich.warehouse_code || null,                    // $20
            enrich.image_url || null,                         // $21
            parseDecimal(row['Original Retail']),             // $22
            parseDecimal(row['Current Suggested Retail']),    // $23
            parseDecimal(row['Base Dealer Price']),           // $24
            dealerPrices.get(sku) || null,                    // $25
            parseBool(row['Ad Policy']),                      // $26
            row['Price Changed Today'] || null,               // $27
            parseBool(row['Drag Part']),                      // $28
            parseBool(row['Closeout Catalog Indicator']),     // $29
            parseBool(row['Race Only']),                      // $30
            parseBool(row['Truck Part Only']),                 // $31
            row['No Ship to CA'] ? row['No Ship to CA'].trim() === 'X' : false, // $32
            row['PFAS'] || null,                              // $33
            row['Hazardous Code'] || null,                    // $34
            hasPage(row['Oldbook Current Year Page']),         // $35
            hasPage(row['Fatbook Current Year Page']),         // $36
            row['Oldbook Current Year'] || null,              // $37
            row['Oldbook Current Year Page'] || null,         // $38
            row['Oldbook Last Year'] || null,                 // $39
            row['Oldbook Last Year Page'] || null,            // $40
            row['Fatbook Current Year'] || null,              // $41
            row['Fatbook Current Year Page'] || null,         // $42
            row['Fatbook Last Year'] || null,                 // $43
            row['Fatbook Last Year Page'] || null,            // $44
            row['Last Catalog'] || null,                      // $45
            row['Last Catalog Page'] || null,                 // $46
            row['WI Availability'] || '0',                    // $47
            row['NY Availability'] || '0',                    // $48
            row['TX Availability'] || '0',                    // $49
            row['NV Availability'] || '0',                    // $50
            row['NC Availability'] || '0',                    // $51
            row['National Availability'] || '0',              // $52
            enrich.weight ?? parseDecimal(row['Weight']),     // $53
            enrich.height_in ?? parseDecimal(row['Height(inches)']), // $54
            enrich.length_in ?? parseDecimal(row['Length(inches)']), // $55
            enrich.width_in  ?? parseDecimal(row['Width(inches)']),  // $56
            enrich.height_ship || null,                       // $57
            enrich.length_ship || null,                       // $58
            enrich.width_ship  || null,                       // $59
            row['Harmonized US'] || null,                     // $60
            row['Harmonized EU'] || null,                     // $61
            row['Harmonized Schedule B'] || null,             // $62
            parseDecimal(row['Dropship Fee']),                // $63
            parseDate(row['Part Add Date']),                  // $64
            parseDate(row['Go Live Date']),                   // $65
          ]);
          inserted++;
        } catch (e) {
          errors++;
          if (errors <= 5) console.error(`Error on SKU ${sku}:`, e.message);
        }
      }

      process.stdout.write(`\r  ${inserted} inserted, ${errors} errors...`);
    }

    console.log(`\n✅ Done — ${inserted} rows inserted into pu_catalog, ${errors} errors`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
