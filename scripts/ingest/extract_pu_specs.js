/**
 * extract_pu_specs.js
 *
 * Extracts product attribute/spec data from raw_vendor_pu JSONB payloads
 * and inserts into catalog_specs (keyed by catalog_products.id via SKU join).
 *
 * Handles two XML shapes found in PU brand files:
 *   1. PIES format  — payload.Items[].Attributes[].{PAAttributeID, Value}
 *   2. Non-PIES     — payload.Products[].Attributes[].{Name, Value}
 *                   — payload.Products[].Specifications[].{Name, Value}
 *
 * Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING on (product_id, attribute, value).
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/extract_pu_specs.js [--dry-run]
 */

import pg from 'pg';
import { ProgressBar, BatchProgressBar } from './progress_bar.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 500;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── PIES attribute ID → human-readable label map ──────────────────────────────
// PA = Product Attribute per PIES spec. Extend as you discover new IDs.
const PIES_ATTR_LABELS = {
  // Physical
  'WGHT': 'Weight',
  'HGHT': 'Height',
  'LNGT': 'Length',
  'WDTH': 'Width',
  'THCK': 'Thickness',
  'DIAM': 'Diameter',
  'BORE': 'Bore',
  'STRK': 'Stroke',
  // Product descriptors
  'PRDT': 'Product Name',
  'TYPE': 'Type',
  'STYL': 'Style',
  'MATL': 'Material',
  'COLR': 'Color',
  'FNSH': 'Finish',
  'GEND': 'Gender',
  'SIZE': 'Size',
  'CTRY': 'Country of Origin',
  'UOM':  'Unit of Measure',
  'UNIT': 'Units',
  // Brake specific
  'FRCN': 'Friction Rating',
  'MNTP': 'Mounting Position',
  'RDST': 'Riding Style',
  // Electrical
  'VOLT': 'Voltage',
  'AMPS': 'Amperage',
  'WATT': 'Wattage',
  // Tire / wheel
  'ASPX': 'Aspect Ratio',
  'RIMW': 'Rim Width',
  'LOAD': 'Load Rating',
  'SPED': 'Speed Rating',
  'PLYR': 'Ply Rating',
  'TUBT': 'Tube Type',
  // Engine / drivetrain
  'COMP': 'Compression Ratio',
  'LIFT': 'Valve Lift',
  'DURN': 'Duration',
  'THRD': 'Thread Size',
  'PTCH': 'Pitch',
};

function piesToLabel(attrId) {
  return PIES_ATTR_LABELS[attrId?.toUpperCase()] ?? attrId;
}

/**
 * Given a raw_vendor_pu payload row, return array of {sku, attribute, value} objects.
 * Handles PIES Items[], non-PIES Products[], and fallback patterns.
 */
function extractSpecsFromPayload(payload, sourceFile) {
  const specs = [];

  // ── PIES format ──────────────────────────────────────────────────────────────
  const items = payload?.Items ?? payload?.PIES?.Items ?? payload?.items;
  if (Array.isArray(items)) {
    for (const item of items) {
      const sku = item.PartNumber ?? item.partNumber ?? item.ItemLevelGTIN ?? null;
      if (!sku) continue;

      const attrs = item.Attributes ?? item.attributes ?? [];
      for (const attr of attrs) {
        const id  = attr.PAAttributeID ?? attr.AttributeID ?? attr.id ?? null;
        const val = attr.Value ?? attr.value ?? null;
        if (!id || val == null || val === '') continue;
        specs.push({ sku, attribute: piesToLabel(id), value: String(val).trim() });
      }

      // PIES ExtendedProductInformation block often has useful fields
      const epi = item.ExtendedProductInformation ?? item.EPI ?? {};
      const epiMap = {
        CountryOfOrigin:   'Country of Origin',
        ProductName:       'Product Name',
        ProductType:       'Product Type',
        MarketingDescr:    'Marketing Description',
        AltProductID:      'Alt Part Number',
      };
      for (const [key, label] of Object.entries(epiMap)) {
        const v = epi[key];
        if (v && String(v).trim()) {
          specs.push({ sku, attribute: label, value: String(v).trim() });
        }
      }

      // PIES Packages block for dimensions/weight
      const pkgs = item.Packages ?? item.packages ?? [];
      for (const pkg of pkgs) {
        const dimPairs = [
          ['Height',  pkg.Height  ?? pkg.PackageHeight],
          ['Width',   pkg.Width   ?? pkg.PackageWidth],
          ['Length',  pkg.Length  ?? pkg.PackageLength],
          ['Weight',  pkg.Weight  ?? pkg.PackageWeight],
        ];
        for (const [label, val] of dimPairs) {
          if (val != null && val !== '') {
            const uom = pkg.DimensionUOM ?? pkg.WeightUOM ?? '';
            specs.push({ sku, attribute: label, value: `${val}${uom ? ' ' + uom : ''}` });
          }
        }
      }
    }
    return specs;
  }

  // ── Non-PIES: Products[] array format ────────────────────────────────────────
  const products = payload?.Products ?? payload?.products ?? payload?.Catalog?.Products;
  if (Array.isArray(products)) {
    for (const prod of products) {
      const sku =
        prod.PartNumber ?? prod.partNumber ??
        prod.SKU ?? prod.sku ??
        prod.ItemNumber ?? null;
      if (!sku) continue;

      // Attributes block
      const attrs = prod.Attributes ?? prod.attributes ?? prod.ProductAttributes ?? [];
      for (const attr of attrs) {
        const name = attr.Name ?? attr.name ?? attr.Label ?? attr.label ?? null;
        const val  = attr.Value ?? attr.value ?? null;
        if (!name || val == null || val === '') continue;
        specs.push({ sku, attribute: String(name).trim(), value: String(val).trim() });
      }

      // Specifications block (some formats use this instead)
      const specList = prod.Specifications ?? prod.specifications ?? prod.Specs ?? [];
      for (const spec of specList) {
        const name = spec.Name ?? spec.name ?? spec.Label ?? null;
        const val  = spec.Value ?? spec.value ?? null;
        if (!name || val == null || val === '') continue;
        specs.push({ sku, attribute: String(name).trim(), value: String(val).trim() });
      }

      // Dimension fields at product level
      const dimFields = [
        ['Weight',  prod.Weight  ?? prod.weight],
        ['Height',  prod.Height  ?? prod.height  ?? prod.HeightInches],
        ['Width',   prod.Width   ?? prod.width   ?? prod.WidthInches],
        ['Length',  prod.Length  ?? prod.length  ?? prod.LengthInches],
      ];
      for (const [label, val] of dimFields) {
        if (val != null && String(val).trim() !== '' && String(val) !== '0') {
          specs.push({ sku, attribute: label, value: String(val).trim() });
        }
      }
    }
    return specs;
  }

  // ── Flat object format (single product per file) ──────────────────────────────
  const sku =
    payload?.PartNumber ?? payload?.partNumber ??
    payload?.SKU ?? payload?.sku ?? null;
  if (sku) {
    const attrs = payload?.Attributes ?? payload?.attributes ?? [];
    for (const attr of attrs) {
      const name = attr.Name ?? attr.name ?? null;
      const val  = attr.Value ?? attr.value ?? null;
      if (!name || val == null || val === '') continue;
      specs.push({ sku, attribute: String(name).trim(), value: String(val).trim() });
    }
  }

  return specs;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n🔧 extract_pu_specs.js${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

    // Load all raw_vendor_pu files
    console.log('Loading raw_vendor_pu payloads...');
    const { rows: rawRows } = await client.query(
      `SELECT source_file, payload FROM raw_vendor_pu ORDER BY source_file`
    );
    console.log(`  Found ${rawRows.length} source files`);

    // Load SKU → product_id map for PU products only
    console.log('Loading SKU → product_id map...');
    const { rows: skuRows } = await client.query(`
      SELECT sku, id AS product_id
      FROM catalog_products
      WHERE source_vendor = 'pu'
    `);
    const skuMap = new Map();
    for (const r of skuRows) {
      // Store both plain and punctuated forms
      skuMap.set(r.sku, r.product_id);
      // Also store normalized (no punctuation) version
      skuMap.set(r.sku.replace(/[^a-zA-Z0-9]/g, ''), r.product_id);
    }
    console.log(`  Mapped ${skuMap.size} SKU variants for ${skuRows.length} products\n`);

    // Extract specs from all payloads
    const bar = new ProgressBar(rawRows.length, 'Extracting specs');
    const allSpecs = []; // {product_id, attribute, value}
    let filesWithSpecs = 0;
    let filesSkipped = 0;

    for (const row of rawRows) {
      bar.increment();
      let payload = row.payload;
      // payload is already parsed JSONB from pg driver
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { filesSkipped++; continue; }
      }

      const specs = extractSpecsFromPayload(payload, row.source_file);
      if (specs.length === 0) { filesSkipped++; continue; }

      filesWithSpecs++;
      for (const { sku, attribute, value } of specs) {
        // Try exact match, then normalized
        let productId = skuMap.get(sku);
        if (!productId) {
          productId = skuMap.get(sku.replace(/[^a-zA-Z0-9]/g, ''));
        }
        if (!productId) continue; // SKU not in our catalog — skip
        allSpecs.push({ product_id: productId, attribute, value });
      }
    }
    bar.finish();

    // Deduplicate
    const seen = new Set();
    const uniqueSpecs = [];
    for (const s of allSpecs) {
      const key = `${s.product_id}|${s.attribute}|${s.value}`;
      if (!seen.has(key)) { seen.add(key); uniqueSpecs.push(s); }
    }

    console.log(`\n  Files with specs: ${filesWithSpecs}`);
    console.log(`  Files skipped:    ${filesSkipped}`);
    console.log(`  Unique spec rows: ${uniqueSpecs.length}\n`);

    if (uniqueSpecs.length === 0) {
      console.log('⚠️  No specs found. Check payload structure — may need schema adjustment.');
      return;
    }

    if (DRY_RUN) {
      console.log('DRY RUN — sample (first 20):');
      console.table(uniqueSpecs.slice(0, 20));
      return;
    }

    // Batch insert into catalog_specs
    const totalBatches = Math.ceil(uniqueSpecs.length / BATCH_SIZE);
    const batchBar = new BatchProgressBar(totalBatches, BATCH_SIZE, 'Inserting into catalog_specs');
    let inserted = 0;
    let skipped  = 0;
    let batchNum = 0;

    for (let i = 0; i < uniqueSpecs.length; i += BATCH_SIZE) {
      const batch = uniqueSpecs.slice(i, i + BATCH_SIZE);
      batchNum++;
      batchBar.updateBatch(batchNum, batch.length);

      // Build multi-row INSERT
      const values = [];
      const params = [];
      let p = 1;
      for (const s of batch) {
        values.push(`($${p++}, $${p++}, $${p++})`);
        params.push(s.product_id, s.attribute, s.value);
      }

      const res = await client.query(`
        INSERT INTO catalog_specs (product_id, attribute, value)
        VALUES ${values.join(', ')}
        ON CONFLICT (product_id, attribute, value) DO NOTHING
      `, params);

      inserted += res.rowCount ?? 0;
      skipped  += batch.length - (res.rowCount ?? 0);
    }
    batchBar.finish();

    console.log(`\n✅ Done`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Already existed (skipped): ${skipped}`);

    // Show attribute distribution
    const { rows: dist } = await client.query(`
      SELECT attribute, COUNT(*) as cnt
      FROM catalog_specs cs
      JOIN catalog_products cp ON cp.id = cs.product_id
      WHERE cp.source_vendor = 'pu'
      GROUP BY attribute
      ORDER BY cnt DESC
      LIMIT 25
    `);
    console.log('\n📊 Top PU spec attributes now in catalog_specs:');
    console.table(dist);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
