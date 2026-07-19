#!/usr/bin/env node
/**
 * index_product_groups.js
 *
 * Indexes product_groups into Typesense — one search document per "need"
 * (one per OEM fitment / UPC-matched item / singleton).
 *
 * Each document carries:
 *   - Canonical name, brand, image, fitment from the best member
 *   - All available brands for the group (shown as options on product page)
 *   - All vendor SKUs (used by routing engine at checkout)
 *   - Aggregated availability and pricing across all members
 *
 * This replaces the old per-SKU indexing — customers never see duplicates.
 *
 * Run:
 *   node scripts/ingest/index_product_groups.js
 *   node scripts/ingest/index_product_groups.js --recreate   (drop & rebuild)
 *
 * Prerequisites:
 *   migration-122-product-groups.sql  ← creates tables
 *   build-product-groups.js           ← populates tables
 */

import dotenv from 'dotenv';
import pg from 'pg';
import Typesense from 'typesense';

dotenv.config({ path: '.env.local', override: true });

const dbPool = new pg.Pool({
  host:     process.env.CATALOG_DB_HOST     || '5.161.100.126',
  port:     parseInt(process.env.CATALOG_DB_PORT  || '5432'),
  database: process.env.CATALOG_DB_NAME     || 'stinkin_catalog',
  user:     process.env.CATALOG_DB_USER     || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

const tsClient = new Typesense.Client({
  nodes: [{
    host:     process.env.TYPESENSE_HOST     || 'localhost',
    port:     parseInt(process.env.TYPESENSE_PORT || '8108'),
    protocol: process.env.TYPESENSE_PROTOCOL || 'http',
  }],
  apiKey:                   process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 30,
});

const COLLECTION = 'product_groups';
const BATCH_SIZE = 250;
const RECREATE   = process.argv.includes('--recreate');

// ── SCHEMA ────────────────────────────────────────────────────────────────────

const SCHEMA = {
  name: COLLECTION,
  fields: [
    // Group identity
    { name: 'group_id',           type: 'int32' },
    { name: 'group_signal',       type: 'string',   facet: true },
    { name: 'slug',               type: 'string',   optional: true },
    { name: 'oem_number',         type: 'string',   optional: true },

    // Canonical display
    { name: 'name',               type: 'string' },
    { name: 'brand',              type: 'string',   facet: true, optional: true },
    { name: 'category',           type: 'string',   facet: true, optional: true },
    { name: 'image_url',          type: 'string',   optional: true },
    { name: 'has_image',          type: 'bool',     facet: true },

    // All brands available for this group (shown as option cards)
    { name: 'available_brands',   type: 'string[]', facet: true, optional: true },
    // All vendor SKUs across all members (for routing engine)
    { name: 'vendor_skus',        type: 'string[]', optional: true },
    // Vendor coverage
    { name: 'vendors',            type: 'string[]', facet: true, optional: true },
    { name: 'vendor_count',       type: 'int32' },
    { name: 'member_count',       type: 'int32' },
    { name: 'brand_count',        type: 'int32' },

    // Pricing (min/max across all members for range display)
    { name: 'price_min',          type: 'float',    optional: true, facet: true },
    { name: 'price_max',          type: 'float',    optional: true },

    // Availability
    { name: 'in_stock',           type: 'bool',     facet: true },
    { name: 'stock_total',        type: 'int32' },

    // Fitment — from canonical member
    { name: 'fitment_year_start', type: 'int32',    optional: true, facet: true },
    { name: 'fitment_year_end',   type: 'int32',    optional: true },
    { name: 'fitment_hd_families',type: 'string[]', optional: true, facet: true },
    { name: 'fitment_hd_models',  type: 'string[]', optional: true, facet: true },
    { name: 'fitment_hd_codes',   type: 'string[]', optional: true, facet: true },
    { name: 'fitment_other_makes',type: 'string[]', optional: true, facet: true },
    { name: 'is_harley_fitment',  type: 'bool',     facet: true },
    { name: 'is_universal',       type: 'bool',     facet: true },

    // Catalog flags from canonical member
    { name: 'drag_part',          type: 'bool',     facet: true },
    { name: 'closeout',           type: 'bool',     facet: true },
    { name: 'in_oldbook',         type: 'bool',     facet: true },
    { name: 'in_fatbook',         type: 'bool',     facet: true },
    { name: 'has_map_policy',     type: 'bool',     facet: true },
    { name: 'truck_only',         type: 'bool',     facet: true },
    { name: 'no_ship_ca',         type: 'bool',     facet: true },

    // Full-text search helpers
    { name: 'description',        type: 'string',   optional: true },
    { name: 'features',           type: 'string[]', optional: true },
    { name: 'oem_numbers',        type: 'string[]', optional: true }, // all OEM#s for this group
    { name: 'page_references',    type: 'string[]', optional: true }, // all brand part#s

    // Sort
    { name: 'sort_priority',      type: 'int32' },
  ],
  default_sorting_field: 'sort_priority',
};

// ── collection setup ──────────────────────────────────────────────────────────

async function ensureCollection() {
  try {
    const existing = await tsClient.collections(COLLECTION).retrieve();
    if (RECREATE) {
      console.log(`   Deleting existing collection "${COLLECTION}"…`);
      await tsClient.collections(COLLECTION).delete();
      throw new Error('recreate');
    }
    console.log(`   Collection "${COLLECTION}" exists (${existing.num_documents} docs). Upserting…`);
  } catch (err) {
    if (err.message === 'recreate' || err.httpStatus === 404) {
      console.log(`   Creating collection "${COLLECTION}"…`);
      await tsClient.collections().create(SCHEMA);
      console.log('   Created.\n');
    } else {
      throw err;
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🔍  Typesense Product Group Indexer');
  console.log('─'.repeat(60));

  await ensureCollection();

  const db = dbPool;
  const { rows: [{ total }] } = await db.query(
    `SELECT COUNT(*) AS total FROM product_groups`
  );
  console.log(`\n📦  ${Number(total).toLocaleString()} product groups to index\n`);

  let offset = 0;
  let indexed = 0;
  let errors  = 0;
  const startedAt = Date.now();

  while (true) {
    // Fetch a batch of groups with all their members joined
    const { rows: groups } = await db.query(`
      SELECT
        pg.id             AS group_id,
        pg.group_signal,
        pg.slug,
        pg.oem_number,
        pg.canonical_name,
        pg.canonical_brand,
        pg.canonical_category,
        pg.canonical_image_url,
        pg.any_in_stock,
        pg.member_count,
        pg.vendor_count,
        pg.brand_count,
        pg.price_min,
        pg.price_max,
        -- Canonical unified product data (for fitment, flags, description)
        cu.description,
        cu.features,
        cu.fitment_year_start,
        cu.fitment_year_end,
        cu.fitment_hd_families,
        cu.fitment_hd_models,
        cu.fitment_hd_codes,
        cu.fitment_other_makes,
        cu.is_harley_fitment,
        cu.is_universal,
        cu.drag_part,
        cu.closeout,
        cu.in_oldbook,
        cu.in_fatbook,
        cu.has_map_policy,
        cu.truck_only,
        cu.no_ship_ca,
        -- Aggregated member data
        array_agg(DISTINCT pgm.vendor_sku)    AS vendor_skus,
        array_agg(DISTINCT pgm.vendor)        AS vendors,
        array_agg(DISTINCT pgm.display_brand) FILTER (WHERE pgm.display_brand IS NOT NULL) AS available_brands,
        SUM(pgm.stock_quantity)               AS stock_total
      FROM product_groups pg
      -- Join to canonical unified product for fitment/flag data
      LEFT JOIN product_group_members canon_mem ON canon_mem.group_id = pg.id AND canon_mem.is_canonical = TRUE
      LEFT JOIN catalog_unified cu ON cu.id = canon_mem.unified_id
      -- Join all members for aggregation
      LEFT JOIN product_group_members pgm ON pgm.group_id = pg.id
      GROUP BY
        pg.id, pg.group_signal, pg.slug, pg.oem_number,
        pg.canonical_name, pg.canonical_brand, pg.canonical_category,
        pg.canonical_image_url, pg.any_in_stock, pg.member_count,
        pg.vendor_count, pg.brand_count, pg.price_min, pg.price_max,
        cu.description, cu.features,
        cu.fitment_year_start, cu.fitment_year_end,
        cu.fitment_hd_families, cu.fitment_hd_models,
        cu.fitment_hd_codes, cu.fitment_other_makes,
        cu.is_harley_fitment, cu.is_universal,
        cu.drag_part, cu.closeout, cu.in_oldbook, cu.in_fatbook,
        cu.has_map_policy, cu.truck_only, cu.no_ship_ca
      ORDER BY pg.id
      LIMIT $1 OFFSET $2
    `, [BATCH_SIZE, offset]);

    if (groups.length === 0) break;

    // Fetch OEM numbers + page_references for these groups
    const groupIds = groups.map(g => g.group_id);
    const { rows: crossrefs } = await db.query(`
      SELECT DISTINCT ON (pgm.group_id, c.oem_number)
        pgm.group_id,
        c.oem_number,
        c.page_reference
      FROM product_group_members pgm
      JOIN catalog_oem_crossref c ON c.sku = pgm.vendor_sku
      WHERE pgm.group_id = ANY($1)
        AND c.oem_number IS NOT NULL
    `, [groupIds]);

    // Build lookup: groupId → { oem_numbers[], page_references[] }
    const crossrefByGroup = new Map();
    for (const cr of crossrefs) {
      if (!crossrefByGroup.has(cr.group_id)) {
        crossrefByGroup.set(cr.group_id, { oem_numbers: new Set(), page_references: new Set() });
      }
      const entry = crossrefByGroup.get(cr.group_id);
      if (cr.oem_number) entry.oem_numbers.add(cr.oem_number);
      if (cr.page_reference) entry.page_references.add(cr.page_reference);
    }

    // Build Typesense documents
    const docs = groups.map(g => {
      const cr = crossrefByGroup.get(g.group_id) ?? { oem_numbers: new Set(), page_references: new Set() };

      // Sort priority: in-stock first, then by member count (more options = better), then by price
      const sortPriority =
        (g.any_in_stock     ? 1_000_000 : 0) +
        (g.member_count * 1_000) +
        (g.price_min != null ? Math.max(0, 10_000 - Math.round(g.price_min)) : 0);

      return {
        id:                 String(g.group_id),
        group_id:           Number(g.group_id),
        group_signal:       g.group_signal ?? 'singleton',
        slug:               g.slug ?? '',
        oem_number:         g.oem_number ?? '',

        name:               g.canonical_name ?? '',
        brand:              g.canonical_brand ?? '',
        category:           g.canonical_category ?? '',
        image_url:          g.canonical_image_url ?? '',
        has_image:          !!g.canonical_image_url,

        available_brands:   (g.available_brands ?? []).filter(Boolean),
        vendor_skus:        (g.vendor_skus ?? []).filter(Boolean),
        vendors:            (g.vendors ?? []).filter(Boolean),
        vendor_count:       Number(g.vendor_count ?? 1),
        member_count:       Number(g.member_count ?? 1),
        brand_count:        Number(g.brand_count ?? 1),

        price_min:          g.price_min != null ? parseFloat(g.price_min) : null,
        price_max:          g.price_max != null ? parseFloat(g.price_max) : null,

        in_stock:           g.any_in_stock ?? false,
        stock_total:        Number(g.stock_total ?? 0),

        fitment_year_start: g.fitment_year_start ? Number(g.fitment_year_start) : null,
        fitment_year_end:   g.fitment_year_end   ? Number(g.fitment_year_end)   : null,
        fitment_hd_families:g.fitment_hd_families ?? [],
        fitment_hd_models:  g.fitment_hd_models   ?? [],
        fitment_hd_codes:   g.fitment_hd_codes    ?? [],
        fitment_other_makes:g.fitment_other_makes  ?? [],
        is_harley_fitment:  g.is_harley_fitment ?? false,
        is_universal:       g.is_universal ?? false,

        drag_part:          g.drag_part    ?? false,
        closeout:           g.closeout     ?? false,
        in_oldbook:         g.in_oldbook   ?? false,
        in_fatbook:         g.in_fatbook   ?? false,
        has_map_policy:     g.has_map_policy ?? false,
        truck_only:         g.truck_only   ?? false,
        no_ship_ca:         g.no_ship_ca   ?? false,

        description:        g.description ?? '',
        features:           g.features ?? [],
        oem_numbers:        [...cr.oem_numbers],
        page_references:    [...cr.page_references],

        sort_priority:      sortPriority,
      };
    });

    // Upsert to Typesense
    try {
      const result = await tsClient
        .collections(COLLECTION)
        .documents()
        .import(docs, { action: 'upsert' });

      const failed = result.filter(r => !r.success);
      if (failed.length > 0) {
        errors += failed.length;
        console.error(`\n  ⚠  ${failed.length} failed in batch at offset ${offset}`);
        if (failed[0]) console.error('     First error:', failed[0].error);
      }
      indexed += docs.length - failed.length;
    } catch (err) {
      console.error(`\n  ⚠  Batch import error at offset ${offset}:`, err.message);
      errors += docs.length;
    }

    offset += groups.length;
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    const pct = ((offset / Number(total)) * 100).toFixed(1);
    process.stdout.write(
      `\r   ${indexed.toLocaleString()} / ${Number(total).toLocaleString()} indexed  (${pct}%)  ${elapsed}s`
    );
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const col = await tsClient.collections(COLLECTION).retrieve();
  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('\n\n' + '─'.repeat(60));
  console.log(`✅  Done in ${totalSec}s`);
  console.log(`   Indexed  : ${indexed.toLocaleString()}`);
  if (errors) console.log(`   Errors   : ${errors}`);
  console.log(`   In Typesense: ${col.num_documents.toLocaleString()} docs`);
  console.log('─'.repeat(60) + '\n');
  console.log('Search query example:');
  console.log(`  query_by=name,available_brands,oem_numbers,page_references,features`);
  console.log(`  filter_by=is_harley_fitment:true && in_stock:true`);
  console.log(`  facet_by=category,available_brands,vendors,fitment_hd_families\n`);

  await dbPool.end();
}

run().catch(err => {
  console.error('\n❌  Fatal:', err.message);
  dbPool.end();
  process.exit(1);
});
