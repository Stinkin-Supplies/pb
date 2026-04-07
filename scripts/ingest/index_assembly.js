/**
 * Stage 3 — Typesense v2 Index Assembly
 * Reads:  catalog_products, catalog_specs, catalog_fitment,
 *         catalog_media, vendor_offers
 * Writes: Typesense 'products' collection
 *
 * Schema v2 features:
 *   - Weighted search: name:10, brand:5, sku:3, specs_blob:2, search_blob:1
 *   - Fitment facets: fitment_make[], fitment_model[], fitment_year[]
 *   - Sport-type facets: sport_types[]
 *   - Sort: stock_quantity:desc, computed_price:asc
 *
 * Column names match live DB schema:
 *   catalog_products:  stock_quantity, computed_price, in_stock
 *   catalog_specs:     product_id, attribute, value
 *   catalog_fitment:   product_id, make, model, year_start, year_end
 *   catalog_media:     product_id, url, priority
 *   vendor_offers:     catalog_product_id, vendor_code
 */

import Typesense from 'typesense';
import { sql } from '../lib/db.js';

// ─── config ───────────────────────────────────────────────────────────────────

const COLLECTION = 'products';
const BATCH_SIZE  = 1000;

function getClient() {
  const host     = process.env.TYPESENSE_HOST;
  const apiKey   = process.env.TYPESENSE_API_KEY;
  const port     = Number(process.env.TYPESENSE_PORT ?? 443);
  const protocol = process.env.TYPESENSE_PROTOCOL ?? 'https';

  if (!host || !apiKey) throw new Error('Missing TYPESENSE_HOST or TYPESENSE_API_KEY env vars');

  return new Typesense.Client({
    nodes:                   [{ host, port, protocol }],
    apiKey,
    connectionTimeoutSeconds: 60,
  });
}

// ─── schema ───────────────────────────────────────────────────────────────────

const SCHEMA = {
  name: COLLECTION,
  fields: [
    // Core identifiers
    { name: 'id',           type: 'string' },
    { name: 'sku',          type: 'string',   facet: true },
    { name: 'slug',         type: 'string',   index: true },
    { name: 'mpn',          type: 'string',   optional: true },

    // Weighted search fields
    { name: 'name',         type: 'string' },
    { name: 'brand',        type: 'string',   facet: true },
    { name: 'category',     type: 'string',   facet: true, optional: true },
    { name: 'specs_blob',   type: 'string',   optional: true },
    { name: 'search_blob',  type: 'string',   optional: true },

    // Pricing + stock (sort fields)
    { name: 'computed_price', type: 'float',  optional: true, sort: true },
    { name: 'stock_quantity', type: 'int32',  sort: true },
    { name: 'in_stock',       type: 'bool',   facet: true },
    { name: 'free_shipping',  type: 'bool',   facet: true },

    // Images
    { name: 'primary_image',  type: 'string', optional: true, index: false },

    // Fitment facets
    { name: 'fitment_make',   type: 'string[]', facet: true, optional: true },
    { name: 'fitment_model',  type: 'string[]', facet: true, optional: true },
    { name: 'fitment_year',   type: 'int32[]',  facet: true, optional: true },

    // Sport-type facets
    { name: 'sport_types',    type: 'string[]', facet: true, optional: true },

    // Vendors
    { name: 'vendors',        type: 'string[]', facet: true, optional: true },
  ],
  default_sorting_field: 'stock_quantity',
};

// ─── document builder ─────────────────────────────────────────────────────────

function buildSportTypes(product) {
  const types = [];
  if (product.is_atv)        types.push('ATV/UTV');
  if (product.is_offroad)    types.push('Off-Road');
  if (product.is_snow)       types.push('Snow');
  if (product.is_street)     types.push('Street');
  if (product.is_watercraft) types.push('Watercraft');
  if (product.is_bicycle)    types.push('Bicycle');
  return types;
}

function buildDocument(product, { specs, fitment, media, offers }) {
  // stock_quantity is the correct column name
  const price        = product.computed_price ? Number(product.computed_price) : null;
  const stock        = Number(product.stock_quantity ?? 0);
  const inStock      = stock > 0;
  const freeShipping = price !== null && price >= 99;

  // Primary image — lowest priority, skip ZIP URLs
  const primaryImage = media
    .filter(m => m.url && !m.url.endsWith('.zip'))
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))[0]?.url ?? null;

  // Fitment arrays (deduped, years expanded from ranges)
  const fitmentMakes  = [...new Set(fitment.map(f => f.make).filter(Boolean))];
  const fitmentModels = [...new Set(fitment.map(f => f.model).filter(Boolean))];
  const fitmentYears  = [...new Set(
    fitment.flatMap(f => {
      const years = [];
      const start = Number(f.year_start);
      const end   = Number(f.year_end ?? f.year_start);
      for (let y = start; y <= end; y++) years.push(y);
      return years;
    }).filter(Boolean)
  )].sort((a, b) => a - b);

  // Specs blob — all attribute:value pairs joined for full-text search
  const specsBlob = specs.map(s => `${s.attribute}: ${s.value}`).join(' | ');

  // Search blob — catch-all field for broad queries
  const searchBlob = [
    product.name,
    product.brand,
    product.sku,
    product.manufacturer_part_number,
    product.description,
    product.category,
  ].filter(Boolean).join(' ');

  const sportTypes = buildSportTypes(product);

  // vendor_code is the correct column name on vendor_offers
  const vendors = [...new Set(offers.map(o => o.vendor_code).filter(Boolean))];

  return {
    id:             String(product.id),
    sku:            product.sku          ?? '',
    slug:           product.slug         ?? '',
    mpn:            product.manufacturer_part_number ?? undefined,
    name:           product.name         ?? '',
    brand:          product.brand        ?? '',
    category:       product.category     ?? undefined,
    specs_blob:     specsBlob            || undefined,
    search_blob:    searchBlob           || undefined,
    computed_price: price                ?? undefined,
    stock_quantity: stock,
    in_stock:       inStock,
    free_shipping:  freeShipping,
    primary_image:  primaryImage         ?? undefined,
    fitment_make:   fitmentMakes.length  ? fitmentMakes  : undefined,
    fitment_model:  fitmentModels.length ? fitmentModels : undefined,
    fitment_year:   fitmentYears.length  ? fitmentYears  : undefined,
    sport_types:    sportTypes.length    ? sportTypes    : undefined,
    vendors:        vendors.length       ? vendors       : undefined,
  };
}

// ─── collection management ────────────────────────────────────────────────────

async function recreateCollection(client) {
  try {
    await client.collections(COLLECTION).delete();
    console.log(`[Stage3] Deleted existing '${COLLECTION}' collection`);
  } catch {
    // doesn't exist yet — fine
  }
  await client.collections().create(SCHEMA);
  console.log(`[Stage3] Created '${COLLECTION}' collection with v2 schema`);
}

// ─── main ─────────────────────────────────────────────────────────────────────

export async function buildTypesenseIndex({ recreate = true } = {}) {
  console.log('[Stage3] Starting Typesense v2 index assembly...');

  const client = getClient();
  if (recreate) await recreateCollection(client);

  const [{ count }] = await sql`
    SELECT COUNT(DISTINCT cp.id) 
    FROM catalog_products cp
    INNER JOIN catalog_media m ON m.product_id = cp.id AND m.media_type = 'image'
    WHERE cp.is_active = true AND cp.is_discontinued = false
  `;
  const total = Number(count);
  console.log(`[Stage3] Indexing ${total} products with images...`);

  let offset    = 0;
  let indexed   = 0;
  let failed    = 0;
  const startTime = Date.now();

  while (offset < total) {
    const products = await sql`
      SELECT DISTINCT cp.id, cp.sku, cp.slug, cp.name, cp.brand, cp.manufacturer_part_number, cp.description,
             cp.category, cp.computed_price, cp.stock_quantity
      FROM catalog_products cp
	      INNER JOIN catalog_media m ON m.product_id = cp.id AND m.media_type = 'image'
	      WHERE cp.is_active = true AND cp.is_discontinued = false
	      ORDER BY cp.id
	      LIMIT ${BATCH_SIZE} OFFSET ${offset}
	    `;

    if (!products.length) break;

    const ids = products.map(p => p.id);

    // Batch-fetch related data — note catalog_product_id on vendor_offers
    const [specs, fitment, media, offers] = await Promise.all([
      sql`SELECT product_id, attribute, value
          FROM catalog_specs
          WHERE product_id = ANY(${ids})`,

      sql`SELECT product_id, make, model, year_start, year_end
          FROM catalog_fitment
          WHERE product_id = ANY(${ids})`,

      sql`SELECT product_id, url, priority
          FROM catalog_media
          WHERE product_id = ANY(${ids})
          ORDER BY priority ASC NULLS LAST`,

      sql`SELECT catalog_product_id, vendor_code
          FROM vendor_offers
          WHERE catalog_product_id = ANY(${ids})`,
    ]);

    // Group by the correct key for each table
    const specsMap   = groupBy(specs,   'product_id');
    const fitmentMap = groupBy(fitment, 'product_id');
    const mediaMap   = groupBy(media,   'product_id');
    const offersMap  = groupBy(offers,  'catalog_product_id'); // different key

    const documents = [];
    for (const product of products) {
      try {
        const doc = buildDocument(product, {
          specs:   specsMap[product.id]   ?? [],
          fitment: fitmentMap[product.id] ?? [],
          media:   mediaMap[product.id]   ?? [],
          offers:  offersMap[product.id]  ?? [],
        });
        documents.push(doc);
      } catch (err) {
        console.error(`[Stage3] Build failed id ${product.id}: ${err.message}`);
        failed++;
      }
    }

    if (documents.length) {
      const results = await client
        .collections(COLLECTION)
        .documents()
        .import(documents, { action: 'upsert' });

      const batchFailed = results.filter(r => !r.success).length;
      if (batchFailed) {
        console.warn(`[Stage3] ${batchFailed} import failures in this batch`);
        results.filter(r => !r.success).slice(0, 3).forEach(r =>
          console.warn('  ', r.error, r.document?.sku)
        );
        failed += batchFailed;
      }
      indexed += documents.length - batchFailed;
    }

    const pct3    = Math.min(offset + BATCH_SIZE, total) / total;
    const filled3 = Math.round(pct3 * 26);
    const bar3    = '█'.repeat(filled3) + '░'.repeat(26 - filled3);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    offset += BATCH_SIZE;
    console.log(`[Stage3] │${bar3}│ ${(pct3 * 100).toFixed(1).padStart(5)}% (${Math.min(offset, total)}/${total}) indexed: ${indexed} failed: ${failed} | ${elapsed}s`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Stage3] Done. Indexed: ${indexed} | Failed: ${failed} | Time: ${totalTime}s`);
  return { indexed, failed, totalTime };
}

// ─── util ─────────────────────────────────────────────────────────────────────

function groupBy(rows, key) {
  const map = {};
  for (const row of rows) {
    const k = row[key];
    if (!map[k]) map[k] = [];
    map[k].push(row);
  }
  return map;
}
