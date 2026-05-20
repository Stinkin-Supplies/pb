#!/usr/bin/env node
/**
 * enrich_pu_xml_comprehensive.js
 * Comprehensive re-enrichment of pu_catalog from brand XML files.
 * Sources: scripts/data/pu_pricefile/brand_files/*.xml
 *
 * Run: node scripts/ingest/enrich_pu_xml_comprehensive.js
 * Dry: node scripts/ingest/enrich_pu_xml_comprehensive.js --dry
 */

import fs from 'fs';
import path from 'path';
import sax from 'sax';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BRAND_DIR = path.resolve(__dirname, '../data/pu_pricefile/brand_files');
const DRY = process.argv.includes('--dry');

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

function progress(current, total, label) {
  const pct = Math.floor((current / total) * 100);
  const filled = Math.floor(pct / 2);
  const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
  process.stdout.write(`\r  ${label}: [${bar}] ${pct}% (${current.toLocaleString()}/${total.toLocaleString()})`);
}

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
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
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
          sku: null, sku_punctuated: null, brand_code: null, brand: null,
          name: null, part_status: null, features: [], oem_part_number: null,
          country_of_origin: null, special_instructions: null, uom: null,
          qty_per_uom: null, height_in: null, width_in: null, length_in: null,
          height_ship: null, width_ship: null, length_ship: null, weight: null,
          image_urls: [], product_name: null, product_id: null,
          product_image: null, vendor_price_update_date: null,
          base_dealer_price: null, your_dealer_price: null,
          base_retail_price: null, original_retail_price: null,
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
      if (currentTag === 'URI') current.image_urls.push(t);
      if (currentTag === 'Description' && descCode === 'TLE') current.name = t;
      if (currentTag === 'Description' && descCode === 'FAB' && t) current.features.push(t);
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
      if (currentTag === 'punctuatedPartNumber') current.sku_punctuated = t;
      if (currentTag === 'brandName') current.brand = t;
      if (currentTag === 'partDescription') current.name = t;
      if (currentTag === 'partStatusDescription') current.part_status = t;
      if (currentTag === 'supplierNumber') current.oem_part_number = t;
      if (currentTag === 'unitOfMeasure') current.uom = t;
      if (currentTag === 'specialInstructions') current.special_instructions = t;
      if (currentTag === 'productName') current.product_name = t;
      if (currentTag === 'productId') current.product_id = t;
      if (currentTag === 'vendorPriceUpdateDate') current.vendor_price_update_date = parseDate(t);
      if (currentTag === 'partImage') current.image_urls.push(t);
      if (currentTag === 'productImage') current.product_image = t;
      if (currentTag === 'baseDealerPrice') current.base_dealer_price = parseDecimal(t);
      if (currentTag === 'yourDealerPrice') current.your_dealer_price = parseDecimal(t);
      if (currentTag === 'baseRetailPrice') current.base_retail_price = parseDecimal(t);
      if (currentTag === 'originalRetailPrice') current.original_retail_price = parseDecimal(t);
      if (bulletIndex !== null && t) current.features.push(t);
    });

    saxStream.on('closetag', (name) => {
      if (!current) return;
      if (name === 'Dimensions') inDimensions = false;
      if (name === 'Weights') inWeights = false;
      if (name === 'Description') { descCode = null; currentTag = null; }
      if (name === 'ExtendedProductInformation') { expiCode = null; currentTag = null; }
      if (name !== 'Dimensions' && name !== 'Weights') currentTag = null;
      bulletIndex = null;

      if ((format === 'PIES' && name === 'Item') ||
          (format === 'CATALOG_CONTENT' && name === 'part')) {
        if (current.sku) {
          current.image_urls = [...new Set(current.image_urls)];
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

function pgArray(arr) {
  if (!arr || arr.length === 0) return null;
  const escaped = arr.map(s => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${escaped.join(',')}}`;
}

async function main() {
  console.log('\n🔧 PU XML Comprehensive Enrichment\n');
  console.log(`   Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   Source: ${BRAND_DIR}\n`);

  const files = fs.readdirSync(BRAND_DIR)
    .filter(f => f.endsWith('.xml'))
    .map(f => path.join(BRAND_DIR, f));

  console.log(`📂 ${files.length} XML files found\n`);

  const client = await pool.connect();
  console.log('Loading pu_catalog SKUs...');
  const { rows: skuRows } = await client.query('SELECT sku FROM pu_catalog');
  const validSkus = new Set(skuRows.map(r => r.sku));
  console.log(`✓ ${validSkus.size.toLocaleString()} SKUs in pu_catalog\n`);

  // ── Phase 1: Parse XML files ──────────────────────────────────
  console.log('Phase 1/3 — Parsing XML files...\n');
  let totalParsed = 0, totalMatched = 0;
  const allItems = [];

  for (let i = 0; i < files.length; i++) {
    let items = [];
    try {
      items = await parseXmlFile(files[i]);
    } catch (e) {
      console.error(`\n  Parse error ${path.basename(files[i])}:`, e.message);
      continue;
    }
    totalParsed += items.length;
    const matched = items.filter(item => validSkus.has(item.sku));
    totalMatched += matched.length;
    allItems.push(...matched);
    progress(i + 1, files.length, 'Parsing');
  }
  console.log(`\n  ✓ ${totalParsed.toLocaleString()} parsed, ${totalMatched.toLocaleString()} matched\n`);

  if (DRY) {
    allItems.slice(0, 5).forEach(item => {
      console.log(`  SKU: ${item.sku} | name: ${(item.name||'').substring(0,40)} | images: ${item.image_urls.length} | features: ${item.features?.length??0} | dealer: ${item.your_dealer_price}`);
    });
    console.log('\nRe-run without --dry to execute.');
    client.release();
    await pool.end();
    return;
  }

  // ── Phase 2: Update pu_catalog ────────────────────────────────
  console.log('Phase 2/3 — Updating pu_catalog...\n');
  let totalUpdated = 0, totalErrors = 0;
  const errorLog = [];

  for (let i = 0; i < allItems.length; i++) {
    const item = allItems[i];
    try {
      await client.query(`
        UPDATE pu_catalog SET
          sku_punctuated           = $2,
          brand_code               = COALESCE($3, brand_code),
          brand                    = COALESCE($4, brand),
          name                     = $5,
          part_status              = COALESCE($6, part_status),
          features                 = $7::text[],
          oem_part_number          = COALESCE($8, oem_part_number),
          country_of_origin        = COALESCE($9, country_of_origin),
          special_instructions     = COALESCE($10, special_instructions),
          uom                      = COALESCE($11, uom),
          qty_per_uom              = COALESCE($12, qty_per_uom),
          height_in                = COALESCE($13, height_in),
          width_in                 = COALESCE($14, width_in),
          length_in                = COALESCE($15, length_in),
          height_ship              = COALESCE($16, height_ship),
          width_ship               = COALESCE($17, width_ship),
          length_ship              = COALESCE($18, length_ship),
          weight                   = COALESCE($19, weight),
          image_url                = COALESCE($20, image_url),
          image_urls               = $21::text[],
          product_name             = COALESCE($22, product_name),
          product_id               = COALESCE($23, product_id),
          product_image            = COALESCE($24, product_image),
          vendor_price_update_date = COALESCE($25, vendor_price_update_date),
          base_dealer_price        = COALESCE($26, base_dealer_price),
          dealer_price             = COALESCE($27, dealer_price),
          msrp                     = COALESCE($28, msrp),
          original_retail          = COALESCE($29, original_retail),
          updated_at               = now()
        WHERE sku = $1
      `, [
        item.sku, item.sku_punctuated, item.brand_code, item.brand, item.name,
        item.part_status,
        item.features ? pgArray(item.features) : null,
        item.oem_part_number, item.country_of_origin, item.special_instructions,
        item.uom, item.qty_per_uom,
        item.height_in, item.width_in, item.length_in,
        item.height_ship, item.width_ship, item.length_ship,
        item.weight,
        item.image_urls[0] || null,
        item.image_urls.length > 0 ? pgArray(item.image_urls) : null,
        item.product_name, item.product_id, item.product_image,
        item.vendor_price_update_date,
        item.base_dealer_price, item.your_dealer_price,
        item.base_retail_price, item.original_retail_price,
      ]);
      totalUpdated++;
    } catch (e) {
      totalErrors++;
      if (errorLog.length < 10) errorLog.push(`SKU ${item.sku}: ${e.message}`);
    }

    if ((i + 1) % 200 === 0 || i + 1 === allItems.length) {
      progress(i + 1, allItems.length, 'pu_catalog');
    }
  }

  console.log(`\n  ✓ ${totalUpdated.toLocaleString()} updated, ${totalErrors} errors`);
  if (errorLog.length) {
    console.log('\n  Errors:');
    errorLog.forEach(e => console.log(`    ${e}`));
  }
  console.log();

  // ── Phase 3: Backfill catalog_media ──────────────────────────
  console.log('Phase 3/3 — Backfilling catalog_media...\n');

  const { rows: mediaRows } = await client.query(`
    SELECT cu.id as product_id, pc.image_urls
    FROM pu_catalog pc
    JOIN catalog_unified cu ON cu.sku = pc.sku AND cu.source_vendor = 'PU'
    WHERE pc.image_urls IS NOT NULL AND array_length(pc.image_urls, 1) > 0
  `);

  console.log(`  ${mediaRows.length.toLocaleString()} PU products with images\n`);

  const { rowCount: cleared } = await client.query(`
    DELETE FROM catalog_media
    WHERE product_id IN (
      SELECT id FROM catalog_unified WHERE source_vendor = 'PU'
    )
  `);
  console.log(`  ✓ Cleared ${cleared.toLocaleString()} stale PU media rows\n`);

  let mediaInserted = 0, mediaErrors = 0;

  for (let i = 0; i < mediaRows.length; i++) {
    const row = mediaRows[i];
    for (let j = 0; j < row.image_urls.length; j++) {
      try {
        await client.query(`
          INSERT INTO catalog_media (product_id, url, media_type, priority)
          VALUES ($1, $2, 'image', $3)
          ON CONFLICT (product_id, url) DO NOTHING
        `, [row.product_id, row.image_urls[j], j]);
        mediaInserted++;
      } catch (e) {
        mediaErrors++;
        if (mediaErrors <= 3) console.error(`\n  catalog_media error:`, e.message);
      }
    }
    if ((i + 1) % 500 === 0 || i + 1 === mediaRows.length) {
      progress(i + 1, mediaRows.length, 'catalog_media');
    }
  }

  console.log(`\n  ✓ ${mediaInserted.toLocaleString()} media rows inserted, ${mediaErrors} errors\n`);

  // ── Summary ───────────────────────────────────────────────────
  const { rows: [s] } = await client.query(`
    SELECT
      COUNT(*)                                                          as total,
      COUNT(image_url)                                                  as has_image,
      COUNT(image_urls) FILTER (WHERE array_length(image_urls,1) > 0)  as has_image_urls,
      COUNT(features)   FILTER (WHERE array_length(features,1)   > 0)  as has_features,
      COUNT(oem_part_number)                                            as has_oem,
      COUNT(weight)                                                     as has_weight,
      COUNT(dealer_price)                                               as has_pricing
    FROM pu_catalog
  `);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  PU XML Enrichment Complete!

  Phase 1 — XML Parsing:
    Files:              ${files.length}
    Items parsed:       ${totalParsed.toLocaleString()}
    Matched to catalog: ${totalMatched.toLocaleString()}

  Phase 2 — pu_catalog:
    Updated:            ${totalUpdated.toLocaleString()}
    Errors:             ${totalErrors}
    Has image:          ${s.has_image}
    Has image_urls[]:   ${s.has_image_urls}
    Has features:       ${s.has_features}
    Has OEM:            ${s.has_oem}
    Has weight:         ${s.has_weight}
    Has pricing:        ${s.has_pricing}

  Phase 3 — catalog_media:
    Rows inserted:      ${mediaInserted.toLocaleString()}
    Errors:             ${mediaErrors}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next: rebuild catalog_unified to pick up enriched PU data
`);

  client.release();
  await pool.end();
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
