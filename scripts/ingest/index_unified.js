#!/usr/bin/env node

/**
 * index_unified.js
 * Indexes catalog_unified into Typesense with full schema:
 * fitment, features, vendor flags, inventory, images, categories
 *
 * Run: node scripts/ingest/index_unified.js
 * Run (recreate): node scripts/ingest/index_unified.js --recreate
 */

import dotenv from 'dotenv';
import pg from 'pg';
import Typesense from 'typesense';
import { ProgressBar } from './progress_bar.js';

dotenv.config({ path: '.env.local', override: true });

const pool = new pg.Pool({
  host:     process.env.CATALOG_DB_HOST     || '5.161.100.126',
  port:     process.env.CATALOG_DB_PORT     || 5432,
  database: process.env.CATALOG_DB_NAME     || 'stinkin_catalog',
  user:     process.env.CATALOG_DB_USER     || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

const client = new Typesense.Client({
  nodes: [{ 
    host:     process.env.TYPESENSE_HOST     || 'localhost',
    port:     parseInt(process.env.TYPESENSE_PORT || '8108'),
    protocol: process.env.TYPESENSE_PROTOCOL || 'http',
  }],
  apiKey:                   process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 30,
});

const COLLECTION = process.env.TYPESENSE_COLLECTION || 'products';
const BATCH_SIZE = 250;
const RECREATE   = process.argv.includes('--recreate');

// ── SCHEMA ────────────────────────────────────────────────────────────────────

const SCHEMA = {
  name: COLLECTION,
  fields: [
    // Identity
    { name: 'sku',               type: 'string' },
    { name: 'vendor_sku',        type: 'string',   optional: true },
    { name: 'source_vendor',     type: 'string',   facet: true },
    { name: 'product_code',      type: 'string',   facet: true, optional: true },
    { name: 'slug',              type: 'string',   optional: true },

    // Content
    { name: 'name',              type: 'string' },
    { name: 'description',       type: 'string',   optional: true },
    { name: 'features',          type: 'string[]', optional: true },
    { name: 'brand',             type: 'string',   facet: true, optional: true },
    { name: 'category',          type: 'string',   facet: true, optional: true },
    { name: 'subcategory',       type: 'string',   facet: true, optional: true },
    { name: 'oem_part_number',   type: 'string',   optional: true },
    { name: 'upc',               type: 'string',   optional: true },
    { name: 'uom',               type: 'string',   optional: true },

    // Pricing
    { name: 'msrp',              type: 'float',    optional: true, facet: true },
    { name: 'cost',              type: 'float',    optional: true },
    { name: 'map_price',         type: 'float',    optional: true },
    { name: 'has_map_policy',    type: 'bool',     facet: true },
    { name: 'ad_policy',         type: 'bool',     facet: true },
    { name: 'dropship_fee',      type: 'float',    optional: true },

    // Inventory
    { name: 'stock_quantity',    type: 'int32' },
    { name: 'warehouse_wi',      type: 'int32' },
    { name: 'warehouse_ny',      type: 'int32' },
    { name: 'warehouse_tx',      type: 'int32' },
    { name: 'warehouse_nv',      type: 'int32' },
    { name: 'warehouse_nc',      type: 'int32' },
    { name: 'in_stock',          type: 'bool',     facet: true },

    // Physical
    { name: 'weight',            type: 'float',    optional: true },
    { name: 'height_in',         type: 'float',    optional: true },
    { name: 'length_in',         type: 'float',    optional: true },
    { name: 'width_in',          type: 'float',    optional: true },
    { name: 'country_of_origin', type: 'string',   optional: true },
    { name: 'hazardous_code',    type: 'string',   facet: true, optional: true },
    { name: 'truck_only',        type: 'bool',     facet: true },
    { name: 'no_ship_ca',        type: 'bool',     facet: true },

    // Media
    { name: 'image_url',         type: 'string',   optional: true },
    { name: 'image_urls',        type: 'string[]', optional: true },
    { name: 'has_image',         type: 'bool',     facet: true },

    // Fitment
    { name: 'fitment_year_start',  type: 'int32',    optional: true, facet: true },
    { name: 'fitment_year_end',    type: 'int32',    optional: true },
    { name: 'fitment_hd_families', type: 'string[]', optional: true, facet: true },
    { name: 'fitment_hd_models',   type: 'string[]', optional: true, facet: true },
    { name: 'fitment_hd_codes',    type: 'string[]', optional: true, facet: true },
    { name: 'fitment_other_makes', type: 'string[]', optional: true, facet: true },
    { name: 'is_harley_fitment',   type: 'bool',     facet: true },
    { name: 'is_universal',        type: 'bool',     facet: true },

    // Catalog flags
    { name: 'in_harddrive',      type: 'bool',     facet: true },
    { name: 'in_oldbook',        type: 'bool',     facet: true },
    { name: 'in_fatbook',        type: 'bool',     facet: true },
    { name: 'drag_part',         type: 'bool',     facet: true },
    { name: 'closeout',          type: 'bool',     facet: true },
    { name: 'is_active',         type: 'bool',     facet: true },
    { name: 'is_discontinued',   type: 'bool',     facet: true },

    // Sorting
    { name: 'sort_priority',     type: 'int32' },
    { name: 'name_sort',         type: 'string',   optional: true },
  ],
  default_sorting_field: 'sort_priority',
};

// ── TRANSFORM ─────────────────────────────────────────────────────────────────

function transform(row) {
  const hasImage = !!row.image_url;
  const imageUrls = Array.isArray(row.image_urls)
    ? row.image_urls.filter(Boolean)
    : row.image_url ? [row.image_url] : [];

  // Sort priority: has image + in stock = highest
  const sortPriority =
    (hasImage ? 4 : 0) +
    (row.in_stock ? 2 : 0) +
    (row.source_vendor === 'WPS' ? 1 : 0);

  return {
    id:               row.id.toString(),
    sku:              row.sku,
    vendor_sku:       row.vendor_sku || undefined,
    source_vendor:    row.source_vendor || '',
    product_code:     row.product_code || undefined,
    slug:             row.slug || undefined,

    name:             row.name,
    description:      row.description || undefined,
    features:         Array.isArray(row.features) && row.features.length ? row.features : undefined,
    brand:            row.brand || undefined,
    category:         row.category || undefined,
    subcategory:      row.subcategory || undefined,
    oem_part_number:  row.oem_part_number || undefined,
    upc:              row.upc || undefined,
    uom:              row.uom || undefined,

    msrp:             parseFloat(row.msrp) || undefined,
    cost:             parseFloat(row.cost) || undefined,
    map_price:        parseFloat(row.map_price) || undefined,
    has_map_policy:   row.has_map_policy || false,
    ad_policy:        row.ad_policy || false,
    dropship_fee:     parseFloat(row.dropship_fee) || undefined,

    stock_quantity:   row.stock_quantity || 0,
    warehouse_wi:     row.warehouse_wi || 0,
    warehouse_ny:     row.warehouse_ny || 0,
    warehouse_tx:     row.warehouse_tx || 0,
    warehouse_nv:     row.warehouse_nv || 0,
    warehouse_nc:     row.warehouse_nc || 0,
    in_stock:         row.in_stock || false,

    weight:           parseFloat(row.weight) || undefined,
    height_in:        parseFloat(row.height_in) || undefined,
    length_in:        parseFloat(row.length_in) || undefined,
    width_in:         parseFloat(row.width_in) || undefined,
    country_of_origin: row.country_of_origin || undefined,
    hazardous_code:   row.hazardous_code || undefined,
    truck_only:       row.truck_only || false,
    no_ship_ca:       row.no_ship_ca || false,

    image_url:        row.image_url || undefined,
    image_urls:       imageUrls.length ? imageUrls : undefined,
    has_image:        hasImage,

    fitment_year_start:  row.fitment_year_start ? parseInt(row.fitment_year_start) : undefined,
    fitment_year_end:    row.fitment_year_end   ? parseInt(row.fitment_year_end)   : undefined,
    fitment_hd_families: row.fitment_hd_families?.length ? row.fitment_hd_families : undefined,
    fitment_hd_models:   row.fitment_hd_models?.length   ? row.fitment_hd_models   : undefined,
    fitment_hd_codes:    row.fitment_hd_codes?.length    ? row.fitment_hd_codes    : undefined,
    fitment_other_makes: row.fitment_other_makes?.length ? row.fitment_other_makes : undefined,
    is_harley_fitment:   row.is_harley_fitment || false,
    is_universal:        row.is_universal || false,

    in_harddrive:     row.in_harddrive || false,
    in_oldbook:       row.in_oldbook || false,
    in_fatbook:       row.in_fatbook || false,
    drag_part:        row.drag_part  || false,
    closeout:         row.closeout   || false,
    is_active:        row.is_active  !== false,
    is_discontinued:  row.is_discontinued || false,

    sort_priority:    sortPriority,
    name_sort:        row.name?.toLowerCase() || '',
  };
}

// ── COLLECTION SETUP ──────────────────────────────────────────────────────────

async function setupCollection() {
  if (RECREATE) {
    console.log('🗑️  Recreating collection...');
    try {
      await client.collections(COLLECTION).delete();
      console.log('   ✓ Deleted old collection');
    } catch (e) {
      if (e.httpStatus !== 404) throw e;
      console.log('   ℹ️  Collection did not exist');
    }
    await client.collections().create(SCHEMA);
    console.log('   ✓ Collection created\n');
  } else {
    // Try to update schema or create if missing
    try {
      await client.collections(COLLECTION).retrieve();
      console.log(`   ✓ Collection exists — upserting documents\n`);
    } catch (e) {
      if (e.httpStatus === 404) {
        await client.collections().create(SCHEMA);
        console.log('   ✓ Collection created\n');
      } else throw e;
    }
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Indexing catalog_unified → Typesense [${COLLECTION}]\n`);
  console.log(`   Mode: ${RECREATE ? 'RECREATE' : 'UPSERT'}`);
  console.log(`   Host: ${process.env.TYPESENSE_HOST}\n`);

  await setupCollection();

  // Count total
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM catalog_unified WHERE is_active = true`
  );
  const total = parseInt(count);
  console.log(`📦 ${total.toLocaleString()} active products to index\n`);

  const bar     = new ProgressBar(total, 'Indexing');
  let indexed   = 0;
  let errors    = 0;
  let offset    = 0;

  while (offset < total) {
    const { rows } = await pool.query(
      `SELECT * FROM catalog_unified WHERE is_active = true ORDER BY id LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    );

    if (!rows.length) break;

    const docs = rows.map(transform);

    try {
      const results = await client
        .collections(COLLECTION)
        .documents()
        .import(docs, { action: 'upsert' });

      results.forEach(r => { if(r.success) indexed++; else { errors++; if(errors<=2) console.error("FAIL:", JSON.stringify(r)); }});
    } catch (err) {
      console.error(`\nBatch error at offset ${offset}:`, err.message);
      errors += rows.length;
    }

    offset += rows.length;
    bar.update(offset);
  }

  bar.finish('Indexing complete');

  // Summary
  const col = await client.collections(COLLECTION).retrieve();
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Indexing complete!

  Documents indexed:    ${indexed.toLocaleString()}
  Errors:               ${errors.toLocaleString()}
  Typesense total:      ${col.num_documents.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Test searches:
  Harley Softail products:
  curl "https://${process.env.TYPESENSE_HOST}/collections/${COLLECTION}/documents/search?q=softail&query_by=name,brand,features&filter_by=is_harley_fitment:true" \\
    -H "X-TYPESENSE-API-KEY: ${process.env.TYPESENSE_SEARCH_KEY}"

  In-stock Drag parts:
  curl "https://${process.env.TYPESENSE_HOST}/collections/${COLLECTION}/documents/search?q=*&filter_by=drag_part:true&&in_stock:true" \\
    -H "X-TYPESENSE-API-KEY: ${process.env.TYPESENSE_SEARCH_KEY}"
`);

  await pool.end();
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
