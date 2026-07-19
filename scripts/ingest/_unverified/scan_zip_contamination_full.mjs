/**
 * scripts/ingest/scan_zip_contamination_full.mjs
 *
 * Full (non-sampled) stopgap scan for the PU image-zip contamination issue.
 * Extends check_dead_images.mjs's approach (real Content-Type check via
 * ranged GET, not status-only) to cover BOTH columns the page actually
 * renders from:
 *   1. catalog_unified.image_url   (primary)
 *   2. catalog_media.url           (fallback — COALESCE(image_url, catalog_media.url))
 *
 * Why both matter together: nulling a bad image_url alone does nothing
 * visible if the catalog_media fallback for that same product is ALSO
 * contaminated — the page just serves the same zip via the fallback path.
 * They have to be assessed and cleared as a pair per product.
 *
 * This also surfaces a case the original sampling missed: some products
 * with a bad image_url may have a perfectly good catalog_media row at a
 * different priority. For those, nulling image_url actually RESCUES a real
 * photo instead of falling back to the "NO IMAGE" placeholder. Reported
 * separately so you know the stopgap isn't pure loss.
 *
 * Defaults to DRY RUN — scans and reports, writes nothing to the database.
 * Pass --apply to actually null bad image_urls and delete bad catalog_media
 * rows.
 *
 * Usage:
 *   node scripts/ingest/scan_zip_contamination_full.mjs                  (dry run)
 *   node scripts/ingest/scan_zip_contamination_full.mjs --apply          (writes changes)
 *   node scripts/ingest/scan_zip_contamination_full.mjs --concurrency=20
 *
 * Requires: CATALOG_DATABASE_URL env var.
 * Output: CSV report + console summary.
 */

import pg from 'pg';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const { Pool } = pg;

// ── Minimal .env loader (same as check_dead_images.mjs) ───────────────────────

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const APPLY       = args.includes('--apply');
const CONCURRENCY = parseInt(getArg('concurrency', '15'), 10);
const TIMEOUT_MS  = parseInt(getArg('timeout', '8000'), 10);

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL env var is required.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── Concurrency-limited queue (same as check_dead_images.mjs) ──────────────────

async function runWithConcurrency(items, limit, worker) {
  let idx = 0, active = 0, done = 0;
  const results = new Array(items.length);
  return new Promise((res) => {
    function next() {
      if (idx >= items.length && active === 0) { res(results); return; }
      while (active < limit && idx < items.length) {
        const i = idx++;
        active++;
        worker(items[i], i).then((r) => {
          results[i] = r;
          active--; done++;
          printProgress(done, items.length);
          next();
        });
      }
    }
    next();
  });
}

function printProgress(done, total) {
  const pct = ((done / total) * 100).toFixed(1);
  const barLen = 30;
  const filled = Math.round((done / total) * barLen);
  const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
  process.stdout.write(`\r  [${bar}] ${pct}%  (${done}/${total})`);
  if (done === total) process.stdout.write('\n');
}

async function checkUrl(url) {
  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: { Range: 'bytes=0-1023' },
      });
      clearTimeout(timer);
      const contentType = res.headers.get('content-type') ?? '';
      return {
        resolved: res.ok || res.status === 206,
        status: res.status,
        contentType,
        isImage: contentType.toLowerCase().startsWith('image/'),
      };
    } catch (err) {
      clearTimeout(timer);
      return { resolved: false, status: null, contentType: '', isImage: false, error: err.name === 'AbortError' ? 'TIMEOUT' : err.message };
    }
  };
  let result = await attempt();
  if (!result.resolved && (result.error === 'TIMEOUT' || result.status === null)) {
    await new Promise(r => setTimeout(r, 400));
    result = await attempt();
  }
  return result;
}

async function scanUrls(label, urls) {
  console.log(`\nChecking ${urls.length} unique ${label} URLs (concurrency=${CONCURRENCY})…`);
  const startedAt = Date.now();
  const results = await runWithConcurrency(urls, CONCURRENCY, async (url) => ({ url, ...(await checkUrl(url)) }));
  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
  const byUrl = new Map();
  results.forEach((r, i) => byUrl.set(urls[i], r));
  return byUrl;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(APPLY ? '── Full zip-contamination scan (APPLY MODE — will write changes) ──'
                     : '── Full zip-contamination scan (DRY RUN — nothing will be written) ──');

  // 1. All active products with a non-null image_url
  console.log('\nLoading active products…');
  const { rows: products } = await pool.query(`
    SELECT id, sku, name, brand, source_vendor, image_url
    FROM catalog_unified
    WHERE is_active = true
  `);
  console.log(`  ${products.length} active products loaded.`);

  const productMap = new Map(products.map(p => [p.id, p]));
  const imageUrlProducts = products.filter(p => p.image_url && p.image_url.trim() !== '');
  const uniqueImageUrls = [...new Set(imageUrlProducts.map(p => p.image_url))];

  // 2. All catalog_media rows (image type) for active products
  const { rows: mediaRows } = await pool.query(`
    SELECT cm.id, cm.product_id, cm.url, cm.priority
    FROM catalog_media cm
    JOIN catalog_unified cu ON cu.id = cm.product_id
    WHERE cu.is_active = true AND cm.media_type = 'image'
  `);
  console.log(`  ${mediaRows.length} catalog_media image rows loaded across active products.`);
  const uniqueMediaUrls = [...new Set(mediaRows.map(m => m.url))];

  // ── Scan both sets of URLs ────────────────────────────────────────────────
  const imageUrlResults = await scanUrls('image_url', uniqueImageUrls);
  const mediaUrlResults = await scanUrls('catalog_media.url', uniqueMediaUrls);

  // ── Classify ──────────────────────────────────────────────────────────────
  const badImageUrlProductIds = [];
  const badMediaIds = [];
  const mediaByProduct = new Map(); // product_id -> media rows with status attached

  for (const m of mediaRows) {
    const status = mediaUrlResults.get(m.url);
    const isBad = !status.resolved || !status.isImage;
    if (isBad) badMediaIds.push(m.id);
    if (!mediaByProduct.has(m.product_id)) mediaByProduct.set(m.product_id, []);
    mediaByProduct.get(m.product_id).push({ ...m, isBad });
  }

  let rescueCount = 0;
  let placeholderCount = 0;
  const reportRows = [['product_id', 'sku', 'brand', 'source_vendor', 'name', 'image_url_status', 'image_url_content_type', 'good_catalog_media_remaining', 'classification']];

  for (const p of imageUrlProducts) {
    const status = imageUrlResults.get(p.image_url);
    const isBad = !status.resolved || !status.isImage;
    if (!isBad) continue; // good image_url — nothing to report or do

    badImageUrlProductIds.push(p.id);

    const mediaForProduct = mediaByProduct.get(p.id) ?? [];
    const goodMediaRemaining = mediaForProduct.filter(m => !m.isBad).length;
    const classification = goodMediaRemaining > 0 ? 'RESCUED_BY_CATALOG_MEDIA' : 'PLACEHOLDER_NO_IMAGE';

    if (classification === 'RESCUED_BY_CATALOG_MEDIA') rescueCount++;
    else placeholderCount++;

    reportRows.push([
      p.id, p.sku, p.brand ?? '', p.source_vendor ?? '', (p.name ?? '').replace(/"/g, '""'),
      status.resolved ? 'resolved' : 'dead', status.contentType ?? '', goodMediaRemaining, classification,
    ]);
  }

  // Also catch products with image_url already null/empty whose ONLY catalog_media
  // option is bad — these aren't in imageUrlProducts at all but still need their
  // bad catalog_media row(s) cleared so they fall through to the placeholder
  // instead of a still-broken fallback image.
  const nullImageUrlBadFallback = products.filter(p => {
    if (p.image_url && p.image_url.trim() !== '') return false; // has its own image_url, handled above
    const mediaForProduct = mediaByProduct.get(p.id) ?? [];
    return mediaForProduct.length > 0 && mediaForProduct.every(m => m.isBad);
  });

  const toCsv = (rows) => rows.map(row => row.map(v => `"${String(v)}"`).join(',')).join('\n');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = `zip_scan_report_${stamp}.csv`;
  writeFileSync(reportPath, toCsv(reportRows));

  console.log('\n── Summary ──');
  console.log(`  Active products scanned:                 ${products.length}`);
  console.log(`  Products with bad image_url:               ${badImageUrlProductIds.length}`);
  console.log(`    → rescued by a good catalog_media row:    ${rescueCount}`);
  console.log(`    → no good fallback (will show placeholder): ${placeholderCount}`);
  console.log(`  Products with null image_url + dead-only catalog_media fallback: ${nullImageUrlBadFallback.length}`);
  console.log(`  Total catalog_media rows confirmed bad:   ${badMediaIds.length}`);
  console.log(`\n  Report written: ${reportPath}`);

  if (!APPLY) {
    console.log('\n  Dry run only — re-run with --apply to null bad image_urls and delete bad catalog_media rows.');
    await pool.end();
    return;
  }

  console.log('\n── Applying changes ──');
  if (badImageUrlProductIds.length > 0) {
    await pool.query(`UPDATE catalog_unified SET image_url = NULL WHERE id = ANY($1)`, [badImageUrlProductIds]);
    console.log(`  Nulled image_url on ${badImageUrlProductIds.length} products.`);
  }
  if (badMediaIds.length > 0) {
    await pool.query(`DELETE FROM catalog_media WHERE id = ANY($1)`, [badMediaIds]);
    console.log(`  Deleted ${badMediaIds.length} bad catalog_media rows.`);
  }
  console.log('\n  ✓ Applied.');

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
