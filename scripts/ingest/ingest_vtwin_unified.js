#!/usr/bin/env node
/**
 * ingest_vtwin_unified.js
 * Merges vtwin_catalog into catalog_unified
 * Sources directly from public.vtwin_catalog
 *
 * Run: node scripts/ingest/ingest_vtwin_unified.js
 * Dry: node scripts/ingest/ingest_vtwin_unified.js --dry
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

const pool = new pg.Pool({
  host:     process.env.CATALOG_DB_HOST     || '5.161.100.126',
  port:     parseInt(process.env.CATALOG_DB_PORT || '5432'),
  database: process.env.CATALOG_DB_NAME     || 'stinkin_catalog',
  user:     process.env.CATALOG_DB_USER     || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

const DRY        = process.argv.includes('--dry');
const BATCH_SIZE = 500;

function progress(current, total, label) {
  const pct    = Math.floor((current / total) * 100);
  const filled = Math.floor(pct / 2);
  const bar    = '█'.repeat(filled) + '░'.repeat(50 - filled);
  process.stdout.write(`\r  ${label}: [${bar}] ${pct}% (${current.toLocaleString()}/${total.toLocaleString()})`);
}

function slugify(text, sku) {
  const base = (text || sku || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .slice(0, 80);
  return `${base}-${(sku || '').toLowerCase()}`;
}

function computePrice(cost, retail) {
  const c = parseFloat(cost)   || 0;
  const r = parseFloat(retail) || 0;
  if (c <= 0) return null;
  const markup = parseFloat((c / 0.75).toFixed(2));
  return r > 0 ? Math.min(markup, r) : markup;
}

function buildRow(p) {
  // VTwin SKUs are like "VT-01-0101" — use as-is for sku, strip for sku_normalized
  const sku           = (p.sku || '').trim();
  const skuNorm       = sku.replace(/[^a-zA-Z0-9]/g, '');
  const computedPrice = computePrice(p.dealer_price, p.retail_price);
  const brand         = (p.manufacturer || 'V-Twin').trim() || 'V-Twin';
  const slug          = slugify(p.name, sku);

  // Combine oem_numbers array (already consolidated) + xrefs as fallback
  const oemNums = p.oem_numbers && p.oem_numbers.length > 0
    ? p.oem_numbers
    : [p.oem_xref1, p.oem_xref2, p.oem_xref3]
        .map(v => (v || '').trim()).filter(Boolean);

  const imageUrls = [p.full_pic1, p.full_pic2, p.full_pic3, p.full_pic4]
    .map(v => (v || '').trim()).filter(Boolean);

  const primaryImage = imageUrls[0] || (p.thumb_pic || '').trim() || null;

  return {
    sku,
    sku_normalized:    skuNorm,
    vendor_sku:        sku,
    source_vendor:     'VTwin',
    name:              p.name || sku,
    description:       null,
    features:          null,
    brand,
    display_brand:     brand,
    manufacturer_brand: brand,
    category:          null,           // category fix script handles this separately
    msrp:              parseFloat(p.retail_price) || null,
    original_retail:   parseFloat(p.retail_price) || null,
    cost:              parseFloat(p.dealer_price)  || null,
    computed_price:    computedPrice,
    has_map_policy:    false,
    ad_policy:         false,
    stock_quantity:    0,
    in_stock:          p.has_stock === true,
    weight:            parseFloat(p.weight_lbs)  || null,
    height_in:         parseFloat(p.height_in)   || null,
    length_in:         parseFloat(p.length_in)   || null,
    width_in:          parseFloat(p.width_in)    || null,
    uom:               p.uom || null,
    upc:               null,
    country_of_origin: p.country_of_origin || null,
    image_url:         primaryImage,
    image_urls:        imageUrls.length ? imageUrls : null,
    is_harley_fitment: false,
    is_universal:      false,
    in_oldbook:        false,
    in_fatbook:        false,
    drag_part:         false,
    closeout:          false,
    is_active:         true,
    is_discontinued:   false,
    in_harddrive:      false,
    in_street:         false,
    oem_numbers:       oemNums.length ? oemNums : null,
    slug,
    internal_sku:      sku,
  };
}

async function main() {
  console.log('\n🔧 VTwin → catalog_unified Ingest\n');
  console.log(`   Mode: ${DRY ? 'DRY RUN' : 'LIVE'}\n`);

  const client = await pool.connect();

  // ── Check existing ────────────────────────────────────────────
  const { rows: [{ existing }] } = await client.query(
    `SELECT COUNT(*) as existing FROM catalog_unified WHERE source_vendor = 'VTwin'`
  );
  console.log(`   Existing VTwin rows in catalog_unified: ${existing}\n`);

  // ── Load vtwin_catalog ────────────────────────────────────────
  console.log('Loading vtwin_catalog...');
  const { rows: products } = await client.query(`
    SELECT
      sku, name, dealer_price, retail_price, has_stock,
      uom, vendor_part_no, manufacturer, country_of_origin,
      weight_lbs, length_in, width_in, height_in,
      oem_xref1, oem_xref2, oem_xref3,
      oem_numbers,
      thumb_pic, full_pic1, full_pic2, full_pic3, full_pic4,
      update_date, date_added
    FROM vtwin_catalog
    ORDER BY sku
  `);
  console.log(`✓ ${products.length.toLocaleString()} products loaded\n`);

  if (DRY) {
    const sample = products.slice(0, 5).map(buildRow);
    console.log('Sample rows:');
    sample.forEach(r => {
      console.log(`  ${r.sku} | ${r.name.substring(0,40)} | $${r.computed_price} | oem: ${r.oem_numbers?.length ?? 0} | img: ${r.image_url ? '✓' : '✗'}`);
    });
    const withOem   = products.filter(p => buildRow(p).oem_numbers?.length > 0).length;
    const withImage = products.filter(p => buildRow(p).image_url).length;
    console.log(`\n  Would insert/update: ${products.length.toLocaleString()}`);
    console.log(`  With OEM numbers:    ${withOem.toLocaleString()}`);
    console.log(`  With images:         ${withImage.toLocaleString()}`);
    console.log('\nRe-run without --dry to execute.');
    client.release();
    await pool.end();
    return;
  }

  // ── Upsert in batches ─────────────────────────────────────────
  console.log('Upserting into catalog_unified...\n');
  let inserted = 0, updated = 0, errors = 0;
  const errorLog = [];
  const totalBatches = Math.ceil(products.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const batch = products.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const rows  = batch.map(buildRow);

    // Build parameterized VALUES
    const COLS = 38;
    const valuePlaceholders = rows.map((_, i) => {
      const base  = i * COLS;
      const slots = Array.from({ length: COLS }, (_, j) => `$${base + j + 1}`);
      return `(${slots.join(', ')}, now(), now())`;
    }).join(',\n');

    const params = rows.flatMap(r => [
      r.sku, r.sku_normalized, r.vendor_sku, r.source_vendor,
      r.name, r.description, r.features,
      r.brand, r.display_brand, r.manufacturer_brand,
      r.category,
      r.msrp, r.original_retail, r.cost, r.computed_price,
      r.has_map_policy, r.ad_policy,
      r.stock_quantity, r.in_stock,
      r.weight, r.height_in, r.length_in, r.width_in,
      r.uom, r.upc, r.country_of_origin,
      r.image_url, r.image_urls,
      r.is_harley_fitment, r.is_universal,
      r.in_oldbook, r.in_fatbook, r.drag_part,
      r.closeout, r.is_active, r.is_discontinued,
      r.oem_numbers,
      r.slug,
    ]);

    const sql = `
      INSERT INTO catalog_unified (
        sku, sku_normalized, vendor_sku, source_vendor,
        name, description, features,
        brand, display_brand, manufacturer_brand,
        category,
        msrp, original_retail, cost, computed_price,
        has_map_policy, ad_policy,
        stock_quantity, in_stock,
        weight, height_in, length_in, width_in,
        uom, upc, country_of_origin,
        image_url, image_urls,
        is_harley_fitment, is_universal,
        in_oldbook, in_fatbook, drag_part,
        closeout, is_active, is_discontinued,
        oem_numbers,
        slug,
        created_at, updated_at
      )
      VALUES ${valuePlaceholders}
      ON CONFLICT (sku) DO UPDATE SET
        sku_normalized     = EXCLUDED.sku_normalized,
        vendor_sku         = EXCLUDED.vendor_sku,
        name               = EXCLUDED.name,
        brand              = EXCLUDED.brand,
        display_brand      = EXCLUDED.display_brand,
        manufacturer_brand = EXCLUDED.manufacturer_brand,
        msrp               = EXCLUDED.msrp,
        original_retail    = EXCLUDED.original_retail,
        cost               = EXCLUDED.cost,
        computed_price     = EXCLUDED.computed_price,
        stock_quantity     = EXCLUDED.stock_quantity,
        in_stock           = EXCLUDED.in_stock,
        weight             = EXCLUDED.weight,
        height_in          = EXCLUDED.height_in,
        length_in          = EXCLUDED.length_in,
        width_in           = EXCLUDED.width_in,
        image_url          = EXCLUDED.image_url,
        image_urls         = EXCLUDED.image_urls,
        oem_numbers        = EXCLUDED.oem_numbers,
        updated_at         = now()
    `;

    try {
      const result = await client.query(sql, params);
      inserted += result.rowCount;
    } catch (e) {
      errors += batch.length;
      if (errorLog.length < 5) errorLog.push(e.message);
    }

    progress(b + 1, totalBatches, 'Upserting');
  }

  console.log(`\n  ✓ ${inserted.toLocaleString()} rows upserted, ${errors} errors`);
  if (errorLog.length) {
    console.log('\n  Errors:');
    errorLog.forEach(e => console.log(`    ${e}`));
  }

  // ── Summary ───────────────────────────────────────────────────
  const { rows: [s] } = await client.query(`
    SELECT
      COUNT(*)                                    as total,
      COUNT(*) FILTER (WHERE in_stock)            as in_stock,
      COUNT(*) FILTER (WHERE computed_price > 0)  as has_price,
      COUNT(*) FILTER (WHERE image_url IS NOT NULL) as has_image,
      COUNT(*) FILTER (WHERE array_length(oem_numbers,1) > 0) as has_oem,
      ROUND(AVG(computed_price) FILTER (WHERE computed_price > 0), 2) as avg_price
    FROM catalog_unified
    WHERE source_vendor = 'VTwin'
  `);

  const { rows: [{ grand_total }] } = await client.query(
    `SELECT COUNT(*) as grand_total FROM catalog_unified`
  );

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  VTwin Ingest Complete!

  VTwin in catalog_unified:
    Total:         ${s.total}
    In stock:      ${s.in_stock}
    Has price:     ${s.has_price}
    Has image:     ${s.has_image}
    Has OEM#:      ${s.has_oem}
    Avg price:     $${s.avg_price}

  catalog_unified grand total: ${parseInt(grand_total).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next steps:
  1. Run category fix script for VTwin products
  2. node scripts/ingest/index_unified.js --recreate
`);

  client.release();
  await pool.end();
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
