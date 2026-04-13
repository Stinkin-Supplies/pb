#!/usr/bin/env node
/**
 * import-hd-fitment.js
 *
 * Imports hd_parts_data_clean.csv into catalog_fitment.
 *
 * CSV columns: year, model, assembly, oem_part_number, part_description
 *
 * Join path:
 *   oem_part_number → catalog_oem_crossref.oem_number → catalog_products.sku
 *   → catalog_fitment (product_id, make, model, year_start, year_end, notes)
 *
 * Year-range grouping:
 *   Instead of one row per year, the script groups each (oem_number, model_clean)
 *   combination and collapses consecutive years into ranges.
 *   Gap tolerance: 2 years (e.g. 1986, 1988 → treated as one range 1986–1988).
 *
 * Usage:
 *   node scripts/ingest/import-hd-fitment.js
 *   node scripts/ingest/import-hd-fitment.js --dry-run      # parse only, no DB writes
 *   node scripts/ingest/import-hd-fitment.js --clear        # TRUNCATE catalog_fitment first
 *   node scripts/ingest/import-hd-fitment.js --limit 5000   # test on first 5000 CSV rows
 *
 * Prerequisites:
 *   Run: python3 scripts/ingest/clean-hd-csv.py  (already done — creates hd_parts_data_clean.csv)
 *   or point --file at the raw CSV (it will auto-strip &nbsp)
 */

'use strict';

import fs       from 'fs';
import path     from 'path';
import readline from 'readline';
import pg       from 'pg';
import dotenv   from 'dotenv';

dotenv.config({ path: '.env.local' });

// ── CLI args ──────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const getArg  = f => { const i = args.indexOf(f); return i !== -1 ? args[i+1] : null; };
const hasFlag = f => args.includes(f);

const DEFAULT_FILE = 'scripts/data/hd_parts_data_clean.csv';
const FILE    = getArg('--file') || DEFAULT_FILE;
const DRY_RUN = hasFlag('--dry-run');
const CLEAR   = hasFlag('--clear');
const LIMIT   = parseInt(getArg('--limit') || '0', 10);
const BATCH   = parseInt(getArg('--batch') || '1000', 10);
const GAP_TOL = 2;  // years gap still treated as continuous range

if (!fs.existsSync(FILE)) {
  console.error(`\n❌  File not found: ${FILE}`);
  console.error(`    Run the cleaner first, or pass --file path/to/hd_parts_data_final.csv\n`);
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: false, max: 3,
});

// ── Model string helpers ──────────────────────────────────────────────────────

// Extract the model code prefix (e.g. "FLHR" from "FLHR ROAD KING (FB)")
function extractModelCode(model) {
  const m = model.match(/^([A-Z0-9\-]+)/);
  return m ? m[1] : null;
}

// Map model prefixes / keywords to clean HD family names
const MODEL_FAMILIES = [
  { re: /^XL|SPORTSTER/i,           family: 'Sportster' },
  { re: /^FLST|^FXST|SOFTAIL/i,     family: 'Softail' },
  { re: /^FLD|^FXD|^FXDL|DYNA/i,   family: 'Dyna' },
  { re: /^FL[HT]|^FLTR|TOURING/i,   family: 'Touring' },
  { re: /^FLHR|ROAD KING/i,         family: 'Road King' },
  { re: /^FLHX|STREET GLIDE/i,      family: 'Street Glide' },
  { re: /^FLTR|ROAD GLIDE/i,        family: 'Road Glide' },
  { re: /^FXR\b/i,                   family: 'FXR' },
  { re: /^FX[W]?G|WIDE GLIDE/i,     family: 'Wide Glide' },
  { re: /^VRS|V-ROD/i,              family: 'V-Rod' },
  { re: /TRIKE|^TRI GLIDE/i,        family: 'Trike' },
];

function modelFamily(model) {
  for (const { re, family } of MODEL_FAMILIES) {
    if (re.test(model)) return family;
  }
  return null;
}

// Normalise model string for grouping:
// "FLHR ROAD KING (FB)" → "FLHR ROAD KING"  (drop variant code in parens)
function normalizeModel(model) {
  return model
    .replace(/\s*\([^)]+\)\s*$/g, '')  // drop trailing (FB), (INJECTION) etc.
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Year-range collapsing ─────────────────────────────────────────────────────
// Given a sorted array of years, returns [{year_start, year_end}] ranges
function collapseYears(years, gapTolerance = GAP_TOL) {
  if (!years || years.length === 0) return [];
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const ranges = [];
  let start = sorted[0];
  let end   = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - end <= gapTolerance + 1) {
      end = sorted[i];
    } else {
      ranges.push({ year_start: start, year_end: end });
      start = sorted[i];
      end   = sorted[i];
    }
  }
  ranges.push({ year_start: start, year_end: end });
  return ranges;
}

// ── DB lookups ────────────────────────────────────────────────────────────────
async function buildLookups(client) {
  process.stdout.write('   Loading OEM crossref → product_id map…');

  // Primary: oem_number → [product_id, ...]  via catalog_oem_crossref.sku → catalog_products.sku
  const { rows: oemRows } = await client.query(`
    SELECT DISTINCT x.oem_number, cp.id AS product_id
    FROM catalog_oem_crossref x
    JOIN catalog_products cp ON cp.sku = x.sku
    WHERE x.oem_number IS NOT NULL AND x.oem_number <> ''
  `);

  const oemMap = new Map();
  for (const r of oemRows) {
    const key = r.oem_number.trim();
    if (!oemMap.has(key)) oemMap.set(key, new Set());
    oemMap.get(key).add(r.product_id);
  }

  // Secondary: page_reference (Brand-Part#) ↔ catalog_products.manufacturer_part_number
  // This catches products catalogued under a different SKU but sharing the same MPN.
  // e.g. crossref has page_reference=JGI-738; a PU product has manufacturer_part_number=JGI-738
  const mpnMap = new Map();
  try {
    const { rows: mpnRows } = await client.query(`
      SELECT DISTINCT
        UPPER(TRIM(cp.manufacturer_part_number)) AS mpn,
        cp.id AS product_id
      FROM catalog_products cp
      WHERE cp.manufacturer_part_number IS NOT NULL
        AND btrim(cp.manufacturer_part_number) <> ''
    `);
    for (const r of mpnRows) {
      if (!mpnMap.has(r.mpn)) mpnMap.set(r.mpn, new Set());
      mpnMap.get(r.mpn).add(r.product_id);
    }
  } catch { /* manufacturer_part_number column may not exist on older schema */ }

  // Also build page_reference → product_id from the crossref itself
  // (page_reference is already joined to a SKU, so this piggybacks off the oemMap)
  const { rows: pageRows } = await client.query(`
    SELECT DISTINCT
      UPPER(TRIM(x.page_reference)) AS page_ref,
      cp.id AS product_id
    FROM catalog_oem_crossref x
    JOIN catalog_products cp ON cp.sku = x.sku
    WHERE x.page_reference IS NOT NULL AND x.page_reference <> ''
  `);
  for (const r of pageRows) {
    if (!mpnMap.has(r.page_ref)) mpnMap.set(r.page_ref, new Set());
    mpnMap.get(r.page_ref).add(r.product_id);
  }

  console.log(` ${oemMap.size.toLocaleString()} OEM#s  |  ${mpnMap.size.toLocaleString()} brand part#s (MPN)`);
  return { oemMap, mpnMap };
}

function resolveProductIds(oemNumber, lookups) {
  const { oemMap, mpnMap } = lookups;
  const key = (oemNumber ?? '').trim();
  if (!key) return [];

  const ids = new Set();

  // Primary: exact OEM# match → crossref → product_id
  if (oemMap.has(key)) oemMap.get(key).forEach(id => ids.add(id));

  // Try stripping leading zeros (some HD part numbers are stored with/without them)
  const stripped = key.replace(/^0+/, '');
  if (stripped && stripped !== key && oemMap.has(stripped)) {
    oemMap.get(stripped).forEach(id => ids.add(id));
  }

  // Secondary: OEM# might also appear as a manufacturer_part_number in some products
  // (rare, but handles cases where MPN = OEM# directly)
  if (ids.size === 0) {
    const mpnKey = key.toUpperCase();
    if (mpnMap.has(mpnKey)) mpnMap.get(mpnKey).forEach(id => ids.add(id));
  }

  return [...ids];
}

// ── Batch insert ──────────────────────────────────────────────────────────────
async function flushBatch(client, rows, dryRun) {
  if (rows.length === 0) return 0;
  if (dryRun) return rows.length;

  const vals   = [];
  const params = [];
  let   p      = 1;
  for (const r of rows) {
    vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
    params.push(r.product_id, r.make, r.model, r.year_start, r.year_end, r.notes);
  }

  const { rowCount } = await client.query(`
    INSERT INTO catalog_fitment (product_id, make, model, year_start, year_end, notes)
    VALUES ${vals.join(',')}
    ON CONFLICT DO NOTHING
  `, params);

  return rowCount ?? rows.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const fileSize = fs.statSync(FILE).size;
  console.log('\n🏍   HD Fitment Importer');
  console.log('─'.repeat(62));
  console.log(`   File    : ${path.basename(FILE)} (${(fileSize/1024/1024).toFixed(1)} MB)`);
  console.log(`   Mode    : ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}`);
  if (LIMIT) console.log(`   Limit   : first ${LIMIT.toLocaleString()} data rows`);
  console.log('─'.repeat(62));

  const client = await pool.connect();
  try {
    if (CLEAR && !DRY_RUN) {
      console.log('\n⚠   Truncating catalog_fitment…');
      await client.query('TRUNCATE catalog_fitment RESTART IDENTITY');
      console.log('    Done.\n');
    }

    console.log('\n📖  Building lookup maps from DB…');
    const lookups = await buildLookups(client);

    // ── Stream the CSV and accumulate into in-memory groups ─────────────────
    // Key: `${oem_number}|||${normalizedModel}` → Set<year>
    // We group ALL rows into memory first, then collapse year ranges.
    // At 1.25M rows with ~40k distinct OEM#s × ~500 models the map is large
    // but fits in a few hundred MB — acceptable for a one-shot import.

    console.log('\n📂  Streaming CSV…');
    const rl = readline.createInterface({
      input: fs.createReadStream(FILE, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    // Key: `oem|||modelNorm` → { modelNorm, assembly, years: Set<int> }
    const groups   = new Map();
    let   lineNo   = 0;
    let   parsed   = 0;
    let   skipped  = 0;

    for await (const raw of rl) {
      lineNo++;
      if (lineNo === 1) continue;  // skip header
      if (LIMIT && parsed >= LIMIT) break;

      const line = raw.replace(/\r/g, '').trim();
      if (!line) continue;

      // Fast CSV split — fields: year, model, assembly, oem_part_number, part_description
      // The last field (description) may be quoted. We only need fields 0-3.
      const firstComma = line.indexOf(',');
      if (firstComma === -1) { skipped++; continue; }
      const year = parseInt(line.slice(0, firstComma), 10);
      if (!year || year < 1900 || year > 2100) { skipped++; continue; }

      const rest1      = line.slice(firstComma + 1);
      const sc2        = rest1.indexOf(',');
      const modelRaw   = rest1.slice(0, sc2).trim();

      const rest2      = rest1.slice(sc2 + 1);
      const sc3        = rest2.indexOf(',');
      // assembly is rest2.slice(0, sc3) — we use it as notes

      const rest3      = rest2.slice(sc3 + 1);
      const sc4        = rest3.indexOf(',');
      const oemRaw     = sc4 !== -1 ? rest3.slice(0, sc4).trim() : rest3.trim();

      // Strip &nbsp just in case raw file is used
      const oemNum     = oemRaw.replace(/&nbsp;?/gi, '').trim();
      const modelNorm  = normalizeModel(modelRaw.replace(/&nbsp;?/gi, '').trim());
      const assembly   = rest2.slice(0, sc3).trim().replace(/&nbsp;?/gi, '');

      if (!oemNum || !modelNorm) { skipped++; continue; }

      const key = `${oemNum}|||${modelNorm}`;
      if (!groups.has(key)) {
        groups.set(key, { oemNum, modelNorm, assembly, years: new Set() });
      }
      groups.get(key).years.add(year);
      parsed++;

      if (parsed % 100_000 === 0) {
        process.stdout.write(`\r   ${parsed.toLocaleString()} rows scanned  |  ${groups.size.toLocaleString()} groups accumulated`);
      }
    }

    console.log(`\r   ${parsed.toLocaleString()} rows scanned  |  ${groups.size.toLocaleString()} unique (OEM×model) groups`);
    if (skipped) console.log(`   ${skipped.toLocaleString()} rows skipped (bad data)`);

    // ── Resolve product_ids and build fitment rows ───────────────────────────
    console.log('\n🔗  Resolving product IDs and collapsing year ranges…');

    let fitmentBatch   = [];
    let inserted       = 0;
    let unresolved     = 0;
    let groupsResolved = 0;

    const MAKE = 'Harley-Davidson';
    const startedAt = Date.now();

    for (const [, g] of groups) {
      const productIds = resolveProductIds(g.oemNum, lookups);

      if (productIds.length === 0) {
        unresolved++;
        continue;
      }

      const ranges   = collapseYears([...g.years]);
      const family   = modelFamily(g.modelNorm);
      const modelOut = family ?? g.modelNorm;  // prefer clean family name
      const notes    = g.assembly || null;

      for (const pid of productIds) {
        for (const { year_start, year_end } of ranges) {
          fitmentBatch.push({
            product_id: pid,
            make:       MAKE,
            model:      modelOut,
            year_start,
            year_end,
            notes,
          });
        }
      }

      groupsResolved++;

      if (fitmentBatch.length >= BATCH) {
        inserted += await flushBatch(client, fitmentBatch, DRY_RUN);
        fitmentBatch = [];
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
        process.stdout.write(
          `\r   ${groupsResolved.toLocaleString()} groups resolved  |  ${inserted.toLocaleString()} fitment rows inserted  |  ${elapsed}s`
        );
      }
    }

    // Flush remainder
    inserted += await flushBatch(client, fitmentBatch, DRY_RUN);

    const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log('\n\n' + '─'.repeat(62));
    console.log(`✅  Done in ${totalSec}s`);
    console.log(`\n   CSV rows parsed     : ${parsed.toLocaleString()}`);
    console.log(`   OEM×Model groups    : ${groups.size.toLocaleString()}`);
    console.log(`   Groups resolved     : ${groupsResolved.toLocaleString()}`);
    console.log(`   Groups unresolved   : ${unresolved.toLocaleString()}  (OEM# not in our catalog)`);
    console.log(`   Fitment rows        : ${inserted.toLocaleString()}${DRY_RUN ? '  (DRY RUN)' : ' inserted'}`);

    if (!DRY_RUN) {
      const { rows: [s] } = await client.query(`
        SELECT COUNT(*) AS total,
               COUNT(DISTINCT product_id) AS products,
               MIN(year_start) AS yr_min,
               MAX(year_end)   AS yr_max
        FROM catalog_fitment
        WHERE make = 'Harley-Davidson'
      `);
      console.log(`\n📊  catalog_fitment (H-D) now has:`);
      console.log(`   Total rows          : ${Number(s.total).toLocaleString()}`);
      console.log(`   Products w/ fitment : ${Number(s.products).toLocaleString()}`);
      console.log(`   Year coverage       : ${s.yr_min} – ${s.yr_max}`);
    }

    console.log('─'.repeat(62) + '\n');

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('\n❌  Fatal:', err.message);
  pool.end();
  process.exit(1);
});
