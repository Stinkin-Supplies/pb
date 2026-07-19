/**
 * scripts/ingest/check_product_image_column.mjs
 *
 * Sanity check before trusting pu_catalog.product_image as the replacement
 * source for catalog_unified.image_url: samples rows where image_url and
 * product_image disagree, and checks the actual Content-Type of
 * product_image specifically (not image_url) — same wrong-content-type
 * detection as check_dead_images.mjs, applied to the candidate fix column
 * instead of the column we already know is broken.
 *
 * Usage:
 *   node scripts/ingest/check_product_image_column.mjs --sample=300
 */

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const { Pool } = pg;

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

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const SAMPLE      = parseInt(getArg('sample', '300'), 10);
const CONCURRENCY = parseInt(getArg('concurrency', '15'), 10);
const TIMEOUT_MS  = parseInt(getArg('timeout', '8000'), 10);

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL env var is required.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function runWithConcurrency(items, limit, worker) {
  let idx = 0, active = 0, done = 0;
  const results = new Array(items.length);
  return new Promise((resolve) => {
    function next() {
      if (idx >= items.length && active === 0) { resolve(results); return; }
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

async function main() {
  console.log('Fetching PU rows where image_url and product_image disagree…');

  const { rows } = await pool.query(`
    SELECT sku, image_url, product_image
    FROM pu_catalog
    WHERE image_url IS NOT NULL AND image_url <> ''
      AND product_image IS NOT NULL AND product_image <> ''
      AND image_url <> product_image
    ORDER BY random()
    LIMIT ${SAMPLE}
  `);

  console.log(`  ${rows.length} candidate rows loaded.`);
  console.log(`Checking product_image content-type for each (concurrency=${CONCURRENCY})…`);

  const startedAt = Date.now();
  const results = await runWithConcurrency(rows, CONCURRENCY, async (r) => {
    const check = await checkUrl(r.product_image);
    return { sku: r.sku, url: r.product_image, ...check };
  });
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Done in ${elapsedSec}s.\n`);

  const goodCount = results.filter(r => r.isImage).length;
  const badTypeCount = results.filter(r => r.resolved && !r.isImage).length;
  const deadCount = results.filter(r => !r.resolved).length;

  const ctCounts = new Map();
  for (const r of results) {
    if (!r.isImage) {
      const key = r.resolved ? r.contentType : `DEAD (${r.status ?? r.error})`;
      ctCounts.set(key, (ctCounts.get(key) ?? 0) + 1);
    }
  }

  console.log(`product_image results (n=${results.length}):`);
  console.log(`  Good (real image):        ${goodCount}  (${((goodCount / results.length) * 100).toFixed(1)}%)`);
  console.log(`  Wrong content-type:       ${badTypeCount}`);
  console.log(`  Dead/unreachable:         ${deadCount}`);

  if (ctCounts.size) {
    console.log('\nBreakdown of non-image results:');
    for (const [ct, count] of [...ctCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${count.toString().padStart(4)}  ${ct}`);
    }
  }

  console.log('\nVerdict:');
  if (goodCount / results.length > 0.9) {
    console.log('  product_image looks reliable — safe to use as the image_url replacement source.');
  } else if (goodCount / results.length > 0.5) {
    console.log('  product_image is better than image_url but not clean — consider COALESCE(good check) before bulk update.');
  } else {
    console.log('  product_image is NOT reliably better — do not blindly swap; needs more investigation.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
