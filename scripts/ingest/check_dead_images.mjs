/**
 * scripts/ingest/check_dead_images.mjs
 *
 * Walks every active catalog_unified row with a non-null image_url and checks
 * two separate things:
 *   1. Does the URL actually resolve (not 404/timeout/network error)?
 *   2. Does it return real image bytes (Content-Type: image/*) — or does it
 *      silently return something else (application/zip, text/html error
 *      page, octet-stream, etc.) with a perfectly healthy 200 status?
 *
 * That second check matters: a URL can be "alive" by HTTP status alone while
 * still being useless as an <img src>. This was discovered when PU image_url
 * values were found pointing at ZIP archives instead of direct images —
 * status 200, content fails to render, invisible to a status-only checker.
 *
 * Dedupes by URL first since many variant rows share the same image.
 *
 * Usage:
 *   node scripts/ingest/check_dead_images.mjs                # full run
 *   node scripts/ingest/check_dead_images.mjs --sample=500    # quick test
 *   node scripts/ingest/check_dead_images.mjs --concurrency=10
 *
 * Requires: CATALOG_DATABASE_URL env var (same as everything else).
 * Output:   two CSVs in the working directory —
 *   dead_images_<timestamp>.csv       (URL never resolved)
 *   bad_content_type_images_<timestamp>.csv  (resolved, but not an image)
 */

import pg from 'pg';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const { Pool } = pg;

// ── Minimal .env loader (no dotenv dependency) ────────────────────────────────

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
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

const SAMPLE      = parseInt(getArg('sample', '0'), 10);       // 0 = no limit
const CONCURRENCY = parseInt(getArg('concurrency', '15'), 10);
const TIMEOUT_MS  = parseInt(getArg('timeout', '8000'), 10);

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL env var is required.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── Tiny concurrency-limited queue (no extra deps) ─────────────────────────────

async function runWithConcurrency(items, limit, worker) {
  let idx = 0;
  let active = 0;
  let done = 0;
  const results = new Array(items.length);

  return new Promise((resolve) => {
    function next() {
      if (idx >= items.length && active === 0) {
        resolve(results);
        return;
      }
      while (active < limit && idx < items.length) {
        const i = idx++;
        active++;
        worker(items[i], i).then((res) => {
          results[i] = res;
          active--;
          done++;
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

// ── URL check ─────────────────────────────────────────────────────────────────
// Always does a ranged GET (bytes=0-1023) rather than HEAD-first: some CDNs
// return different (or missing) headers on HEAD vs GET, and we need an
// accurate Content-Type every time, not just a status code. One retry on
// timeout/network error only — not on a clean 404 or a clean-but-wrong
// content type.

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
      return {
        resolved: false,
        status: null,
        contentType: '',
        isImage: false,
        error: err.name === 'AbortError' ? 'TIMEOUT' : err.message,
      };
    }
  };

  let result = await attempt();

  if (!result.resolved && (result.error === 'TIMEOUT' || result.status === null)) {
    await new Promise(r => setTimeout(r, 400));
    result = await attempt();
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching active products with image URLs…');

  const { rows } = await pool.query(`
    SELECT id, sku, name, brand, source_vendor, image_url
    FROM catalog_unified
    WHERE is_active = true
      AND image_url IS NOT NULL
      AND image_url <> ''
    ${SAMPLE > 0 ? `ORDER BY random() LIMIT ${SAMPLE}` : 'ORDER BY id'}
  `);

  console.log(`  ${rows.length} product rows loaded.`);

  const byUrl = new Map();
  for (const r of rows) {
    if (!byUrl.has(r.image_url)) byUrl.set(r.image_url, []);
    byUrl.get(r.image_url).push(r);
  }
  const uniqueUrls = [...byUrl.keys()];

  console.log(`  ${uniqueUrls.length} unique URLs to check (concurrency=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms).`);
  console.log('Checking…');

  const startedAt = Date.now();
  const results = await runWithConcurrency(uniqueUrls, CONCURRENCY, async (url) => {
    const r = await checkUrl(url);
    return { url, ...r };
  });

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done in ${elapsedSec}s.`);

  // ── Build CSVs ──────────────────────────────────────────────────────────────
  const deadRows = [['product_id', 'sku', 'brand', 'source_vendor', 'name', 'image_url', 'http_status', 'error']];
  const badTypeRows = [['product_id', 'sku', 'brand', 'source_vendor', 'name', 'image_url', 'http_status', 'content_type']];

  let deadUrlCount = 0, deadProductCount = 0;
  let badTypeUrlCount = 0, badTypeProductCount = 0;
  let goodUrlCount = 0;

  results.forEach((res, i) => {
    const products = byUrl.get(uniqueUrls[i]) ?? [];

    if (!res.resolved) {
      deadUrlCount++;
      deadProductCount += products.length;
      for (const p of products) {
        deadRows.push([p.id, p.sku, p.brand ?? '', p.source_vendor ?? '', (p.name ?? '').replace(/"/g, '""'), res.url, res.status ?? '', res.error ?? '']);
      }
      return;
    }

    if (!res.isImage) {
      badTypeUrlCount++;
      badTypeProductCount += products.length;
      for (const p of products) {
        badTypeRows.push([p.id, p.sku, p.brand ?? '', p.source_vendor ?? '', (p.name ?? '').replace(/"/g, '""'), res.url, res.status ?? '', res.contentType]);
      }
      return;
    }

    goodUrlCount++;
  });

  const toCsv = (rows) => rows.map(row => row.map(v => `"${String(v)}"`).join(',')).join('\n');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const deadPath = `dead_images_${stamp}.csv`;
  const badTypePath = `bad_content_type_images_${stamp}.csv`;

  writeFileSync(deadPath, toCsv(deadRows));
  writeFileSync(badTypePath, toCsv(badTypeRows));

  console.log('');
  console.log(`Checked ${uniqueUrls.length} unique URLs across ${rows.length} active products.`);
  console.log(`  Good (resolves + is an image):     ${goodUrlCount} URLs`);
  console.log(`  Dead (never resolves):             ${deadUrlCount} URLs  (${deadProductCount} products)`);
  console.log(`  Wrong content-type (200 but not an image, e.g. zip/html): ${badTypeUrlCount} URLs  (${badTypeProductCount} products)`);
  console.log('');
  console.log(`Written: ${deadPath}`);
  console.log(`Written: ${badTypePath}`);

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
