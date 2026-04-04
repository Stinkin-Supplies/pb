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
  // Support multiple common env var names.
  const typesenseKey =
    process.env.TYPESENSE_ADMIN_KEY ||
    process.env.TYPESENSE_ADMIN_API_KEY ||
    process.env.TYPESENSE_API_KEY;

  if (!typesenseHost || !typesenseKey) {
    throw new Error(
      'Missing Typesense credentials (need TYPESENSE_HOST and an admin key: TYPESENSE_ADMIN_KEY or TYPESENSE_ADMIN_API_KEY or TYPESENSE_API_KEY)'
    );
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

function isTypesenseOomError(err) {
  const msg = String(err?.message ?? err ?? '');
  return (
    msg.includes('OUT_OF_MEMORY') ||
    msg.toLowerCase().includes('running out of resource') ||
    msg.toLowerCase().includes('out of memory')
  );
}

async function withTypesenseOomRetry(fn, label) {
  const setupDelayMs = parseInt(process.env.INDEX_SETUP_OOM_DELAY_MS || process.env.INDEX_OOM_DELAY_MS || '30000', 10);
  const safeDelay = Number.isFinite(setupDelayMs) && setupDelayMs > 0 ? setupDelayMs : 30000;

  // Retry forever on OOM during setup; if the node is temporarily overloaded, it will recover.
  // If it never recovers, the index cannot be built anyway.
  while (true) {
    try {
      return await fn();
    } catch (e) {
      if (!isTypesenseOomError(e)) throw e;
      console.warn(`⚠️  Typesense OOM during ${label}. Cooling down for ${safeDelay}ms then retrying...`);
      await sleep(safeDelay);
    }
  }
}

function slimDocumentForTypesense(doc, level = 0) {
  // Level 0: cap arrays and strings.
  const out = { ...doc };

  const capArray = (v, n) => (Array.isArray(v) ? v.slice(0, n) : v);
  const capString = (v, n) => (typeof v === 'string' ? v.slice(0, n) : v);

  out.specs = capArray(out.specs, 10);
  out.fitment_make = capArray(out.fitment_make, 25);
  out.fitment_model = capArray(out.fitment_model, 25);
  out.fitment_year = capArray(out.fitment_year, 25);
  out.search_blob = capString(out.search_blob, 200);
  out.description = capString(out.description, 4000);

  if (level >= 1) {
    // Drop the biggest memory offenders first.
    out.fitment_year = [];
    out.search_blob = '';
  }

  if (level >= 2) {
    out.specs = [];
    out.fitment_make = [];
    out.fitment_model = [];
  }

  if (level >= 3) {
    // Minimal doc: keep only required/search core fields.
    return {
      id: out.id,
      sku: out.sku,
      slug: out.slug,
      brand: out.brand,
      category: out.category,
      name: out.name,
      description: out.description,
      price: out.price,
      msrp: out.msrp,
      stock_quantity: out.stock_quantity,
      in_stock: out.in_stock,
      free_shipping: out.free_shipping,
      image_url: out.image_url,
      specs: [],
      fitment_make: [],
      fitment_model: [],
      fitment_year: [],
      search_blob: '',
    };
  }

  return out;
}

async function importWithRetry(typesenseClient, collection, docs, opts = {}) {
  const retries = Number.isFinite(opts.retries) ? opts.retries : 3;
  const baseDelayMs = Number.isFinite(opts.baseDelayMs) ? opts.baseDelayMs : 750;
  const maxDelayMs = Number.isFinite(opts.maxDelayMs) ? opts.maxDelayMs : 10_000;
  const oomDelayMs = parseInt(process.env.INDEX_OOM_DELAY_MS || '15000', 10);
  const depth = Number.isFinite(opts.depth) ? opts.depth : 0;
  const maxSplitDepth = parseInt(process.env.INDEX_MAX_SPLIT_DEPTH || '32', 10);
  const slimLevel = Number.isFinite(opts.slimLevel) ? opts.slimLevel : 0;
  const maxSlimLevel = parseInt(process.env.INDEX_MAX_SLIM_LEVEL || '4', 10);
  const skipOomSingleDoc =
    String(process.env.INDEX_SKIP_OOM_SINGLE_DOC ?? 'true').toLowerCase() === 'true';

  let attempt = 0;
  // Retries are for request-level failures (timeouts, 5xx, network).
  // Per-record failures are handled inside importBatch() and should not trigger retries.
  while (true) {
    try {
      return await importBatch(typesenseClient, collection, docs);
    } catch (err) {
      // Typesense sometimes returns 422 with OUT_OF_MEMORY when it is overloaded.
      // Treat it as retryable with a longer cool-down, otherwise we'll "complete" batches as failed
      // and end up with a permanently incomplete index.
      if (isTypesenseOomError(err)) {
        const safeMaxDepth = Number.isFinite(maxSplitDepth) && maxSplitDepth > 0 ? maxSplitDepth : 32;

        // Split until single-doc chunks (log2(N) depth). This is the most reliable way to
        // make progress on memory-constrained Typesense nodes.
        if (docs.length > 1 && depth < safeMaxDepth) {
          const mid = Math.floor(docs.length / 2);
          const left = docs.slice(0, mid);
          const right = docs.slice(mid);

          console.warn(`⚠️  Typesense OOM reject. Splitting batch ${docs.length} → ${left.length} + ${right.length}`);

          const r1 = await importWithRetry(typesenseClient, collection, left, { ...opts, depth: depth + 1, slimLevel: 0 });
          const r2 = await importWithRetry(typesenseClient, collection, right, { ...opts, depth: depth + 1, slimLevel: 0 });
          return {
            failed: (r1.failed ?? 0) + (r2.failed ?? 0),
            total: (r1.total ?? 0) + (r2.total ?? 0),
          };
        }

        // Single-doc worst case: progressively slim. If it still OOMs, optionally skip it so the run finishes.
        if (docs.length === 1) {
          const safeMaxSlim = Number.isFinite(maxSlimLevel) && maxSlimLevel > 0 ? maxSlimLevel : 4;
          if (slimLevel < safeMaxSlim) {
            const nextLevel = slimLevel + 1;
            console.warn(`⚠️  Typesense OOM reject for single doc. Retrying with slim level ${nextLevel}...`);
            const slimDoc = slimDocumentForTypesense(docs[0], nextLevel);
            return await importWithRetry(typesenseClient, collection, [slimDoc], { ...opts, slimLevel: nextLevel });
          }

          if (skipOomSingleDoc) {
            try {
              const doc = docs?.[0];
              const bytes = Buffer.byteLength(JSON.stringify(doc ?? {}), 'utf8');
              console.log(`Doc size: ${bytes} bytes`);
              console.log(`Doc id=${doc?.id ?? '(unknown)'} sku=${doc?.sku ?? '(unknown)'}`);
            } catch {
              console.log('Doc size: (failed to compute)');
            }
            console.error(`❌ Skipping OOM doc id=${docs?.[0]?.id ?? '(unknown)'}`);
            return { failed: 1, total: 1 };
          }
        }

        const delay = Number.isFinite(oomDelayMs) && oomDelayMs > 0 ? oomDelayMs : 15000;
        console.warn(`⚠️  Typesense OOM reject. Cooling down for ${delay}ms then retrying...`);
        await sleep(delay);
        continue;
      }

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
async function setupCollection(collectionName, profile, recreate = false) {
  const typesenseClient = getTypesense();
  const resolvedName = collectionName || 'products';
  const resolvedProfile = profile || 'full';

  if (recreate) {
    console.log('Deleting existing collection...');
    await withTypesenseOomRetry(async () => {
      try {
        await typesenseClient.collections(resolvedName).delete();
      } catch (e) {
        // Collection may not exist
      }
    }, `delete collection ${resolvedName}`);
  }

  try {
    await withTypesenseOomRetry(
      async () => typesenseClient.collections(resolvedName).retrieve(),
      `retrieve collection ${resolvedName}`
    );
    console.log('Using existing collection');
    return resolvedName;
  } catch (e) {
    console.log('Creating new collection...');
  }

  // Ultra-minimal schema for low-memory nodes (user-defined).
  // Keep only the essential searchable/sort/filter fields.
  if (resolvedProfile === 'products_search') {
    const schema = {
      name: resolvedName,
      fields: [
        { name: 'id', type: 'string' },
        { name: 'name', type: 'string', index: true },
        { name: 'sku', type: 'string', index: true },
        { name: 'brand', type: 'string', facet: true },
        { name: 'category', type: 'string', facet: true },
        { name: 'price', type: 'float', sort: true },
        { name: 'in_stock', type: 'bool', facet: true },
        { name: 'image_url', type: 'string', index: false, store: true, optional: true },
      ],
    };

    await withTypesenseOomRetry(
      async () => typesenseClient.collections().create(schema),
      `create collection ${resolvedName}`
    );
    console.log('✓ Collection created');
    return resolvedName;
  }

  const isSearchOnly = resolvedProfile === 'search';

  const baseFields = [
    { name: 'id', type: 'string' },
    { name: 'sku', type: 'string', facet: !isSearchOnly },
    { name: 'slug', type: 'string' },
    { name: 'brand', type: 'string', facet: !isSearchOnly },
    { name: 'category', type: 'string', facet: !isSearchOnly },
    { name: 'name', type: 'string', locale: 'en' },
    { name: 'description', type: 'string', optional: true },
    { name: 'price', type: 'float', facet: !isSearchOnly, sort: !isSearchOnly },
    { name: 'msrp', type: 'float', optional: true },
    { name: 'stock_quantity', type: 'int32', facet: !isSearchOnly, sort: !isSearchOnly },
    { name: 'in_stock', type: 'bool', facet: !isSearchOnly },
    // Existing Typesense collection schema expects this field.
    { name: 'free_shipping', type: 'bool', facet: !isSearchOnly, optional: true },
    // Not searched; keep retrievable but avoid indexing overhead.
    { name: 'image_url', type: 'string', optional: true, index: false },
    // Index for search relevance, but don't store on disk to reduce stored payload.
    { name: 'search_blob', type: 'string', optional: true, store: false },
  ];

  const heavyFields = [
    // Heavy arrays: keep searchable/filterable (via exact-match filters), but do not facet them
    // to avoid huge in-memory facet indexes on constrained Typesense nodes.
    { name: 'specs', type: 'string[]', facet: false, optional: true },
    { name: 'fitment_make', type: 'string[]', facet: false, optional: true },
    { name: 'fitment_model', type: 'string[]', facet: false, optional: true },
    { name: 'fitment_year', type: 'int32[]', facet: false, optional: true },
  ];

  const schema = {
    name: resolvedName,
    fields: resolvedProfile === 'core' ? baseFields : baseFields.concat(heavyFields),
    ...(isSearchOnly ? {} : { default_sorting_field: 'stock_quantity' }),
  };

  await withTypesenseOomRetry(
    async () => typesenseClient.collections().create(schema),
    `create collection ${resolvedName}`
  );
  console.log('✓ Collection created');
  return resolvedName;
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

async function buildDocumentsForProducts(products, opts = {}) {
  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const useCache = await hasSearchCache();
  const profile = opts.profile || 'full';
  const queryProfile = profile === 'products_search' ? 'core' : profile;

  let rows = [];
  if (useCache) {
    if (queryProfile === 'core') {
      rows = await sql`
        WITH ids AS (
          SELECT unnest(${productIds}::int[]) AS product_id
        )
        SELECT
          cp.id,
          ARRAY[]::text[] AS specs,
          ARRAY[]::text[] AS fitment_make,
          ARRAY[]::text[] AS fitment_model,
          ARRAY[]::int[]  AS fitment_year,
          c.image_url AS image_url,
          c.search_blob AS search_blob,
          COALESCE(cp.stock_quantity, 0)::int AS stock_qty,
          cp.msrp AS msrp
        FROM ids
        JOIN catalog_products cp ON cp.id = ids.product_id
        LEFT JOIN catalog_product_search_cache c
          ON c.product_id = cp.id
      `;
    } else {
      rows = await sql`
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
      `;
    }
  } else {
    if (queryProfile === 'core') {
      rows = await sql`
        WITH ids AS (
          SELECT unnest(${productIds}::int[]) AS product_id
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
          ARRAY[]::text[] AS specs,
          ARRAY[]::text[] AS fitment_make,
          ARRAY[]::text[] AS fitment_model,
          ARRAY[]::int[]  AS fitment_year,
          media.url AS image_url,
          NULL::text AS search_blob,
          COALESCE(cp.stock_quantity, 0)::int AS stock_qty,
          cp.msrp AS msrp
        FROM ids
        JOIN catalog_products cp ON cp.id = ids.product_id
        LEFT JOIN media ON media.product_id = cp.id
      `;
    } else {
      rows = await sql`
        -- Single DB round-trip for the batch (still uses multiple CTEs, but one query).
        WITH ids AS (
          SELECT unnest(${productIds}::int[]) AS product_id
        ),
        specs AS (
          SELECT
            s.product_id,
            (ARRAY_AGG(s.attribute || ': ' || s.value ORDER BY s.attribute, s.value))[1:10] AS specs
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
              LEAST(
                COALESCE(f.year_end, f.year_start),
                COALESCE(f.year_start, f.year_end) + 24
              )
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
    }
  }

  const rowById = new Map(rows.map((r) => [r.id, r]));

  return products.map((product) => {
    const r = rowById.get(product.id);
    const imageUrl = r?.image_url ?? null;
    const stockQty = Number(r?.stock_qty ?? 0);
    const msrp = r?.msrp ?? null;
    const priceNum = Number(product.computed_price ?? 0);
    const safePrice = Number.isFinite(priceNum) ? priceNum : 0;
    const msrpNum = msrp === null || msrp === undefined ? null : Number(msrp);
    const safeMsrp = msrpNum === null ? null : (Number.isFinite(msrpNum) ? msrpNum : null);

    if (profile === 'products_search') {
      // Emit only the minimal fields requested:
      // no specs/fitment/search_blob/description/slug/msrp.
      return {
        id: product.id.toString(),
        name: product.name || '',
        sku: product.sku,
        brand: product.brand || '',
        category: product.category || '',
        price: safePrice,
        in_stock: stockQty > 0,
        image_url: imageUrl,
      };
    }

    const specs = r?.specs ?? [];

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

    const fitmentMake = (r?.fitment_make ?? []).slice(0, 25);
    const fitmentModel = (r?.fitment_model ?? []).slice(0, 25);
    const fitmentYear = (r?.fitment_year ?? []).slice(0, 25);

    const baseDoc = {
      id: product.id.toString(),
      sku: product.sku,
      slug: product.slug,
      brand: product.brand || '',
      category: product.category || '',
      name: product.name || '',
      description: product.description || '',
      // Typesense expects true numeric types; Postgres NUMERIC tends to arrive as strings.
      price: safePrice,
      msrp: safeMsrp,
      stock_quantity: stockQty,
      in_stock: stockQty > 0,
      // Typesense schema requires the field; default false until you implement logic.
      free_shipping: false,
      image_url: imageUrl,
      search_blob: searchBlob.substring(0, 200),
    };

    if (profile === 'core') return baseDoc;

    return {
      ...baseDoc,
      specs,
      fitment_make: fitmentMake,
      fitment_model: fitmentModel,
      fitment_year: fitmentYear,
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
  const args = process.argv.slice(2);
  const profile =
    (args.find((_, i) => args[i - 1] === '--profile') || process.env.INDEX_PROFILE || 'full')
      .toLowerCase();
  const collectionName =
    (args.find((_, i) => args[i - 1] === '--collection') || process.env.INDEX_COLLECTION || 'products')
      .trim();

  console.log(`Index profile: ${profile}`);
  console.log(`Collection: ${collectionName}\n`);

  const collection = await setupCollection(collectionName, profile, recreate);

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
    const documents = await buildDocumentsForProducts(products, { profile });
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
