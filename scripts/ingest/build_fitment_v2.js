#!/usr/bin/env node
/**
 * build_fitment_v2.js
 * ───────────────────────────────────────────────────────────────────────────
 * Populates catalog_fitment_v2 (the real fitment table) using OEM cross
 * reference data joined against hd_parts_data_clean.csv.
 *
 * Data flow:
 *   VTwin:  vtwin-master OEM_XREF1/2/3 → hd_parts_data (year + model string)
 *             → harley_model_years.id → catalog_fitment_v2
 *   WPS:    wps_harley_oem_cross_reference OEM# → WPS# → hd_parts_data
 *             → harley_model_years.id → catalog_fitment_v2
 *
 * Model string matching:
 *   hd_parts_data uses verbose strings like "FLHT 1340 Electriglide (DC)"
 *   harley_models uses clean codes like "FLHT"
 *   We extract the leading model code and apply a variant→base mapping
 *   for fuel-injected (-I), police (P), special edition (SE) variants.
 *
 * Usage:
 *   node scripts/ingest/build_fitment_v2.js --dry-run
 *   node scripts/ingest/build_fitment_v2.js
 *   node scripts/ingest/build_fitment_v2.js --vendor vtwin
 *   node scripts/ingest/build_fitment_v2.js --vendor wps
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { parse } from 'csv-parse/sync';
import { ProgressBar } from './progress_bar.js';

const { Pool } = pg;
const require = createRequire(import.meta.url);
const { extractYears } = require('../../parse_years.js');
const { detectModel } = require('../../parse_models.js');
const { detectPlatform } = require('../../parse_platforms.js');

const DRY_RUN     = process.argv.includes('--dry-run');
const VENDOR_FLAG = process.argv.includes('--vendor')
  ? process.argv[process.argv.indexOf('--vendor') + 1]?.toLowerCase()
  : null;

const DATA_DIR = path.resolve('scripts/data');
const BATCH    = 500;
const ANALYSIS_LOG_LIMIT = 1000;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let analysisLogCount = 0;
const stats = {
  year_model: 0,
  year_platform: 0,
  model_only: 0,
  platform_only: 0,
  none: 0,
};

// ── Variant → base model code mapping ────────────────────────────────────────
const VARIANT_MAP = {
  'FLHRI':    'FLHR',  'FLHR-I':   'FLHR',
  'FLHRCI':   'FLHRC', 'FLHRC-I':  'FLHRC',
  'FLHRSI':   'FLHRS', 'FLHRSEI':  'FLHRS', 'FLHRSEI2': 'FLHRS',
  'FLHRSE3':  'FLHRS', 'FLHRSE4':  'FLHRS',
  'FLHTI':    'FLHT',
  'FLHTCI':   'FLHTC', 'FLHTC-I':  'FLHTC',
  'FLHTCUI':  'FLHTCU','FLHTCU-I': 'FLHTCU','FLHTC-U':  'FLHTCU',
  'FLHTCSE2': 'FLHTCU','FLHTCUSE2':'FLHTCU','FLHTCUSE3':'FLHTCU',
  'FLHTCUSE4':'FLHTCU','FLHTCUSE5':'FLHTCU','FLHTCUSE6':'FLHTCU',
  'FLHTCUSE7':'FLHTCU',
  'FLHXI':    'FLHX',  'FLHXSE2':  'FLHX',  'FLHXSE3':  'FLHX',
  'FLHPI':    'FLHT',  'FLHP':     'FLHT',  'FLHPE':    'FLHT',
  'FLHPEI':   'FLHT',  'FLHTP':    'FLHT',  'FLHTPI':   'FLHT',
  'FLT':      'FLHT',  'FLTHC':    'FLHTC', 'FLTC-U':   'FLTCU',
  'FLTRI':    'FLTR',  'FLTR-I':   'FLTR',  'FLTRC-I':  'FLTR',
  'FLTRSE3':  'FLTR',  'FLTRSEI2': 'FLTR',  'FLTCU-I':  'FLTCU',
  'FLSTCI':   'FLSTC', 'FLSTFI':   'FLSTF', 'FLSTI':    'FLST',
  'FLSTNI':   'FLSTN', 'FLSTSI':   'FLSTS', 'FLSTBI':   'FLSTF',
  'FLSTSCI':  'FLSTSC','FLSTSE2':  'FLSTSE','FLSTSE3':  'FLSTSE',
  'FLSTFSE2': 'FLSTF',
  'FXDI':     'FXD',   'FXDLI':    'FXDL',  'FXDCI':    'FXDC',
  'FXDWGI':   'FXDWG', 'FXDXI':    'FXDX',  'FXDBI':    'FXDB',
  'FXDX-CON': 'FXDX',  'FXDS-CON': 'FXDS',  'FXDB-D':   'FXDB',
  'FXDB-S':   'FXDB',  'FXDXT':    'FXDX',  'FXDP':     'FXD',
  'FXD35':    'FXD',   'FXDFSE2':  'FXDF',  'FXDSE2':   'FXDSE',
  'FXR-2':    'FXR',   'FXR-3':    'FXR',   'FXRC':     'FXR',
  'FXWG':     'FXDWG', 'FXWDG':    'FXDWG',
  'FXSTI':    'FXST',  'FXSTBI':   'FXSTB', 'FXSTDI':   'FXSTD',
  'FXSTSI':   'FXSTS', 'FXSTDR2':  'FXSTD', 'FXSTSSE2': 'FXSTSSE',
  'FXSTSSE3': 'FXSTSSE',
  'XL':       'XL883', 'XLCH':     'XLH',   'XLHA':     'XLH',
  'XLSA':     'XLS',   'XLHC1200': 'XLH1200','XLHS1200': 'XLH1200',
  'XLR':      'XLS',   'XR':       'XR1000', 'XR-1000':  'XR1000',
  'SPORSTER': 'XL883', 'SPORTSTER':'XL883',
  'V-ROD':    'VRSCA', 'VRSCAW':   'VRSCA', 'VRSCAWA':  'VRSCA',
  'VRSCDA':   'VRSCD', 'VRSCDXA':  'VRSCDX','VRSCSE2':  'VRSCSE',
  'VRXSE':    'VRSCSE',
  // Skip — no meaningful base model
  'POLICE':   null, 'SIDECAR': null, 'TLE': null, 'TLEU': null,
};

function extractModelCode(modelStr) {
  const m = modelStr.trim().toUpperCase().match(/^([A-Z0-9][A-Z0-9\-]*)/);
  return m ? m[1] : null;
}

function loadCSV(filepath, label) {
  console.log(`📂  Loading ${label}…`);
  const raw  = fs.readFileSync(filepath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`   → ${rows.length.toLocaleString()} rows`);
  return rows;
}

function nullify(val) {
  if (!val) return null;
  const s = String(val).trim();
  return s === '' || s === 'null' ? null : s;
}

async function loadModelAliases(db) {
  const { rows } = await db.query(`
    SELECT alias_text, model_family, model_code, priority
    FROM model_alias_map
    WHERE is_active = true
    ORDER BY priority DESC
  `);
  return rows;
}

async function loadPlatformMap(db) {
  const { rows } = await db.query(`
    SELECT alias_text, platform, start_year, end_year,
           applicable_families, confidence
    FROM engine_platform_map
    WHERE is_active = true
  `);
  return rows;
}

function analyzeFitment(text, modelAliases, platformMap) {
  const years = extractYears(text);
  const model = detectModel(text, modelAliases);
  const platform = detectPlatform(text, platformMap);

  if (years && model) {
    return { years, model, platform, expansion_type: 'year+model', confidence: 0.95 };
  }

  if (years && platform) {
    return { years, model, platform, expansion_type: 'year+platform', confidence: 0.85 };
  }

  if (model) {
    return { years, model, platform, expansion_type: 'model_only', confidence: 0.7 };
  }

  if (platform) {
    return { years, model, platform, expansion_type: 'platform_only', confidence: 0.6 };
  }

  return null;
}

function logFitmentAnalysis(sku, text, modelAliases, platformMap) {
  if (analysisLogCount >= ANALYSIS_LOG_LIMIT) return;

  const analysis = analyzeFitment(text, modelAliases, platformMap);
  const expansionType = analysis?.expansion_type ?? 'none';
  if (Object.prototype.hasOwnProperty.call(stats, expansionType)) {
    stats[expansionType]++;
  }
  console.log({
    sku,
    years: analysis?.years ?? null,
    model: analysis?.model ?? null,
    platform: analysis?.platform ?? null,
    expansion_type: analysis?.expansion_type ?? null,
  });
  analysisLogCount++;
}

function buildHdIndex(hdRows, knownCodes) {
  console.log('\n🗂️   Building HD OEM index…');
  const index = new Map();
  const pb    = new ProgressBar(hdRows.length, 'HD index');

  for (const r of hdRows) {
    pb.increment();
    const oem  = nullify(r.oem_part_number);
    const year = parseInt(r.year);
    if (!oem || !year || year < 1979) continue;

    let code = extractModelCode(r.model);
    if (!code) continue;

    if (VARIANT_MAP.hasOwnProperty(code)) {
      code = VARIANT_MAP[code];
    }
    if (!code || !knownCodes.has(code)) continue;

    const key = oem.toUpperCase();
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ year, modelCode: code });
  }
  pb.finish();
  console.log(`   → ${index.size.toLocaleString()} unique OEM numbers indexed`);
  return index;
}

function resolveModelYearIds(oems, hdIndex, modelYearMap) {
  const ids = new Set();
  for (const oem of oems) {
    const hits = hdIndex.get(oem.toUpperCase()) || [];
    for (const { year, modelCode } of hits) {
      const id = modelYearMap.get(`${modelCode}:${year}`);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

async function insertFitment(client, rows, label) {
  if (rows.length === 0) return 0;
  if (DRY_RUN) {
    console.log(`   [DRY RUN] Would insert ${rows.length.toLocaleString()} rows for ${label}`);
    return rows.length;
  }

  let inserted = 0;
  const pb = new ProgressBar(rows.length, `Writing ${label}`);

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const pIds  = batch.map(r => r.product_id);
    const myIds = batch.map(r => r.model_year_id);

    const res = await client.query(`
      INSERT INTO catalog_fitment_v2 (product_id, model_year_id)
      SELECT unnest($1::int[]), unnest($2::int[])
      ON CONFLICT (product_id, model_year_id) DO NOTHING
    `, [pIds, myIds]);

    inserted += res.rowCount;
    pb.update(Math.min(i + BATCH, rows.length));
  }
  pb.finish();
  return inserted;
}

async function processVtwin(client, hdIndex, modelYearMap, modelAliases, platformMap) {
  if (VENDOR_FLAG && VENDOR_FLAG !== 'vtwin') return;
  console.log('\n━━━  VTwin OEM_XREF → catalog_fitment_v2  ━━━');

  const vtRows = loadCSV(path.join(DATA_DIR, 'vtwin-master.csv'), 'VTwin master');

  const vtOemMap = new Map();
  for (const r of vtRows) {
    const item = nullify(r.ITEM);
    if (!item) continue;
    const oems = [r.OEM_XREF1, r.OEM_XREF2, r.OEM_XREF3].map(nullify).filter(Boolean);
    if (oems.length > 0) vtOemMap.set(item, oems);
  }

  // catalog_products.sku for vtwin IS the VTwin ITEM number directly
  const { rows: bridgeRows } = await client.query(`
    SELECT sku, id AS product_id
    FROM catalog_products
    WHERE source_vendor = 'vtwin' AND is_active = true
  `);
  const vendorSkuToProductId = new Map(bridgeRows.map(r => [r.sku, r.product_id]));
  console.log(`   VTwin product SKUs loaded: ${vendorSkuToProductId.size.toLocaleString()}`);

  const toInsert = [];
  let matched = 0, noProduct = 0, noFitment = 0;

  const pb = new ProgressBar(vtOemMap.size, 'VTwin fitment');
  for (const [item, oems] of vtOemMap) {
    pb.increment();
    if (DRY_RUN) logFitmentAnalysis(item, item, modelAliases, platformMap);
    const productId = vendorSkuToProductId.get(item);
    if (!productId) { noProduct++; continue; }

    const myIds = resolveModelYearIds(oems, hdIndex, modelYearMap);
    if (myIds.length === 0) { noFitment++; continue; }

    matched++;
    for (const myId of myIds) toInsert.push({ product_id: productId, model_year_id: myId });
  }
  pb.finish();

  console.log(`   Items matched to product    : ${matched.toLocaleString()}`);
  console.log(`   Items no product match      : ${noProduct.toLocaleString()}`);
  console.log(`   Items no HD fitment         : ${noFitment.toLocaleString()}`);
  console.log(`   Fitment rows to insert      : ${toInsert.length.toLocaleString()}`);

  const inserted = await insertFitment(client, toInsert, 'VTwin');
  console.log(`   Inserted (new)              : ${inserted.toLocaleString()}`);
}

async function processWps(client, hdIndex, modelYearMap, modelAliases, platformMap) {
  if (VENDOR_FLAG && VENDOR_FLAG !== 'wps') return;
  console.log('\n━━━  WPS OEM xref → catalog_fitment_v2  ━━━');

  const wpsOemRows = loadCSV(
    path.join(DATA_DIR, 'wps_harley_oem_cross_reference.csv'),
    'WPS OEM xref'
  );

  const wpsSku2Oems = new Map();
  for (const r of wpsOemRows) {
    const wps = nullify(r['WPS#']);
    const oem = nullify(r['OEM#']);
    if (!wps || !oem) continue;
    if (!wpsSku2Oems.has(wps)) wpsSku2Oems.set(wps, []);
    wpsSku2Oems.get(wps).push(oem);
  }

  const { rows: catRows } = await client.query(`
    SELECT id, sku FROM catalog_products
    WHERE source_vendor = 'wps' AND is_active = true
  `);
  console.log(`   Catalog WPS products: ${catRows.length.toLocaleString()}`);

  const toInsert = [];
  let matched = 0, noFitment = 0;

  const pb = new ProgressBar(catRows.length, 'WPS fitment');
  for (const row of catRows) {
    pb.increment();
    if (DRY_RUN) logFitmentAnalysis(row.sku, row.sku, modelAliases, platformMap);
    const oems = wpsSku2Oems.get(row.sku);
    if (!oems) continue;

    const myIds = resolveModelYearIds(oems, hdIndex, modelYearMap);
    if (myIds.length === 0) { noFitment++; continue; }

    matched++;
    for (const myId of myIds) toInsert.push({ product_id: row.id, model_year_id: myId });
  }
  pb.finish();

  console.log(`   WPS SKUs with fitment       : ${matched.toLocaleString()}`);
  console.log(`   WPS SKUs with no fitment    : ${noFitment.toLocaleString()}`);
  console.log(`   Fitment rows to insert      : ${toInsert.length.toLocaleString()}`);

  const inserted = await insertFitment(client, toInsert, 'WPS');
  console.log(`   Inserted (new)              : ${inserted.toLocaleString()}`);
}

async function coverageReport(client) {
  const { rows } = await client.query(`
    SELECT
      cp.source_vendor,
      COUNT(DISTINCT cp.id)            AS total,
      COUNT(DISTINCT fv2.product_id)   AS has_fitment,
      ROUND(COUNT(DISTINCT fv2.product_id)::numeric /
            NULLIF(COUNT(DISTINCT cp.id), 0) * 100, 1) AS pct
    FROM catalog_products cp
    LEFT JOIN catalog_fitment_v2 fv2 ON fv2.product_id = cp.id
    WHERE cp.is_active = true
    GROUP BY cp.source_vendor
    ORDER BY cp.source_vendor
  `);

  console.log('\n📊  catalog_fitment_v2 coverage after run:');
  console.log('  Vendor  | Total   | Has Fitment | %');
  console.log('  --------|---------|-------------|------');
  for (const r of rows) {
    console.log(
      `  ${r.source_vendor.padEnd(7)} | ${String(r.total).padEnd(7)} | ` +
      `${String(r.has_fitment).padEnd(11)} | ${r.pct}%`
    );
  }
}

async function main() {
  console.log(`\n🔧  build_fitment_v2.js  ${DRY_RUN ? '[DRY RUN]' : ''}${VENDOR_FLAG ? `[vendor=${VENDOR_FLAG}]` : ''}\n`);
  console.log('ℹ️   HD parts data covers 1979–2012.\n');

  const hdRows = loadCSV(path.join(DATA_DIR, 'hd_parts_data_clean.csv'), 'HD parts data');

  const client = await pool.connect();
  try {
    console.log('\n🧩  Loading model alias and platform maps…');
    const [modelAliases, platformMap] = await Promise.all([
      loadModelAliases(client),
      loadPlatformMap(client),
    ]);
    console.log(`   → model aliases: ${modelAliases.length.toLocaleString()}`);
    console.log(`   → platform map  : ${platformMap.length.toLocaleString()}`);

    if (DRY_RUN) {
      console.log('\n🧪  Dry-run fitment analysis test block');
      const samples = [
        "Dual Speedster Exhaust - Chrome - Fishtail - '10-'16 Dresser",
        "COVER DERBY CLEAR-BLACK BIG TWIN '90-'97",
        "Cylinder Stud Kit - '17-'23 M8 Models",
        'EXHAUST DRGSTR ST 07-11',
      ];

      for (const text of samples) {
        console.log(`   ${text} ->`, analyzeFitment(text, modelAliases, platformMap));
      }
    }

    const { rows: modelCodeRows } = await client.query(`SELECT model_code FROM harley_models`);
    const knownCodes = new Set(modelCodeRows.map(r => r.model_code));
    console.log(`   Known harley_models codes: ${knownCodes.size}`);

    console.log('\n🗂️   Loading harley_model_years…');
    const { rows: myRows } = await client.query(`
      SELECT hmy.id, hm.model_code, hmy.year
      FROM harley_model_years hmy
      JOIN harley_models hm ON hm.id = hmy.model_id
    `);
    const modelYearMap = new Map(myRows.map(r => [`${r.model_code}:${r.year}`, r.id]));
    console.log(`   → ${modelYearMap.size.toLocaleString()} model-year combinations`);

    const hdIndex = buildHdIndex(hdRows, knownCodes);

    if (!DRY_RUN) await client.query('BEGIN');

    await processVtwin(client, hdIndex, modelYearMap, modelAliases, platformMap);
    await processWps(client, hdIndex, modelYearMap, modelAliases, platformMap);

    if (!DRY_RUN) await client.query('COMMIT');

    await coverageReport(client);

    if (DRY_RUN) {
      console.log(stats);
    }

    if (DRY_RUN) console.log('\n   ⚠️  DRY RUN — no changes written to DB');

  } catch (err) {
    if (!DRY_RUN) await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌  Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
