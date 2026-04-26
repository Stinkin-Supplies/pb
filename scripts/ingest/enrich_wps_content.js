#!/usr/bin/env node
/**
 * enrich_wps_content.js
 * ----------------------
 * Backfills catalog_unified with richer content and images from:
 *   - wps_master_item_harddrive.csv  → description, features, dims, upc
 *   - wps-master-image-list.csv      → image_url, image_urls (multi-image array)
 *
 * Only touches WPS source_vendor rows. Never overwrites existing non-null values
 * unless --force flag is passed.
 *
 * Usage:
 *   node enrich_wps_content.js
 *   node enrich_wps_content.js --dry-run
 *   node enrich_wps_content.js --force      # overwrites existing values
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { ProgressBar } from './progress_bar.js';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

const DATA_DIR    = path.resolve('scripts/data');
const HARDDRIVE   = path.join(DATA_DIR, 'wps_master_item_harddrive.csv');
const IMAGE_LIST  = path.join(DATA_DIR, 'wps-master-image-list.csv');
const BATCH_SIZE  = 200;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Helpers ───────────────────────────────────────────────────────────────────

function nullify(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' || s === 'null' || s === 'NULL' ? null : s;
}

function parseFloat2(val) {
  const n = parseFloat(nullify(val));
  return isNaN(n) ? null : n;
}

function toTextArray(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const cleaned = value.map(nullify).filter(Boolean);
    return cleaned.length ? cleaned : null;
  }

  const text = nullify(value);
  return text ? [text] : null;
}

function hasExistingValue(existing) {
  if (Array.isArray(existing)) return existing.length > 0;
  return existing !== null && existing !== '';
}

// ── Load harddrive CSV ────────────────────────────────────────────────────────

function loadHarddrive() {
  console.log('📂  Loading WPS harddrive catalog…');
  const raw = fs.readFileSync(HARDDRIVE, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const map = new Map(); // sku → enrichment object
  for (const r of rows) {
    const sku = nullify(r.sku);
    if (!sku) continue; // skip header-junk rows

    map.set(sku, {
      sku,
      description : nullify(r.product_description),
      features    : toTextArray(r.product_features),
      name_rich   : nullify(r.product_name),   // richer than plain name
      upc         : nullify(r.upc),
      weight      : parseFloat2(r.weight),
      length_in   : parseFloat2(r.length),
      width_in    : parseFloat2(r.width),
      height_in   : parseFloat2(r.height),
      has_map_policy: nullify(r.has_map_policy) === 'yes' ? true : null,
      country_of_origin: nullify(r.country_of_origin_code),
      status      : nullify(r.status),           // STK / NLA / CLO / NEW / DIR
      in_harddrive: nullify(r.harddrive_catalog) === 'yes',
    });
  }
  console.log(`   → ${map.size} harddrive SKUs loaded`);
  return map;
}

// ── Load image list CSV ───────────────────────────────────────────────────────

function loadImages() {
  console.log('📂  Loading WPS image list…');
  const raw = fs.readFileSync(IMAGE_LIST, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  const map = new Map(); // sku → sorted array of {uri, width, height}
  for (const r of rows) {
    const sku = nullify(r.sku);
    const uri = nullify(r.image_uri);
    if (!sku || !uri) continue;

    const w = parseInt(r.image_width) || 0;
    const h = parseInt(r.image_height) || 0;
    if (!map.has(sku)) map.set(sku, []);
    map.get(sku).push({ uri, width: w, height: h });
  }

  // Sort each SKU's images by width DESC (highest quality first)
  for (const [sku, imgs] of map) {
    map.set(sku, imgs.sort((a, b) => b.width - a.width));
  }

  console.log(`   → ${map.size} unique SKUs with images`);
  return map;
}

// ── Batch UPDATE helper ───────────────────────────────────────────────────────

async function batchUpdate(client, updates) {
  if (updates.length === 0) return 0;
  let affected = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    for (const u of batch) {
      if (DRY_RUN) { affected++; continue; }
      const res = await client.query(u.sql, u.params);
      affected += res.rowCount;
    }
  }
  return affected;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧  enrich_wps_content.js  ${DRY_RUN ? '[DRY RUN]' : ''}${FORCE ? '[FORCE]' : ''}\n`);

  const hdMap  = loadHarddrive();
  const imgMap = loadImages();

  const client = await pool.connect();
  try {
    // Fetch all WPS rows from catalog
    console.log('\n📡  Fetching WPS rows from catalog_unified…');
    const { rows: catalog } = await client.query(`
      SELECT id, sku, description, features, name, upc,
             weight, length_in, width_in, height_in,
             has_map_policy, country_of_origin, image_url, image_urls,
             in_harddrive
      FROM catalog_unified
      WHERE source_vendor = 'WPS'
    `);
    console.log(`   → ${catalog.length} WPS rows found in catalog`);

    // ── Content enrichment ─────────────────────────────────────────────────
    console.log('\n⚙️   Building content update queries…');
    const contentUpdates = [];
    const pb = new ProgressBar(catalog.length, 'Content');

    for (const row of catalog) {
      pb.increment();
      const hd = hdMap.get(row.sku);
      if (!hd) continue;

      const setClauses = [];
      const params     = [];
      let   p          = 1;

      const set = (col, newVal, existing) => {
        if (newVal === null) return;
        if (!FORCE && hasExistingValue(existing)) return; // don't overwrite
        setClauses.push(`${col} = $${p++}`);
        params.push(newVal);
      };

      set('description',       hd.description,       row.description);
      set('features',          hd.features,           row.features);
      // Only set name if catalog name is blank and we have a richer one
      set('name',              hd.name_rich,          row.name);
      set('upc',               hd.upc,                row.upc);
      set('weight',            hd.weight,             row.weight);
      set('length_in',         hd.length_in,          row.length_in);
      set('width_in',          hd.width_in,           row.width_in);
      set('height_in',         hd.height_in,          row.height_in);
      set('country_of_origin', hd.country_of_origin,  row.country_of_origin);

      if (hd.has_map_policy !== null && (FORCE || row.has_map_policy === null)) {
        setClauses.push(`has_map_policy = $${p++}`);
        params.push(hd.has_map_policy);
      }
      if (hd.in_harddrive && (FORCE || !row.in_harddrive)) {
        setClauses.push(`in_harddrive = $${p++}`);
        params.push(true);
      }

      if (setClauses.length === 0) continue;
      setClauses.push(`updated_at = NOW()`);
      params.push(row.id);

      contentUpdates.push({
        sql: `UPDATE catalog_unified SET ${setClauses.join(', ')} WHERE id = $${p}`,
        params,
      });
    }
    pb.finish();

    // ── Image enrichment ───────────────────────────────────────────────────
    console.log('\n⚙️   Building image update queries…');
    const imageUpdates = [];
    const pb2 = new ProgressBar(catalog.length, 'Images');

    for (const row of catalog) {
      pb2.increment();
      const imgs = imgMap.get(row.sku);
      if (!imgs || imgs.length === 0) continue;

      const primary   = imgs[0].uri;
      const allUrls   = imgs.map(i => i.uri);

      if (!FORCE && row.image_url) continue; // already has an image

      imageUpdates.push({
        sql: `UPDATE catalog_unified
              SET image_url = $1, image_urls = $2, updated_at = NOW()
              WHERE id = $3`,
        params: [primary, allUrls, row.id],
      });
    }
    pb2.finish();

    // ── Execute ────────────────────────────────────────────────────────────
    console.log(`\n📝  Executing updates…`);
    const bp = new ProgressBar(contentUpdates.length + imageUpdates.length, 200);

    if (!DRY_RUN) await client.query('BEGIN');
    const contentAffected = await batchUpdate(client, contentUpdates);
    bp.increment();
    const imageAffected = await batchUpdate(client, imageUpdates);
    bp.increment();
    if (!DRY_RUN) await client.query('COMMIT');
    bp.finish();

    // ── Summary ────────────────────────────────────────────────────────────
    console.log('\n✅  Done.');
    console.log(`   Content rows updated : ${contentAffected}`);
    console.log(`   Image rows updated   : ${imageAffected}`);
    console.log(`   WPS SKUs in img list but not catalog: ${
      [...imgMap.keys()].filter(s => !catalog.find(r => r.sku === s)).length
    }`);
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
