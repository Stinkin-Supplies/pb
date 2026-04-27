/**
 * ingest_vtwin_unified.js
 * Merges VTwin products into catalog_unified
 * Uses bulk parameterized inserts per batch for speed
 *
 * Usage: node scripts/ingest/ingest_vtwin_unified.js
 * Safe to re-run — uses ON CONFLICT (internal_sku) DO UPDATE
 */

import pg from 'pg';
import { BatchProgressBar } from './progress_bar.js';

const { Pool } = pg;

const db = new Pool({
  connectionString: 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
  max: 5,
});

const BATCH_SIZE = 500;
const COLS = 42;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function computePrice(dealerPrice, retailPrice) {
  const cost   = parseFloat(dealerPrice) || 0;
  const retail = parseFloat(retailPrice) || 0;
  if (cost <= 0) return null;
  const markup = parseFloat((cost / 0.75).toFixed(2));
  return retail > 0 ? Math.min(markup, retail) : markup;
}

function formatInternalSku(raw) {
  const match = (raw || '').match(/^([A-Z]{3})(\d+)$/);
  if (!match) return raw;
  return `${match[1]}-${match[2]}`;
}

function parseDate(raw) {
  // VTwin date_added format: '20000101' (YYYYMMDD)
  // Guard against '0', '', null, or other garbage
  if (!raw || raw.length !== 8 || !/^\d{8}$/.test(raw)) return null;
  const y = raw.slice(0, 4);
  const m = raw.slice(4, 6);
  const d = raw.slice(6, 8);
  // Sanity check
  if (y === '0000' || m === '00' || d === '00') return null;
  return `${y}-${m}-${d}`;
}

function buildRow(p) {
  const internalSku   = formatInternalSku(p.internal_sku);
  const skuNorm       = internalSku.replace(/[^a-zA-Z0-9]/g, '');
  const computedPrice = computePrice(p.dealer_price, p.retail_price);
  const inStock       = p.has_stock === 'Yes';
  const brand         = (p.manufacturer || 'V-Twin').trim() || 'V-Twin';

  const oemNums = [p.oem_xref1, p.oem_xref2, p.oem_xref3]
    .map(v => (v || '').trim()).filter(Boolean);

  const imageUrls = [p.full_pic1, p.full_pic2, p.full_pic3, p.full_pic4]
    .map(v => (v || '').trim()).filter(Boolean);

  const primaryImage = imageUrls[0] || (p.thumb_pic || '').trim() || null;
  const slug         = slugify(p.description || p.sku).slice(0, 80) + '-' + internalSku.toLowerCase();
  const partAddDate  = parseDate(p.date_added);

  return [
    internalSku,                              // 1  sku
    skuNorm,                                  // 2  sku_normalized
    p.sku,                                    // 3  vendor_sku
    'VTWIN',                                  // 4  source_vendor
    p.description || p.sku,                  // 5  name
    null,                                     // 6  description
    '{}',                                     // 7  features
    brand,                                    // 8  brand
    p.catalog_category,                       // 9  category
    parseFloat(p.retail_price) || null,       // 10 msrp
    parseFloat(p.retail_price) || null,       // 11 original_retail
    parseFloat(p.dealer_price) || null,       // 12 cost
    false,                                    // 13 has_map_policy
    false,                                    // 14 ad_policy
    0,                                        // 15 stock_quantity
    inStock,                                  // 16 in_stock
    parseFloat(p.weight_lbs) || null,         // 17 weight
    parseFloat(p.height_inch) || null,        // 18 height_in
    parseFloat(p.length_inch) || null,        // 19 length_in
    parseFloat(p.width_inch) || null,         // 20 width_in
    p.uom || null,                            // 21 uom
    null,                                     // 22 upc
    p.cntry_of_origin || null,                // 23 country_of_origin
    primaryImage,                             // 24 image_url
    imageUrls.length ? imageUrls : null,       // 25 image_urls
    false,                                    // 26 is_harley_fitment
    false,                                    // 27 is_universal
    false,                                    // 28 in_oldbook
    false,                                    // 29 in_fatbook
    false,                                    // 30 drag_part
    false,                                    // 31 closeout
    true,                                     // 32 is_active
    false,                                    // 33 is_discontinued
    false,                                    // 34 in_harddrive
    false,                                    // 35 in_street
    partAddDate,                              // 36 part_add_date
    slug,                                     // 37 slug
    internalSku,                              // 38 internal_sku
    brand,                                    // 39 display_brand
    brand,                                    // 40 manufacturer_brand
    oemNums.length ? oemNums : null,          // 41 oem_numbers
    computedPrice,                            // 42 computed_price
  ];
}

// ---------------------------------------------------------------------------
// Step 1: Fetch all VTwin products joined to staging SKUs
// ---------------------------------------------------------------------------
async function fetchProducts() {
  console.log('\n[Step 1] Fetching VTwin products from staging...');
  const { rows } = await db.query(`
    SELECT p.*, s.internal_sku, s.catalog_category, s.sku_prefix
    FROM vendor.vtwinmtc_products p
    JOIN vendor.vtwin_sku_staging s ON s.vtwin_sku = p.sku
    ORDER BY p.sku
  `);
  console.log(`  Loaded ${rows.length.toLocaleString()} products`);
  return rows;
}

// ---------------------------------------------------------------------------
// Step 2: Merge in bulk batches
// ---------------------------------------------------------------------------
async function mergeProducts(products) {
  console.log('\n[Step 2] Merging into catalog_unified...');

  const totalBatches = Math.ceil(products.length / BATCH_SIZE);
  const bar = new BatchProgressBar(totalBatches, BATCH_SIZE, 'Merging');

  const COLUMN_LIST = `
    sku, sku_normalized, vendor_sku, source_vendor,
    name, description, features,
    brand, category,
    msrp, original_retail, cost,
    has_map_policy, ad_policy,
    stock_quantity, in_stock,
    weight, height_in, length_in, width_in,
    uom, upc, country_of_origin,
    image_url, image_urls,
    is_harley_fitment, is_universal,
    in_oldbook, in_fatbook, drag_part,
    closeout, is_active, is_discontinued,
    in_harddrive, in_street,
    part_add_date, slug,
    internal_sku, display_brand, manufacturer_brand,
    oem_numbers, computed_price
  `;

  const UPDATE_SET = `
    sku                = EXCLUDED.sku,
    sku_normalized     = EXCLUDED.sku_normalized,
    vendor_sku         = EXCLUDED.vendor_sku,
    name               = EXCLUDED.name,
    brand              = EXCLUDED.brand,
    category           = EXCLUDED.category,
    msrp               = EXCLUDED.msrp,
    original_retail    = EXCLUDED.original_retail,
    cost               = EXCLUDED.cost,
    stock_quantity     = EXCLUDED.stock_quantity,
    in_stock           = EXCLUDED.in_stock,
    weight             = EXCLUDED.weight,
    height_in          = EXCLUDED.height_in,
    length_in          = EXCLUDED.length_in,
    width_in           = EXCLUDED.width_in,
    image_url          = EXCLUDED.image_url,
    image_urls         = EXCLUDED.image_urls,
    oem_numbers        = EXCLUDED.oem_numbers,
    computed_price     = EXCLUDED.computed_price,
    updated_at         = now()
  `;

  let totalInserted = 0;

  for (let b = 0; b < totalBatches; b++) {
    const batch   = products.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const rows    = batch.map(buildRow);
    const params  = rows.flat();

    // Build $1, $2... placeholders — COLS values per row
    const valuePlaceholders = rows.map((_, i) => {
      const base = i * COLS;
      const slots = Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`);
      return `(${slots.join(', ')}, now(), now())`;
    }).join(',\n');

    const sql = `
      INSERT INTO catalog_unified (${COLUMN_LIST}, created_at, updated_at)
      VALUES ${valuePlaceholders}
      ON CONFLICT (internal_sku) WHERE internal_sku IS NOT NULL
      DO UPDATE SET ${UPDATE_SET}
    `;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(sql, params);
      await client.query('COMMIT');
      totalInserted += result.rowCount;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    bar.updateBatch(b + 1, batch.length);
  }

  bar.finish();
  return totalInserted;
}

// ---------------------------------------------------------------------------
// Step 3: Summary
// ---------------------------------------------------------------------------
async function printSummary() {
  console.log('\n[Step 3] Summary...');

  const { rows } = await db.query(`
    SELECT
      COUNT(*)                                    AS total,
      COUNT(*) FILTER (WHERE in_stock)            AS in_stock,
      COUNT(*) FILTER (WHERE computed_price > 0)  AS has_price,
      COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url != '') AS has_image,
      COUNT(*) FILTER (WHERE oem_numbers IS NOT NULL) AS has_oem,
      ROUND(AVG(computed_price)::numeric, 2)      AS avg_price
    FROM catalog_unified
    WHERE source_vendor = 'VTWIN'
  `);

  const r = rows[0];
  console.log(`
  VTWIN rows in catalog_unified:
  --------------------------------
  Total:       ${Number(r.total).toLocaleString()}
  In stock:    ${Number(r.in_stock).toLocaleString()}
  Has price:   ${Number(r.has_price).toLocaleString()}
  Has image:   ${Number(r.has_image).toLocaleString()}
  Has OEM#:    ${Number(r.has_oem).toLocaleString()}
  Avg price:   $${r.avg_price}
  `);

  const { rows: byCat } = await db.query(`
    SELECT category, COUNT(*) AS products
    FROM catalog_unified
    WHERE source_vendor = 'VTWIN'
    GROUP BY category
    ORDER BY products DESC
    LIMIT 15
  `);

  console.log('  Top categories:');
  for (const c of byCat) {
    console.log(`    ${(c.category || 'NULL').padEnd(35)} ${Number(c.products).toLocaleString()}`);
  }

  const { rows: gt } = await db.query(`SELECT COUNT(*) AS total FROM catalog_unified`);
  console.log(`\n  catalog_unified grand total: ${Number(gt[0].total).toLocaleString()} products`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== VTwin → catalog_unified Merge ===');
  try {
    const existingCount = await db.query(
      `SELECT COUNT(*) AS cnt FROM catalog_unified WHERE source_vendor = 'VTWIN'`
    );
    const existing = parseInt(existingCount.rows[0].cnt);
    if (existing > 0) {
      console.log(`  ℹ️  ${existing.toLocaleString()} existing VTWIN rows — will update`);
    }

    const products = await fetchProducts();
    await mergeProducts(products);
    await printSummary();
    console.log('\n✅ Done. Run index_unified.js --recreate to reindex Typesense.\n');
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();
