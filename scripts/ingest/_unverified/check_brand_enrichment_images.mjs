/**
 * scripts/ingest/check_brand_enrichment_images.mjs
 *
 * Checks whether pu_brand_enrichment.image_uri serves real images for PU
 * products, using the SAME normalized SKU join as
 * import_pu_brand_catalogs_WORKING.js:
 *   replace(cu.sku, '-', '') = replace(replace(pbe.sku, '-', ''), '.', '')
 *
 * (An earlier version of this script used a naive exact sku = sku join,
 * which under-matched — this version matches the real import pipeline.)
 *
 * Usage:
 *   node scripts/ingest/check_brand_enrichment_images.mjs --sample=300
 *   node scripts/ingest/check_brand_enrichment_images.mjs --sample=300 --only-zip-broken
 *
 * --only-zip-broken restricts the sample to PU products whose CURRENT
 * catalog_unified.image_url is known to be a zip (id IN the known-bad set
 * isn't tracked in SQL, so this flag instead samples from products where
 * pu_catalog.image_url and product_image agree — the pattern we found
 * correlates with the zip contamination — giving a more targeted sample
 * than just any row with an image_uri).
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
const hasFlag = (name) => args.includes(`--${name}`);

const SAMPLE      = parseInt(getArg('sample', '300'), 10);
const CONCURRENCY = parseInt(getArg('concurrency', '15'), 10);
const TIMEOUT_MS  = parseInt(getArg('timeout', '8000'), 10);
const ONLY_ZIP_BROKEN = hasFlag('only-zip-broken');

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
  console.log('Finding pu_brand_enrichment rows for PU products (normalized SKU join)…');

  const zipBrokenFilter = ONLY_ZIP_BROKEN
    ? `AND pc.image_url = pc.product_image` // the pattern correlated with zip contamination
    : '';

  const { rows } = await pool.query(`
    SELECT * FROM (
      SELECT DISTINCT ON (cu.id) cu.id, cu.sku, pbe.image_uri, pbe.image_uris
      FROM catalog_unified cu
      JOIN pu_brand_enrichment pbe
        ON replace(cu.sku, '-', '') = replace(replace(pbe.sku, '-', ''), '.', '')
      JOIN pu_catalog pc ON pc.sku = cu.sku
      WHERE cu.source_vendor = 'PU'
        AND cu.is_active = true
        AND pbe.image_uri IS NOT NULL
        AND pbe.image_uri NOT ILIKE '%coming-soon%'
        ${zipBrokenFilter}
    ) deduped
    ORDER BY random()
    LIMIT ${SAMPLE}
  `);

  console.log(`  ${rows.length} candidate rows loaded${ONLY_ZIP_BROKEN ? ' (restricted to likely zip-broken products)' : ''}.`);

  if (rows.length === 0) {
    console.log('No matching rows found.');
    await pool.end();
    return;
  }

  console.log(`Checking image_uri content-type for each (concurrency=${CONCURRENCY})…`);

  const startedAt = Date.now();
  const results = await runWithConcurrency(rows, CONCURRENCY, async (r) => {
    const check = await checkUrl(r.image_uri);
    return { id: r.id, sku: r.sku, url: r.image_uri, ...check };
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

  console.log(`pu_brand_enrichment.image_uri results (n=${results.length}):`);
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
    console.log('  pu_brand_enrichment.image_uri is reliable — safe to use for a targeted backfill.');
  } else if (goodCount / results.length > 0.5) {
    console.log('  Partially reliable — backfill should verify content-type per row, not blind-copy.');
  } else {
    console.log('  Not reliable — same problem persists even in this table for this sample.');
  }

  const withMultiple = rows.filter(r => Array.isArray(r.image_uris) && r.image_uris.length > 1).length;
  console.log(`\n${withMultiple} of ${rows.length} sampled rows have more than one URL in image_uris[].`);

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
