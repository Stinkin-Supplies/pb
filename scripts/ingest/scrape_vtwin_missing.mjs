#!/usr/bin/env node
/**
 * scrape_vtwin_missing.mjs
 *
 * Two-phase scraper for VTwin products with no fitment data:
 *
 *   Phase 1 — GraphQL: batch-queries url_key for each SKU (50 per request)
 *   Phase 2 — HTML:    fetches /{url_key}.html, parses FITS + other fields,
 *                      upserts into vtwin_scrape_data
 *
 * Then re-run parse_vtwin_fitment_raw.mjs --apply to promote into catalog_fitment_v2.
 *
 * Usage:
 *   node scrape_vtwin_missing.mjs                  # full run
 *   node scrape_vtwin_missing.mjs --phase1-only    # URL discovery only
 *   node scrape_vtwin_missing.mjs --phase2-only    # HTML fetch only (uses checkpoint)
 *   node scrape_vtwin_missing.mjs --limit 100      # test with first 100 SKUs
 *
 * Checkpoint: ./vtwin_scrape_checkpoint.json  (safe to delete to restart)
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const DB_URL = process.env.CATALOG_DATABASE_URL
  || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog';

const GRAPHQL_URL  = 'https://www2.vtwinmfg.com/graphql';
const PRODUCT_BASE = 'https://www2.vtwinmfg.com';
const CHECKPOINT   = path.join(__dirname, 'vtwin_scrape_checkpoint.json');

const GRAPHQL_BATCH   = 50;    // SKUs per GraphQL request
const HTML_CONCURRENCY = 8;    // parallel HTML fetches
const GRAPHQL_DELAY_MS = 200;  // ms between GraphQL batches
const HTML_DELAY_MS    = 80;   // ms between HTML fetches per worker

const PHASE1_ONLY = process.argv.includes('--phase1-only');
const PHASE2_ONLY = process.argv.includes('--phase2-only');
const LIMIT_IDX   = process.argv.indexOf('--limit');
const LIMIT       = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : Infinity;

const pool = new Pool({ connectionString: DB_URL });

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT)) {
    return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
  }
  return { urlKeys: {}, done: [] }; // urlKeys: { sku: url_key }, done: [sku, ...]
}

function saveCheckpoint(cp) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2));
}

// Parse FITS and other fields from product page HTML
function parsePage(html, sku) {
  const result = { sku, fitment_raw: null, oem_no: null, description: null,
                   uom: null, manufacturer: null, origin: null,
                   extra_attributes: null, product_url: null };

  // FITS field
  const fitsMatch = html.match(/data-th="FITS"[^>]*>\s*(?:<BR>|<br>|<br\s*\/>)?\s*([^<]+)/i);
  if (fitsMatch) result.fitment_raw = fitsMatch[1].trim();

  // OEM No.
  const oemMatch = html.match(/data-th="OEM No\."[^>]*>\s*([^<]+)/i);
  if (oemMatch) result.oem_no = oemMatch[1].trim();

  // Description
  const descMatch = html.match(/<div class="value"\s*>([^<]+)<\/div>/i);
  if (descMatch) result.description = descMatch[1].trim();

  // UOM
  const uomMatch = html.match(/data-th="UOM"[^>]*>\s*([^<]+)/i);
  if (uomMatch) result.uom = uomMatch[1].trim();

  // Manufacturer
  const mfgMatch = html.match(/data-th="Manufacturer"[^>]*>\s*([^<]+)/i);
  if (mfgMatch) result.manufacturer = mfgMatch[1].trim();

  // Origin
  const originMatch = html.match(/data-th="Origin"[^>]*>\s*([^<]+)/i);
  if (originMatch) result.origin = originMatch[1].trim();

  // Finish (sometimes present)
  const finishMatch = html.match(/data-th="Finish"[^>]*>\s*([^<]+)/i);
  if (finishMatch) result.extra_attributes = JSON.stringify({ Finish: finishMatch[1].trim() });

  return result;
}

// ── Phase 1: GraphQL URL key discovery ───────────────────────────────────────

async function phase1(skus, cp) {
  const missing = skus.filter(s => !cp.urlKeys[s]);
  if (missing.length === 0) {
    console.log('Phase 1: all URL keys already in checkpoint, skipping.');
    return;
  }
  console.log(`\nPhase 1: discovering URL keys for ${missing.length} SKUs...`);

  let found = 0, notFound = 0;

  for (let i = 0; i < missing.length; i += GRAPHQL_BATCH) {
    const batch = missing.slice(i, i + GRAPHQL_BATCH);
    const skuList = batch.map(s => JSON.stringify(s)).join(',');
    const query = `{ products(filter: {sku: {in: [${skuList}]}}) { items { sku url_key } } }`;

    try {
      const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      const items = data?.data?.products?.items || [];

      for (const item of items) {
        if (item.url_key) {
          cp.urlKeys[item.sku] = item.url_key;
          found++;
        }
      }
      // SKUs with no result get a null marker so we skip them in phase 2
      for (const s of batch) {
        if (!cp.urlKeys[s]) {
          cp.urlKeys[s] = null;
          notFound++;
        }
      }
    } catch (err) {
      console.error(`  GraphQL batch ${i}–${i + batch.length} failed:`, err.message);
    }

    // Save checkpoint every 10 batches
    if ((i / GRAPHQL_BATCH) % 10 === 9) saveCheckpoint(cp);

    const pct = Math.round(((i + batch.length) / missing.length) * 100);
    process.stdout.write(`\r  ${i + batch.length}/${missing.length} (${pct}%) — found: ${found}, not found: ${notFound}   `);

    if (i + GRAPHQL_BATCH < missing.length) await sleep(GRAPHQL_DELAY_MS);
  }

  saveCheckpoint(cp);
  console.log(`\n  Done — found: ${found}, not found: ${notFound}`);
}

// ── Phase 2: HTML fetch + parse ───────────────────────────────────────────────

async function phase2(skus, cp, db) {
  const todo = skus.filter(s => cp.urlKeys[s] && !cp.done.includes(s));
  if (todo.length === 0) {
    console.log('\nPhase 2: nothing to fetch.');
    return;
  }
  console.log(`\nPhase 2: fetching HTML for ${todo.length} products (${HTML_CONCURRENCY} concurrent)...`);

  let completed = 0, hasFitment = 0, noFitment = 0, errors = 0;
  const doneSet = new Set(cp.done);

  // Worker pool
  async function worker(queue) {
    while (queue.length > 0) {
      const sku = queue.shift();
      const urlKey = cp.urlKeys[sku];
      const url = `${PRODUCT_BASE}/${urlKey}.html`;

      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; catalog-bot/1.0)' },
          signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
          errors++;
        } else {
          const html = await res.text();
          const parsed = parsePage(html, sku);
          parsed.product_url = url;

          await db.query(`
            INSERT INTO vtwin_scrape_data
              (sku, product_url, fitment_raw, oem_no, description, uom,
               manufacturer, origin, extra_attributes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (sku) DO UPDATE SET
              product_url      = EXCLUDED.product_url,
              fitment_raw      = COALESCE(EXCLUDED.fitment_raw, vtwin_scrape_data.fitment_raw),
              oem_no           = COALESCE(EXCLUDED.oem_no, vtwin_scrape_data.oem_no),
              description      = COALESCE(EXCLUDED.description, vtwin_scrape_data.description),
              uom              = COALESCE(EXCLUDED.uom, vtwin_scrape_data.uom),
              manufacturer     = COALESCE(EXCLUDED.manufacturer, vtwin_scrape_data.manufacturer),
              origin           = COALESCE(EXCLUDED.origin, vtwin_scrape_data.origin),
              extra_attributes = COALESCE(EXCLUDED.extra_attributes, vtwin_scrape_data.extra_attributes),
              scraped_at       = now()
          `, [sku, parsed.product_url, parsed.fitment_raw, parsed.oem_no,
              parsed.description, parsed.uom, parsed.manufacturer,
              parsed.origin, parsed.extra_attributes]);

          if (parsed.fitment_raw) hasFitment++; else noFitment++;
        }
      } catch (err) {
        errors++;
      }

      doneSet.add(sku);
      completed++;

      if (completed % 100 === 0) {
        cp.done = [...doneSet];
        saveCheckpoint(cp);
        const pct = Math.round((completed / todo.length) * 100);
        process.stdout.write(
          `\r  ${completed}/${todo.length} (${pct}%) — fitment: ${hasFitment}, no fitment: ${noFitment}, errors: ${errors}   `
        );
      }

      await sleep(HTML_DELAY_MS);
    }
  }

  const queue = [...todo];
  await Promise.all(Array.from({ length: HTML_CONCURRENCY }, () => worker(queue)));

  cp.done = [...doneSet];
  saveCheckpoint(cp);

  console.log(`\n\n── Phase 2 done ──`);
  console.log(`  Completed:   ${completed}`);
  console.log(`  Has fitment: ${hasFitment}`);
  console.log(`  No fitment:  ${noFitment}`);
  console.log(`  Errors:      ${errors}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = await pool.connect();
  const cp = loadCheckpoint();

  try {
    // Load never-scraped VTwin SKUs
    const { rows } = await db.query(`
      SELECT cu.vendor_sku AS sku
      FROM catalog_unified cu
      LEFT JOIN vtwin_scrape_data vsd ON vsd.sku = cu.vendor_sku
      WHERE cu.source_vendor = 'VTWIN'
        AND cu.is_active = true
        AND vsd.sku IS NULL
      ORDER BY cu.vendor_sku
    `);

    let skus = rows.map(r => r.sku);
    if (LIMIT < Infinity) {
      skus = skus.slice(0, LIMIT);
      console.log(`-- LIMIT mode: ${skus.length} SKUs --`);
    }

    console.log(`Total never-scraped SKUs: ${skus.length}`);
    console.log(`Checkpoint: ${Object.keys(cp.urlKeys).length} URL keys cached, ${cp.done.length} HTML done`);

    if (!PHASE2_ONLY) await phase1(skus, cp);
    if (!PHASE1_ONLY) await phase2(skus, cp, db);

    console.log('\nAll done. Now run:');
    console.log('  node scripts/ingest/parse_vtwin_fitment_raw.mjs --apply');

  } finally {
    db.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
