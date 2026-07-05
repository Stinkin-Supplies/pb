#!/usr/bin/env node

/**
 * index_unified.js
 * Indexes catalog_unified into Typesense with full schema:
 * fitment, features, vendor flags, inventory, images, categories
 *
 * UPDATED: joins canonical_products to add canonical_sku to the index. This
 * is the field checkout actually needs — catalog_unified.id/sku are a
 * different keyspace from canonical_products.canonical_sku, which is what
 * checkout/prepare, stripe/create-intent, and orders/create all key off of.
 * ~2,044 of 90,629 active products (2.3%) have no canonical match yet and
 * will index with canonical_sku = null — those can't go through checkout
 * until they're matched; that's a data gap to close separately, not
 * something to work around here.
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
    { name: 'canonical_sku',     type: 'string',   optional: true },
    { name: 'vendor_sku',        type: 'string',   optional: true },
    { name: 'source_vendor',     type: 'string',   facet: true },
    { name: 'product_code',      type: 'string',   facet: true, optional: true },
    { name: 'slug',              type: 'string',   optional: true },
    { name: 'variant_group_id', type: 'int32',    optional: true, facet: true },

    // Content
    { name: 'name',              type: 'string' },
    { name: 'description',       type: 'string',   optional: true },
    { name: 'features',          type: 'string[]', optional: true },
    { name: 'brand',             type: 'string',   facet: true, optional: true },
    { name: 'category',             type: 'string',   facet: true, optional: true },
    { name: 'subcategory',          type: 'string',   facet: true, optional: true },
    { name: 'display_category',     type: 'string',   facet: true, optional: true },
    { name: 'display_subcategory',  type: 'string',   facet: true, optional: true },
    { name: 'oem_part_number',   type: 'string',   optional: true },
    { name: 'oem_numbers',       type: 'string[]', optional: true },
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
    // Combined human-readable fitment string for full-text search.
    // e.g. "Touring Street Glide Road King FLHX FLHR 2006-2023"
    // Makes "street glide brake rotor" find the right products.
    { name: 'fitment_text',        type: 'string',   optional: true },
    { name: 'is_harley_fitment',   type: 'bool',     facet: true },
    { name: 'is_universal',        type: 'bool',     facet: true },

    // Era boolean flags — pre-populated by era_columns_populate.sql
    { name: 'era_flathead',        type: 'bool',     facet: true },
    { name: 'era_knucklehead',     type: 'bool',     facet: true },
    { name: 'era_panhead',         type: 'bool',     facet: true },
    { name: 'era_shovelhead',      type: 'bool',     facet: true },
    { name: 'era_ironhead',        type: 'bool',     facet: true },
    { name: 'era_evolution',       type: 'bool',     facet: true },
    { name: 'era_evo_sportster',   type: 'bool',     facet: true },
    { name: 'era_twin_cam',        type: 'bool',     facet: true },
    { name: 'era_milwaukee8',      type: 'bool',     facet: true },
    { name: 'era_chopper',         type: 'bool',     facet: true },

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

  // product_details is the normalized, vendor-agnostic content column.
  // Use it as primary source for description + features; fall back to raw
  // columns for products not yet backfilled (or non-active-vendor products).
  const details     = row.product_details || {};
  const description = details.description
    || row.description
    || undefined;
  const features    = details.features?.length
    ? details.features
    : (Array.isArray(row.features) && row.features.length ? row.features : undefined);

  // Sort priority: has image + in stock = highest
  const sortPriority =
    (hasImage ? 4 : 0) +
    (row.in_stock ? 2 : 0) +
    (row.source_vendor === 'WPS' ? 1 : 0);

  return {
    id:               row.id.toString(),
    sku:              row.sku,
    // From the canonical_products join below — null for the ~2.3% of active
    // products not yet matched to a canonical row. Checkout keys off this,
    // not `sku`.
    canonical_sku:    row.canonical_sku || undefined,
    vendor_sku:       row.vendor_sku || undefined,
    source_vendor:    row.source_vendor || '',
    product_code:     row.product_code || undefined,
    slug:             row.slug || undefined,
    variant_group_id: row.variant_group_id ? parseInt(row.variant_group_id) : undefined,

    name:             row.name,
    description:      description,
    features:         features,
    brand:            row.brand || undefined,
    category:         row.category || undefined,
    subcategory:      row.subcategory || undefined,
    display_category:    row.display_category || undefined,
    display_subcategory: row.display_subcategory || undefined,
    oem_part_number:  row.oem_part_number || undefined,
    oem_numbers:      Array.isArray(row.oem_numbers) && row.oem_numbers.length ? row.oem_numbers : undefined,
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
    // Combined human-readable fitment string for full-text search.
    // Joins families + models + year range into one searchable field.
    fitment_text: (() => {
      const parts = [];
      if (row.fitment_hd_families?.length) parts.push(...row.fitment_hd_families);
      if (row.fitment_hd_models?.length)   parts.push(...row.fitment_hd_models);
      if (row.fitment_hd_codes?.length)    parts.push(...row.fitment_hd_codes);
      if (row.fitment_year_start && row.fitment_year_end) {
        parts.push(`${row.fitment_year_start}-${row.fitment_year_end}`);
      }
      return parts.length ? [...new Set(parts)].join(' ') : undefined;
    })(),
    is_harley_fitment:   row.is_harley_fitment || false,
    is_universal:        row.is_universal || false,

    era_flathead:        row.era_flathead        || false,
    era_knucklehead:     row.era_knucklehead     || false,
    era_panhead:         row.era_panhead         || false,
    era_shovelhead:      row.era_shovelhead      || false,
    era_ironhead:        row.era_ironhead        || false,
    era_evolution:       row.era_evolution       || false,
    era_evo_sportster:   row.era_evo_sportster   || false,
    era_twin_cam:        row.era_twin_cam        || false,
    era_milwaukee8:      row.era_milwaukee8      || false,
    era_chopper:         row.era_chopper         || false,

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
    // Try to update schema or create if missing.
    // NOTE: adding a new optional field (canonical_sku) to an EXISTING
    // collection without --recreate will NOT retroactively add it to the
    // schema — Typesense only applies SCHEMA on creation. Run with
    // --recreate at least once after this change, then plain upserts are
    // fine going forward.
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
    // LEFT JOIN — unmatched products (canonical_product_id IS NULL) still
    // index, just with canonical_sku = null. They're just not sellable via
    // checkout until they're matched; that's a separate data-quality task.
    const { rows } = await pool.query(
      `SELECT cu.*, cp.canonical_sku
       FROM catalog_unified cu
       LEFT JOIN canonical_products cp ON cp.id = cu.canonical_product_id
       WHERE cu.is_active = true
       ORDER BY cu.id
       LIMIT $1 OFFSET $2`,
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
