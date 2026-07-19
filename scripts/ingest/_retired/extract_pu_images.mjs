/**
 * extract_pu_images.mjs
 * Parses PU brand XML files and populates:
 *   1. catalog_media       — all image URLs per product (multi-angle)
 *   2. catalog_unified     — product_details.features from FAB bullets (PIES)
 *                          — product_details.description from partDescription (Catalog_Content)
 *   3. catalog_oem_crossref — OSP supplier/OEM part numbers (PIES)
 *
 * Usage:
 *   node scripts/ingest/extract_pu_images.mjs             # dry run
 *   node scripts/ingest/extract_pu_images.mjs --apply     # write to DB
 *
 * Requires: npm install fast-xml-parser
 */

import fs   from 'fs';
import path from 'path';
import pg   from 'pg';
import { XMLParser } from 'fast-xml-parser';

const { Pool } = pg;
const APPLY       = process.argv.includes('--apply');
const LEMANS_BASE = 'http://asset.lemansnet.com/z/';
const XML_DIR     = 'scripts/data/pu_pricefile/brand_files';

const db = new Pool({
  connectionString:
    process.env.CATALOG_DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

// ── URL helpers ───────────────────────────────────────────────────────────────

function expandPartImageUrl(url) {
  if (!url?.startsWith(LEMANS_BASE)) return [url].filter(Boolean);
  const decoded = Buffer.from(url.slice(LEMANS_BASE.length), 'base64').toString('utf8');
  return decoded.split(',').map(p => p.trim()).filter(Boolean)
    .map(p => LEMANS_BASE + Buffer.from(p).toString('base64'));
}

// ── PIES parser ───────────────────────────────────────────────────────────────
// Returns Map<sku, { urls, features, ospNumbers }>

function parsePies(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix:   true,
    isArray: n => ['Item', 'DigitalAssets', 'Description', 'ExtendedProductInformation'].includes(n),
  });
  const doc   = parser.parse(xmlText);
  const root  = doc?.PIES || doc?.pies || Object.values(doc)[0];
  const items = root?.Items?.Item ?? [];

  const result = new Map();
  for (const part of items) {
    const sku = part?.PartNumber?.toString().trim().replace(/-/g, '');
    if (!sku) continue;

    // Images
    const assets = Array.isArray(part?.DigitalAssets) ? part.DigitalAssets : [];
    const urls = assets
      .map(a => a?.DigitalFileInformation?.URI?.toString().trim())
      .filter(u => u?.startsWith(LEMANS_BASE));

    // FAB bullets → features
    const descriptions = Array.isArray(part?.Descriptions?.Description)
      ? part.Descriptions.Description : [];
    const features = descriptions
      .filter(d => d?.['@_DescriptionCode'] === 'FAB')
      .sort((a, b) => Number(a?.['@_Sequence'] ?? 0) - Number(b?.['@_Sequence'] ?? 0))
      .map(d => (d?.['#text'] ?? d)?.toString().trim())
      .filter(Boolean);

    // OSP → OEM/supplier cross-reference numbers
    const extInfo = Array.isArray(part?.ExtendedInformation?.ExtendedProductInformation)
      ? part.ExtendedInformation.ExtendedProductInformation : [];
    const ospNumbers = extInfo
      .filter(e => e?.['@_EXPICode'] === 'OSP')
      .map(e => (e?.['#text'] ?? e)?.toString().trim())
      .filter(Boolean);

    if (urls.length || features.length || ospNumbers.length) {
      result.set(sku, { urls, features, ospNumbers });
    }
  }
  return result;
}

// ── Catalog_Content parser ────────────────────────────────────────────────────
// Returns Map<sku, { urls, description }>

function parseCatalogContent(xmlText) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc    = parser.parse(xmlText);
  const parts  = doc?.root?.part ?? [];
  const arr    = Array.isArray(parts) ? parts : [parts];

  const result = new Map();
  for (const part of arr) {
    const sku = (part?.partNumber || part?.punctuatedPartNumber)?.toString().trim();
    if (!sku) continue;

    const urls = [];
    const primary  = part?.productImage?.toString().trim();
    const compound = part?.partImage?.toString().trim();
    if (primary?.startsWith(LEMANS_BASE))  urls.push(primary);
    if (compound?.startsWith(LEMANS_BASE)) {
      for (const u of expandPartImageUrl(compound)) {
        if (!urls.includes(u)) urls.push(u);
      }
    }

    // Description from partDescription (not productName — that's the title)
    const description = part?.partDescription?.toString().trim() || null;

    if (urls.length > 1 || description) {
      result.set(sku, { urls, description });
    }
  }
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== PU Enrichment Extraction (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`);

  // Load PU vendor_sku → { id, internal_sku } map (no-dash normalized)
  console.log('Loading PU product map...');
  const { rows: puRows } = await db.query(`
    SELECT id, vendor_sku, internal_sku
    FROM catalog_unified
    WHERE source_vendor = 'PU' AND is_active = true AND vendor_sku IS NOT NULL
  `);
  const skuToProduct = new Map();
  for (const r of puRows) {
    const plain  = r.vendor_sku.trim();
    const noDash = plain.replace(/-/g, '');
    const val    = { id: r.id, internal_sku: r.internal_sku };
    skuToProduct.set(plain,  val);
    if (noDash !== plain) skuToProduct.set(noDash, val);
  }
  console.log(`  ${skuToProduct.size.toLocaleString()} PU SKU entries\n`);

  // Existing catalog_media
  const { rows: existingMedia } = await db.query(
    `SELECT product_id, url FROM catalog_media WHERE media_type = 'image'`
  );
  const existingMediaSet = new Set(existingMedia.map(r => `${r.product_id}::${r.url}`));

  // Products that already have features in product_details
  const { rows: hasFeatures } = await db.query(`
    SELECT id FROM catalog_unified
    WHERE source_vendor = 'PU'
      AND product_details IS NOT NULL
      AND jsonb_array_length(COALESCE(product_details->'features', '[]'::jsonb)) > 0
  `);
  const hasFeatureSet = new Set(hasFeatures.map(r => r.id));

  // Products that already have description in product_details
  const { rows: hasDesc } = await db.query(`
    SELECT id FROM catalog_unified
    WHERE source_vendor = 'PU'
      AND product_details IS NOT NULL
      AND product_details->>'description' IS NOT NULL
      AND product_details->>'description' != ''
  `);
  const hasDescSet = new Set(hasDesc.map(r => r.id));

  // Existing OEM crossref entries
  const { rows: existingOem } = await db.query(`
    SELECT product_id, oem_number FROM catalog_oem_crossref WHERE source = 'PU_PIES'
  `);
  const existingOemSet = new Set(existingOem.map(r => `${r.product_id}::${r.oem_number}`));

  // Parse XML files
  const files  = fs.readdirSync(XML_DIR).filter(f => f.endsWith('.xml'));
  console.log(`Parsing ${files.length} XML files...\n`);

  const imageInserts   = [];   // { productId, url, priority }
  const featureUpdates = [];   // { id, features[] }
  const descUpdates    = [];   // { id, description }
  const oemInserts     = [];   // { productId, internalSku, oemNumber }

  for (const file of files) {
    const xmlText = fs.readFileSync(path.join(XML_DIR, file), 'utf8');
    const isPies  = file.includes('PIES');
    let parsed;
    try {
      parsed = isPies ? parsePies(xmlText) : parseCatalogContent(xmlText);
    } catch (err) {
      console.warn(`  ⚠️  ${file}: ${err.message}`);
      continue;
    }

    let matched = 0;
    for (const [sku, data] of parsed) {
      const product = skuToProduct.get(sku);
      if (!product) continue;
      matched++;
      const { id, internal_sku } = product;

      // Images
      const urls = data.urls ?? [];
      for (let i = 0; i < urls.length; i++) {
        if (!existingMediaSet.has(`${id}::${urls[i]}`)) {
          imageInserts.push({ productId: id, url: urls[i], priority: i });
          existingMediaSet.add(`${id}::${urls[i]}`);
        }
      }

      // Features (PIES only, skip if already has features)
      if (isPies && data.features?.length && !hasFeatureSet.has(id)) {
        featureUpdates.push({ id, features: data.features });
        hasFeatureSet.add(id); // prevent duplicates across files
      }

      // Description (Catalog_Content only, skip if already has description)
      if (!isPies && data.description && !hasDescSet.has(id)) {
        descUpdates.push({ id, description: data.description });
        hasDescSet.add(id);
      }

      // OSP → OEM crossref (PIES only)
      if (isPies && data.ospNumbers?.length && internal_sku) {
        for (const oem of data.ospNumbers) {
          if (!existingOemSet.has(`${id}::${oem}`)) {
            oemInserts.push({ productId: id, internalSku: internal_sku, oemNumber: oem });
            existingOemSet.add(`${id}::${oem}`);
          }
        }
      }
    }

    if (parsed.size > 0 || matched > 0) {
      console.log(`  ${file.padEnd(55)} ${parsed.size} parts, ${matched} matched`);
    } else {
      process.stdout.write('.');
    }
  }

  console.log('\n');
  console.log(`Images to insert:      ${imageInserts.length.toLocaleString()}`);
  console.log(`Feature updates:       ${featureUpdates.length.toLocaleString()} products`);
  console.log(`Description updates:   ${descUpdates.length.toLocaleString()} products`);
  console.log(`OEM crossref inserts:  ${oemInserts.length.toLocaleString()}`);

  if (!APPLY) {
    // Sample features
    const sample = featureUpdates.slice(0, 2);
    if (sample.length) {
      console.log('\nSample features:');
      for (const f of sample) {
        console.log(`  product_id=${f.id}: ${f.features.slice(0, 2).join(' | ')}`);
      }
    }
    // Sample OEM
    const oemSample = oemInserts.slice(0, 3);
    if (oemSample.length) {
      console.log('\nSample OEM crossref:');
      for (const o of oemSample) {
        console.log(`  product_id=${o.productId} sku=${o.internalSku} oem=${o.oemNumber}`);
      }
    }
    console.log('\nDry run — pass --apply to write.');
    await db.end();
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const BATCH = 500;

    // 1. Images
    if (imageInserts.length) {
      process.stdout.write('Inserting images... ');
      let inserted = 0;
      for (let i = 0; i < imageInserts.length; i += BATCH) {
        const batch = imageInserts.slice(i, i + BATCH);
        const vals  = batch.map((_, j) => `($${j*3+1},$${j*3+2},'image',$${j*3+3})`).join(',');
        const flat  = batch.flatMap(r => [r.productId, r.url, r.priority]);
        const res   = await client.query(
          `INSERT INTO catalog_media (product_id, url, media_type, priority) VALUES ${vals} ON CONFLICT DO NOTHING`, flat
        );
        inserted += res.rowCount ?? 0;
      }
      console.log(`${inserted.toLocaleString()} rows ✅`);
    }

    // 2. Features → product_details
    if (featureUpdates.length) {
      process.stdout.write('Updating features... ');
      let updated = 0;
      for (let i = 0; i < featureUpdates.length; i += BATCH) {
        const batch = featureUpdates.slice(i, i + BATCH);
        for (const { id, features } of batch) {
          const res = await client.query(`
            UPDATE catalog_unified
            SET product_details = COALESCE(product_details, '{}'::jsonb)
              || jsonb_build_object('features', $2::text[])
            WHERE id = $1
              AND (product_details IS NULL
                OR jsonb_array_length(COALESCE(product_details->'features','[]'::jsonb)) = 0)
          `, [id, features]);
          updated += res.rowCount ?? 0;
        }
        process.stdout.write(`\rUpdating features... ${Math.min(i+BATCH, featureUpdates.length)}/${featureUpdates.length}`);
      }
      console.log(`\rUpdating features... ${updated.toLocaleString()} rows ✅             `);
    }

    // 3. Descriptions → product_details
    if (descUpdates.length) {
      process.stdout.write('Updating descriptions... ');
      let updated = 0;
      for (let i = 0; i < descUpdates.length; i += BATCH) {
        const batch = descUpdates.slice(i, i + BATCH);
        for (const { id, description } of batch) {
          const res = await client.query(`
            UPDATE catalog_unified
            SET product_details = COALESCE(product_details, '{}'::jsonb)
              || jsonb_build_object('description', $2::text)
            WHERE id = $1
              AND (product_details IS NULL
                OR product_details->>'description' IS NULL
                OR product_details->>'description' = '')
          `, [id, description]);
          updated += res.rowCount ?? 0;
        }
      }
      console.log(`${updated.toLocaleString()} rows ✅`);
    }

    // 4. OEM crossref
    if (oemInserts.length) {
      process.stdout.write('Inserting OEM crossref... ');
      let inserted = 0;
      for (let i = 0; i < oemInserts.length; i += BATCH) {
        const batch = oemInserts.slice(i, i + BATCH);
        const vals  = batch.map((_, j) => `($${j*3+1},$${j*3+2},$${j*3+3},'PU_PIES')`).join(',');
        const flat  = batch.flatMap(r => [r.internalSku, r.oemNumber, r.productId]);
        const res   = await client.query(`
          INSERT INTO catalog_oem_crossref (sku, oem_number, product_id, source)
          VALUES ${vals} ON CONFLICT (sku, oem_number) DO NOTHING
        `, flat);
        inserted += res.rowCount ?? 0;
      }
      console.log(`${inserted.toLocaleString()} rows ✅`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Done. Run index_unified.js to reindex.\n');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await db.end();
}

main().catch(err => { console.error('❌', err); process.exit(1); });
