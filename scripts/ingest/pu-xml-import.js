require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });
const { Pool }  = require('pg');
const fs        = require('fs');
const path      = require('path');
const { DOMParser } = require('@xmldom/xmldom');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── Directories to scan ───────────────────────────────────────
const XML_DIRS = [
  path.resolve(__dirname, '../../data/pu'),
  path.resolve(__dirname, 'pu-extracted'),
];

// ── Stats ─────────────────────────────────────────────────────
const stats = {
  filesProcessed: 0,
  partsFound:     0,
  descUpdated:    0,
  imgInserted:    0,
  noMatch:        0,
  failed:         0,
};

// ── XML helpers ───────────────────────────────────────────────
function getText(node, tag) {
  if (!node) return null;
  const els = node.getElementsByTagName(tag);
  if (!els || els.length === 0) return null;
  const val = els[0].textContent?.trim();
  return val && val.length > 0 ? val : null;
}

function getAllText(node, tag) {
  if (!node) return [];
  const els = node.getElementsByTagName(tag);
  const results = [];
  for (let i = 0; i < els.length; i++) {
    const val = els[i].textContent?.trim();
    if (val && val.length > 0) results.push(val);
  }
  return results;
}

// ── Parse PIES XML ────────────────────────────────────────────
// Fields: PartNumber, Descriptions (TLE=title, FAB=feature bullets), Packages (dimensions/weight), DigitalAssets
function parsePIES(xmlStr) {
  const doc   = new DOMParser().parseFromString(xmlStr, 'text/xml');
  const items = doc.getElementsByTagName('Item');
  const parts = [];

  for (let i = 0; i < items.length; i++) {
    const item      = items[i];
    const partNum   = getText(item, 'PartNumber');
    if (!partNum) continue;

    // Descriptions — TLE = short title, FAB = feature bullets
    const descEls = item.getElementsByTagName('Description');
    let   title   = null;
    const bullets = [];
    for (let d = 0; d < descEls.length; d++) {
      const code = descEls[d].getAttribute('DescriptionCode');
      const val  = descEls[d].textContent?.trim();
      if (!val) continue;
      if (code === 'TLE') title = val;
      if (code === 'FAB') bullets.push(val);
    }

    // Dimensions + weight
    const weight = getText(item, 'Weight');
    const height = getText(item, 'MerchandisingHeight') || getText(item, 'ShippingHeight');
    const width  = getText(item, 'MerchandisingWidth')  || getText(item, 'ShippingWidth');
    const length = getText(item, 'MerchandisingLength') || getText(item, 'ShippingLength');

    // Digital assets — image URLs (skip ZIPs)
    const assetEls = item.getElementsByTagName('DigitalFileInformation');
    const images   = [];
    for (let a = 0; a < assetEls.length; a++) {
      const uri      = getText(assetEls[a], 'URI');
      const fileName = getText(assetEls[a], 'FileName') || '';
      if (uri && !fileName.toLowerCase().endsWith('.zip')) {
        images.push(uri);
      }
    }

    const description = bullets.length > 0
      ? bullets.join('\n')
      : title || null;

    parts.push({
      partNumber: partNum.replace(/-/g, '').toUpperCase(),
      punctuatedPartNumber: partNum,
      description,
      title,
      bullets,
      images,
      weight:     weight ? parseFloat(weight) : null,
      dimensions: (height || width || length) ? { height, width, length } : null,
    });
  }
  return parts;
}

// ── Parse Catalog Content XML ─────────────────────────────────
// Fields: partNumber, punctuatedPartNumber, partImage, productImage, bullet1-24, productName
function parseCatalogContent(xmlStr) {
  const doc   = new DOMParser().parseFromString(xmlStr, 'text/xml');
  const parts = doc.getElementsByTagName('part');
  const result = [];

  for (let i = 0; i < parts.length; i++) {
    const part    = parts[i];
    const partNum = getText(part, 'partNumber');
    const punctPN = getText(part, 'punctuatedPartNumber');
    if (!partNum && !punctPN) continue;

    // Collect non-empty bullets
    const bullets = [];
    for (let b = 1; b <= 24; b++) {
      const bullet = getText(part, `bullet${b}`);
      if (bullet) bullets.push(bullet);
    }

    // Images
    const images = [];
    const productImage = getText(part, 'productImage');
    const partImage    = getText(part, 'partImage');
    if (productImage && !productImage.toLowerCase().endsWith('.zip')) images.push(productImage);
    if (partImage && partImage !== productImage && !partImage.toLowerCase().endsWith('.zip')) images.push(partImage);

    const description = bullets.length > 0 ? bullets.join('\n') : null;
    const productName = getText(part, 'productName');
    const msrp        = getText(part, 'baseRetailPrice') || getText(part, 'originalRetailPrice');
    const cost        = getText(part, 'yourDealerPrice') || getText(part, 'baseDealerPrice');

    result.push({
      partNumber:          (partNum || '').replace(/-/g, '').toUpperCase(),
      punctuatedPartNumber: punctPN || partNum,
      description,
      bullets,
      images,
      productName,
      msrp:  msrp  ? parseFloat(msrp)  : null,
      cost:  cost  ? parseFloat(cost)   : null,
    });
  }
  return result;
}

// ── Parse Parts Info XML ──────────────────────────────────────
// Fields: partNumber, punctuatedPartNumber, partImage — minimal content
function parsePartsInfo(xmlStr) {
  const doc   = new DOMParser().parseFromString(xmlStr, 'text/xml');
  const parts = doc.getElementsByTagName('part');
  const result = [];

  for (let i = 0; i < parts.length; i++) {
    const part    = parts[i];
    const partNum = getText(part, 'partNumber');
    const punctPN = getText(part, 'punctuatedPartNumber');
    if (!partNum && !punctPN) continue;

    const images = [];
    const partImage = getText(part, 'partImage');
    if (partImage && !partImage.toLowerCase().endsWith('.zip')) images.push(partImage);

    result.push({
      partNumber:           (partNum || '').replace(/-/g, '').toUpperCase(),
      punctuatedPartNumber: punctPN || partNum,
      description:          null,
      bullets:              [],
      images,
    });
  }
  return result;
}

// ── Detect file type and parse ────────────────────────────────
function parseXmlFile(filePath) {
  const xmlStr   = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);

  if (fileName.includes('PIES')) return { type: 'pies',    parts: parsePIES(xmlStr) };
  if (fileName.includes('Catalog')) return { type: 'catalog', parts: parseCatalogContent(xmlStr) };
  if (fileName.includes('Parts_Info') || fileName.includes('Parts-Info')) return { type: 'parts_info', parts: parsePartsInfo(xmlStr) };

  // Try to auto-detect from content
  if (xmlStr.includes('<PIES') || xmlStr.includes('<Item MaintenanceType')) return { type: 'pies', parts: parsePIES(xmlStr) };
  if (xmlStr.includes('<bullet1>')) return { type: 'catalog', parts: parseCatalogContent(xmlStr) };
  return { type: 'parts_info', parts: parsePartsInfo(xmlStr) };
}

// ── Find all XML files recursively ───────────────────────────
function findXmlFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) { console.log(`  ⚠️  Directory not found: ${dir}`); continue; }
    const walk = (d) => {
      for (const entry of fs.readdirSync(d)) {
        const full = path.join(d, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full);
        else if (entry.endsWith('.xml')) files.push(full);
      }
    };
    walk(dir);
  }
  return files;
}

// ── Build SKU lookup from DB ──────────────────────────────────
async function buildSkuLookup(client) {
  // Map both punctuated (0151-0012) and non-punctuated (01510012) to catalog_product_id
  const { rows } = await client.query(`
    SELECT
      cp.id,
      cp.sku,
      cp.manufacturer_part_number,
      vo.vendor_part_number
    FROM public.catalog_products cp
    JOIN public.vendor_offers vo ON vo.catalog_product_id = cp.id
    WHERE vo.vendor_code = 'pu'
  `);

  const map = {};
  for (const row of rows) {
    // Index by multiple key formats
    if (row.sku)                     map[row.sku.toUpperCase()]                              = row.id;
    if (row.manufacturer_part_number) map[row.manufacturer_part_number.toUpperCase()]        = row.id;
    if (row.vendor_part_number)      map[row.vendor_part_number.toUpperCase()]               = row.id;
    // Also index without dashes
    if (row.sku)                     map[row.sku.replace(/-/g,'').toUpperCase()]             = row.id;
    if (row.vendor_part_number)      map[row.vendor_part_number.replace(/-/g,'').toUpperCase()] = row.id;
  }
  return map;
}

// ── Upsert description + images for a catalog product ────────
async function upsertProduct(client, catalogId, part, skuLookup) {
  // Update description only if missing
  if (part.description) {
    await client.query(`
      UPDATE public.catalog_products
      SET description = $1, updated_at = NOW()
      WHERE id = $2 AND (description IS NULL OR description = '')
    `, [part.description, catalogId]);
    stats.descUpdated++;
  }

  // Insert images into catalog_media
  for (let i = 0; i < part.images.length; i++) {
    const url = part.images[i];
    if (!url || url.toLowerCase().endsWith('.zip')) continue;
    try {
      await client.query(`
        INSERT INTO public.catalog_media (product_id, url, media_type, priority)
        VALUES ($1, $2, 'image', $3)
        ON CONFLICT DO NOTHING
      `, [catalogId, url, i]);
      stats.imgInserted++;
    } catch (_) {}
  }
}

// ── MAIN ──────────────────────────────────────────────────────
async function run() {
  // Check xmldom is installed
  try { require('@xmldom/xmldom'); } catch {
    console.error('❌  Missing dependency. Run: npm install @xmldom/xmldom');
    process.exit(1);
  }

  const client = await pool.connect();
  console.log('▶  PU XML Unified Import\n');

  // Find all XML files
  const xmlFiles = findXmlFiles(XML_DIRS);
  console.log(`   Found ${xmlFiles.length} XML files across all directories\n`);

  // Build SKU lookup
  console.log('   Building SKU → catalog_product_id lookup...');
  const skuLookup = await buildSkuLookup(client);
  console.log(`   Loaded ${Object.keys(skuLookup).length.toLocaleString()} PU SKU mappings\n`);

  // Process each file
  for (const filePath of xmlFiles) {
    const relPath = filePath.replace(path.resolve(__dirname, '../..'), '');
    try {
      const { type, parts } = parseXmlFile(filePath);
      stats.filesProcessed++;
      stats.partsFound += parts.length;

      let fileUpdated = 0;
      for (const part of parts) {
        // Try to find catalog product
        const catalogId =
          skuLookup[part.punctuatedPartNumber?.toUpperCase()] ||
          skuLookup[part.partNumber?.toUpperCase()] ||
          skuLookup[part.punctuatedPartNumber?.replace(/-/g,'').toUpperCase()] ||
          null;

        if (!catalogId) { stats.noMatch++; continue; }

        await upsertProduct(client, catalogId, part, skuLookup);
        fileUpdated++;
      }

      process.stdout.write(`\r  [${type.padEnd(10)}] ${relPath.slice(-60).padEnd(60)} — ${parts.length} parts, ${fileUpdated} matched`);
      console.log(); // newline after each file
    } catch (err) {
      stats.failed++;
      console.error(`\n  ❌  ${relPath}: ${err.message}`);
    }
  }

  console.log('\n\n✅  PU XML import complete!');
  console.log(`   Files processed:  ${stats.filesProcessed}`);
  console.log(`   Parts found:      ${stats.partsFound.toLocaleString()}`);
  console.log(`   Descriptions set: ${stats.descUpdated.toLocaleString()}`);
  console.log(`   Images inserted:  ${stats.imgInserted.toLocaleString()}`);
  console.log(`   No DB match:      ${stats.noMatch.toLocaleString()}`);
  console.log(`   File errors:      ${stats.failed}`);

  // Final DB summary
  const { rows: [summary] } = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') AS with_desc,
      COUNT(*) AS total
    FROM public.catalog_products
    WHERE is_active = true
  `);
  const pct = Math.round(Number(summary.with_desc) / Number(summary.total) * 100);
  console.log(`\n   DB: ${Number(summary.with_desc).toLocaleString()} / ${Number(summary.total).toLocaleString()} active products have descriptions (${pct}%)`);

  const { rows: [imgSummary] } = await client.query(`
    SELECT COUNT(*) AS total FROM public.catalog_images
  `);
  console.log(`   DB: ${Number(imgSummary.total).toLocaleString()} total images in catalog_images`);

  client.release();
  await pool.end();
}

run().catch(err => {
  console.error('❌  Fatal:', err.message);
  process.exit(1);
});
