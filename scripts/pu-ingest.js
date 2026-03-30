require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { XMLParser } = require('fast-xml-parser');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const ZIPS_DIR    = './pu-zips';
const EXTRACT_DIR = './pu-extracted';
const CHECKPOINT  = './pu-checkpoint.json';

function num(val) { const n = parseFloat(val); return isNaN(n) ? null : n; }

// ── Checkpoint ────────────────────────────────────────────────────────────────
function saveCheckpoint(data) { fs.writeFileSync(CHECKPOINT, JSON.stringify(data, null, 2)); }
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT)) {
    const d = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    console.log(`\n♻️  Resuming — completed: ${d.completedFiles.length} files | inserted: ${d.inserted}\n`);
    return d;
  }
  return { completedFiles: [], inserted: 0, failed: 0 };
}
function clearCheckpoint() { if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT); }

// ── Extract ZIPs ──────────────────────────────────────────────────────────────
function extractZips() {
  if (!fs.existsSync(EXTRACT_DIR)) fs.mkdirSync(EXTRACT_DIR, { recursive: true });
  const zips = fs.readdirSync(ZIPS_DIR).filter(f => f.endsWith('.zip'));
  if (zips.length === 0) { console.log('📦  No new ZIPs to extract\n'); return; }
  console.log(`📦  ${zips.length} ZIP files found\n`);
  for (const zip of zips) {
    const dest = path.join(EXTRACT_DIR, path.basename(zip, '.zip'));
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
      try {
        execSync(`unzip -q "${path.join(ZIPS_DIR, zip)}" -d "${dest}"`);
        console.log(`  ✅  ${zip}`);
      } catch (e) { console.error(`  ❌  ${zip}: ${e.message}`); }
    }
  }
  console.log('');
}

// ── Find XML files by name pattern ───────────────────────────────────────────
function findXMLFiles(namePattern) {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (entry.toLowerCase().endsWith('.xml') && full.includes(namePattern)) results.push(full);
    }
  }
  walk(EXTRACT_DIR);
  return results;
}

// ── Build bullet points array (skip empty) ───────────────────────────────────
function extractBullets(part) {
  const bullets = [];
  for (let i = 1; i <= 24; i++) {
    const val = part[`bullet${i}`];
    if (val && String(val).trim()) bullets.push(String(val).trim());
  }
  return bullets;
}

// ── Build images array from all available image fields ───────────────────────
function extractImages(part) {
  const images = [];
  if (part.productImage && String(part.productImage).trim()) {
    images.push({ url: String(part.productImage).trim(), primary: true, source: 'product' });
  }
  if (part.partImage && String(part.partImage).trim()) {
    images.push({ url: String(part.partImage).trim(), primary: images.length === 0, source: 'part' });
  }
  return images;
}

// ── Process Brand_Parts_Info_Export + Brand_Catalog_Content_Export XML ───────
async function processPartsFile(client, xmlPath) {
  const fileName = path.basename(xmlPath);
  const isCatalog = fileName.includes('Catalog_Content');
  console.log(`  📄  ${isCatalog ? 'Catalog' : 'Parts'}: ${fileName}`);

  const xml = fs.readFileSync(xmlPath, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
  const parsed = parser.parse(xml);

  const root = parsed.root ?? parsed.brandPartsInfoExport ?? parsed.BrandPartsInfoExport ?? parsed;
  const partsContainer = root.parts ?? root.Parts ?? root;
  let parts = partsContainer.part ?? partsContainer.Part ?? [];
  if (!Array.isArray(parts)) parts = [parts];

  let inserted = 0, failed = 0;

  for (const part of parts) {
    if (!part) continue;
    const partNumber = String(part.partNumber ?? part.PartNumber ?? '').trim();
    if (!partNumber) continue;

    const bullets = extractBullets(part);
    const images  = extractImages(part);

    try {
      await client.query(`
        INSERT INTO vendor.vendor_products (
          id, vendor_code,
          vendor_part_number, manufacturer_part_number,
          title, description_raw, brand,
          categories_raw, attributes_raw,
          msrp, map_price, wholesale_cost,
          images_raw, fitment_raw,
          status, unit_of_measurement,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(), 'pu',
          $1, $2, $3, $4, $5,
          $6::jsonb, $7::jsonb,
          $8, $9, $10,
          $11::jsonb, $12::jsonb,
          $13, $14,
          NOW(), NOW()
        )
        ON CONFLICT (vendor_part_number) DO UPDATE SET
          manufacturer_part_number = EXCLUDED.manufacturer_part_number,
          title                    = EXCLUDED.title,
          brand                    = EXCLUDED.brand,
          attributes_raw           = EXCLUDED.attributes_raw,
          msrp                     = EXCLUDED.msrp,
          map_price                = EXCLUDED.map_price,
          wholesale_cost           = EXCLUDED.wholesale_cost,
          images_raw               = CASE
            WHEN jsonb_array_length(EXCLUDED.images_raw) > jsonb_array_length(vendor.vendor_products.images_raw)
            THEN EXCLUDED.images_raw
            ELSE vendor.vendor_products.images_raw
          END,
          status                   = EXCLUDED.status,
          unit_of_measurement      = EXCLUDED.unit_of_measurement,
          updated_at               = NOW()
      `, [
        partNumber,                                                     // $1  vendor_part_number
        String(part.supplierNumber ?? part.SupplierNumber ?? partNumber).trim(), // $2  manufacturer_part_number
        String(part.partDescription ?? part.PartDescription ?? '').trim(),       // $3  title
        null,                                                           // $4  description_raw (in PIES)
        String(part.brandName ?? part.BrandName ?? '').trim() || null, // $5  brand
        JSON.stringify([]),                                             // $6  categories_raw
        JSON.stringify({                                                // $7  attributes_raw
          punctuated_part:      part.punctuatedPartNumber ?? null,
          unit_of_measure:      part.unitOfMeasure ?? null,
          special_instructions: part.specialInstructions ?? null,
          vendor_price_update:  part.vendorPriceUpdateDate ?? null,
          product_id:           part.productId ?? null,
          product_name:         part.productName ?? null,
          bullets:              bullets.length > 0 ? bullets : null,
        }),
        num(part.originalRetailPrice ?? part.baseRetailPrice),          // $8  msrp
        num(part.baseRetailPrice),                                      // $9  map_price
        num(part.yourDealerPrice ?? part.baseDealerPrice),              // $10 wholesale_cost
        JSON.stringify(images),                                         // $11 images_raw
        JSON.stringify([]),                                             // $12 fitment_raw
        String(part.partStatusDescription ?? '').trim() || null,        // $13 status
        String(part.unitOfMeasure ?? '').trim() || null,                // $14 unit_of_measurement
      ]);
      inserted++;
    } catch (err) {
      failed++;
      await client.query(
        `INSERT INTO vendor.vendor_error_log (id,vendor_code,vendor_part_number,error_type,error_message,created_at)
         VALUES (gen_random_uuid(),'pu',$1,'insert_failed',$2,NOW())`,
        [partNumber, err.message]
      ).catch(() => {});
    }
  }

  console.log(`     ✅  ${inserted} inserted/updated, ${failed} failed (${parts.length} total)`);
  return { inserted, failed };
}

// ── Process Brand_PIES_Export XML ─────────────────────────────────────────────
async function processPIESFile(client, xmlPath) {
  console.log(`  📄  PIES: ${path.basename(xmlPath)}`);
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: true,
    isArray: (name) => ['Item', 'Description', 'DigitalFileInformation', 'Package'].includes(name),
  });
  const parsed = parser.parse(xml);
  const items = parsed?.PIES?.Items?.Item ?? [];

  let updated = 0, failed = 0;

  for (const item of items) {
    if (!item) continue;
    const partNumber = String(item.PartNumber ?? '').trim();
    if (!partNumber) continue;

    try {
      const descs   = Array.isArray(item.Descriptions?.Description) ? item.Descriptions.Description : [item.Descriptions?.Description].filter(Boolean);
      const titleD  = descs.find(d => d['@_DescriptionCode'] === 'TLE');
      const longD   = descs.find(d => d['@_DescriptionCode'] === 'FAB');
      const title   = titleD ? String(titleD['#text'] ?? titleD).trim() : null;
      const longTxt = longD  ? String(longD['#text']  ?? longD).trim()  : null;

      const assets  = Array.isArray(item.DigitalAssets?.DigitalFileInformation) ? item.DigitalAssets.DigitalFileInformation : [item.DigitalAssets?.DigitalFileInformation].filter(Boolean);
      const images  = assets.filter(a => a?.URI).map(a => ({ url: String(a.URI).trim(), type: a.AssetType ?? null, source: 'pies' }));

      const pkgs    = Array.isArray(item.Packages?.Package) ? item.Packages.Package : [item.Packages?.Package].filter(Boolean);
      const pkg     = pkgs[0];
      const weight  = pkg ? num(pkg.Weights?.Weight) : null;
      const length  = pkg ? num(pkg.Dimensions?.ShippingLength ?? pkg.Dimensions?.MerchandisingLength) : null;
      const width   = pkg ? num(pkg.Dimensions?.ShippingWidth  ?? pkg.Dimensions?.MerchandisingWidth)  : null;
      const height  = pkg ? num(pkg.Dimensions?.ShippingHeight ?? pkg.Dimensions?.MerchandisingHeight) : null;

      const result = await client.query(`
        UPDATE vendor.vendor_products SET
          description_raw = COALESCE(NULLIF($2, ''), description_raw),
          title           = COALESCE(NULLIF($3, ''), title),
          images_raw      = CASE
            WHEN $4::jsonb != '[]'::jsonb
            THEN $4::jsonb || images_raw
            ELSE images_raw
          END,
          weight          = COALESCE($5, weight),
          length          = COALESCE($6, length),
          width           = COALESCE($7, width),
          height          = COALESCE($8, height),
          updated_at      = NOW()
        WHERE vendor_code = 'pu' AND vendor_part_number = $1
      `, [partNumber, longTxt, title, JSON.stringify(images), weight, length, width, height]);

      if (result.rowCount === 0) {
        await client.query(`
          INSERT INTO vendor.vendor_products
            (id, vendor_code, vendor_part_number, manufacturer_part_number,
             title, description_raw, brand,
             categories_raw, attributes_raw, images_raw, fitment_raw,
             weight, length, width, height, created_at, updated_at)
          VALUES
            (gen_random_uuid(), 'pu', $1, $1, $2, $3, $4,
             '[]'::jsonb, '{}'::jsonb, $5::jsonb, '[]'::jsonb,
             $6, $7, $8, $9, NOW(), NOW())
          ON CONFLICT (vendor_part_number) DO NOTHING
        `, [partNumber, title, longTxt, String(item.BrandLabel ?? '').trim() || null,
            JSON.stringify(images), weight, length, width, height]);
      }
      updated++;
    } catch (err) {
      failed++;
      await client.query(
        `INSERT INTO vendor.vendor_error_log (id,vendor_code,vendor_part_number,error_type,error_message,created_at)
         VALUES (gen_random_uuid(),'pu',$1,'pies_failed',$2,NOW())`,
        [partNumber, err.message]
      ).catch(() => {});
    }
  }

  console.log(`     ✅  ${updated} enriched with PIES data, ${failed} failed (${items.length} total)`);
  return { inserted: updated, failed };
}

// ── Log sync ──────────────────────────────────────────────────────────────────
async function logSync(client, stats) {
  await client.query(`
    INSERT INTO vendor.vendor_sync_log
      (id,vendor_code,sync_type,status,rows_inserted,rows_failed,started_at,completed_at,notes)
    VALUES (gen_random_uuid(),'pu','full_catalog',$1,$2,$3,$4,NOW(),$5)
  `, [stats.status, stats.inserted, stats.failed, stats.startedAt, stats.notes]);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  const startedAt = new Date();
  const checkpoint = loadCheckpoint();
  let totalInserted = checkpoint.inserted;
  let totalFailed   = checkpoint.failed;

  console.log('▶  Starting PU catalog ingestion...\n');
  extractZips();

  // Phase A: Parts Info + Catalog Content (both use same <root><part> schema)
  const partsFiles = [
    ...findXMLFiles('Brand_Parts_Info_Export'),
    ...findXMLFiles('Brand_Catalog_Content_Export'),
  ];
  console.log(`📋  Found ${partsFiles.length} Parts/Catalog XML files\n`);

  try {
    for (const xmlPath of partsFiles) {
      if (checkpoint.completedFiles.includes(xmlPath)) {
        console.log(`  ⏭️   Skipping (done): ${path.basename(xmlPath)}`);
        continue;
      }
      const { inserted, failed } = await processPartsFile(client, xmlPath);
      totalInserted += inserted;
      totalFailed   += failed;
      checkpoint.completedFiles.push(xmlPath);
      checkpoint.inserted = totalInserted;
      checkpoint.failed   = totalFailed;
      saveCheckpoint(checkpoint);
    }

    // Phase B: PIES — enrich with descriptions, images, dimensions
    const piesFiles = findXMLFiles('Brand_PIES_Export');
    console.log(`\n🖼️   Found ${piesFiles.length} PIES XML files\n`);

    for (const xmlPath of piesFiles) {
      if (checkpoint.completedFiles.includes(xmlPath)) {
        console.log(`  ⏭️   Skipping (done): ${path.basename(xmlPath)}`);
        continue;
      }
      const { inserted, failed } = await processPIESFile(client, xmlPath);
      totalInserted += inserted;
      totalFailed   += failed;
      checkpoint.completedFiles.push(xmlPath);
      checkpoint.inserted = totalInserted;
      checkpoint.failed   = totalFailed;
      saveCheckpoint(checkpoint);
    }

    await logSync(client, {
      status: totalFailed === 0 ? 'success' : 'partial',
      inserted: totalInserted, failed: totalFailed, startedAt,
      notes: `${partsFiles.length} Parts/Catalog + ${piesFiles.length} PIES files processed.`,
    });

    clearCheckpoint();
    console.log(`\n✅  PU Done — ${totalInserted} rows processed, ${totalFailed} errors`);

  } catch (err) {
    await logSync(client, { status: 'failed', inserted: totalInserted, failed: totalFailed, startedAt, notes: err.message });
    console.error('\n❌  PU sync failed:', err.message);
    console.error('    Re-run node pu-ingest.js to resume from checkpoint.');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
