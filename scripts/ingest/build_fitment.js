#!/usr/bin/env node
/**
 * build_fitment.js
 * ----------------
 * Populates fitment columns in catalog_unified using three data sources:
 *
 *   SOURCE A — VTwin OEM_XREF columns:
 *     vtwin-master.csv  OEM_XREF1/2/3  →  hd_parts_data_clean.csv (year + model)
 *     Join key: vendor_sku = vtwin ITEM
 *     Coverage: ~5,399 VTwin catalog items
 *
 *   SOURCE B — WPS OEM cross reference:
 *     wps_harley_oem_cross_reference.csv  OEM# → WPS#  →  hd_parts_data_clean.csv
 *     Join key: sku = WPS#
 *     Coverage: ~1,063 WPS catalog items
 *
 *   SOURCE C — Fatbook/Oldbook OEM cross reference:
 *     oem_cross_reference.csv  oem_number → part_number (catalog SKU)  →  hd_parts_data_clean.csv
 *     Coverage: ~452 PU/DS catalog items
 *
 * Output columns populated:
 *   fitment_year_start     — earliest year across all matched HD records
 *   fitment_year_end       — latest year
 *   fitment_year_ranges    — JSON: [{year_start, year_end, family, models}]
 *   fitment_hd_families    — PostgreSQL array: {Touring,Softail,...}
 *   fitment_hd_models      — JSON array of specific model strings
 *   is_harley_fitment      — true if any HD fitment found
 *   is_universal           — true if universal signals detected
 *
 * NOTE: HD parts data covers 1979–2012. Fitment for newer models (2013+)
 * must come from the PU XML ACES data (separate pipeline).
 *
 * Usage:
 *   node build_fitment.js
 *   node build_fitment.js --dry-run
 *   node build_fitment.js --vendor vtwin   # only process one vendor
 *   node build_fitment.js --vendor wps
 *   node build_fitment.js --vendor pu
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { ProgressBar } from './progress_bar.js';

const { Pool } = pg;

const DRY_RUN     = process.argv.includes('--dry-run');
const FORCE       = process.argv.includes('--force');
const VENDOR_FLAG = process.argv.includes('--vendor')
  ? process.argv[process.argv.indexOf('--vendor') + 1]?.toLowerCase()
  : null;

const DATA_DIR = path.resolve('scripts/data');
const BATCH    = 150;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── HD Model Family Classifier ────────────────────────────────────────────────

const FAMILY_PATTERNS = [
  { family: 'Touring',   regex: /\b(FLH[TXCRSE]?|FLHR|FLHX|FLTR|ELECTRA|TOUR GLIDE|ULTRA CLASSIC|ROAD KING|ROAD GLIDE|STREET GLIDE|TRI GLIDE|FREEWHEELER)\b/i },
  { family: 'Softail',   regex: /\b(FLST[CFBN]?|FXST[CBSF]?|FAT BOY|HERITAGE|DELUXE|SPRINGER|BREAKOUT|SLIM|STREET BOB|LOW RIDER S|DEUCE|NIGHT TRAIN)\b/i },
  { family: 'Dyna',      regex: /\b(FXD[BCILSWX]?|DYNA|LOW RIDER|WIDE GLIDE|STREET BOB|SUPER GLIDE|FAT BOB|SWITCHBACK)\b/i },
  { family: 'Sportster', regex: /\b(XL[HS\d]?|SPORTSTER|ROADSTER|NIGHTSTER|FORTY-EIGHT|SEVENTY-TWO|IRON)\b/i },
  { family: 'FXR',       regex: /\bFXR[SDTP]?\b/i },
  { family: 'V-Rod',     regex: /\b(VRSC[ADW]?|V-ROD|VROD|MUSCLE|NIGHT ROD)\b/i },
];

function classifyFamily(modelStr) {
  for (const { family, regex } of FAMILY_PATTERNS) {
    if (regex.test(modelStr)) return family;
  }
  return 'Other';
}

// ── Universal Part Detection ──────────────────────────────────────────────────

const UNIVERSAL_CATEGORIES = new Set([
  'Chemicals', 'Lubricants', 'Tools', 'Hardware', 'Accessories',
  'Cleaning', 'Fluids', 'Shop Supplies',
]);

const UNIVERSAL_NAME_PATTERNS = [
  /\buniversal\b/i,
  /\ball models?\b/i,
  /\ball harley\b/i,
  /\ball h-d\b/i,
  /^(chrome |black )?(bolt|nut|washer|screw|clip)/i,
];

function isUniversal(row) {
  if (UNIVERSAL_CATEGORIES.has(row.category)) return true;
  const name = String(row.name || '').toLowerCase();
  return UNIVERSAL_NAME_PATTERNS.some(p => p.test(name));
}

// ── Build Compact Year Ranges ─────────────────────────────────────────────────
/**
 * Converts a flat list of {year, family, model} records into compact ranges:
 * [{year_start: 1984, year_end: 1999, family: 'Touring', models: ['FLHTC', ...]}, ...]
 * Consecutive years within the same family are merged into one range.
 */
function buildYearRanges(records) {
  // Group by family
  const byFamily = {};
  for (const r of records) {
    if (!byFamily[r.family]) byFamily[r.family] = { years: new Set(), models: new Set() };
    byFamily[r.family].years.add(r.year);
    byFamily[r.family].models.add(r.model);
  }

  const ranges = [];
  for (const [family, { years, models }] of Object.entries(byFamily)) {
    const sorted = [...years].sort((a, b) => a - b);
    // Merge consecutive years into spans
    let spanStart = sorted[0];
    let spanEnd   = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] <= 2) { // allow 1-year gaps (data holes)
        spanEnd = sorted[i];
      } else {
        ranges.push({ year_start: spanStart, year_end: spanEnd, family, models: [...models].slice(0, 20) });
        spanStart = spanEnd = sorted[i];
      }
    }
    ranges.push({ year_start: spanStart, year_end: spanEnd, family, models: [...models].slice(0, 20) });
  }

  return ranges.sort((a, b) => a.year_start - b.year_start);
}

// ── Load Files ────────────────────────────────────────────────────────────────

function loadCSV(filepath, label) {
  console.log(`📂  Loading ${label}…`);
  const raw = fs.readFileSync(filepath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`   → ${rows.length.toLocaleString()} rows`);
  return rows;
}

function nullify(val) {
  if (!val) return null;
  const s = String(val).trim();
  return s === '' || s === 'null' ? null : s;
}

// ── Build OEM → [{year, model, family}] index from hd_parts_data ─────────────

function buildHdIndex(hdRows) {
  console.log('\n🗂️   Building HD parts OEM index…');
  const index = new Map(); // oem_clean → [{year, model, family}]

  const pb = new ProgressBar(hdRows.length, 'HD index');
  for (const r of hdRows) {
    pb.increment();
    const oem = nullify(r.oem_part_number);
    if (!oem) continue;
    const key = oem.toUpperCase().trim();
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({
      year   : parseInt(r.year),
      model  : r.model,
      family : classifyFamily(r.model),
    });
  }
  pb.finish();

  console.log(`   → ${index.size.toLocaleString()} unique OEM numbers indexed`);
  return index;
}

// ── Resolve fitment for a set of OEM numbers using the HD index ───────────────

function resolveFitment(oems, hdIndex) {
  const hits = [];
  for (const oem of oems) {
    const key = String(oem).toUpperCase().trim();
    const records = hdIndex.get(key) || [];
    hits.push(...records);
  }
  if (hits.length === 0) return null;

  const years    = hits.map(h => h.year).filter(y => y > 1900);
  const families = [...new Set(hits.map(h => h.family).filter(f => f !== 'Other'))];
  const ranges   = buildYearRanges(hits);

  return {
    year_start          : Math.min(...years),
    year_end            : Math.max(...years),
    fitment_year_ranges : ranges,                          // jsonb — pass as object
    fitment_hd_families : families.length > 0 ? families : null,  // text[] — pass as array
    fitment_hd_models   : [...new Set(hits.map(h => h.model))].slice(0, 50), // text[] — pass as array
    is_harley_fitment   : true,
  };
}

// ── Source A: VTwin ───────────────────────────────────────────────────────────

async function processVtwin(client, hdIndex, catalogMap) {
  if (VENDOR_FLAG && VENDOR_FLAG !== 'vtwin') return 0;
  console.log('\n━━━  Source A: VTwin OEM_XREF  ━━━');

  const vtRows = loadCSV(path.join(DATA_DIR, 'vtwin-master.csv'), 'VTwin master');

  // Fetch VTWIN catalog rows
  const { rows: catVt } = await client.query(`
    SELECT id, vendor_sku, fitment_year_start, fitment_hd_families, name, category
    FROM catalog_unified WHERE source_vendor = 'VTWIN'
  `);
  console.log(`   Catalog VTWIN rows: ${catVt.length.toLocaleString()}`);

  // Build vtwin ITEM → OEM xrefs map
  const vtOemMap = new Map();
  for (const r of vtRows) {
    const item = nullify(r.ITEM);
    if (!item) continue;
    const oems = [r.OEM_XREF1, r.OEM_XREF2, r.OEM_XREF3].map(nullify).filter(Boolean);
    if (oems.length > 0) vtOemMap.set(item, oems);
  }

  const updates = [];
  const pb = new ProgressBar(catVt.length, 'VTwin fitment');

  for (const row of catVt) {
    pb.increment();
    if (row.fitment_year_start && !FORCE) continue; // already has fitment

    const oems = vtOemMap.get(row.vendor_sku);
    if (!oems) continue;

    const fit = resolveFitment(oems, hdIndex);
    if (!fit) continue;

    const universal = isUniversal(row);
    updates.push({
      sql: `UPDATE catalog_unified SET
              fitment_year_start    = $1,
              fitment_year_end      = $2,
              fitment_year_ranges   = $3::jsonb,
              fitment_hd_families   = $4,
              fitment_hd_models     = $5,
              is_harley_fitment     = $6,
              is_universal          = $7,
              updated_at            = NOW()
            WHERE id = $8`,
      params: [
        fit.year_start,
        fit.year_end,
        JSON.stringify(fit.fitment_year_ranges),
        fit.fitment_hd_families,
        fit.fitment_hd_models,
        fit.is_harley_fitment,
        universal,
        row.id,
      ],
    });
  }
  pb.finish();

  console.log(`   → ${updates.length} VTwin rows with fitment resolved`);
  return executeUpdates(client, updates, 'VTwin');
}

// ── Source B: WPS OEM xref ────────────────────────────────────────────────────

async function processWps(client, hdIndex) {
  if (VENDOR_FLAG && VENDOR_FLAG !== 'wps') return 0;
  console.log('\n━━━  Source B: WPS OEM cross reference  ━━━');

  const wpsOemRows = loadCSV(
    path.join(DATA_DIR, 'wps_harley_oem_cross_reference.csv'),
    'WPS OEM xref'
  );

  // Build WPS# → [OEM#] map (one WPS SKU can replace multiple OEM parts)
  const wpsSku2Oems = new Map();
  for (const r of wpsOemRows) {
    const wps = nullify(r['WPS#']);
    const oem = nullify(r['OEM#']);
    if (!wps || !oem) continue;
    if (!wpsSku2Oems.has(wps)) wpsSku2Oems.set(wps, []);
    wpsSku2Oems.get(wps).push(oem);
  }

  const { rows: catWps } = await client.query(`
    SELECT id, sku, fitment_year_start, name, category
    FROM catalog_unified WHERE source_vendor = 'WPS'
  `);

  const updates = [];
  const pb = new ProgressBar(catWps.length, 'WPS fitment');

  for (const row of catWps) {
    pb.increment();
    if (row.fitment_year_start && !FORCE) continue;

    const oems = wpsSku2Oems.get(row.sku);
    if (!oems) continue;

    const fit = resolveFitment(oems, hdIndex);
    if (!fit) continue;

    const universal = isUniversal(row);
    updates.push({
      sql: `UPDATE catalog_unified SET
              fitment_year_start    = $1,
              fitment_year_end      = $2,
              fitment_year_ranges   = $3::jsonb,
              fitment_hd_families   = $4,
              fitment_hd_models     = $5,
              is_harley_fitment     = $6,
              is_universal          = $7,
              updated_at            = NOW()
            WHERE id = $8`,
      params: [
        fit.year_start,
        fit.year_end,
        JSON.stringify(fit.fitment_year_ranges),
        fit.fitment_hd_families,
        fit.fitment_hd_models,
        fit.is_harley_fitment,
        universal,
        row.id,
      ],
    });
  }
  pb.finish();

  console.log(`   → ${updates.length} WPS rows with fitment resolved`);
  return executeUpdates(client, updates, 'WPS');
}

// ── Source C: Fatbook/Oldbook OEM cross reference → PU/DS SKUs ───────────────

async function processPu(client, hdIndex) {
  if (VENDOR_FLAG && VENDOR_FLAG !== 'pu') return 0;
  console.log('\n━━━  Source C: Fatbook/Oldbook OEM cross reference  ━━━');

  const xrefRows = loadCSV(
    path.join(DATA_DIR, 'oem_cross_reference.csv'),
    'OEM cross reference'
  );

  // Build catalog_sku → [oem_numbers] map
  const sku2Oems = new Map();
  for (const r of xrefRows) {
    const sku = nullify(r.part_number);
    const oem = nullify(r.oem_number);
    if (!sku || !oem) continue;
    if (!sku2Oems.has(sku)) sku2Oems.set(sku, []);
    sku2Oems.get(sku).push(oem);
  }

  const { rows: catPu } = await client.query(`
    SELECT id, sku, fitment_year_start, name, category, fitment_hd_families
    FROM catalog_unified WHERE source_vendor = 'PU'
  `);

  const updates = [];
  const pb = new ProgressBar(catPu.length, 'PU fitment');

  for (const row of catPu) {
    pb.increment();
    // PU already has partial fitment — only fill gaps unless --force
    if (row.fitment_year_start && row.fitment_hd_families && !FORCE) continue;

    const oems = sku2Oems.get(row.sku);
    if (!oems) continue;

    const fit = resolveFitment(oems, hdIndex);
    if (!fit) continue;

    // Merge with existing families if PU already had some
    let families = fit.fitment_hd_families; // already a JS array
    if (row.fitment_hd_families && !FORCE) {
      const existing = Array.isArray(row.fitment_hd_families)
        ? row.fitment_hd_families
        : row.fitment_hd_families.replace(/[{}]/g, '').split(',').map(s => s.trim());
      const newFams = Array.isArray(fit.fitment_hd_families)
        ? fit.fitment_hd_families
        : [];
      families = [...new Set([...existing, ...newFams])];
    }

    const universal = isUniversal(row);
    updates.push({
      sql: `UPDATE catalog_unified SET
              fitment_year_start    = COALESCE(fitment_year_start, $1),
              fitment_year_end      = COALESCE(fitment_year_end, $2),
              fitment_year_ranges   = COALESCE(fitment_year_ranges, $3::jsonb),
              fitment_hd_families   = $4,
              fitment_hd_models     = COALESCE(fitment_hd_models, $5),
              is_harley_fitment     = true,
              is_universal          = $6,
              updated_at            = NOW()
            WHERE id = $7`,
      params: [
        fit.year_start,
        fit.year_end,
        JSON.stringify(fit.fitment_year_ranges),
        families,
        fit.fitment_hd_models,
        universal,
        row.id,
      ],
    });
  }
  pb.finish();

  console.log(`   → ${updates.length} PU rows with fitment resolved/enriched`);
  return executeUpdates(client, updates, 'PU');
}

// ── Fix is_universal for remaining rows ───────────────────────────────────────

async function fixUniversal(client) {
  console.log('\n━━━  Universal flag sweep  ━━━');
  const { rows } = await client.query(`
    SELECT id, name, category, fitment_year_start
    FROM catalog_unified
    WHERE is_universal = false
  `);

  const toMark = rows.filter(r => isUniversal(r));
  console.log(`   → Marking ${toMark.length} rows as universal`);

  if (!DRY_RUN && toMark.length > 0) {
    const ids = toMark.map(r => r.id);
    await client.query(`
      UPDATE catalog_unified SET is_universal = true, updated_at = NOW()
      WHERE id = ANY($1)
    `, [ids]);
  }
  return toMark.length;
}

// ── Execute batch updates ─────────────────────────────────────────────────────

async function executeUpdates(client, updates, label) {
  if (updates.length === 0) return 0;
  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would execute ${updates.length} updates for ${label}`);
    return updates.length;
  }

  const pb = new ProgressBar(updates.length, `Writing ${label}`);
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    for (const u of batch) await client.query(u.sql, u.params);
    written += batch.length;
    pb.update(written);
  }
  pb.finish();
  return written;
}

// ── Coverage report ───────────────────────────────────────────────────────────

async function coverageReport(client) {
  const { rows } = await client.query(`
    SELECT
      source_vendor,
      COUNT(*) as total,
      COUNT(fitment_year_start) as has_year,
      COUNT(fitment_hd_families) as has_families,
      COUNT(fitment_year_ranges) as has_ranges,
      SUM(CASE WHEN is_harley_fitment THEN 1 ELSE 0 END) as harley_flagged,
      SUM(CASE WHEN is_universal THEN 1 ELSE 0 END) as universal_flagged
    FROM catalog_unified
    GROUP BY source_vendor
    ORDER BY source_vendor
  `);

  console.log('\n📊  Fitment Coverage Report:');
  console.log('  Vendor  | Total  | Has Year | Has Families | Has Ranges | HD Flag | Universal');
  console.log('  --------|--------|----------|--------------|------------|---------|----------');
  for (const r of rows) {
    console.log(
      `  ${r.source_vendor.padEnd(7)} | ${String(r.total).padEnd(6)} | ` +
      `${String(r.has_year).padEnd(8)} | ${String(r.has_families).padEnd(12)} | ` +
      `${String(r.has_ranges).padEnd(10)} | ${String(r.harley_flagged).padEnd(7)} | ${r.universal_flagged}`
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧  build_fitment.js  ${DRY_RUN ? '[DRY RUN]' : ''}${VENDOR_FLAG ? `[vendor=${VENDOR_FLAG}]` : ''}\n`);
  console.log('ℹ️   HD parts data covers 1979–2012. Post-2012 fitment comes from PU ACES XML.');

  const hdRows = loadCSV(path.join(DATA_DIR, 'hd_parts_data_clean.csv'), 'HD parts data');
  const hdIndex = buildHdIndex(hdRows);

  const client = await pool.connect();
  try {
    if (!DRY_RUN) await client.query('BEGIN');

    const vtCount  = await processVtwin(client, hdIndex);
    const wpsCount = await processWps(client, hdIndex);
    const puCount  = await processPu(client, hdIndex);
    const univCount = await fixUniversal(client);

    if (!DRY_RUN) await client.query('COMMIT');

    console.log('\n✅  Done.');
    console.log(`   VTwin rows with fitment  : ${vtCount}`);
    console.log(`   WPS rows with fitment    : ${wpsCount}`);
    console.log(`   PU rows with fitment     : ${puCount}`);
    console.log(`   Universal rows flagged   : ${univCount}`);
    if (DRY_RUN) console.log('\n   ⚠️  DRY RUN — no changes written to DB');

    await coverageReport(client);

  } catch (err) {
    if (!DRY_RUN) await client.query('ROLLBACK');
    console.error('❌  Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
