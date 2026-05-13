#!/usr/bin/env node
// enrich_pu_catalog_xml.js
// Enriches pu_catalog from PU brand XML files using SAX streaming parser
// Handles both PIES format (<PIES><Items><Item>) and Catalog Content format (<root><part>)
// Join key: strip dashes from XML PartNumber → match pu_catalog.sku

import fs from 'fs';
import path from 'path';
import sax from 'sax';
import pg from 'pg';

const { Pool } = pg;

const BRAND_DIR = path.resolve('scripts/data/pu_pricefile/brand_files');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

function stripDashes(sku) {
  if (!sku) return null;
  return sku.toString().replace(/-/g, '').trim();
}

function parseDecimal(val) {
  if (!val) return null;
  const n = parseFloat(val.toString().replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? null : n;
}

function parseDate(val) {
  if (!val) return null;
  const s = val.toString().trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  return null;
}

function parseXmlFile(filePath) {
  return new Promise((resolve, reject) => {
    const items = [];
    const saxStream = sax.createStream(true, { lowercase: false, trim: true });

    let current = null;
    let currentTag = null;
    let descCode = null;
    let expiCode = null;
    let bulletIndex = null;
    let inDimensions = false;
    let inWeights = false;
    let format = null;

    saxStream.on('opentag', (node) => {
      const name = node.name;
      const attrs = node.attributes || {};

      if (name === 'PIES') format = 'PIES';
      if (name === 'root') format = 'CATALOG_CONTENT';

      if ((format === 'PIES' && name === 'Item') ||
          (format === 'CATALOG_CONTENT' && name === 'part')) {
        current = {
          sku: null, brand_code: null, brand: null, name: null,
          features: [], oem_part_number: null, country_of_origin: null,
          special_instructions: null, uom: null, qty_per_uom: null,
          height_in: null, width_in: null, length_in: null,
          height_ship: null, width_ship: null, length_ship: null,
          weight: null, image_url: null, image_zip: null,
          product_name: null, product_id: null, product_image: null,
          vendor_price_update_date: null,
        };
      }

      if (!current) return;
      currentTag = name;

      if (name === 'Dimensions') inDimensions = true;
      if (name === 'Weights') inWeights = true;
      if (name === 'Description') descCode = attrs.DescriptionCode || null;
      if (name === 'ExtendedProductInformation') expiCode = attrs.EXPICode || null;

      const bm = name.match(/^bullet(\d+)$/i);
      bulletIndex = bm ? parseInt(bm[1]) : null;
    });

    saxStream.on('text', (text) => {
      if (!current) return;
      const t = text.trim();
      if (!t) return;

      // PIES
      if (currentTag === 'PartNumber') current.sku = stripDashes(t);
      if (currentTag === 'BrandAAIAID') current.brand_code = t;
      if (currentTag === 'BrandLabel') current.brand = t;
      if (currentTag === 'PackageUOM') current.uom = t;
      if (currentTag === 'QuantityofEaches') current.qty_per_uom = parseInt(t) || null;
      if (currentTag === 'FileName') current.image_zip = t;
      if (currentTag === 'URI' && !current.image_url) current.image_url = t;
      if (currentTag === 'Description' && descCode === 'TLE') current.name = t;
      if (currentTag === 'Description' && descCode === 'FAB') current.features.push(t);
      if (currentTag === 'ExtendedProductInformation') {
        if (expiCode === 'OSP') current.oem_part_number = t;
        if (expiCode === 'CTO') current.country_of_origin = t;
        if (expiCode === 'LIF') current.special_instructions = t;
      }
      if (inDimensions) {
        if (currentTag === 'MerchandisingHeight') current.height_in = parseDecimal(t);
        if (currentTag === 'MerchandisingWidth') current.width_in = parseDecimal(t);
        if (currentTag === 'MerchandisingLength') current.length_in = parseDecimal(t);
        if (currentTag === 'ShippingHeight') current.height_ship = parseDecimal(t);
        if (currentTag === 'ShippingWidth') current.width_ship = parseDecimal(t);
        if (currentTag === 'ShippingLength') current.length_ship = parseDecimal(t);
      }
      if (inWeights && currentTag === 'Weight') current.weight = parseDecimal(t);

      // Catalog Content
      if (currentTag === 'partNumber') current.sku = stripDashes(t);
      if (currentTag === 'brandName') current.brand = t;
      if (currentTag === 'partDescription') current.name = t;
      if (currentTag === 'supplierNumber') current.oem_part_number = t;
      if (currentTag === 'unitOfMeasure') current.uom = t;
      if (currentTag === 'partImage' && !current.image_url) current.image_url = t;
      if (currentTag === 'productName') current.product_name = t;
      if (currentTag === 'productId') current.product_id = t;
      if (currentTag === 'productImage') current.product_image = t;
      if (currentTag === 'specialInstructions') current.special_instructions = t;
      if (currentTag === 'vendorPriceUpdateDate') current.vendor_price_update_date = parseDate(t);
      if (bulletIndex !== null) current.features.push(t);
    });

    saxStream.on('closetag', (name) => {
      if (!current) return;
      if (name === 'Dimensions') inDimensions = false;
      if (name === 'Weights') inWeights = false;
      if (name === 'Description') descCode = null;
      if (name === 'ExtendedProductInformation') expiCode = null;
      currentTag = null;
      bulletIndex = null;

      if ((format === 'PIES' && name === 'Item') ||
          (format === 'CATALOG_CONTENT' && name === 'part')) {
        if (current.sku) {
          if (current.features.length === 0) current.features = null;
          items.push(current);
        }
        current = null;
      }
    });

    saxStream.on('error', () => {
      saxStream._parser.error = null;
      saxStream._parser.resume();
    });

    saxStream.on('end', () => resolve(items));
    fs.createReadStream(filePath).pipe(saxStream);
  });
}

async function main() {
  const client = await pool.connect();

  try {
    console.log('Loading pu_catalog SKUs...');
    const skuRes = await client.query('SELECT sku FROM pu_catalog');
    const validSkus = new Set(skuRes.rows.map(r => r.sku));
    console.log(`Valid SKUs: ${validSkus.size}`);

    const files = fs.readdirSync(BRAND_DIR)
      .filter(f => f.endsWith('.xml'))
      .map(f => path.join(BRAND_DIR, f));
    console.log(`XML files: ${files.length}`);

    let totalParsed = 0, totalMatched = 0, totalUpdated = 0, totalErrors = 0;

    for (const file of files) {
      const fname = path.basename(file);
      let items = [];

      try {
        items = await parseXmlFile(file);
      } catch (e) {
        console.error(`\n  Parse error ${fname}:`, e.message);
        continue;
      }

      totalParsed += items.length;

      for (const item of items) {
        if (!validSkus.has(item.sku)) continue;
        totalMatched++;

        try {
          await client.query(`
            UPDATE pu_catalog SET
              brand_code              = COALESCE(brand_code, $2),
              brand                   = COALESCE(brand, $3),
              name                    = COALESCE(NULLIF(name,''), $4),
              features                = COALESCE(features, $5),
              oem_part_number         = COALESCE(oem_part_number, $6),
              country_of_origin       = COALESCE(country_of_origin, $7),
              special_instructions    = COALESCE(special_instructions, $8),
              uom                     = COALESCE(uom, $9),
              qty_per_uom             = COALESCE(qty_per_uom, $10),
              height_in               = COALESCE(height_in, $11),
              width_in                = COALESCE(width_in, $12),
              length_in               = COALESCE(length_in, $13),
              height_ship             = COALESCE(height_ship, $14),
              width_ship              = COALESCE(width_ship, $15),
              length_ship             = COALESCE(length_ship, $16),
              weight                  = COALESCE(weight, $17),
              image_url               = COALESCE(image_url, $18),
              image_zip               = COALESCE(image_zip, $19),
              product_name            = COALESCE(product_name, $20),
              product_id              = COALESCE(product_id, $21),
              product_image           = COALESCE(product_image, $22),
              vendor_price_update_date = COALESCE(vendor_price_update_date, $23),
              updated_at              = now()
            WHERE sku = $1
          `, [
            item.sku, item.brand_code, item.brand, item.name,
            item.features ? `{${item.features.map(f => `"${f.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`).join(',')}}` : null,
            item.oem_part_number, item.country_of_origin, item.special_instructions,
            item.uom, item.qty_per_uom,
            item.height_in, item.width_in, item.length_in,
            item.height_ship, item.width_ship, item.length_ship,
            item.weight, item.image_url, item.image_zip,
            item.product_name, item.product_id, item.product_image,
            item.vendor_price_update_date,
          ]);
          totalUpdated++;
        } catch (e) {
          totalErrors++;
          if (totalErrors <= 5) console.error(`\n  Update error SKU ${item.sku}:`, e.message);
        }
      }

      process.stdout.write(`\r  ${fname.substring(0,45).padEnd(45)} ${items.length} items | ${totalUpdated} updated`);
    }

    console.log(`\n\n✅ Done`);
    console.log(`   Files:    ${files.length}`);
    console.log(`   Parsed:   ${totalParsed}`);
    console.log(`   Matched:  ${totalMatched}`);
    console.log(`   Updated:  ${totalUpdated}`);
    console.log(`   Errors:   ${totalErrors}`);

    const res = await client.query(`
      SELECT COUNT(*) as total, COUNT(image_url) as has_image,
        COUNT(features) as has_features, COUNT(brand_code) as has_brand_code,
        COUNT(oem_part_number) as has_oem, COUNT(weight) as has_weight,
        COUNT(height_in) as has_dims
      FROM pu_catalog
    `);
    console.log('\nEnrichment summary:', res.rows[0]);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
