#!/usr/bin/env node
/**
 * promote_vtwin_scrape_fitment.mjs
 *
 * vtwin_scrape_data.fitment_raw -> catalog_fitment_v2 (fitment_source='vtwin_scrape')
 *
 * Reads fitment directly from the DB scrape table (19,695 rows, scraped
 * 2026-06-04) instead of the older vtwin_fitment_partial.csv export
 * (13,275 rows, May 30) -- fresher and a higher match rate against the
 * live catalog (98% vs 97%). Matches only against catalog_unified rows
 * that already exist (VT-<sku> prefix, source_vendor='VTWIN', active) --
 * unlike import_vtwin_fitment_partial.mjs, this does NOT upsert new
 * products into catalog_unified. SKUs with no existing product match are
 * skipped, not created.
 *
 * Parsing logic (classifyFitment/parseFitmentRaw), MODEL_ALIASES, and the
 * model_code -> harley_model_years expansion are ported from
 * scripts/ingest/_unverified/import_vtwin_fitment_partial.mjs.
 *
 * Usage:
 *   node promote_vtwin_scrape_fitment.mjs --dry      # preview only
 *   node promote_vtwin_scrape_fitment.mjs            # live run
 */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DB_URL = process.env.CATALOG_DATABASE_URL;
const DRY_RUN = process.argv.includes('--dry');
const UP_YEAR = 2026;
const BATCH = 500;

function classifyFitment(raw) {
  if (!raw || String(raw).trim() === '') return 'none';
  const s = String(raw).trim();
  if (s === 'All models' || s === 'All') return 'universal';
  if (/^(Custom|Replacement|All W)/i.test(s)) return 'custom_text';
  return 'structured';
}

function parseFitmentRaw(sku, raw) {
  if (classifyFitment(raw) !== 'structured') return [];
  const SEG = /^([A-Z][A-Z0-9\-]*)\s+(\d{4})-(\d{4}|UP)$/;
  return String(raw)
    .split('|')
    .map(s => s.trim())
    .flatMap(seg => {
      const m = seg.match(SEG);
      if (!m) return [];
      return [{
        sku,
        model_code: m[1],
        year_start: parseInt(m[2], 10),
        year_end: m[3] === 'UP' ? UP_YEAR : parseInt(m[3], 10),
      }];
    });
}

// Same aliases as import_vtwin_fitment_partial.mjs -- VTwin uses shorthand/
// generic codes that expand to multiple specific harley_models codes.
const MODEL_ALIASES = {
  'E': ['EL', 'ELH'],
  'XL1200': ['XL1200C','XL1200CX','XL1200L','XL1200N','XL1200NS','XL1200R','XL1200S','XL1200T','XL1200V','XL1200X','XL1200XS'],
  'XL883': ['XL883','XL883C','XL883L','XL883N','XL883R'],
  'FLHR': ['FLHR','FLHRI','FLHRC','FLHRCI','FLHRS','FLHRSI','FLHRSE','FLHRSEI','FLHRSCI','FLHRXS'],
  'FLHX': ['FLHX','FLHXI','FLHXSE','FLHXS'],
  'FLSTF': ['FLSTF','FLSTFI','FLSTFSE','FLSTFB','FLSTFBS'],
  'FXSTB': ['FXSTB','FXSTBI','FXSTBSE'],
  'FXDWG': ['FXDWG','FXDWGI','FXDWG3','FXDWGS'],
};

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  console.log(DRY_RUN ? '🔍  DRY RUN — no writes' : '🚀  LIVE RUN');

  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const { rows: scrapeRows } = await client.query(
      `SELECT sku, fitment_raw FROM vtwin_scrape_data WHERE fitment_raw IS NOT NULL AND fitment_raw != ''`
    );
    console.log(`\n📄  vtwin_scrape_data rows with fitment_raw: ${scrapeRows.length.toLocaleString()}`);

    let fitmentRows = [];
    let universalCount = 0, customTextCount = 0, noFitmentCount = 0;
    for (const r of scrapeRows) {
      const cls = classifyFitment(r.fitment_raw);
      if (cls === 'structured') fitmentRows.push(...parseFitmentRaw(r.sku, r.fitment_raw));
      else if (cls === 'universal') universalCount++;
      else if (cls === 'custom_text') customTextCount++;
      else noFitmentCount++;
    }
    console.log(`📊  Structured segments parsed: ${fitmentRows.length.toLocaleString()} (universal: ${universalCount}, custom text: ${customTextCount}, none: ${noFitmentCount})`);

    // Resolve SKU -> catalog_unified.id (VT- prefixed, active, existing products only)
    const skuList = [...new Set(scrapeRows.map(r => r.sku))];
    const idRes = await client.query(
      `SELECT id, sku FROM catalog_unified
       WHERE source_vendor = 'VTWIN' AND is_active = true AND sku = ANY($1::text[])`,
      [skuList.map(s => 'VT-' + s)]
    );
    const skuToId = new Map(idRes.rows.map(r => [r.sku.slice(3), r.id]));
    console.log(`🔗  Resolved ${skuToId.size.toLocaleString()}/${skuList.length.toLocaleString()} SKUs to existing catalog_unified products (unmatched SKUs skipped, not created)`);

    // Resolve model_code -> harley_model_years
    const rawModelCodes = [...new Set(fitmentRows.map(r => r.model_code))];
    const expandedCodes = [...new Set(rawModelCodes.flatMap(c => MODEL_ALIASES[c] ?? [c]))];
    const hymRes = await client.query(
      `SELECT hmy.id, hm.model_code, hmy.year
       FROM harley_model_years hmy JOIN harley_models hm ON hm.id = hmy.model_id
       WHERE hm.model_code = ANY($1::text[])`,
      [expandedCodes]
    );
    const hymByModel = new Map();
    for (const row of hymRes.rows) {
      if (!hymByModel.has(row.model_code)) hymByModel.set(row.model_code, []);
      hymByModel.get(row.model_code).push({ id: row.id, year: parseInt(row.year, 10) });
    }
    const resolvedByCode = new Map();
    for (const code of rawModelCodes) {
      const targets = MODEL_ALIASES[code] ?? [code];
      const entries = targets.flatMap(t => hymByModel.get(t) ?? []);
      if (entries.length) resolvedByCode.set(code, entries);
    }
    const unknownModels = rawModelCodes.filter(m => !resolvedByCode.has(m));
    if (unknownModels.length > 0) {
      console.log(`⚠️  ${unknownModels.length} model codes not found in harley_model_years (skipped): ${unknownModels.slice(0, 30).join(', ')}${unknownModels.length > 30 ? ', ...' : ''}`);
    }

    // Expand to (product_id, model_year_id) pairs
    const fitmentSet = new Map();
    for (const row of fitmentRows) {
      const productId = skuToId.get(row.sku);
      if (!productId) continue;
      const yearEntries = resolvedByCode.get(row.model_code);
      if (!yearEntries) continue;
      for (const { id: myi, year } of yearEntries) {
        if (year >= row.year_start && year <= row.year_end) {
          fitmentSet.set(`${productId}:${myi}`, { product_id: productId, model_year_id: myi });
        }
      }
    }
    const fitmentUnique = [...fitmentSet.values()];
    console.log(`\n💾  Unique (product_id, model_year_id) pairs ready: ${fitmentUnique.length.toLocaleString()}`);

    if (DRY_RUN) {
      console.log('\n✋  Dry run complete — exiting before any DB writes.');
      console.log('\nSample pairs:', fitmentUnique.slice(0, 5));
      return;
    }

    let inserted = 0;
    for (const batch of chunks(fitmentUnique, BATCH)) {
      const vals = [];
      const params = [];
      let idx = 1;
      for (const { product_id, model_year_id } of batch) {
        vals.push(`($${idx++}, $${idx++}, 'vtwin_scrape')`);
        params.push(product_id, model_year_id);
      }
      const res = await client.query(
        `INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source)
         VALUES ${vals.join(',')}
         ON CONFLICT (product_id, model_year_id) DO NOTHING`,
        params
      );
      inserted += res.rowCount;
      process.stdout.write(`\r  ${inserted.toLocaleString()}/${fitmentUnique.length.toLocaleString()} inserted`);
    }
    console.log();

    const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM catalog_fitment_v2');
    console.log(`\ncatalog_fitment_v2 total now: ${parseInt(count).toLocaleString()}`);
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
