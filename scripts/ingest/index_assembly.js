/**
 * Stage 3: Typesense Index Assembly
 * Builds search index from normalized catalog data
 */

import Typesense from 'typesense';
import dotenv from 'dotenv';
import fs from 'fs';
import { sql } from '../lib/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true });

let typesense = null;
function getTypesense() {
  if (typesense) return typesense;

  const typesenseHost = process.env.TYPESENSE_HOST;
  const typesenseKey = process.env.TYPESENSE_ADMIN_KEY;

  if (!typesenseHost || !typesenseKey) {
    throw new Error('Missing Typesense credentials (TYPESENSE_HOST / TYPESENSE_ADMIN_KEY)');
  }

  typesense = new Typesense.Client({
    nodes: [{
      host: typesenseHost,
      port: 443,
      protocol: 'https'
    }],
    apiKey: typesenseKey,
    connectionTimeoutSeconds: 120
  });
  return typesense;
}

const CHECKPOINT_FILE = '.stage3_checkpoint.json';
const DEFAULT_BATCH_SIZE = 2000;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_INFLIGHT_PER_WORKER = 1;

let _hasSearchCache = null;
async function hasSearchCache() {
  if (_hasSearchCache !== null) return _hasSearchCache;
  const rows = await sql`SELECT to_regclass('public.catalog_product_search_cache') AS reg`;
  _hasSearchCache = Boolean(rows?.[0]?.reg);
  return _hasSearchCache;
}

async function importBatch(typesenseClient, collection, docs) {
  const payload = docs.map((d) => JSON.stringify(d)).join('\n');

  const res = await typesenseClient
    .collections(collection)
    .documents()
    .import(payload, { action: 'upsert' });

  // Typesense returns per-record status lines. Depending on client/version,
  // this may be an array of objects or a newline-delimited string.
  const lines = Array.isArray(res)
    ? res
    : String(res)
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return { success: false, error: 'Invalid import response line' };
          }
        });

  let failed = 0;
  const sampleErrors = [];

  for (const line of lines) {
    if (!line?.success) {
      failed++;
      if (sampleErrors.length < 3) {
        sampleErrors.push(line?.error ?? 'Unknown error');
      }
    }
  }

  if (failed > 0) {
    console.warn(`⚠️  ${failed} failed in batch`);
    if (sampleErrors.length > 0) {
      console.warn(`   Sample errors: ${sampleErrors.join(' | ')}`);
    }
  }

  return { failed, total: lines.length };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function importWithRetry(typesenseClient, collection, docs, opts = {}) {
  const retries = Number.isFinite(opts.retries) ? opts.retries : 3;
  const baseDelayMs = Number.isFinite(opts.baseDelayMs) ? opts.baseDelayMs : 750;
  const maxDelayMs = Number.isFinite(opts.maxDelayMs) ? opts.maxDelayMs : 10_000;

  let attempt = 0;
  // Retries are for request-level failures (timeouts, 5xx, network).
  // Per-record failures are handled inside importBatch() and should not trigger retries.
  while (true) {
    try {
      return await importBatch(typesenseClient, collection, docs);
    } catch (err) {
      if (attempt >= retries) throw err;
      attempt++;

      const backoff = Math.min(maxDelayMs, baseDelayMs * (2 ** (attempt - 1)));
      const jitter = Math.floor(Math.random() * 250);
      const delay = backoff + jitter;

      console.warn(
        `⚠️  Typesense import failed (attempt ${attempt}/${retries}). Retrying in ${delay}ms...`
      );
      await sleep(delay);
    }
  }
}

/**
 * Get or create Typesense collection
 */
async function setupCollection(recreate = false) {
  const typesenseClient = getTypesense();
  const collectionName = 'products';

  if (recreate) {
    console.log('Deleting existing collection...');
    try {
      await typesenseClient.collections(collectionName).delete();
    } catch (e) {
      // Collection may not exist
    }
  }

  try {
    await typesenseClient.collections(collectionName).retrieve();
    console.log('Using existing collection');
    return collectionName;
  } catch (e) {
    console.log('Creating new collection...');
  }

  const schema = {
    name: collectionName,
    fields: [
      { name: 'id', type: 'string' },
      { name: 'sku', type: 'string', facet: true },
      { name: 'slug', type: 'string' },
      { name: 'brand', type: 'string', facet: true },
      { name: 'category', type: 'string', facet: true },
      { name: 'name', type: 'string', locale: 'en' },
      { name: 'description', type: 'string', optional: true },
      { name: 'price', type: 'float', facet: true, sort: true },
      { name: 'msrp', type: 'float', optional: true },
      { name: 'stock_quantity', type: 'int32', facet: true, sort: true },
      { name: 'in_stock', type: 'bool', facet: true },
      { name: 'image_url', type: 'string', optional: true },
      { name: 'specs', type: 'string[]', facet: true, optional: true },
      { name: 'fitment_make', type: 'string[]', facet: true, optional: true },
      { name: 'fitment_model', type: 'string[]', facet: true, optional: true },
      { name: 'fitment_year', type: 'int32[]', facet: true, optional: true },
      { name: 'search_blob', type: 'string', optional: true }
    ],
    default_sorting_field: 'stock_quantity'
  };

  await typesenseClient.collections().create(schema);
  console.log('✓ Collection created');
  return collectionName;
}

/**
 * Load checkpoint for resume
 */
function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    }
  } catch (e) {
    console.log('No checkpoint found');
  }
  return { lastOffset: 0, processed: 0, failed: 0 };
}

/**
 * Save checkpoint
 */
function saveCheckpoint(checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

async function buildDocumentsForProducts(products) {
  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const useCache = await hasSearchCache();

  const rows = useCache
    ? await sql`
        WITH ids AS (
          SELECT unnest(${productIds}::int[]) AS product_id
        )
        SELECT
          cp.id,
          COALESCE(c.specs, ARRAY[]::text[]) AS specs,
          COALESCE(c.fitment_make, ARRAY[]::text[]) AS fitment_make,
          COALESCE(c.fitment_model, ARRAY[]::text[]) AS fitment_model,
          COALESCE(c.fitment_year, ARRAY[]::int[]) AS fitment_year,
          c.image_url AS image_url,
          c.search_blob AS search_blob,
          COALESCE(cp.stock_quantity, 0)::int AS stock_qty,
          cp.msrp AS msrp
        FROM ids
        JOIN catalog_products cp ON cp.id = ids.product_id
        LEFT JOIN catalog_product_search_cache c
          ON c.product_id = cp.id
      `
    : await sql`
        -- Single DB round-trip for the batch (still uses multiple CTEs, but one query).
        WITH ids AS (
          SELECT unnest(${productIds}::int[]) AS product_id
        ),
        specs AS (
          SELECT
            s.product_id,
            ARRAY_AGG(s.attribute || ': ' || s.value ORDER BY s.attribute, s.value) AS specs
          FROM catalog_specs s
          JOIN ids ON ids.product_id = s.product_id
          GROUP BY s.product_id
        ),
        fitment AS (
          SELECT
            f.product_id,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT f.make), NULL) AS makes,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT f.model), NULL) AS models,
            ARRAY_AGG(DISTINCT y.year)::int[] AS years
          FROM catalog_fitment f
          JOIN ids ON ids.product_id = f.product_id
          LEFT JOIN LATERAL (
            SELECT generate_series(
              COALESCE(f.year_start, f.year_end),
              COALESCE(f.year_end, f.year_start)
            ) AS year
          ) y ON true
          GROUP BY f.product_id
        ),
        media AS (
          SELECT DISTINCT ON (m.product_id)
            m.product_id,
            m.url
          FROM catalog_media m
          JOIN ids ON ids.product_id = m.product_id
          ORDER BY m.product_id, m.priority ASC
        )
        SELECT
          cp.id,
          COALESCE(specs.specs, ARRAY[]::text[]) AS specs,
          COALESCE(fitment.makes, ARRAY[]::text[]) AS fitment_make,
          COALESCE(fitment.models, ARRAY[]::text[]) AS fitment_model,
          COALESCE(fitment.years, ARRAY[]::int[]) AS fitment_year,
          media.url AS image_url,
          NULL::text AS search_blob,
          COALESCE(cp.stock_quantity, 0)::int AS stock_qty,
          cp.msrp AS msrp
        FROM ids
        JOIN catalog_products cp ON cp.id = ids.product_id
        LEFT JOIN specs   ON specs.product_id   = cp.id
        LEFT JOIN fitment ON fitment.product_id = cp.id
        LEFT JOIN media   ON media.product_id   = cp.id
      `;

  const rowById = new Map(rows.map((r) => [r.id, r]));

  return products.map((product) => {
    const r = rowById.get(product.id);
    const specs = r?.specs ?? [];
    const imageUrl = r?.image_url ?? null;
    const stockQty = Number(r?.stock_qty ?? 0);
    const msrp = r?.msrp ?? null;

    const searchBlob = (r?.search_blob && String(r.search_blob).trim())
      ? String(r.search_blob).toLowerCase()
      : [
          product.name,
          product.brand,
          product.sku,
          product.category,
          ...specs,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

    return {
      id: product.id.toString(),
      sku: product.sku,
      slug: product.slug,
      brand: product.brand || '',
      category: product.category || '',
      name: product.name || '',
      description: product.description || '',
      price: product.computed_price || 0,
      msrp: msrp ? Number(msrp) : null,
      stock_quantity: stockQty,
      in_stock: stockQty > 0,
      image_url: imageUrl,
      specs,
      fitment_make: r?.fitment_make ?? [],
      fitment_model: r?.fitment_model ?? [],
      fitment_year: r?.fitment_year ?? [],
      search_blob: searchBlob.substring(0, 1000),
    };
  });
}

/**
 * Get products to index (respecting allowlist)
 */
async function getProductsToIndex(offset, limit, useAllowlist) {
  if (useAllowlist) {
    return {
      data: await sql`
        SELECT cp.id, cp.sku, cp.slug, cp.brand, cp.name, cp.description, cp.category, cp.computed_price
        FROM catalog_products cp
        WHERE cp.is_active = true
          AND cp.is_discontinued = false
          AND cp.computed_price IS NOT NULL
          AND EXISTS (SELECT 1 FROM catalog_allowlist al WHERE al.sku = cp.sku)
        ORDER BY cp.id
        OFFSET ${offset}
        LIMIT ${limit}
      `,
      error: null,
    };
  }

  return {
    data: await sql`
      SELECT cp.id, cp.sku, cp.slug, cp.brand, cp.name, cp.description, cp.category, cp.computed_price
      FROM catalog_products cp
      WHERE cp.is_active = true
        AND cp.is_discontinued = false
        AND cp.computed_price IS NOT NULL
      ORDER BY cp.id
      OFFSET ${offset}
      LIMIT ${limit}
    `,
    error: null,
  };
}

/**
 * Main index builder
 */
export async function buildTypesenseIndex(options = {}) {
  const { recreate = false, resume = true } = options;
  
  console.log('🚀 Stage 3: Building Typesense Index\n');
  // Validate Typesense config only when running Stage 3.
  const typesenseClient = getTypesense();
  
  const startTime = Date.now();
  const collection = await setupCollection(recreate);

  // Load checkpoint
  let checkpoint = resume ? loadCheckpoint() : { lastOffset: 0, processed: 0, failed: 0 };
  
  if (recreate) {
    checkpoint = { lastOffset: 0, processed: 0, failed: 0 };
  }

  console.log(`Starting from offset: ${checkpoint.lastOffset}`);

  // Get total count
  const allowlistCount = await sql`SELECT COUNT(*)::int AS count FROM catalog_allowlist`;
  const useAllowlist = (allowlistCount?.[0]?.count ?? 0) > 0;
  console.log(`Allowlist entries: ${allowlistCount?.[0]?.count ?? 0}`);

  const totalRes = useAllowlist
    ? await sql`
        SELECT COUNT(*)::int AS count
        FROM catalog_products cp
        WHERE cp.is_active = true
          AND cp.is_discontinued = false
          AND cp.computed_price IS NOT NULL
          AND EXISTS (SELECT 1 FROM catalog_allowlist al WHERE al.sku = cp.sku)
      `
    : await sql`
        SELECT COUNT(*)::int AS count
        FROM catalog_products cp
        WHERE cp.is_active = true
          AND cp.is_discontinued = false
          AND cp.computed_price IS NOT NULL
      `;

  const totalProducts = totalRes?.[0]?.count ?? 0;

  console.log(`Products to index: ${totalProducts}\n`);

  let offset = checkpoint.lastOffset;
  let processed = checkpoint.processed;
  let failed = checkpoint.failed;

  const args = process.argv.slice(2);
  const batchSizeArg = parseInt(args.find((_, i) => args[i - 1] === '--batch-size') || process.env.INDEX_BATCH_SIZE || '', 10);
  const concurrencyArg = parseInt(args.find((_, i) => args[i - 1] === '--concurrency') || process.env.INDEX_CONCURRENCY || '', 10);
  const inflightArg = parseInt(args.find((_, i) => args[i - 1] === '--inflight') || process.env.INDEX_INFLIGHT || '', 10);
  const batchSize = Number.isFinite(batchSizeArg) && batchSizeArg > 0 ? batchSizeArg : DEFAULT_BATCH_SIZE;
  const concurrency = Number.isFinite(concurrencyArg) && concurrencyArg > 0 ? concurrencyArg : DEFAULT_CONCURRENCY;
  const inflightPerWorker = Number.isFinite(inflightArg) && inflightArg > 0 ? inflightArg : DEFAULT_INFLIGHT_PER_WORKER;

  let nextOffset = offset;
  let checkpointOffset = offset;
  const completed = new Map(); // startOffset -> count

  // Serialize checkpoint updates (multiple workers complete batches concurrently).
  let checkpointLock = Promise.resolve();
  const withCheckpointLock = (fn) => {
    checkpointLock = checkpointLock.then(fn, fn);
    return checkpointLock;
  };

  let inFlightTotal = 0;

  async function prepareBatch(start) {
    const res = await getProductsToIndex(start, batchSize, useAllowlist);
    const products = res.data ?? [];
    if (!products || products.length === 0) {
      return { start, count: 0, documents: [] };
    }
    const documents = await buildDocumentsForProducts(products);
    return { start, count: products.length, documents };
  }

  function renderProgress() {
    const pct = totalProducts > 0
      ? ((Math.min(checkpointOffset, totalProducts) / totalProducts) * 100).toFixed(1)
      : '0.0';
    process.stdout.write(
      `\r  Progress: ${checkpointOffset}/${totalProducts} (${pct}%) | Indexed: ${processed} | Failed: ${failed} | Workers: ${concurrency} | InFlight: ${inFlightTotal}`
    );
  }

  async function worker(workerId) {
    // Pipeline: prepare next batch while importing current.
    const claim = () => {
      const start = nextOffset;
      nextOffset += batchSize;
      return start;
    };

    const inFlight = []; // [{ token, promise }]

    async function settleOne() {
      if (inFlight.length === 0) return;

      const settled = await Promise.race(inFlight.map((x) => x.promise));
      const idx = inFlight.findIndex((x) => x.token === settled.token);
      if (idx >= 0) inFlight.splice(idx, 1);

      await withCheckpointLock(async () => {
        inFlightTotal = Math.max(0, inFlightTotal - 1);

        if (settled.ok) {
          processed += settled.docsLen;
          failed += settled.batchFailed;
        } else {
          console.error(`Import error at offset ${settled.start}:`, settled.error?.message ?? settled.error);
          failed += settled.docsLen;
        }

        completed.set(settled.start, settled.count);

        // Advance checkpoint only for contiguous completed offsets.
        while (true) {
          const count = completed.get(checkpointOffset);
          if (!count) break;
          completed.delete(checkpointOffset);
          checkpointOffset += count;
        }

        checkpoint = { lastOffset: checkpointOffset, processed, failed };
        saveCheckpoint(checkpoint);
        renderProgress();
      });
    }

    function scheduleImport(cur) {
      const token = Symbol(`w${workerId}:${cur.start}`);

      const p = (async () => {
        try {
          const { failed: batchFailed } = await importWithRetry(
            typesenseClient,
            collection,
            cur.documents,
            {
              retries: parseInt(process.env.INDEX_IMPORT_RETRIES || '3', 10),
              baseDelayMs: parseInt(process.env.INDEX_IMPORT_RETRY_BASE_MS || '750', 10),
            }
          );
          return {
            token,
            ok: true,
            start: cur.start,
            count: cur.count,
            docsLen: cur.documents.length,
            batchFailed,
          };
        } catch (error) {
          return {
            token,
            ok: false,
            start: cur.start,
            count: cur.count,
            docsLen: cur.documents.length,
            error,
          };
        }
      })();

      inFlight.push({ token, promise: p });
      // Update global inflight count and progress under the checkpoint lock to avoid flicker/races.
      void withCheckpointLock(async () => {
        inFlightTotal += 1;
        renderProgress();
      });
    }

    let start = claim();
    if (start >= totalProducts) return;

    let prepared = prepareBatch(start);

    while (prepared) {
      let cur;
      try {
        cur = await prepared;
      } catch (e) {
        console.error(`Prepare error at offset ${start}:`, e.message);
        break;
      }

      if (!cur || cur.count === 0) break;

      // Kick off the next prepare before importing, so DB work overlaps Typesense import.
      const nextStart = claim();
      prepared = nextStart < totalProducts ? prepareBatch(nextStart) : null;
      start = nextStart;

      if (cur.documents.length > 0) {
        scheduleImport(cur);
        if (inFlight.length >= inflightPerWorker) {
          await settleOne();
        }
      }
    }

    // Drain remaining imports for this worker.
    while (inFlight.length > 0) {
      await settleOne();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  // Ensure any pending checkpoint writes complete.
  await checkpointLock;

  console.log('\n');
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Total time: ${duration}s`);
  console.log('\n✅ Stage 3 Complete!');
  console.log(`  Total indexed: ${processed}`);
  console.log(`  Failed: ${failed}`);

  // Clean up checkpoint
  if (fs.existsSync(CHECKPOINT_FILE)) {
    fs.unlinkSync(CHECKPOINT_FILE);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const recreate = args.includes('--recreate');
  const resume = !args.includes('--no-resume');
  
  buildTypesenseIndex({ recreate, resume }).catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
}
