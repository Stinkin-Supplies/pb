/**
 * import_pu_brand_xml.js
 *
 * Reads ALL XML files from scripts/data/pu_pricefile/ and extracts enrichment
 * data into the DB. Handles two formats found in the wild:
 *
 * FORMAT A — PIES 7.x  (*_PIES_Export*.xml)
 *   <PIES><Items><Item>
 *     <PartNumber>          — punctuated SKU  e.g. 0214-1180
 *     <BrandLabel>          — brand name
 *     <Descriptions>
 *       DescriptionCode=TLE — product title
 *       DescriptionCode=DES — long description
 *       DescriptionCode=FAB — feature bullets (multiple, Sequence attr)
 *       DescriptionCode=MKT — marketing copy
 *     <ExtendedInformation>
 *       EXPICode=OSP        — OEM/supplier part number
 *       EXPICode=CTO        — country of origin
 *       EXPICode=HTS        — harmonized tariff code
 *     <Packages><Package>
 *       <MerchandisingHeight/Width/Length UOM="IN">
 *       <ShippingHeight/Width/Length>
 *       <Weight UOM="LB">
 *     <ProductAttributes><ProductAttribute>
 *       PAAttributeID + Value — structured specs (Type, Material, etc.)
 *       (not all brands have this block)
 *     <DigitalAssets><DigitalFileInformation>
 *       <URI>               — LeMans image URL
 *
 * FORMAT B — Catalog Content  (*_Catalog_Content_Export*.xml)
 *   <root><part>
 *     <partNumber>          — plain SKU  e.g. 01041484
 *     <punctuatedPartNumber>— punctuated e.g. 0104-1484
 *     <partDescription>     — product name
 *     <brandName>
 *     <bullet1..24>         — feature bullets
 *     <partImage>           — LeMans URL (part-level)
 *     <productImage>        — LeMans URL (product/group level)
 *     <productName>         — group product name
 *     <specialInstructions> — notes
 *     <baseDealerPrice/yourDealerPrice/baseRetailPrice/originalRetailPrice>
 *
 * What gets written:
 *   catalog_specs      — structured attributes (PIES ProductAttribute blocks)
 *   pu_brand_enrichment— dimensions, weight, images, OEM#, country, features
 *                        (upsert — updates existing rows)
 *   catalog_media      — image URLs (insert if missing)
 *
 * Safe to re-run — all writes are upsert/ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/import_pu_brand_xml.js [--dry-run] [--brand=EBC]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import pg from 'pg';
import { ProgressBar, BatchProgressBar } from './progress_bar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.resolve(__dirname, '../data/pu_pricefile');

const DRY_RUN    = process.argv.includes('--dry-run');
const BRAND_FILTER = process.argv.find(a => a.startsWith('--brand='))?.split('=')[1]?.toUpperCase() ?? null;
const BATCH_SIZE = 500;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── XML parser (shared for both formats) ─────────────────────────────────────
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['Item', 'Description', 'ExtendedProductInformation',
                       'Package', 'ProductAttribute', 'DigitalFileInformation',
                       'part'].includes(name),
  textNodeName: '#text',
  trimValues: true,
});

// ── PIES EXPICode → field meaning ───────────────────────────────────────────
const EXPI_MAP = {
  OSP: 'oem_part_number',
  CTO: 'country_of_origin',
  HTS: 'harmonized_us',
  LIF: null, // lifecycle — skip
  REP: null, // replacement — skip
};

// ── PIES PAAttributeID → human label ────────────────────────────────────────
const PA_LABELS = {
  PRDT: 'Product Name', TYPE: 'Type', STYL: 'Style', MATL: 'Material',
  COLR: 'Color', FNSH: 'Finish', SIZE: 'Size', WGHT: 'Weight',
  HGHT: 'Height', LNGT: 'Length', WDTH: 'Width', THCK: 'Thickness',
  DIAM: 'Diameter', BORE: 'Bore', STRK: 'Stroke', VOLT: 'Voltage',
  AMPS: 'Amperage', WATT: 'Wattage', FRCN: 'Friction Rating',
  MNTP: 'Mounting Position', RDST: 'Riding Style', UNIT: 'Units',
  UOM: 'Unit of Measure', CTRY: 'Country of Origin', ASPX: 'Aspect Ratio',
  RIMW: 'Rim Width', LOAD: 'Load Rating', SPED: 'Speed Rating',
  PLYR: 'Ply Rating', TUBT: 'Tube Type', COMP: 'Compression Ratio',
  LIFT: 'Valve Lift', DURN: 'Duration', THRD: 'Thread Size', PTCH: 'Pitch',
  GEND: 'Gender', UNSP: 'Units Per Set', CONT: 'Contents',
};

function paLabel(id) {
  return PA_LABELS[id?.toUpperCase()] ?? id;
}

// ── Result container ─────────────────────────────────────────────────────────
function emptyResult() {
  return {
    sku: null,            // punctuated
    brand: null,
    name: null,           // TLE description
    description: null,    // DES/MKT description
    features: [],         // FAB bullets
    oem_part_number: null,
    country_of_origin: null,
    harmonized_us: null,
    merch_h: null, merch_w: null, merch_l: null,
    ship_h: null,  ship_w: null,  ship_l: null,
    weight: null,
    dimension_uom: 'IN',
    weight_uom: 'LB',
    image_uri: null,
    specs: [],            // [{attribute, value}]
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PIES parser
// ─────────────────────────────────────────────────────────────────────────────
function parsePIES(xml) {
  const doc = parser.parse(xml);
  const items = doc?.PIES?.Items?.Item ?? doc?.Items?.Item ?? [];
  const results = [];

  for (const item of items) {
    const r = emptyResult();
    r.sku   = item.PartNumber != null ? String(item.PartNumber) : null;
    r.brand = item.BrandLabel ?? null;
    if (!r.sku) continue;

    // Descriptions
    const descs = item.Descriptions?.Description ?? [];
    const fabBySeq = [];
    for (const d of descs) {
      const code = d['@_DescriptionCode'];
      const text = d['#text'] ?? d;
      if (!text || typeof text !== 'string') continue;
      if (code === 'TLE') r.name = text;
      else if (code === 'DES' || code === 'MKT') r.description = text;
      else if (code === 'FAB') {
        const seq = parseInt(d['@_Sequence'] ?? '99', 10);
        fabBySeq.push({ seq, text });
      }
    }
    fabBySeq.sort((a, b) => a.seq - b.seq);
    r.features = fabBySeq.map(f => f.text).filter(Boolean);

    // ExtendedInformation
    const extInfos = item.ExtendedInformation?.ExtendedProductInformation ?? [];
    for (const e of extInfos) {
      const code  = e['@_EXPICode'];
      const value = e['#text'] ?? e;
      if (!value || typeof value !== 'string') continue;
      const field = EXPI_MAP[code];
      if (field) r[field] = value.trim();
    }

    // Packages — take first package
    const pkgs = item.Packages?.Package ?? [];
    const pkg  = pkgs[0];
    if (pkg) {
      const dims = pkg.Dimensions;
      const wts  = pkg.Weights;
      if (dims) {
        r.dimension_uom = dims['@_UOM'] ?? 'IN';
        r.merch_h = parseFloat(dims.MerchandisingHeight) || null;
        r.merch_w = parseFloat(dims.MerchandisingWidth)  || null;
        r.merch_l = parseFloat(dims.MerchandisingLength) || null;
        r.ship_h  = parseFloat(dims.ShippingHeight)      || null;
        r.ship_w  = parseFloat(dims.ShippingWidth)       || null;
        r.ship_l  = parseFloat(dims.ShippingLength)      || null;
      }
      if (wts) {
        r.weight_uom = wts['@_UOM'] ?? 'LB';
        r.weight = parseFloat(wts.Weight) || null;
      }
    }

    // ProductAttributes (structured specs — not all brands have this)
    const paList = item.ProductAttributes?.ProductAttribute ?? [];
    for (const pa of paList) {
      const id  = pa['@_PAAttributeID'] ?? pa.PAAttributeID ?? null;
      const val = pa['#text'] ?? pa.Value ?? pa;
      if (!id || val == null || val === '') continue;
      r.specs.push({ attribute: paLabel(id), value: String(val).trim() });
    }

    // DigitalAssets — first image URI
    const das = item.DigitalAssets?.DigitalFileInformation ?? [];
    for (const da of das) {
      const uri = da.URI;
      if (uri && typeof uri === 'string' && uri.includes('lemansnet.com')) {
        r.image_uri = uri.trim();
        break;
      }
    }

    results.push(r);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog Content parser
// ─────────────────────────────────────────────────────────────────────────────
function parseCatalogContent(xml) {
  const doc  = parser.parse(xml);
  const parts = doc?.root?.part ?? doc?.parts?.part ?? [];
  const results = [];

  for (const part of parts) {
    const r = emptyResult();
    // Prefer punctuated SKU; fall back to plain
    const rawSku = part.punctuatedPartNumber ?? part.partNumber ?? null;
    r.sku   = rawSku != null ? String(rawSku) : null;
    r.brand = part.brandName ?? null;
    r.name  = part.partDescription ?? part.productName ?? null;
    r.oem_part_number = part.supplierNumber != null ? String(part.supplierNumber) : null;
    if (!r.sku) continue;

    // Bullets → features
    for (let i = 1; i <= 24; i++) {
      const bullet = part[`bullet${i}`];
      if (bullet && typeof bullet === 'string' && bullet.trim()) {
        r.features.push(bullet.trim());
      }
    }

    // Images — partImage preferred (part-level), then productImage
    const img = part.partImage ?? part.productImage ?? null;
    if (img && typeof img === 'string' && img.includes('lemansnet.com')) {
      r.image_uri = img.trim();
    }

    // Special instructions → store as first feature if no others
    const special = part.specialInstructions;
    if (special && typeof special === 'string' && special.trim() && r.features.length === 0) {
      r.features.push(special.trim());
    }

    results.push(r);
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detect format and dispatch
// ─────────────────────────────────────────────────────────────────────────────
function parseXmlFile(filePath, xml) {
  const lower = filePath.toLowerCase();
  // Check content too — some files are misnamed
  const isPIES = lower.includes('pies') || xml.trimStart().startsWith('<PIES') ||
                 xml.includes('<Items>') || xml.includes('PIESVersion');
  return isPIES ? parsePIES(xml) : parseCatalogContent(xml);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n📦 import_pu_brand_xml.js${DRY_RUN ? ' [DRY RUN]' : ''}${BRAND_FILTER ? ` [brand=${BRAND_FILTER}]` : ''}\n`);

    // ── List XML files ──────────────────────────────────────────────────────
    const allFiles = fs.readdirSync(DATA_DIR)
      .filter(f => f.toLowerCase().endsWith('.xml'))
      .map(f => path.join(DATA_DIR, f));

    const xmlFiles = BRAND_FILTER
      ? allFiles.filter(f => path.basename(f).toUpperCase().includes(BRAND_FILTER))
      : allFiles;

    console.log(`  Found ${xmlFiles.length} XML files to process`);
    if (xmlFiles.length === 0) {
      console.log(`  Check DATA_DIR: ${DATA_DIR}`);
      return;
    }

    // ── Load SKU → product_id map ───────────────────────────────────────────
    console.log('  Loading SKU → product_id map...');
    const { rows: skuRows } = await client.query(`
      SELECT sku, id AS product_id
      FROM catalog_products
      WHERE source_vendor = 'pu' AND is_active = true
    `);
    // Map both punctuated and plain forms
    const skuToId = new Map();
    for (const r of skuRows) {
      skuToId.set(r.sku, r.product_id);
      skuToId.set(r.sku.replace(/[^a-zA-Z0-9]/g, ''), r.product_id);
    }
    console.log(`  Mapped ${skuToId.size} SKU variants for ${skuRows.length} products\n`);

    // ── Parse all files ─────────────────────────────────────────────────────
    const bar = new ProgressBar(xmlFiles.length, 'Parsing XML files');
    const allResults = [];
    const fileSummary = { pies: 0, catalog: 0, empty: 0, error: 0 };

    for (const filePath of xmlFiles) {
      bar.increment();
      try {
        const xml = fs.readFileSync(filePath, 'utf8');
        const results = parseXmlFile(filePath, xml);
        if (results.length === 0) { fileSummary.empty++; continue; }

        const isPies = filePath.toLowerCase().includes('pies') || xml.includes('PIESVersion');
        isPies ? fileSummary.pies++ : fileSummary.catalog++;
        allResults.push(...results);
      } catch (err) {
        fileSummary.error++;
        // Don't crash — log and continue
        process.stderr.write(`\n  ⚠️  Parse error: ${path.basename(filePath)}: ${err.message}\n`);
      }
    }
    bar.finish();

    console.log(`\n  File breakdown:`);
    console.log(`    PIES format:    ${fileSummary.pies}`);
    console.log(`    Catalog format: ${fileSummary.catalog}`);
    console.log(`    Empty/no items: ${fileSummary.empty}`);
    console.log(`    Parse errors:   ${fileSummary.error}`);
    console.log(`    Total items:    ${allResults.length}\n`);

    if (allResults.length === 0) {
      console.log('⚠️  No items parsed from any file.');
      return;
    }

    // ── Match SKUs to catalog ───────────────────────────────────────────────
    let matched = 0, unmatched = 0;
    const enrichRows   = []; // for pu_brand_enrichment upsert
    const specRows     = []; // for catalog_specs insert
    const imageRows    = []; // for catalog_media insert

    for (const r of allResults) {
      if (!r.sku) { unmatched++; continue; }
      const productId = skuToId.get(r.sku) ?? skuToId.get(r.sku.replace(/[^a-zA-Z0-9]/g, ''));
      if (!productId) { unmatched++; continue; }
      matched++;

      enrichRows.push({ ...r, product_id: productId });

      for (const s of r.specs) {
        specRows.push({ product_id: productId, attribute: s.attribute, value: s.value });
      }

      if (r.image_uri) {
        imageRows.push({ product_id: productId, url: r.image_uri });
      }
    }

    console.log(`  SKU match: ${matched} matched, ${unmatched} unmatched (not in our catalog)`);
    console.log(`  catalog_specs rows:  ${specRows.length}`);
    console.log(`  catalog_media rows:  ${imageRows.length}`);

    if (DRY_RUN) {
      console.log('\nDRY RUN — sample enrichment rows (first 10):');
      console.table(enrichRows.slice(0, 10).map(r => ({
        sku: r.sku, brand: r.brand, name: r.name?.slice(0, 40),
        features: r.features.length, specs: r.specs.length,
        has_dims: !!(r.merch_h), has_image: !!r.image_uri,
        oem: r.oem_part_number, country: r.country_of_origin,
      })));
      if (specRows.length > 0) {
        console.log('\nSample spec rows (first 15):');
        console.table(specRows.slice(0, 15));
      }
      return;
    }

    // ── 1. Upsert pu_brand_enrichment ──────────────────────────────────────
    console.log('\nStep 1: Upserting pu_brand_enrichment...');
    const enrichBatches = Math.ceil(enrichRows.length / BATCH_SIZE);
    const enrichBar = new BatchProgressBar(enrichBatches, BATCH_SIZE, 'pu_brand_enrichment');
    let enrichUpdated = 0;
    let batchNum = 0;

    for (let i = 0; i < enrichRows.length; i += BATCH_SIZE) {
      const batch = enrichRows.slice(i, i + BATCH_SIZE);
      batchNum++;
      enrichBar.updateBatch(batchNum, batch.length);

      for (const r of batch) {
        const res = await client.query(`
          INSERT INTO pu_brand_enrichment (
            sku, brand, name, features, oem_part_number, country_of_origin,
            merch_h, merch_w, merch_l, ship_h, ship_w, ship_l,
            weight, weight_uom, dimension_uom, image_uri,
            product_id, source_file
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
          ON CONFLICT (sku) DO UPDATE SET
            brand            = COALESCE(EXCLUDED.brand,            pu_brand_enrichment.brand),
            name             = COALESCE(EXCLUDED.name,             pu_brand_enrichment.name),
            features         = CASE WHEN array_length(EXCLUDED.features,1) > 0
                                    THEN EXCLUDED.features
                                    ELSE pu_brand_enrichment.features END,
            oem_part_number  = COALESCE(EXCLUDED.oem_part_number,  pu_brand_enrichment.oem_part_number),
            country_of_origin= COALESCE(EXCLUDED.country_of_origin,pu_brand_enrichment.country_of_origin),
            merch_h          = COALESCE(EXCLUDED.merch_h,          pu_brand_enrichment.merch_h),
            merch_w          = COALESCE(EXCLUDED.merch_w,          pu_brand_enrichment.merch_w),
            merch_l          = COALESCE(EXCLUDED.merch_l,          pu_brand_enrichment.merch_l),
            ship_h           = COALESCE(EXCLUDED.ship_h,           pu_brand_enrichment.ship_h),
            ship_w           = COALESCE(EXCLUDED.ship_w,           pu_brand_enrichment.ship_w),
            ship_l           = COALESCE(EXCLUDED.ship_l,           pu_brand_enrichment.ship_l),
            weight           = COALESCE(EXCLUDED.weight,           pu_brand_enrichment.weight),
            image_uri        = COALESCE(EXCLUDED.image_uri,        pu_brand_enrichment.image_uri),
            updated_at       = NOW()
        `, [
          r.sku, r.brand, r.name,
          r.features.length > 0 ? r.features : null,
          r.oem_part_number, r.country_of_origin,
          r.merch_h, r.merch_w, r.merch_l,
          r.ship_h,  r.ship_w,  r.ship_l,
          r.weight, r.weight_uom ?? 'LB', r.dimension_uom ?? 'IN',
          r.image_uri, String(r.product_id), null,
        ]);
        enrichUpdated += res.rowCount ?? 0;
      }
    }
    enrichBar.finish();
    console.log(`  ✅ pu_brand_enrichment: ${enrichUpdated} rows upserted`);

    // ── 2. Insert catalog_specs ─────────────────────────────────────────────
    if (specRows.length > 0) {
      console.log('\nStep 2: Inserting catalog_specs...');
      // Deduplicate
      const seen = new Set();
      const uniqueSpecs = specRows.filter(s => {
        const key = `${s.product_id}|${s.attribute}|${s.value}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      console.log(`  ${uniqueSpecs.length} unique spec rows`);

      const specBatches = Math.ceil(uniqueSpecs.length / BATCH_SIZE);
      const specBar = new BatchProgressBar(specBatches, BATCH_SIZE, 'catalog_specs');
      let specInserted = 0;
      batchNum = 0;

      for (let i = 0; i < uniqueSpecs.length; i += BATCH_SIZE) {
        const batch = uniqueSpecs.slice(i, i + BATCH_SIZE);
        batchNum++;
        specBar.updateBatch(batchNum, batch.length);

        const vals = [], params = [];
        let p = 1;
        for (const s of batch) {
          vals.push(`($${p++},$${p++},$${p++})`);
          params.push(s.product_id, s.attribute, s.value);
        }
        const res = await client.query(`
          INSERT INTO catalog_specs (product_id, attribute, value)
          VALUES ${vals.join(',')}
          ON CONFLICT (product_id, attribute, value) DO NOTHING
        `, params);
        specInserted += res.rowCount ?? 0;
      }
      specBar.finish();
      console.log(`  ✅ catalog_specs: ${specInserted} rows inserted`);
    } else {
      console.log('\nStep 2: No ProductAttribute blocks found in any file — catalog_specs unchanged');
      console.log('  (This is normal if none of your brands use the PIES ProductAttributes block)');
    }

    // ── 3. Insert catalog_media images ──────────────────────────────────────
    if (imageRows.length > 0) {
      console.log('\nStep 3: Inserting catalog_media images...');
      const imgBatches = Math.ceil(imageRows.length / BATCH_SIZE);
      const imgBar = new BatchProgressBar(imgBatches, BATCH_SIZE, 'catalog_media');
      let imgInserted = 0;
      batchNum = 0;

      for (let i = 0; i < imageRows.length; i += BATCH_SIZE) {
        const batch = imageRows.slice(i, i + BATCH_SIZE);
        batchNum++;
        imgBar.updateBatch(batchNum, batch.length);

        const vals = [], params = [];
        let p = 1;
        for (const img of batch) {
          vals.push(`($${p++},'image',$${p++})`);
          params.push(img.product_id, img.url);
        }
        const res = await client.query(`
          INSERT INTO catalog_media (product_id, media_type, url)
          VALUES ${vals.join(',')}
          ON CONFLICT (product_id, url) DO NOTHING
        `, params);
        imgInserted += res.rowCount ?? 0;
      }
      imgBar.finish();
      console.log(`  ✅ catalog_media: ${imgInserted} new images inserted`);
    }

    // ── 4. Backfill catalog_unified from updated pu_brand_enrichment ────────
    console.log('\nStep 4: Backfilling catalog_unified from pu_brand_enrichment...');

    const cuFeatures = await client.query(`
      UPDATE catalog_unified cu
      SET features = pbe.features,
          updated_at = NOW()
      FROM pu_brand_enrichment pbe
      WHERE (cu.sku = pbe.sku OR REPLACE(cu.sku,'-','') = REPLACE(pbe.sku,'-',''))
        AND cu.source_vendor = 'PU'
        AND (cu.features IS NULL OR array_length(cu.features,1) IS NULL)
        AND array_length(pbe.features,1) > 0
    `);
    console.log(`  features:          ${cuFeatures.rowCount} rows`);

    const cuDims = await client.query(`
      UPDATE catalog_unified cu
      SET weight    = COALESCE(NULLIF(cu.weight,0),    pbe.weight),
          height_in = COALESCE(NULLIF(cu.height_in,0), COALESCE(pbe.merch_h, pbe.ship_h)),
          length_in = COALESCE(NULLIF(cu.length_in,0), COALESCE(pbe.merch_l, pbe.ship_l)),
          width_in  = COALESCE(NULLIF(cu.width_in,0),  COALESCE(pbe.merch_w, pbe.ship_w)),
          updated_at = NOW()
      FROM pu_brand_enrichment pbe
      WHERE (cu.sku = pbe.sku OR REPLACE(cu.sku,'-','') = REPLACE(pbe.sku,'-',''))
        AND cu.source_vendor = 'PU'
        AND (pbe.weight > 0 OR pbe.merch_h > 0)
    `);
    console.log(`  dimensions:        ${cuDims.rowCount} rows`);

    const cuCountry = await client.query(`
      UPDATE catalog_unified cu
      SET country_of_origin = pbe.country_of_origin
      FROM pu_brand_enrichment pbe
      WHERE (cu.sku = pbe.sku OR REPLACE(cu.sku,'-','') = REPLACE(pbe.sku,'-',''))
        AND cu.source_vendor = 'PU'
        AND (cu.country_of_origin IS NULL OR cu.country_of_origin = '')
        AND pbe.country_of_origin IS NOT NULL
        AND pbe.country_of_origin != ''
    `);
    console.log(`  country_of_origin: ${cuCountry.rowCount} rows`);

    // ── 5. Final summary ────────────────────────────────────────────────────
    console.log('\n📊 Final coverage (PU products in catalog_unified):');
    const { rows: [cov] } = await client.query(`
      SELECT
        COUNT(*) AS total_pu,
        COUNT(CASE WHEN features IS NOT NULL AND array_length(features,1) > 0 THEN 1 END) AS has_features,
        COUNT(CASE WHEN weight > 0 THEN 1 END) AS has_weight,
        COUNT(CASE WHEN height_in > 0 THEN 1 END) AS has_dims,
        COUNT(CASE WHEN oem_part_number IS NOT NULL THEN 1 END) AS has_oem
      FROM catalog_unified WHERE source_vendor = 'PU'
    `);
    console.table([cov]);

    const { rows: [specCov] } = await client.query(`
      SELECT COUNT(DISTINCT cs.product_id) AS products_with_specs,
             COUNT(*) AS total_spec_rows
      FROM catalog_specs cs
      JOIN catalog_products cp ON cp.id = cs.product_id
      WHERE cp.source_vendor = 'pu'
    `);
    console.table([specCov]);

    console.log('\n✅ import_pu_brand_xml complete');
    console.log('\n⚠️  Run reindex to pick up all changes:');
    console.log('   npx dotenv -e .env.local -- node -e "import(\'./scripts/ingest/index_unified.js\').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
