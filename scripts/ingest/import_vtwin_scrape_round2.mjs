#!/usr/bin/env node
/**
 * import_vtwin_scrape_round2.mjs  — optimised version
 *
 * Speed improvements over v1:
 *   • SKU cache loaded once at startup       → eliminates 18K SELECT queries
 *   • Model-year cache loaded once at startup → eliminates 364K SELECT queries
 *   • generate_series for year gap-filling    → 1 query per model instead of N×2
 *   • Fitment rows batched via unnest arrays  → 121 INSERTs instead of 364K
 *   • OEM rows batched via unnest arrays      → 121 INSERTs instead of 4K
 *   • Universal marks batched via ANY($ids)  → 1 UPDATE per batch
 *
 * Usage:
 *   node scripts/ingest/import_vtwin_scrape_round2.mjs [CSV_PATH] [--dry-run] [--deactivate-notfound]
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CSV_PATH = process.argv.find(a => a.endsWith('.csv'))
  || path.resolve(__dirname, '../../data/1781059180975_vtwin_fitment.csv');
const DRY_RUN             = process.argv.includes('--dry-run');
const DEACTIVATE_NOTFOUND = process.argv.includes('--deactivate-notfound');
const BATCH_SIZE          = 200;

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL || process.env.DATABASE_URL,
  max: 5,
});

const stats = {
  total: 0, skuMissing: 0, namesUpdated: 0,
  oemsInserted: 0, universalMarked: 0,
  fitmentInserted: 0, fitmentSkipped: 0,
  yearsGenerated: 0, errors: 0, deactivated: 0,
};

// ── In-memory caches (loaded once before processing) ──────────────────────────
let skuCache        = new Map(); // sku/bare_sku → { id, sku, name }
let modelYearsCache = new Map(); // model_code  → Map( year → model_year_id )
let modelIdCache    = new Map(); // model_code  → model_id (for gap-filling)
let vintageFamilyId = null;

async function buildCaches() {
  process.stdout.write('Loading SKU cache... ');
  const { rows: skuRows } = await pool.query(
    `SELECT id, sku, name FROM catalog_unified WHERE source_vendor = 'VTWIN' AND is_active = true`
  );
  for (const r of skuRows) {
    skuCache.set(r.sku, r);
    if (r.sku.startsWith('VT-')) skuCache.set(r.sku.slice(3), r);
  }
  console.log(`${skuRows.length.toLocaleString()} SKUs`);

  process.stdout.write('Loading model-year cache... ');
  const { rows: myRows } = await pool.query(
    `SELECT hm.model_code, hm.id::int AS model_id, hmy.year::int AS year, hmy.id::int AS id
     FROM harley_model_years hmy
     JOIN harley_models hm ON hm.id = hmy.model_id`
  );
  for (const r of myRows) {
    if (!modelYearsCache.has(r.model_code)) modelYearsCache.set(r.model_code, new Map());
    modelYearsCache.get(r.model_code).set(r.year, r.id);
    modelIdCache.set(r.model_code, r.model_id);
  }
  console.log(`${myRows.length.toLocaleString()} year entries across ${modelYearsCache.size} models`);

  const { rows: famRows } = await pool.query(
    `SELECT id FROM harley_families WHERE name = 'Vintage' LIMIT 1`
  );
  vintageFamilyId = famRows[0]?.id ?? null;
}

// ── Model-year lookup from cache ──────────────────────────────────────────────
function getIdsFromCache(modelCode, yearStart, yearEnd) {
  const yearMap = modelYearsCache.get(modelCode);
  if (!yearMap) return [];
  const ids = [];
  for (let y = yearStart; y <= yearEnd; y++) {
    const id = yearMap.get(y);
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

// ── Fill year gaps using generate_series (one query per model/range) ──────────
const VINTAGE_NAMES = {
  EL:'EL Knucklehead', UL:'UL Side Valve', ULH:'ULH Sport', U:'U Side Valve',
  WL:'WL Sport Solo', WLD:'WLD Deluxe Solo', WLR:'WLR Competition', WR:'WR Racing',
  W:'W Sport Solo', G:'G Servi-Car', GE:'GE Servi-Car (Electric)',
  K:'K Model', KH:'KH Model', KHK:'KHK Model',
  VL:'VL Side Valve', VLD:'VLD Deluxe',
  J:'J Model', JD:'JD Model', JDH:'JDH Model',
  XLC:'XLC Sportster', XLR:'XLR Sportster',
};

async function ensureYearsAndGetIds(client, modelCode, yearStart, yearEnd) {
  let modelId = modelIdCache.get(modelCode);

  // If model not in cache at all, create it
  if (modelId === undefined) {
    if (!vintageFamilyId) return [];
    const modelName = VINTAGE_NAMES[modelCode] || modelCode;
    const { rows } = await client.query(
      `INSERT INTO harley_models (model_code, name, family_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (model_code) DO UPDATE SET model_code = EXCLUDED.model_code
       RETURNING id`,
      [modelCode, modelName, vintageFamilyId]
    );
    modelId = rows[0].id;
    modelIdCache.set(modelCode, modelId);
    if (!modelYearsCache.has(modelCode)) modelYearsCache.set(modelCode, new Map());
  }

  // Fill missing years with a single generate_series query
  const { rows: newYears } = await client.query(
    `INSERT INTO harley_model_years (model_id, year)
     SELECT $1::int, gs
     FROM generate_series($2::int, $3::int) gs
     LEFT JOIN harley_model_years existing
       ON existing.model_id = $1 AND existing.year = gs
     WHERE existing.id IS NULL
     RETURNING id, year`,
    [modelId, yearStart, yearEnd]
  );

  // Update the in-memory cache with new entries
  const yearMap = modelYearsCache.get(modelCode);
  for (const r of newYears) {
    yearMap.set(r.year, r.id);
    stats.yearsGenerated++;
  }

  return getIdsFromCache(modelCode, yearStart, yearEnd);
}

// ── Fitment classifiers ───────────────────────────────────────────────────────
const NON_HD = new Set(['INDIAN','CHIEF','SCOUT','ACE','REPLACEMENT']);
const SEG_RE = /^([A-Z][A-Z0-9]*)\s+(\d{4})-(\d{4}|UP)\b/i;

function parseSegment(seg) {
  const m = seg.trim().match(SEG_RE);
  if (!m) return null;
  const code = m[1].toUpperCase();
  if (NON_HD.has(code)) return null;
  return { modelCode: code, yearStart: parseInt(m[2]),
           yearEnd: m[3].toUpperCase() === 'UP' ? 2030 : parseInt(m[3]) };
}

function isUniversal(raw) {
  if (!raw) return false;
  const lo = raw.toLowerCase().trim();
  return lo === 'all models' || lo === 'all' || lo === 'all models.' ||
    lo.startsWith('all 19') || lo.startsWith('all chain') ||
    lo.startsWith('all tail') || lo.startsWith('all turn') ||
    lo === 'all models with female mounting block';
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const fields = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { fields.push(cur || null); cur = ''; }
    else cur += c;
  }
  fields.push(cur || null);
  return fields;
}

// ── Process a batch — collect ops, execute as bulk statements ─────────────────
async function processBatch(rows) {
  // Collect operations within the batch before touching the DB
  const fitmentPairs   = [];  // [productId, modelYearId]
  const oemPairs       = [];  // [sku, oem_number]
  const universalIds   = [];  // product ids to mark universal
  const nameUpdates    = [];  // [id, name]
  const fitmentNeeded  = [];  // rows needing generate_series (cache miss)

  // ── Pass 1: resolve everything from cache ─────────────────────────────────
  for (const row of rows) {
    const bareSku = row.sku?.trim();
    if (!bareSku) continue;

    const product = skuCache.get(`VT-${bareSku}`) || skuCache.get(bareSku);
    if (!product) { stats.skuMissing++; continue; }

    const { id: productId, sku: dbSku, name: currentName } = product;

    // Name backfill
    const nameRaw = row.product_name?.trim();
    if (nameRaw && nameRaw !== currentName) {
      const looksLikeSku = /^\d[\d\-]+$/.test(currentName.trim())
        || currentName.trim() === bareSku || currentName.trim() === `VT-${bareSku}`;
      if (looksLikeSku) nameUpdates.push([productId, nameRaw]);
    }

    // OEM
    const oemRaw = row.oem_no ? String(row.oem_no).replace(/\.0$/, '').trim() : null;
    if (oemRaw && oemRaw !== 'nan' && oemRaw !== 'NaN') oemPairs.push([dbSku, oemRaw]);

    // Fitment
    const fitRaw = row.fitment_raw;
    if (!fitRaw) continue;

    if (isUniversal(fitRaw)) { universalIds.push(productId); continue; }

    const lo = fitRaw.toLowerCase().trim();
    if (lo.startsWith('custom application') || lo === 'custom') continue;

    const segments = fitRaw.includes(' | ') ? fitRaw.split(' | ') : [fitRaw];
    for (const seg of segments) {
      const parsed = parseSegment(seg);
      if (!parsed) { stats.fitmentSkipped++; continue; }

      const { modelCode, yearStart, yearEnd } = parsed;
      const ids = getIdsFromCache(modelCode, yearStart, yearEnd);

      if (ids.length) {
        for (const myId of ids) fitmentPairs.push([productId, myId]);
      } else {
        // Need DB gap-fill — defer to pass 2
        fitmentNeeded.push({ productId, modelCode, yearStart, yearEnd });
      }
    }
  }

  // ── Pass 2: handle cache misses (generate_series, then re-resolve) ────────
  if (fitmentNeeded.length && !DRY_RUN) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const { productId, modelCode, yearStart, yearEnd } of fitmentNeeded) {
        const ids = await ensureYearsAndGetIds(client, modelCode, yearStart, yearEnd);
        if (ids.length) for (const myId of ids) fitmentPairs.push([productId, myId]);
        else stats.fitmentSkipped++;
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); stats.errors++; }
    finally { client.release(); }
  } else {
    stats.fitmentSkipped += fitmentNeeded.length;
  }

  // ── Pass 3: bulk writes ───────────────────────────────────────────────────
  if (DRY_RUN) {
    stats.namesUpdated    += nameUpdates.length;
    stats.oemsInserted    += oemPairs.length;
    stats.universalMarked += universalIds.length;
    stats.fitmentInserted += fitmentPairs.length;
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Name updates (typically very few)
    for (const [id, name] of nameUpdates) {
      await client.query(`UPDATE catalog_unified SET name = $1 WHERE id = $2`, [name, id]);
      stats.namesUpdated++;
    }

    // OEM batch insert
    if (oemPairs.length) {
      await client.query(
        `INSERT INTO catalog_oem_crossref (sku, oem_number, source)
         SELECT unnest($1::text[]), unnest($2::text[]), 'vtwin_scrape_r2'
         ON CONFLICT (sku, oem_number) DO NOTHING`,
        [oemPairs.map(p => p[0]), oemPairs.map(p => p[1])]
      );
      stats.oemsInserted += oemPairs.length;
    }

    // Universal mark batch
    if (universalIds.length) {
      await client.query(
        `UPDATE catalog_unified SET is_universal = true WHERE id = ANY($1::int[])`,
        [universalIds]
      );
      stats.universalMarked += universalIds.length;
    }

    // Fitment batch insert
    if (fitmentPairs.length) {
      await client.query(
        `INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
         SELECT unnest($1::int[]), unnest($2::int[])
         ON CONFLICT (product_id, model_year_id) DO NOTHING`,
        [fitmentPairs.map(p => p[0]), fitmentPairs.map(p => p[1])]
      );
      stats.fitmentInserted += fitmentPairs.length;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    stats.errors++;
    console.error(`\nBatch write failed: ${err.message}`);
  } finally {
    client.release();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nVTwin Round-2 Scrape Import (optimised)`);
  console.log(`CSV:       ${CSV_PATH}`);
  console.log(`Dry run:   ${DRY_RUN}\n`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`); process.exit(1);
  }

  await buildCaches();
  console.log('');

  const lines   = fs.readFileSync(CSV_PATH, 'utf-8').split('\n');
  const headers = parseCSVLine(lines[0]).map(h => h?.trim());
  const colIdx  = Object.fromEntries(headers.map((h, i) => [h, i]));

  const scraped = [], notFound = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    const row    = Object.fromEntries(Object.entries(colIdx).map(([k, j]) => [k, fields[j] ?? null]));
    stats.total++;
    (row.source === 'not_found' ? notFound : scraped).push(row);
  }

  console.log(`Loaded ${stats.total.toLocaleString()} rows`);
  console.log(`  Scraped:   ${scraped.length.toLocaleString()}`);
  console.log(`  Not found: ${notFound.length.toLocaleString()}\n`);

  const batches = [];
  for (let i = 0; i < scraped.length; i += BATCH_SIZE) batches.push(scraped.slice(i, i + BATCH_SIZE));
  console.log(`Processing ${batches.length} batches of ${BATCH_SIZE}...`);

  for (let b = 0; b < batches.length; b++) {
    await processBatch(batches[b]);
    if ((b + 1) % 5 === 0 || b === batches.length - 1) {
      const pct = Math.round(((b + 1) / batches.length) * 100);
      process.stdout.write(
        `\r  ${pct}% — names: ${stats.namesUpdated} | oem: ${stats.oemsInserted} ` +
        `| universal: ${stats.universalMarked} | fitment: ${stats.fitmentInserted}`
      );
    }
  }
  console.log('\n');

  // Deactivate not-found
  if (DEACTIVATE_NOTFOUND && notFound.length && !DRY_RUN) {
    console.log(`Deactivating ${notFound.length.toLocaleString()} not-found SKUs...`);
    const skus    = notFound.flatMap(r => [`VT-${r.sku}`, r.sku]);
    const client  = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `UPDATE catalog_unified SET is_active = false
         WHERE sku = ANY($1::text[]) AND source_vendor = 'VTWIN' AND is_active = true`,
        [skus]
      );
      stats.deactivated = rowCount;
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); }
    finally { client.release(); }
  }

  console.log('═══════════════════════════════════════');
  console.log('  IMPORT SUMMARY');
  console.log('═══════════════════════════════════════');
  console.log(`  Total rows:           ${stats.total.toLocaleString()}`);
  console.log(`  Not found (skipped):  ${notFound.length.toLocaleString()}`);
  console.log(`  SKU not in DB:        ${stats.skuMissing.toLocaleString()}`);
  console.log(`  Names backfilled:     ${stats.namesUpdated.toLocaleString()}`);
  console.log(`  OEM numbers:          ${stats.oemsInserted.toLocaleString()}`);
  console.log(`  Universal marked:     ${stats.universalMarked.toLocaleString()}`);
  console.log(`  Fitment rows:         ${stats.fitmentInserted.toLocaleString()}`);
  console.log(`  Fitment skipped:      ${stats.fitmentSkipped.toLocaleString()}`);
  console.log(`  Year entries added:   ${stats.yearsGenerated.toLocaleString()}`);
  console.log(`  Deactivated:          ${stats.deactivated.toLocaleString()}`);
  console.log(`  Errors:               ${stats.errors.toLocaleString()}`);
  if (DRY_RUN) console.log('\n  ** DRY RUN — no changes written **');
  console.log('');

  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
