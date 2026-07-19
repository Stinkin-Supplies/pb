#!/usr/bin/env node
/**
 * enrich_vtwin_content.js
 * -----------------------
 * Backfills catalog_unified VTWIN rows from vtwin-master.csv:
 *   - image_url / image_urls  ← FULL_PIC1–4 + THUMB_PIC
 *   - oem_numbers             ← OEM_XREF1–3 (array of HD OEM part numbers)
 *   - oem_part_number         ← VENDOR_PARTNO (manufacturer's own part number)
 *   - cost / msrp             ← DEALER_PRICE / RETAIL_PRICE (sync if stale)
 *   - in_stock                ← HAS_STOCK
 *
 * Join key: vtwin-master ITEM = catalog_unified vendor_sku
 *
 * Usage:
 *   node enrich_vtwin_content.js
 *   node enrich_vtwin_content.js --dry-run
 *   node enrich_vtwin_content.js --force
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { ProgressBar } from './progress_bar.js';

const { Pool } = pg;

const DRY_RUN  = process.argv.includes('--dry-run');
const FORCE    = process.argv.includes('--force');
const BATCH    = 1000;

const DATA_DIR  = path.resolve('scripts/data');
const VT_FILE   = path.join(DATA_DIR, 'vtwin-master.csv');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function nullify(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' || s === 'null' || s === 'NULL' || s === 'NaN' ? null : s;
}

function parseFloat2(val) {
  const n = parseFloat(nullify(val));
  return isNaN(n) ? null : n;
}

// Build LeMans CDN proxy URL (using fflate unzip pattern already in project)
// VTwin image URLs are direct — no proxy needed
function cleanImageUrl(url) {
  const u = nullify(url);
  if (!u) return null;
  // Some VTwin URLs have trailing whitespace or are malformed
  return u.startsWith('http') ? u : null;
}

function uniqueArray(values) {
  return [...new Set(values.filter(Boolean))];
}

// ── Load vtwin master ─────────────────────────────────────────────────────────

function loadVtwin() {
  console.log('📂  Loading VTwin master catalog…');
  const raw = fs.readFileSync(VT_FILE, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const map = new Map(); // ITEM → enrichment object

  for (const r of rows) {
    const item = nullify(r.ITEM);
    if (!item) continue;

    // Collect up to 4 full images + thumb, deduplicated, valid URLs only
    const fullPics = [r.FULL_PIC1, r.FULL_PIC2, r.FULL_PIC3, r.FULL_PIC4]
      .map(cleanImageUrl)
      .filter(Boolean);
    const thumb = cleanImageUrl(r.THUMB_PIC);

    // Primary image: prefer first full pic, fall back to thumb
    const primaryImage = fullPics[0] || thumb;

    // OEM xrefs — strip blank/whitespace-only values
    const oems = [r.OEM_XREF1, r.OEM_XREF2, r.OEM_XREF3]
      .map(nullify)
      .filter(Boolean);

    map.set(item, {
      item,
      primary_image : primaryImage,
      all_images    : fullPics.length > 0 ? fullPics : (thumb ? [thumb] : []),
      thumb_pic     : thumb,
      oem_numbers   : oems,                        // ["25268-84A", ...]
      oem_part_number: nullify(r.VENDOR_PARTNO),   // manufacturer's own #
      dealer_price  : parseFloat2(r.DEALER_PRICE),
      retail_price  : parseFloat2(r.RETAIL_PRICE),
      has_stock     : nullify(r.HAS_STOCK) === 'Yes',
      manufacturer  : nullify(r.MANUFACTURER),
      update_date   : nullify(r.UPDATE_DATE),
    });
  }

  console.log(`   → ${map.size} VTwin items loaded`);
  return map;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧  enrich_vtwin_content.js  ${DRY_RUN ? '[DRY RUN]' : ''}${FORCE ? '[FORCE]' : ''}\n`);

  const vtMap = loadVtwin();

  const client = await pool.connect();
  try {
    console.log('\n📡  Fetching VTWIN rows from catalog_unified…');
    const { rows: catalog } = await client.query(`
      SELECT id, sku, vendor_sku, image_url, image_urls,
             oem_numbers, oem_part_number, cost, msrp, in_stock,
             display_brand, manufacturer_brand
      FROM catalog_unified
      WHERE source_vendor = 'VTWIN'
    `);
    console.log(`   → ${catalog.length} VTWIN rows found in catalog`);

    const stagedUpdates = [];
    const pb = new ProgressBar(catalog.length, 'VTwin enrich');

    let stats = { images: 0, oem: 0, pricing: 0, stock: 0, no_match: 0 };

    for (const row of catalog) {
      pb.increment();
      // VTwin join: catalog vendor_sku = vtwin-master ITEM
      const vt = vtMap.get(row.vendor_sku);
      if (!vt) { stats.no_match++; continue; }

      let imageUrl = null;
      let imageUrls = null;
      let oemNumbers = null;
      let oemPartNumber = null;
      let cost = null;
      let msrp = null;
      let inStock = null;
      let manufacturerBrand = null;

      // Images
      if (vt.primary_image) {
        imageUrl = vt.primary_image;
        if (vt.all_images.length > 0) {
          imageUrls = vt.all_images;
        }
        stats.images++;
      }

      // OEM numbers (merge with existing if present)
      if (vt.oem_numbers.length > 0) {
        const existing = Array.isArray(row.oem_numbers)
          ? row.oem_numbers
          : (row.oem_numbers ? [row.oem_numbers] : []);
        const merged = uniqueArray([...existing, ...vt.oem_numbers]);
        if (FORCE || existing.length === 0) {
          oemNumbers = merged;
          stats.oem++;
        }
      }

      // Manufacturer's own part number
      if (vt.oem_part_number && (FORCE || !row.oem_part_number)) {
        oemPartNumber = vt.oem_part_number;
      }

      // Pricing sync (only update if vtwin has a non-zero value)
      if (vt.dealer_price && vt.dealer_price > 0 && (FORCE || !row.cost)) {
        cost = vt.dealer_price;
        stats.pricing++;
      }
      if (vt.retail_price && vt.retail_price > 0 && (FORCE || !row.msrp)) {
        msrp = vt.retail_price;
      }

      // Stock
      if (FORCE || row.in_stock === null) {
        inStock = vt.has_stock;
        stats.stock++;
      }

      // Manufacturer brand backfill
      if (vt.manufacturer && (FORCE || !row.manufacturer_brand)) {
        manufacturerBrand = vt.manufacturer;
      }

      if (
        imageUrl === null &&
        imageUrls === null &&
        oemNumbers === null &&
        oemPartNumber === null &&
        cost === null &&
        msrp === null &&
        inStock === null &&
        manufacturerBrand === null
      ) {
        continue;
      }

      stagedUpdates.push({
        id: row.id,
        image_url: imageUrl,
        image_urls: imageUrls,
        oem_numbers: oemNumbers,
        oem_part_number: oemPartNumber,
        cost,
        msrp,
        in_stock: inStock,
        manufacturer_brand: manufacturerBrand,
      });
    }
    pb.finish();

    console.log(`\n📝  Executing ${stagedUpdates.length} updates…`);
    if (!DRY_RUN) {
      await client.query('BEGIN');
      await client.query(`
        CREATE TEMP TABLE vtwin_enrich_updates (
          id                  INTEGER PRIMARY KEY,
          image_url           TEXT,
          image_urls          TEXT[],
          oem_numbers         TEXT[],
          oem_part_number     TEXT,
          cost                NUMERIC,
          msrp                NUMERIC,
          in_stock            BOOLEAN,
          manufacturer_brand  TEXT
        ) ON COMMIT DROP
      `);

      const bpb = new ProgressBar(stagedUpdates.length, 'Writing');
      for (let i = 0; i < stagedUpdates.length; i += BATCH) {
        const batch = stagedUpdates.slice(i, i + BATCH);
        const values = [];
        const placeholders = batch.map((row, idx) => {
          const base = idx * 9;
          values.push(
            row.id,
            row.image_url,
            row.image_urls,
            row.oem_numbers,
            row.oem_part_number,
            row.cost,
            row.msrp,
            row.in_stock,
            row.manufacturer_brand
          );
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
        });

        await client.query(`
          INSERT INTO vtwin_enrich_updates
            (id, image_url, image_urls, oem_numbers, oem_part_number, cost, msrp, in_stock, manufacturer_brand)
          VALUES ${placeholders.join(', ')}
        `, values);
        bpb.update(Math.min(i + batch.length, stagedUpdates.length));
      }

      await client.query(`
        UPDATE catalog_unified c
        SET
          image_url = COALESCE(u.image_url, c.image_url),
          image_urls = COALESCE(u.image_urls, c.image_urls),
          oem_numbers = COALESCE(u.oem_numbers, c.oem_numbers),
          oem_part_number = COALESCE(u.oem_part_number, c.oem_part_number),
          cost = COALESCE(u.cost, c.cost),
          msrp = COALESCE(u.msrp, c.msrp),
          in_stock = COALESCE(u.in_stock, c.in_stock),
          manufacturer_brand = COALESCE(u.manufacturer_brand, c.manufacturer_brand),
          updated_at = NOW()
        FROM vtwin_enrich_updates u
        WHERE c.id = u.id
      `);

      await client.query('COMMIT');
      bpb.finish();
    }

    console.log('\n✅  Done.');
    console.log(`   Rows updated          : ${stagedUpdates.length}`);
    console.log(`   Images backfilled     : ${stats.images}`);
    console.log(`   OEM refs backfilled   : ${stats.oem}`);
    console.log(`   Pricing synced        : ${stats.pricing}`);
    console.log(`   Stock synced          : ${stats.stock}`);
    console.log(`   No vtwin match        : ${stats.no_match}`);
    if (DRY_RUN) console.log('\n   ⚠️  DRY RUN — no changes written to DB');

  } catch (err) {
    if (!DRY_RUN) await client.query('ROLLBACK');
    console.error('❌  Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
