/**
 * Stage 1: Normalize Parts Unlimited Data
 * Maps raw_vendor_pu JSONB to canonical catalog schema
 */

import dotenv from 'dotenv';
import { sql } from '../lib/db.js';
import fs from 'fs';
import path from 'path';
import { getPool } from '../lib/db.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true });

const CHECKPOINT_FILE = path.resolve(__dirname, '.stage1_pu_checkpoint.json');

function logDbTarget() {
  const v = process.env.CATALOG_DATABASE_URL ?? '';
  try {
    const u = new URL(v);
    const port = u.port || '(default)';
    console.log(`[Stage1] DB target: ${u.hostname}:${port}${u.pathname}`);
  } catch {
    console.log('[Stage1] DB target: (missing or unparseable CATALOG_DATABASE_URL)');
  }
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m${String(r).padStart(2, '0')}s`;
}

function loadCheckpoint() {
  try {
    if (!fs.existsSync(CHECKPOINT_FILE)) return null;
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveCheckpoint(data) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[Stage1] Failed to write checkpoint:', e?.message ?? e);
  }
}

function clearCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
  } catch {
    // ignore
  }
}

/**
 * Check if product is in target catalogs (Tire, Oldbook, Fatbook)
 */
function isInTargetCatalogs(item) {
  const hasFatbook = item.fatbook_catalog && item.fatbook_catalog.trim() !== '';
  const hasFatbookMid = item.fatbook_midyear_catalog && item.fatbook_midyear_catalog.trim() !== '';
  const hasTire = item.tire_catalog && item.tire_catalog.trim() !== '';
  const hasOldbook = item.oldbook_catalog && item.oldbook_catalog.trim() !== '';
  const hasOldbookMid = item.oldbook_midyear_catalog && item.oldbook_midyear_catalog.trim() !== '';
  
  return hasFatbook || hasFatbookMid || hasTire || hasOldbook || hasOldbookMid;
}

/**
 * Get catalog sources for allowlist
 */
function getCatalogSources(item) {
  const sources = [];
  if (item.fatbook_catalog && item.fatbook_catalog.trim() !== '') sources.push('fatbook');
  if (item.fatbook_midyear_catalog && item.fatbook_midyear_catalog.trim() !== '') sources.push('fatbook_midyear');
  if (item.tire_catalog && item.tire_catalog.trim() !== '') sources.push('tire');
  if (item.oldbook_catalog && item.oldbook_catalog.trim() !== '') sources.push('oldbook');
  if (item.oldbook_midyear_catalog && item.oldbook_midyear_catalog.trim() !== '') sources.push('oldbook_midyear');
  return sources;
}

/**
 * Calculate total stock from warehouse availability
 */
function calculateStock(item) {
  const avail = item.availability || {};
  let total = 0;
  
  ['wi', 'ny', 'tx', 'ca', 'nv', 'nc', 'national'].forEach(loc => {
    const val = avail[loc];
    if (val && val !== 'N/A') {
      const num = parseInt(val, 10);
      if (!isNaN(num)) total += num;
    }
  });
  
  return total;
}

/**
 * Generate URL-friendly slug
 */
function generateSlug(name, sku) {
  const base = `${name || ''} ${sku || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base.substring(0, 100);
}

/**
 * Pass 1: Normalize products from dealer price data
 */
async function normalizeProducts() {
  console.log('📦 Pass 1: Normalizing products from dealer price data...');
  const t0 = Date.now();

  const args = process.argv.slice(2);
  const noResume = args.includes('--no-resume');
  const reset = args.includes('--reset');

  // Get all raw batches
  const batches = await sql`
    SELECT source_file, payload
    FROM raw_vendor_pu
    WHERE source_file LIKE 'dealerprice_batch_%'
    ORDER BY source_file
  `;

  console.log(`Found ${batches.length} batches`);

  const totalRows = batches.reduce((sum, b) => sum + ((b.payload?.length) || 0), 0);
  console.log(`Total rows: ${totalRows.toLocaleString()}`);

  if (reset) {
    clearCheckpoint();
  }

  const cp = !noResume ? loadCheckpoint() : null;
  const startBatchIndex = cp?.nextBatchIndex ?? cp?.batchIndex ?? 0;
  if (cp && !reset) {
    console.log(
      `[Stage1] Resuming from checkpoint: batch ${startBatchIndex + 1}/${batches.length}`
    );
  }

  let processed = cp?.processed ?? 0;
  let inserted = cp?.inserted ?? 0;
  let skipped = cp?.skipped ?? 0;

  let currentBatchIndex = 0;
  let stopRequested = false;

  const checkpoint = (nextBatchIndex) => {
    saveCheckpoint({
      version: 2,
      vendor: 'pu',
      stage: 1,
      nextBatchIndex,
      processed,
      inserted,
      skipped,
      totalRows,
      lastSavedAt: new Date().toISOString(),
      nextBatchSourceFile: batches?.[nextBatchIndex]?.source_file ?? null,
    });
  };

  const onSigint = () => {
    if (stopRequested) {
      console.log('\n[Stage1] Forced exit.');
      process.exit(130);
    }
    stopRequested = true;
    console.log('\n[Stage1] Stop requested. Will checkpoint after current batch...');
  };
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigint);

  const pool = getPool();

  async function withClient(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      throw e;
    } finally {
      client.release();
    }
  }

  async function processBatch(client, items) {
    const products = [];
    const offers = [];
    const specs = [];

    for (const item of items) {
      processed++;

      if (!isInTargetCatalogs(item)) {
        skipped++;
        continue;
      }

      const sku = item.part_number?.trim();
      if (!sku) {
        skipped++;
        continue;
      }

      const name = item.part_description?.trim() || sku;
      const slug = generateSlug(name, sku);
      const brand = item.brand_name?.trim() || '';
      const mpn = item.vendor_part_number?.trim() || sku;
      const category = inferCategory(item);
      const weight = item.weight ?? null;
      const isActive = item.part_status === 'S';
      const isDiscontinued = item.part_status !== 'S';

      products.push({
        sku,
        name,
        brand,
        mpn,
        slug,
        category,
        weight,
        isActive,
        isDiscontinued,
        vendorPartNumber: item.vendor_part_number ?? null,
        availability: item.availability ?? {},
        cost: item.your_dealer_price || item.base_dealer_price || null,
        msrp: item.current_suggested_retail || null,
        stockQty: calculateStock(item),
        raw: item,
      });
    }

    if (products.length === 0) return;

    // Bulk upsert products
    const skuArr = products.map(p => p.sku);
    const nameArr = products.map(p => p.name);
    const brandArr = products.map(p => p.brand);
    const mpnArr = products.map(p => p.mpn);
    const slugArr = products.map(p => p.slug);
    const categoryArr = products.map(p => p.category);
    const weightArr = products.map(p => (p.weight === '' ? null : p.weight));
    const isActiveArr = products.map(p => p.isActive);
    const isDiscontinuedArr = products.map(p => p.isDiscontinued);

    const upsertRes = await client.query(
      `
      WITH input AS (
        SELECT * FROM unnest(
          $1::text[],
          $2::text[],
          $3::text[],
          $4::text[],
          $5::text[],
          $6::text[],
          $7::double precision[],
          $8::boolean[],
          $9::boolean[]
        ) AS t(sku, name, brand, mpn, slug, category, weight, is_active, is_discontinued)
      ),
      upserted AS (
        INSERT INTO catalog_products
          (sku, name, brand, manufacturer_part_number, slug, description, category,
           weight, is_active, is_discontinued, updated_at)
        SELECT
          sku, name, brand, mpn, slug, NULL, category,
          weight, is_active, is_discontinued, NOW()
        FROM input
        ON CONFLICT (sku) DO UPDATE SET
          name                     = EXCLUDED.name,
          brand                    = EXCLUDED.brand,
          manufacturer_part_number = EXCLUDED.manufacturer_part_number,
          slug                     = EXCLUDED.slug,
          category                 = COALESCE(EXCLUDED.category, catalog_products.category),
          weight                   = COALESCE(EXCLUDED.weight, catalog_products.weight),
          is_active                = EXCLUDED.is_active,
          is_discontinued          = EXCLUDED.is_discontinued,
          updated_at               = NOW()
        RETURNING id, sku
      )
      SELECT id, sku FROM upserted
      `,
      [skuArr, nameArr, brandArr, mpnArr, slugArr, categoryArr, weightArr, isActiveArr, isDiscontinuedArr]
    );

    const idBySku = new Map();
    for (const r of upsertRes.rows) idBySku.set(r.sku, r.id);

    // Bulk upsert offers
    const offerProductIds = [];
    const offerVendorCodes = [];
    const offerCosts = [];
    const offerMsrps = [];
    const offerMapPrices = [];
    const offerQtys = [];
    const offerWarehouses = [];
    const offerVendorPartNums = [];

    for (const p of products) {
      const productId = idBySku.get(p.sku);
      if (!productId) continue;
      inserted++;

      offerProductIds.push(productId);
      offerVendorCodes.push('pu');
      offerCosts.push(p.cost);
      offerMsrps.push(p.msrp);
      offerMapPrices.push(null);
      offerQtys.push(p.stockQty);
      offerWarehouses.push(JSON.stringify(p.availability ?? {}));
      offerVendorPartNums.push(p.vendorPartNumber);

      // Specs (managed subset)
      if (p.raw.weight) specs.push({ productId, attribute: 'Weight', value: `${p.raw.weight} lbs` });
      if (p.raw.upc_code) specs.push({ productId, attribute: 'UPC', value: String(p.raw.upc_code) });
      if (p.raw.country_of_origin) specs.push({ productId, attribute: 'Country of Origin', value: String(p.raw.country_of_origin) });
      if (p.raw.product_code) specs.push({ productId, attribute: 'Product Code', value: String(p.raw.product_code) });
      if (p.raw.hazardous_code) specs.push({ productId, attribute: 'Hazardous', value: 'Yes' });
      if (p.raw.dimensions?.height) {
        specs.push({
          productId,
          attribute: 'Dimensions',
          value: `${p.raw.dimensions.height}"H x ${p.raw.dimensions.length}"L x ${p.raw.dimensions.width}"W`,
        });
      }
      if (p.raw.fatbook_catalog) specs.push({ productId, attribute: 'Catalog', value: 'Fatbook' });
      if (p.raw.tire_catalog) specs.push({ productId, attribute: 'Catalog', value: 'Tire' });
      if (p.raw.oldbook_catalog) specs.push({ productId, attribute: 'Catalog', value: 'Oldbook' });
    }

    if (offerProductIds.length > 0) {
      await client.query(
        `
        INSERT INTO vendor_offers
          (catalog_product_id, vendor_code, wholesale_cost, msrp, map_price,
           total_qty, warehouse_json, vendor_part_number, updated_at)
        SELECT t.*, NOW() AS updated_at
        FROM unnest(
          $1::int[],
          $2::text[],
          $3::numeric[],
          $4::numeric[],
          $5::numeric[],
          $6::int[],
          $7::jsonb[],
          $8::text[]
        ) AS t(catalog_product_id, vendor_code, wholesale_cost, msrp, map_price, total_qty, warehouse_json, vendor_part_number)
        ON CONFLICT (catalog_product_id, vendor_code) DO UPDATE SET
          wholesale_cost     = COALESCE(EXCLUDED.wholesale_cost, vendor_offers.wholesale_cost),
          msrp               = COALESCE(EXCLUDED.msrp,           vendor_offers.msrp),
          map_price          = COALESCE(EXCLUDED.map_price,      vendor_offers.map_price),
          total_qty          = EXCLUDED.total_qty,
          warehouse_json     = EXCLUDED.warehouse_json,
          vendor_part_number = COALESCE(EXCLUDED.vendor_part_number, vendor_offers.vendor_part_number),
          updated_at         = NOW()
        `,
        [
          offerProductIds,
          offerVendorCodes,
          offerCosts,
          offerMsrps,
          offerMapPrices,
          offerQtys,
          offerWarehouses,
          offerVendorPartNums,
        ]
      );
    }

    // Replace managed specs in bulk
    if (specs.length > 0) {
      const specProductIds = specs.map(s => s.productId);
      const specAttrs = specs.map(s => s.attribute);
      const specVals = specs.map(s => s.value);
      const managedAttrs = ['Weight', 'UPC', 'Country of Origin', 'Product Code', 'Hazardous', 'Dimensions', 'Catalog'];

      await client.query(
        `DELETE FROM catalog_specs WHERE product_id = ANY($1::int[]) AND attribute = ANY($2::text[])`,
        [Array.from(new Set(specProductIds)), managedAttrs]
      );

      await client.query(
        `
        INSERT INTO catalog_specs (product_id, attribute, value)
        SELECT * FROM unnest($1::int[], $2::text[], $3::text[]) AS t(product_id, attribute, value)
        `,
        [specProductIds, specAttrs, specVals]
      );
    }
  }

  for (currentBatchIndex = startBatchIndex; currentBatchIndex < batches.length; currentBatchIndex++) {
    if (stopRequested) {
      checkpoint(currentBatchIndex);
      process.exit(130);
    }

    const batch = batches[currentBatchIndex];
    const items = batch.payload || [];

    try {
      await withClient((client) => processBatch(client, items));
    } catch (e) {
      console.error(`\n[Stage1] Batch failed (${batch.source_file ?? currentBatchIndex}):`, e?.message ?? e);
      checkpoint(currentBatchIndex);
      throw e;
    }

    // Checkpoint at batch boundary (batch is transactionally complete).
    checkpoint(currentBatchIndex + 1);

    const elapsed = (Date.now() - t0) / 1000;
    const rate = processed / Math.max(1, elapsed);
    const pct = totalRows > 0 ? ((processed / totalRows) * 100) : 0;
    const eta = rate > 0 ? (totalRows - processed) / rate : Infinity;
    process.stdout.write(
      `\r  ${processed.toLocaleString()}/${totalRows.toLocaleString()} (${pct.toFixed(1)}%)` +
      ` | Upserts: ${inserted.toLocaleString()} | Skipped: ${skipped.toLocaleString()}` +
      ` | ${rate.toFixed(0)}/s | ETA ${formatEta(eta)}`
    );
  }

  // done
  clearCheckpoint();

  console.log('\n✅ Pass 1 Complete!');
  console.log(`  Processed: ${processed}`);
  console.log(`  Inserted/Updated: ${inserted}`);
  console.log(`  Skipped: ${skipped}`);
}

/**
 * Infer category from product data
 */
function inferCategory(item) {
  const desc = (item.part_description || '').toLowerCase();
  const brand = (item.brand_name || '').toLowerCase();
  
  // Tire catalog products
  if (item.tire_catalog) {
    if (desc.includes('tire')) return 'Tires';
    if (desc.includes('tube')) return 'Tubes';
    if (desc.includes('wheel')) return 'Wheels';
    return 'Tire & Wheel';
  }
  
  // Fatbook (Harley/V-Twin)
  if (item.fatbook_catalog) {
    if (desc.includes('exhaust')) return 'Exhaust';
    if (desc.includes('seat')) return 'Seats';
    if (desc.includes('handlebar')) return 'Handlebars';
    if (desc.includes('air')) return 'Air Intake';
    if (desc.includes('brake')) return 'Brakes';
    if (desc.includes('suspension')) return 'Suspension';
    return 'V-Twin Parts';
  }
  
  // Oldbook (Vintage/Classic)
  if (item.oldbook_catalog) {
    return 'Vintage Parts';
  }
  
  return 'Parts';
}

/**
 * Insert product specs
 */
async function insertSpecs(productId, item) {
  const specs = [];
  
  if (item.weight) {
    specs.push({ product_id: productId, attribute: 'Weight', value: `${item.weight} lbs` });
  }
  
  if (item.upc_code) {
    specs.push({ product_id: productId, attribute: 'UPC', value: item.upc_code });
  }
  
  if (item.country_of_origin) {
    specs.push({ product_id: productId, attribute: 'Country of Origin', value: item.country_of_origin });
  }
  
  if (item.product_code) {
    specs.push({ product_id: productId, attribute: 'Product Code', value: item.product_code });
  }
  
  if (item.hazardous_code) {
    specs.push({ product_id: productId, attribute: 'Hazardous', value: 'Yes' });
  }
  
  if (item.dimensions?.height) {
    specs.push({ 
      product_id: productId, 
      attribute: 'Dimensions', 
      value: `${item.dimensions.height}"H x ${item.dimensions.length}"L x ${item.dimensions.width}"W` 
    });
  }

  // Catalog membership specs
  if (item.fatbook_catalog) {
    specs.push({ product_id: productId, attribute: 'Catalog', value: 'Fatbook' });
  }
  if (item.tire_catalog) {
    specs.push({ product_id: productId, attribute: 'Catalog', value: 'Tire' });
  }
  if (item.oldbook_catalog) {
    specs.push({ product_id: productId, attribute: 'Catalog', value: 'Oldbook' });
  }

  if (specs.length > 0) {
    await sql`DELETE FROM catalog_specs WHERE product_id = ${productId}`;
    for (const s of specs) {
      await sql`
        INSERT INTO catalog_specs (product_id, attribute, value)
        VALUES (${s.product_id}, ${s.attribute}, ${s.value})
        ON CONFLICT DO NOTHING
      `;
    }
  }
}

/**
 * Main normalization function
 */
export async function normalizePu() {
  console.log('🚀 Stage 1: Normalizing Parts Unlimited Data\n');
  logDbTarget();
  
  const startTime = Date.now();
  
  await normalizeProducts();
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Total time: ${duration}s`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  normalizePu().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}
