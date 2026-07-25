#!/usr/bin/env node
/**
 * update_vtwin_pricing.mjs
 *
 * Ingests the V-Twin dealer/retail pricing CSV into vtwin_catalog, then
 * propagates prices, stock, images and OEM xrefs into catalog_unified.
 *
 * CSV: ~/Downloads/DEALER_W_BOTH_DEALER_AND_RETAIL 2.CSV
 * Columns: ITEM, DESCRIPTION, DEALER_PRICE, RETAIL_PRICE, HAS_STOCK, UOM,
 *          THIS_YR_CATPAGE, LAST_YR_CATPAGE, VENDOR_PARTNO, MANUFACTURER,
 *          CNTRY_OF_ORIGIN, WEIGHT_LBS, LENGTH_INCH, WIDTH_INCH, HEIGHT_INCH,
 *          OEM_XREF1, OEM_XREF2, OEM_XREF3, THUMB_PIC, FULL_PIC1..4,
 *          UPDATE_DATE, DATE_ADDED
 *
 * What this does:
 *   1. Upsert all rows into vtwin_catalog (price, stock, images, xrefs, dims)
 *   2. Update catalog_unified: cost, msrp, computed_price, in_stock, weight,
 *      dimensions, image_url, image_urls
 *   3. Upsert any new OEM xrefs into catalog_oem_crossref
 *
 * computed_price = retail_price  (consistent with PU pattern)
 *
 * Usage:
 *   node scripts/ingest/update_vtwin_pricing.mjs --dry-run
 *   node scripts/ingest/update_vtwin_pricing.mjs
 */

import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const DRY_RUN = process.argv.includes('--dry-run');
const CSV_PATH = path.join(os.homedir(), 'Downloads', 'DEALER_W_BOTH_DEALER_AND_RETAIL 2.CSV');

// ── Minimal RFC 4180 CSV parser ───────────────────────────────────────────────
function parseCSV(content) {
  const rows = [];
  let field = '', fields = [], inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i], next = content[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(field); field = ''; }
      else if (ch === '\n') {
        fields.push(field); rows.push(fields);
        fields = []; field = '';
      } else if (ch !== '\r') { field += ch; }
    }
  }
  fields.push(field);
  if (fields.some(f => f !== '')) rows.push(fields);
  return rows;
}

function clean(s) { return (s ?? '').trim().replace(/^"(.*)"$/, '$1').trim(); }
function num(s) { const n = parseFloat(clean(s)); return isNaN(n) ? null : n; }
function oem(s) { const v = clean(s); return v === ' ' || v === '' ? null : v; }
function pic(s) { const v = clean(s); return (v === ' ' || v === '') ? null : v; }
function parseDate(s) {
  const v = clean(s);
  if (!v || v.length < 6) return null;
  // "06/22/2026" or "20000101"
  if (v.includes('/')) return v; // MM/DD/YYYY
  // YYYYMMDD
  const y = v.slice(0,4), m = v.slice(4,6), d = v.slice(6,8);
  return `${y}-${m}-${d}`;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('CSV not found:', CSV_PATH);
    process.exit(1);
  }

  console.log('Parsing CSV...');
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const allRows = parseCSV(raw);
  const header = allRows[0].map(h => h.trim());
  const dataRows = allRows.slice(1).filter(r => r.length >= 4);
  console.log(`  Header: ${header.join(', ')}`);
  console.log(`  Data rows: ${dataRows.length}`);

  // Map header → index
  const H = {};
  header.forEach((h, i) => { H[h] = i; });

  // Parse all rows into structured objects
  const parsed = [];
  for (const row of dataRows) {
    const item = clean(row[H.ITEM]);
    if (!item) continue;
    const dealerPrice = num(row[H.DEALER_PRICE]);
    const retailPrice = num(row[H.RETAIL_PRICE]);
    const hasStock    = clean(row[H.HAS_STOCK]).toLowerCase() === 'yes';
    const thumbPic    = pic(row[H.THUMB_PIC]);
    const fullPic1    = pic(row[H.FULL_PIC1]);
    const fullPic2    = pic(row[H.FULL_PIC2]);
    const fullPic3    = pic(row[H.FULL_PIC3]);
    const fullPic4    = pic(row[H.FULL_PIC4]);
    const pics        = [fullPic1, fullPic2, fullPic3, fullPic4].filter(Boolean);
    const primaryImg  = fullPic1 || thumbPic;
    parsed.push({
      sku:           item,
      name:          clean(row[H.DESCRIPTION]),
      dealerPrice,
      retailPrice,
      hasStock,
      uom:           clean(row[H.UOM]) || null,
      thisYrCatpage: parseInt(row[H.THIS_YR_CATPAGE]) || null,
      lastYrCatpage: parseInt(row[H.LAST_YR_CATPAGE]) || null,
      vendorPartNo:  clean(row[H.VENDOR_PARTNO]) || null,
      manufacturer:  clean(row[H.MANUFACTURER]) || null,
      countryOfOrigin: clean(row[H.CNTRY_OF_ORIGIN]) || null,
      weightLbs:     num(row[H.WEIGHT_LBS]),
      lengthIn:      num(row[H.LENGTH_INCH]),
      widthIn:       num(row[H.WIDTH_INCH]),
      heightIn:      num(row[H.HEIGHT_INCH]),
      oemXref1:      oem(row[H.OEM_XREF1]),
      oemXref2:      oem(row[H.OEM_XREF2]),
      oemXref3:      oem(row[H.OEM_XREF3]),
      thumbPic,
      fullPic1,
      fullPic2,
      fullPic3,
      fullPic4,
      primaryImg,
      pics,
      updateDate:    parseDate(row[H.UPDATE_DATE]),
      dateAdded:     parseDate(row[H.DATE_ADDED]),
    });
  }

  console.log(`  Parsed: ${parsed.length} valid rows`);
  console.log(`  In stock: ${parsed.filter(r => r.hasStock).length}`);
  console.log(`  With retail price: ${parsed.filter(r => r.retailPrice != null).length}`);

  if (DRY_RUN) {
    console.log('\n-- Sample row:');
    console.log(JSON.stringify(parsed[0], null, 2));
    console.log('\n--dry-run set, no writes performed.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  let vtwinUpserted = 0, cuUpdated = 0, oemInserted = 0;

  try {
    await client.query('BEGIN');

    // ── 1. Upsert vtwin_catalog ───────────────────────────────────────────────
    console.log('\nUpserting vtwin_catalog...');
    const BATCH = 500;
    for (let i = 0; i < parsed.length; i += BATCH) {
      const batch = parsed.slice(i, i + BATCH);
      const values = [];
      const params = [];
      batch.forEach((r, idx) => {
        const b = idx * 25;
        values.push(`(
          $${b+1},$${b+2},$${b+3},$${b+4},$${b+5},
          $${b+6},$${b+7},$${b+8},$${b+9},$${b+10},
          $${b+11},$${b+12},$${b+13},$${b+14},$${b+15},
          $${b+16},$${b+17},$${b+18},$${b+19},$${b+20},
          $${b+21},$${b+22},$${b+23},$${b+24},$${b+25}
        )`);
        params.push(
          r.sku, r.name, r.dealerPrice, r.retailPrice, r.hasStock,
          r.uom, r.thisYrCatpage, r.lastYrCatpage, r.vendorPartNo, r.manufacturer,
          r.countryOfOrigin, r.weightLbs, r.lengthIn, r.widthIn, r.heightIn,
          r.oemXref1, r.oemXref2, r.oemXref3, r.thumbPic, r.fullPic1,
          r.fullPic2, r.fullPic3, r.fullPic4, r.updateDate, r.dateAdded,
        );
      });
      const res = await client.query(`
        INSERT INTO vtwin_catalog (
          sku, name, dealer_price, retail_price, has_stock,
          uom, this_yr_catpage, last_yr_catpage, vendor_part_no, manufacturer,
          country_of_origin, weight_lbs, length_in, width_in, height_in,
          oem_xref1, oem_xref2, oem_xref3, thumb_pic, full_pic1,
          full_pic2, full_pic3, full_pic4, update_date, date_added
        ) VALUES ${values.join(',')}
        ON CONFLICT (sku) DO UPDATE SET
          name             = EXCLUDED.name,
          dealer_price     = EXCLUDED.dealer_price,
          retail_price     = EXCLUDED.retail_price,
          has_stock        = EXCLUDED.has_stock,
          uom              = EXCLUDED.uom,
          this_yr_catpage  = EXCLUDED.this_yr_catpage,
          last_yr_catpage  = EXCLUDED.last_yr_catpage,
          vendor_part_no   = EXCLUDED.vendor_part_no,
          manufacturer     = EXCLUDED.manufacturer,
          country_of_origin = EXCLUDED.country_of_origin,
          weight_lbs       = EXCLUDED.weight_lbs,
          length_in        = EXCLUDED.length_in,
          width_in         = EXCLUDED.width_in,
          height_in        = EXCLUDED.height_in,
          oem_xref1        = EXCLUDED.oem_xref1,
          oem_xref2        = EXCLUDED.oem_xref2,
          oem_xref3        = EXCLUDED.oem_xref3,
          thumb_pic        = EXCLUDED.thumb_pic,
          full_pic1        = EXCLUDED.full_pic1,
          full_pic2        = EXCLUDED.full_pic2,
          full_pic3        = EXCLUDED.full_pic3,
          full_pic4        = EXCLUDED.full_pic4,
          update_date      = EXCLUDED.update_date,
          updated_at       = now()
      `, params);
      vtwinUpserted += res.rowCount;
      process.stdout.write(`  ${Math.min(i + BATCH, parsed.length)}/${parsed.length}\r`);
    }
    console.log(`\n  vtwin_catalog: ${vtwinUpserted} rows upserted`);

    // ── 2. Propagate to catalog_unified ──────────────────────────────────────
    console.log('\nUpdating catalog_unified pricing + stock + images...');

    // Build lookup: sku → parsed row
    const bySkuMap = new Map(parsed.map(r => [r.sku, r]));
    const skuList = parsed.map(r => 'VT-' + r.sku);

    // Load existing catalog_unified VTwin rows
    const { rows: cuRows } = await client.query(
      `SELECT id, sku, vendor_sku, image_url, cost, msrp, computed_price
       FROM catalog_unified WHERE source_vendor = 'VTWIN'`
    );
    console.log(`  VTWIN rows in catalog_unified: ${cuRows.length}`);

    // Batch update
    let cuBatch = 0;
    for (const cu of cuRows) {
      const r = bySkuMap.get(cu.vendor_sku);
      if (!r) continue;

      const imgs = r.pics.length > 0 ? r.pics : (r.primaryImg ? [r.primaryImg] : null);

      await client.query(`
        UPDATE catalog_unified SET
          cost           = $1,
          msrp           = $2,
          computed_price = $2,
          in_stock       = $3,
          stock_quantity = $4,
          weight         = $5,
          length_in      = $6,
          width_in       = $7,
          height_in      = $8,
          image_url      = COALESCE($9, image_url),
          image_urls     = COALESCE($10, image_urls),
          updated_at     = now()
        WHERE id = $11
      `, [
        r.dealerPrice,
        r.retailPrice,
        r.hasStock,
        r.hasStock ? 1 : 0,
        r.weightLbs,
        r.lengthIn,
        r.widthIn,
        r.heightIn,
        r.primaryImg,
        imgs,
        cu.id,
      ]);
      cuBatch++;
    }
    cuUpdated = cuBatch;
    console.log(`  catalog_unified: ${cuUpdated} rows updated`);

    // ── 3. OEM crossref from xref columns ────────────────────────────────────
    console.log('\nInserting new OEM crossref entries...');

    // Load existing xref pairs to avoid dupes
    const { rows: existingOem } = await client.query(
      `SELECT oem_number, product_id FROM catalog_oem_crossref WHERE product_id IS NOT NULL`
    );
    const existingPairs = new Set(existingOem.map(r => `${r.oem_number}:${r.product_id}`));

    // Build product_id lookup: vendor_sku → {id, sku}
    const cuById = new Map(cuRows.map(r => [r.vendor_sku, r]));

    const toInsertOem = [];
    for (const r of parsed) {
      const cu = cuById.get(r.sku);
      if (!cu) continue;

      for (const xref of [r.oemXref1, r.oemXref2, r.oemXref3]) {
        if (!xref) continue;
        const key = `${xref}:${cu.id}`;
        if (!existingPairs.has(key)) {
          existingPairs.add(key);
          toInsertOem.push({ oemNumber: xref, productId: cu.id, sku: r.sku });
        }
      }
    }

    if (toInsertOem.length > 0) {
      for (let i = 0; i < toInsertOem.length; i += 500) {
        const batch = toInsertOem.slice(i, i + 500);
        const values = [];
        const params = [];
        batch.forEach((r, idx) => {
          const b = idx * 3;
          values.push(`($${b+1},$${b+2},$${b+3})`);
          params.push(r.sku, r.oemNumber, r.productId);
        });
        const res = await client.query(`
          INSERT INTO catalog_oem_crossref (sku, oem_number, product_id)
          VALUES ${values.join(',')}
          ON CONFLICT (sku, oem_number) DO NOTHING
        `, params);
        oemInserted += res.rowCount;
      }
    }
    console.log(`  catalog_oem_crossref: ${oemInserted} new rows`);

    await client.query('COMMIT');

    console.log(`
Done.
  vtwin_catalog upserted:      ${vtwinUpserted}
  catalog_unified updated:     ${cuUpdated}
  catalog_oem_crossref added:  ${oemInserted}
`);

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('\nError, rolled back:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
