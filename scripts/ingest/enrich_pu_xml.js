#!/usr/bin/env node
/**
 * enrich_pu_xml.js
 * ----------------
 * Processes ALL XML files in scripts/data/pu_pricefile/ and enriches
 * matching catalog_unified PU rows with content and images.
 *
 * Handles two formats automatically:
 *
 *   FORMAT A — Catalog_Content_Export (*_Catalog_Content_Export*.xml)
 *     <root><part> with partNumber, productName, bullet1–24, partImage, productImage
 *     Same structure as Drag Specialties. Already partially handled by ingest_ds_xml.js
 *     but this script covers ALL brands.
 *
 *   FORMAT B — PIES_Export (*_PIES_Export*.xml)
 *     AAIA PIES 7.x standard: <PIES><Items><Item>
 *     PartNumber, BrandLabel
 *     Descriptions: DescriptionCode="TLE" (title), "FAB" (feature bullets), "DES" (description)
 *     DigitalAssets: URI (image URL), AssetType
 *     Packages: dimensions, weight
 *
 * Match key: partNumber / PartNumber = catalog_unified.sku WHERE source_vendor = 'PU'
 *
 * Usage:
 *   node scripts/ingest/enrich_pu_xml.js
 *   node scripts/ingest/enrich_pu_xml.js --dry-run
 *   node scripts/ingest/enrich_pu_xml.js --force        # overwrite existing values
 *   node scripts/ingest/enrich_pu_xml.js --file "Biltwell_Catalog_Content_Export.xml"
 *   node scripts/ingest/enrich_pu_xml.js --report       # show match stats only, no writes
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { ProgressBar } from './progress_bar.js';

const { Pool } = pg;

const DRY_RUN  = process.argv.includes('--dry-run');
const FORCE    = process.argv.includes('--force');
const REPORT   = process.argv.includes('--report');
const FILE_ARG = process.argv.includes('--file')
  ? process.argv[process.argv.indexOf('--file') + 1]
  : null;
const DIR_ARG  = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : null;

const PU_DIR   = path.resolve(DIR_ARG || 'scripts/data/pu_pricefile');
const BATCH    = 300;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── XML Parser (shared) ───────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes    : false,
  attributeNamePrefix : '@_',
  parseTagValue       : true,
  isArray             : (name) => ['Item', 'part', 'Description',
                                   'DigitalFileInformation', 'ExtendedProductInformation',
                                   'Package'].includes(name),
});

// ── Format detection ──────────────────────────────────────────────────────────

function detectFormat(filename) {
  if (filename.includes('Catalog_Content_Export') || filename.includes('catalog_content')) {
    return 'catalog_content';
  }
  if (filename.includes('PIES_Export') || filename.includes('pies_export') || filename.includes('PIES')) {
    return 'pies';
  }
  // Peek at first 200 chars of file to detect
  const peek = fs.readFileSync(filename, 'utf8').slice(0, 500);
  if (peek.includes('<PIES') || peek.includes('<Items>')) return 'pies';
  if (peek.includes('<root>') && peek.includes('<part>'))  return 'catalog_content';
  return 'unknown';
}

// ── FORMAT A: Catalog_Content_Export parser ───────────────────────────────────

function parseCatalogContent(xml) {
  const doc   = parser.parse(xml);
  const parts = doc?.root?.part;
  if (!parts) return [];

  return parts.map(p => {
    const bullets = [];
    for (let i = 1; i <= 24; i++) {
      const b = p[`bullet${i}`];
      if (b && String(b).trim()) bullets.push(String(b).trim());
    }
    const productImage = String(p.productImage || '').trim() || null;
    const partImage    = String(p.partImage    || '').trim() || null;
    const imageUrl     = (productImage && !productImage.includes('coming-soon')) ? productImage
                       : (partImage    && !partImage.includes('coming-soon'))    ? partImage
                       : null;

    return {
      part_number   : String(p.partNumber   || '').trim(),
      product_name  : String(p.productName  || '').trim() || null,
      description   : String(p.partDescription || '').trim() || null,
      features      : bullets.length ? bullets : null,
      image_url     : imageUrl,
      your_dealer   : parseFloat(p.yourDealerPrice)  || null,
      base_retail   : parseFloat(p.baseRetailPrice)   || null,
      orig_retail   : parseFloat(p.originalRetailPrice) || null,
      status        : String(p.partStatusDescription || '').trim(),
    };
  }).filter(p => p.part_number);
}

// ── FORMAT B: PIES_Export parser ──────────────────────────────────────────────

function parsePies(xml) {
  // Strip namespace to simplify parsing
  const stripped = xml.replace(/xmlns="[^"]*"/g, '');
  const doc   = parser.parse(stripped);
  const items = doc?.PIES?.Items?.Item;
  if (!items) return [];

  return items.map(item => {
    const partNumber = String(item.PartNumber || '').trim();
    if (!partNumber) return null;

    // Descriptions: TLE=title, DES=description, FAB=feature bullets, MKT=marketing
    const descs = Array.isArray(item.Descriptions?.Description)
      ? item.Descriptions.Description
      : (item.Descriptions?.Description ? [item.Descriptions.Description] : []);

    let product_name = null;
    let description  = null;
    const features   = [];

    for (const d of descs) {
      const code = d['@_DescriptionCode'] || '';
      const text = String(d['#text'] || d || '').trim();
      if (!text) continue;
      if (code === 'TLE' || code === 'SHO') product_name = product_name || text;
      else if (code === 'DES' || code === 'MKT') description = description || text;
      else if (code === 'FAB' || code === 'EXT') features.push(text);
    }

    // Digital assets — find best image (prefer P04 primary, then any non-coming-soon)
    const assets = Array.isArray(item.DigitalAssets?.DigitalFileInformation)
      ? item.DigitalAssets.DigitalFileInformation
      : (item.DigitalAssets?.DigitalFileInformation ? [item.DigitalAssets.DigitalFileInformation] : []);

    let image_url = null;
    for (const a of assets) {
      const uri  = String(a.URI || '').trim();
      const type = String(a.AssetType || '').trim();
      if (!uri || uri.includes('coming-soon')) continue;
      // Prefer primary image types
      if (['P04', 'P01', 'IN1', 'ZZ1'].includes(type)) {
        image_url = uri;
        break;
      }
      image_url = image_url || uri;
    }

    // Packages — dimensions and weight
    const pkg = Array.isArray(item.Packages?.Package)
      ? item.Packages.Package[0]
      : item.Packages?.Package;

    let weight = null, height_in = null, width_in = null, length_in = null;
    if (pkg) {
      const dims = pkg.Dimensions;
      const wts  = pkg.Weights;
      if (dims) {
        height_in = parseFloat(dims.MerchandisingHeight) || null;
        width_in  = parseFloat(dims.MerchandisingWidth)  || null;
        length_in = parseFloat(dims.MerchandisingLength) || null;
      }
      if (wts) weight = parseFloat(wts.Weight) || null;
    }

    return {
      part_number  : partNumber,
      product_name,
      description,
      features     : features.length ? features : null,
      image_url,
      your_dealer  : null,  // PIES doesn't include dealer pricing
      base_retail  : null,
      orig_retail  : null,
      weight,
      height_in,
      width_in,
      length_in,
      status       : item['@_MaintenanceType'] === 'D' ? 'DISCONTINUED' : 'STANDARD',
    };
  }).filter(Boolean).filter(p => p.part_number);
}

// ── Parse any XML file ────────────────────────────────────────────────────────

function parseXmlFile(filepath) {
  const format = detectFormat(filepath);
  if (format === 'unknown') {
    console.log(`   ⚠️  Unknown format, skipping: ${path.basename(filepath)}`);
    return [];
  }
  const xml = fs.readFileSync(filepath, 'utf8');
  return format === 'pies' ? parsePies(xml) : parseCatalogContent(xml);
}

// ── Get all XML files to process ──────────────────────────────────────────────

function getXmlFiles() {
  if (FILE_ARG) {
    const full = path.join(PU_DIR, FILE_ARG);
    if (!fs.existsSync(full)) throw new Error(`File not found: ${full}`);
    return [full];
  }
  return fs.readdirSync(PU_DIR)
    .filter(f => f.endsWith('.xml'))
    .map(f => path.join(PU_DIR, f))
    .sort();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧  enrich_pu_xml.js  ${DRY_RUN ? '[DRY RUN]' : ''}${FORCE ? '[FORCE]' : ''}${REPORT ? '[REPORT]' : ''}\n`);

  const xmlFiles = getXmlFiles();
  console.log(`📂  Found ${xmlFiles.length} XML files in pu_pricefile/`);

  // Parse all XML files into a single master map: partNumber → enrichment data
  console.log('⚙️   Parsing XML files…');
  const masterMap = new Map();
  let totalParts  = 0;
  let skipped     = 0;

  const parsePb = new ProgressBar(xmlFiles.length, 'Parsing');
  for (const filepath of xmlFiles) {
    parsePb.increment();
    try {
      const parts = parseXmlFile(filepath);
      totalParts += parts.length;
      for (const p of parts) {
        // Later files win on conflict (more specific brand files override generic ones)
        if (p.part_number) masterMap.set(p.part_number, p);
      }
    } catch (err) {
      skipped++;
      // Don't crash on one bad file
      process.stderr.write(`\n   ⚠️  Error parsing ${path.basename(filepath)}: ${err.message}\n`);
    }
  }
  parsePb.finish();

  console.log(`   → ${totalParts.toLocaleString()} parts parsed across all files`);
  console.log(`   → ${masterMap.size.toLocaleString()} unique part numbers`);
  console.log(`   → ${skipped} files skipped due to errors`);

  const client = await pool.connect();
  try {
    // Fetch all PU rows from catalog
    console.log('\n📡  Fetching PU catalog rows…');
    const { rows: catalog } = await client.query(`
      SELECT id, sku, name, description, features, image_url,
             cost, msrp, original_retail, weight, height_in, width_in, length_in
      FROM catalog_unified
      WHERE source_vendor = 'PU'
    `);
    console.log(`   → ${catalog.length.toLocaleString()} PU rows in catalog`);

    // Match and build staging data
    console.log('\n⚙️   Matching parts to catalog…');
    const staging = [];
    let matched = 0, unmatched = 0, skippedNoChange = 0;

    const matchPb = new ProgressBar(catalog.length, 'Matching');
    for (const row of catalog) {
      matchPb.increment();
      const p = masterMap.get(row.sku);
      if (!p) { unmatched++; continue; }
      matched++;

      const featuresArr = Array.isArray(p.features) ? p.features : null;

      // Check if anything would actually change
      const hasNewName    = p.product_name && (FORCE || !row.name);
      const hasNewDesc    = p.description  && (FORCE || !row.description);
      const hasNewFeats   = featuresArr    && (FORCE || !row.features || row.features.length === 0);
      const hasNewImage   = p.image_url    && (FORCE || !row.image_url);
      const hasNewCost    = p.your_dealer  && p.your_dealer > 0 && (FORCE || !row.cost);
      const hasNewMsrp    = p.base_retail  && p.base_retail > 0 && (FORCE || !row.msrp);
      const hasNewOrigRet = p.orig_retail  && p.orig_retail > 0 && (FORCE || !row.original_retail);
      const hasNewWeight  = p.weight       && (FORCE || !row.weight);
      const hasNewHeight  = p.height_in    && (FORCE || !row.height_in);
      const hasNewWidth   = p.width_in     && (FORCE || !row.width_in);
      const hasNewLength  = p.length_in    && (FORCE || !row.length_in);

      if (!hasNewName && !hasNewDesc && !hasNewFeats && !hasNewImage &&
          !hasNewCost && !hasNewMsrp && !hasNewOrigRet &&
          !hasNewWeight && !hasNewHeight && !hasNewWidth && !hasNewLength) {
        skippedNoChange++;
        continue;
      }

      staging.push({
        id             : row.id,
        name           : hasNewName    ? p.product_name : null,
        description    : hasNewDesc    ? p.description  : null,
        features       : hasNewFeats   ? featuresArr    : null,
        image_url      : hasNewImage   ? p.image_url    : null,
        cost           : hasNewCost    ? p.your_dealer  : null,
        msrp           : hasNewMsrp    ? p.base_retail  : null,
        original_retail: hasNewOrigRet ? p.orig_retail  : null,
        weight         : hasNewWeight  ? p.weight       : null,
        height_in      : hasNewHeight  ? p.height_in    : null,
        width_in       : hasNewWidth   ? p.width_in     : null,
        length_in      : hasNewLength  ? p.length_in    : null,
      });
    }
    matchPb.finish();

    console.log(`\n📊  Match results:`);
    console.log(`   Matched to catalog   : ${matched.toLocaleString()}`);
    console.log(`   Not in catalog       : ${unmatched.toLocaleString()}`);
    console.log(`   Already up to date   : ${skippedNoChange.toLocaleString()}`);
    console.log(`   Rows to update       : ${staging.length.toLocaleString()}`);

    if (REPORT || staging.length === 0) {
      if (DRY_RUN || REPORT) console.log('\n   ⚠️  No writes performed');
      return;
    }

    // Bulk update via temp table
    console.log('\n📝  Writing to database via temp table…');
    if (!DRY_RUN) {
      await client.query('BEGIN');

      await client.query(`
        CREATE TEMP TABLE pu_enrichment_staging (
          id              INT,
          name            TEXT,
          description     TEXT,
          features        TEXT[],
          image_url       TEXT,
          cost            NUMERIC,
          msrp            NUMERIC,
          original_retail NUMERIC,
          weight          NUMERIC,
          height_in       NUMERIC,
          width_in        NUMERIC,
          length_in       NUMERIC
        ) ON COMMIT DROP
      `);

      // Load staging in batches
      const loadPb = new ProgressBar(staging.length, 'Loading staging');
      for (let i = 0; i < staging.length; i += BATCH) {
        const batch = staging.slice(i, i + BATCH);
        const vals  = [];
        const placeholders = batch.map((r, j) => {
          const b = j * 12;
          vals.push(r.id, r.name, r.description, r.features,
                    r.image_url, r.cost, r.msrp, r.original_retail,
                    r.weight, r.height_in, r.width_in, r.length_in);
          return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12})`;
        });
        await client.query(
          `INSERT INTO pu_enrichment_staging VALUES ${placeholders.join(',')}`,
          vals
        );
        loadPb.update(Math.min(i + BATCH, staging.length));
      }
      loadPb.finish();

      // Single bulk UPDATE
      console.log('   Running bulk UPDATE…');
      const res = await client.query(`
        UPDATE catalog_unified cu SET
          name            = COALESCE(NULLIF(cu.name,''),            s.name),
          description     = COALESCE(NULLIF(cu.description,''),     s.description),
          features        = COALESCE(cu.features,                    s.features),
          image_url       = COALESCE(NULLIF(cu.image_url,''),       s.image_url),
          cost            = COALESCE(cu.cost,                        s.cost),
          msrp            = COALESCE(cu.msrp,                        s.msrp),
          original_retail = COALESCE(cu.original_retail,             s.original_retail),
          weight          = COALESCE(cu.weight,                      s.weight),
          height_in       = COALESCE(cu.height_in,                   s.height_in),
          width_in        = COALESCE(cu.width_in,                    s.width_in),
          length_in       = COALESCE(cu.length_in,                   s.length_in),
          updated_at      = NOW()
        FROM pu_enrichment_staging s
        WHERE cu.id = s.id
          AND cu.source_vendor = 'PU'
      `);

      await client.query('COMMIT');
      console.log(`\n✅  Done. ${res.rowCount.toLocaleString()} rows updated.`);
    } else {
      console.log(`\n   ⚠️  DRY RUN — ${staging.length.toLocaleString()} rows would be updated`);
    }

  } catch (err) {
    if (!DRY_RUN) await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌  Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
