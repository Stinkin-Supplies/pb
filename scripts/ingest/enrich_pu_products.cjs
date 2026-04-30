#!/usr/bin/env node
/**
 * enrich_pu_products.js
 *
 * Parses all PU XML files (Catalog Content + PIES) and upserts into pu_products:
 *   - part_image, product_image, special_instructions, supplier_number
 *
 * Then syncs to catalog_unified:
 *   - image_url  ← part_image (only if currently null/empty)
 *   - image_urls ← [part_image, product_image] deduped
 *
 * Usage:
 *   export DATABASE_URL=postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog
 *   node enrich_pu_products.js /path/to/xml/dir
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Install deps if needed
try { require.resolve('fast-xml-parser'); require.resolve('pg'); }
catch { execSync('npm install fast-xml-parser pg', { stdio: 'inherit' }); }

const { XMLParser } = require('fast-xml-parser');
const { Pool } = require('pg');

const XML_DIR = process.argv[2];
if (!XML_DIR) { console.error('Usage: node enrich_pu_products.js <xml_dir>'); process.exit(1); }

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('Set DATABASE_URL env var'); process.exit(1); }

const pool = new Pool({ connectionString: DATABASE_URL });

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['Item', 'part', 'Description', 'DigitalFileInformation'].includes(name),
  trimValues: true,
});

function nonEmpty(v) {
  return v != null && String(v).trim() !== '';
}

function dedupeImages(a, b) {
  const urls = [];
  if (nonEmpty(a)) urls.push(String(a).trim());
  if (nonEmpty(b) && String(b).trim() !== urls[0]) urls.push(String(b).trim());
  return urls;
}

// ─── Catalog Content parser ───────────────────────────────────────────────────
function parseCatalogContent(xml) {
  const parsed = parser.parse(xml);
  const parts = parsed?.root?.part || [];
  const results = [];

  for (const part of parts) {
    const rawSku = String(part.partNumber || '').trim();
    const punctuated = String(part.punctuatedPartNumber || '').trim();
    if (!rawSku && !punctuated) continue;

    // Normalize: strip all non-alphanumeric for matching
    const sku = rawSku.replace(/[^A-Za-z0-9]/g, '') || punctuated.replace(/[^A-Za-z0-9]/g, '');

    const partImage = nonEmpty(part.partImage) ? String(part.partImage).trim() : null;
    const productImage = nonEmpty(part.productImage) ? String(part.productImage).trim() : null;
    const imageUrls = dedupeImages(partImage, productImage);

    results.push({
      sku,
      punctuated,
      part_image: partImage,
      product_image: productImage,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      special_instructions: nonEmpty(part.specialInstructions) ? String(part.specialInstructions).trim() : null,
      supplier_number: nonEmpty(part.supplierNumber) ? String(part.supplierNumber).trim() : null,
    });
  }
  return results;
}

// ─── PIES parser ──────────────────────────────────────────────────────────────
function parsePIES(xml) {
  const parsed = parser.parse(xml);
  const items = parsed?.PIES?.Items?.Item || [];
  const results = [];

  for (const item of items) {
    const sku = String(item.PartNumber || '').replace(/[^A-Za-z0-9]/g, '');
    if (!sku) continue;

    const assets = item.DigitalAssets?.DigitalFileInformation || [];
    const imageAsset = assets.find(a => nonEmpty(a.URI));
    const partImage = imageAsset ? String(imageAsset.URI).trim() : null;

    results.push({
      sku,
      punctuated: null,
      part_image: partImage,
      product_image: null,
      image_url: partImage,
      image_urls: partImage ? [partImage] : [],
      special_instructions: null,
      supplier_number: null,
    });
  }
  return results;
}

// ─── Bulk upsert pu_products ──────────────────────────────────────────────────
async function upsertBatch(rows) {
  if (!rows.length) return 0;
  const client = await pool.connect();
  let count = 0;
  try {
    for (const r of rows) {
      // Match on normalized sku OR punctuated part number
      const res = await client.query(`
        UPDATE pu_products SET
          part_image           = COALESCE($1, part_image),
          product_image        = COALESCE($2, product_image),
          special_instructions = COALESCE($3, special_instructions),
          supplier_number      = COALESCE($4, supplier_number)
        WHERE sku = $5
           OR sku = $6
        RETURNING id
      `, [
        r.part_image,
        r.product_image,
        r.special_instructions,
        r.supplier_number,
        r.sku,
        r.punctuated,
      ]);
      count += res.rowCount;
    }
  } finally {
    client.release();
  }
  return count;
}

// ─── Sync to catalog_unified ──────────────────────────────────────────────────
async function syncUnified() {
  console.log('\nSyncing image data to catalog_unified...');

  const res = await pool.query(`
    UPDATE catalog_unified cu
    SET
      image_url  = COALESCE(NULLIF(cu.image_url, ''), pp.part_image),
      image_urls = CASE
        WHEN pp.part_image IS NOT NULL AND pp.product_image IS NOT NULL
             AND pp.part_image != pp.product_image
          THEN ARRAY[pp.part_image, pp.product_image]
        WHEN pp.part_image IS NOT NULL
          THEN ARRAY[pp.part_image]
        ELSE cu.image_urls
      END
    FROM pu_products pp
    WHERE cu.source_vendor = 'PU'
      AND (
        cu.sku = pp.sku
        OR cu.sku = regexp_replace(pp.sku, '[^A-Za-z0-9]', '', 'g')
        OR cu.vendor_sku = pp.sku
      )
      AND (pp.part_image IS NOT NULL OR pp.product_image IS NOT NULL)
    RETURNING cu.id
  `);

  console.log(`  catalog_unified rows synced: ${res.rowCount}`);

  // Report image_urls coverage after sync
  const coverage = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE image_url IS NOT NULL AND image_url != '') AS has_image,
      COUNT(*) FILTER (WHERE array_length(image_urls, 1) > 1)           AS has_multi_image,
      COUNT(*)                                                           AS total
    FROM catalog_unified
    WHERE source_vendor = 'PU'
  `);
  const c = coverage.rows[0];
  console.log(`\n  PU image coverage after sync:`);
  console.log(`    image_url populated:  ${c.has_image} / ${c.total}`);
  console.log(`    image_urls (2+):      ${c.has_multi_image} / ${c.total}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const files = fs.readdirSync(XML_DIR)
    .filter(f => f.endsWith('.xml') && !f.startsWith('._') && !f.startsWith('.'));

  console.log(`Found ${files.length} XML files\n`);

  let totalParsed = 0;
  let totalUpdated = 0;
  let ccCount = 0;
  let piesCount = 0;
  const errors = [];

  for (const file of files) {
    const filePath = path.join(XML_DIR, file);
    let xml;
    try {
      xml = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      errors.push(`${file}: read error - ${e.message}`);
      continue;
    }

    let rows = [];
    const isCatalogContent = /catalog.?content/i.test(file) || xml.trimStart().startsWith('<root>');

    try {
      rows = isCatalogContent ? parseCatalogContent(xml) : parsePIES(xml);
      if (isCatalogContent) ccCount++; else piesCount++;
    } catch (e) {
      errors.push(`${file}: parse error - ${e.message}`);
      continue;
    }

    if (!rows.length) continue;

    let updated = 0;
    try {
      updated = await upsertBatch(rows);
    } catch (e) {
      errors.push(`${file}: db error - ${e.message}`);
      continue;
    }

    totalParsed += rows.length;
    totalUpdated += updated;

    const label = file
      .replace(/_?(PIES|Catalog_Content)_Export.*$/i, '')
      .replace(/-Brand$/i, '')
      .replace(/Brand$/i, '')
      .substring(0, 38);

    process.stdout.write(`  ${label.padEnd(40)} ${String(rows.length).padStart(5)} parsed  ${String(updated).padStart(5)} updated\n`);
  }

  console.log(`\n${'━'.repeat(60)}`);
  console.log(`Files: ${files.length}  (${ccCount} Catalog Content, ${piesCount} PIES)`);
  console.log(`Parsed:  ${totalParsed}`);
  console.log(`Updated: ${totalUpdated}`);

  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    errors.forEach(e => console.log(`  ${e}`));
  }

  await syncUnified();
  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
