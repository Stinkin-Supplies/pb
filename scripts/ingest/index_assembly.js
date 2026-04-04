/**
 * Stage 3: Typesense Index Assembly
 * Builds search index from normalized catalog data
 */

import Typesense from 'typesense';
import dotenv from 'dotenv';
import fs from 'fs';
import { sql } from '../lib/db.js';

dotenv.config({ path: '.env.local' });

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
const BATCH_SIZE = 250;

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

/**
 * Get product specs as array
 */
async function getProductSpecs(productId) {
  const specs = await sql`
    SELECT attribute, value
    FROM catalog_specs
    WHERE product_id = ${productId}
  `;

  if (!specs || specs.length === 0) return [];
  
  return specs.map(s => `${s.attribute}: ${s.value}`);
}

/**
 * Get product fitment
 */
async function getProductFitment(productId) {
  const fitment = await sql`
    SELECT make, model, year_start, year_end
    FROM catalog_fitment
    WHERE product_id = ${productId}
  `;

  if (!fitment || fitment.length === 0) {
    return { makes: [], models: [], years: [] };
  }

  const makes = [...new Set(fitment.map(f => f.make).filter(Boolean))];
  const models = [...new Set(fitment.map(f => f.model).filter(Boolean))];
  const years = [];
  
  fitment.forEach(f => {
    if (f.year_start && f.year_end) {
      for (let y = f.year_start; y <= f.year_end; y++) {
        years.push(y);
      }
    } else if (f.year_start) {
      years.push(f.year_start);
    }
  });

  return {
    makes: [...new Set(makes)],
    models: [...new Set(models)],
    years: [...new Set(years)]
  };
}

/**
 * Get primary image URL
 */
async function getProductImage(productId) {
  const media = await sql`
    SELECT url
    FROM catalog_media
    WHERE product_id = ${productId}
    ORDER BY priority ASC
    LIMIT 1
  `;
  return media?.[0]?.url ?? null;
}

/**
 * Build search document for a product
 */
async function buildDocument(product) {
  const [specs, fitment, imageUrl] = await Promise.all([
    getProductSpecs(product.id),
    getProductFitment(product.id),
    getProductImage(product.id)
  ]);

  // Get stock from vendor offers
  const offers = await sql`
    SELECT total_qty
    FROM vendor_offers
    WHERE catalog_product_id = ${product.id}
  `;
  const stockQty = (offers ?? []).reduce((sum, o) => sum + (Number(o.total_qty) || 0), 0);

  // Build search blob
  const searchBlob = [
    product.name,
    product.brand,
    product.sku,
    product.category,
    ...specs
  ].filter(Boolean).join(' ').toLowerCase();

  return {
    id: product.id.toString(),
    sku: product.sku,
    slug: product.slug,
    brand: product.brand || '',
    category: product.category || '',
    name: product.name || '',
    description: product.description || '',
    price: product.computed_price || 0,
    msrp: null, // Will be populated from offers
    stock_quantity: stockQty,
    in_stock: stockQty > 0,
    image_url: imageUrl,
    specs: specs,
    fitment_make: fitment.makes,
    fitment_model: fitment.models,
    fitment_year: fitment.years,
    search_blob: searchBlob.substring(0, 1000)
  };
}

/**
 * Get products to index (respecting allowlist)
 */
async function getProductsToIndex(offset, limit) {
  // Check if allowlist exists and has entries
  const allowlistCount = await sql`SELECT COUNT(*)::int AS count FROM catalog_allowlist`;
  const useAllowlist = (allowlistCount?.[0]?.count ?? 0) > 0;

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

  while (offset < totalProducts) {
    let products = [];
    try {
      const res = await getProductsToIndex(offset, BATCH_SIZE);
      products = res.data ?? [];
    } catch (e) {
      console.error(`Fetch error at offset ${offset}:`, e.message);
      break;
    }

    if (!products || products.length === 0) {
      break;
    }

    // Build documents
    const documents = [];
    for (const product of products) {
      try {
        const doc = await buildDocument(product);
        documents.push(doc);
      } catch (e) {
        console.error(`Error building document for ${product.sku}:`, e.message);
        failed++;
      }
    }

    // Import to Typesense
    if (documents.length > 0) {
      try {
        await typesenseClient.collections(collection).documents().import(
          documents.map(d => JSON.stringify(d)).join('\n'),
          { action: 'upsert' }
        );
        processed += documents.length;
      } catch (e) {
        console.error(`Import error:`, e.message);
        failed += documents.length;
      }
    }

    offset += products.length;

    // Save checkpoint
    checkpoint = { lastOffset: offset, processed, failed };
    saveCheckpoint(checkpoint);

    // Progress
    const pct = ((offset / totalProducts) * 100).toFixed(1);
    process.stdout.write(`\r  Progress: ${offset}/${totalProducts} (${pct}%) | Indexed: ${processed} | Failed: ${failed}`);
  }

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
