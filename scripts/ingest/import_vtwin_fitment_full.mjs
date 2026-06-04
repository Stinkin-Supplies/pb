/**
 * import_vtwin_fitment_full.mjs
 *
 * Ingests the completed VTwin scraper output (vtwin_fitment_missing.csv) into:
 *   1. vtwin_scrape_data   — raw scraped attributes (description, oem_no, price, etc.)
 *   2. catalog_fitment_v2 — parsed fitment rows
 *
 * Also updates catalog_unified.oem_numbers[] for matched VTwin SKUs.
 *
 * Run from: ~/Desktop/Stinkin-Supplies/
 *   node import_vtwin_fitment_full.mjs [--dry-run] [path/to/vtwin_fitment_missing.csv]
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import pg from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const CSV_PATH = process.argv.find(a => a.endsWith('.csv'))
  || './vtwin_fitment_missing.csv';

const DB_URL = process.env.CATALOG_DATABASE_URL
  || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog';

// ─── Progress bar ────────────────────────────────────────────────────────────
function progress(label, n, total) {
  const pct = Math.round((n / total) * 100);
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stdout.write(`\r[${bar}] ${pct}% — ${n}/${total}  ${label}    `);
  if (n === total) process.stdout.write('\n');
}

// ─── Fitment parser ──────────────────────────────────────────────────────────
// Input:  "FLST 1999-2016 | FXD 1999-2017 | XL 2014-UP"
// Output: [{ model_code, year_start, year_end, notes }]
const CURRENT_YEAR = new Date().getFullYear();

function parseFitmentRaw(raw) {
  if (!raw || !raw.trim()) return [];
  const results = [];

  for (const segment of raw.split('|')) {
    const seg = segment.trim();
    if (!seg) continue;

    // Skip non-fitment segments
    if (/^(replacement|custom|application|fits|use with|note)/i.test(seg)) continue;

    // e.g. "FLST 1999-2016 Late 1999" or "XL 1980 Early 1980"
    const m = seg.match(
      /^([A-Z][A-Z0-9]*)\s+(\d{4})(?:-(\d{4}|UP))?\s*(.*)?$/i
    );
    if (!m) continue;

    const model_code = m[1];
    const year_start = parseInt(m[2], 10);
    const year_end_raw = m[3];
    const qualifier = (m[4] || '').trim().replace(/["]+/g, '').trim();

    let year_end;
    if (!year_end_raw) {
      year_end = year_start; // single year
    } else if (/^up$/i.test(year_end_raw)) {
      year_end = CURRENT_YEAR;
    } else {
      year_end = parseInt(year_end_raw, 10);
    }

    // Sanity check
    if (year_start < 1900 || year_start > CURRENT_YEAR + 2) continue;
    if (year_end < year_start) continue;

    const notes = qualifier || null;
    results.push({ model_code, year_start, year_end, notes });
  }

  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔧 VTwin Full Fitment Import`);
  console.log(`   CSV: ${CSV_PATH}`);
  console.log(`   Dry run: ${DRY_RUN}\n`);

  // ── Read CSV ──
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const allRows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });
  console.log(`📄 Total CSV rows: ${allRows.length}`);

  // ── Deduplicate by SKU, drop errors ──
  const skuMap = new Map();
  for (const row of allRows) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    if (row.source === 'not_found' || row.error) continue;
    if (!skuMap.has(sku)) skuMap.set(sku, row);
  }
  const uniqueRows = [...skuMap.values()];
  console.log(`✅ Unique non-error SKUs: ${uniqueRows.length}`);
  console.log(`⚠️  Error/not-found SKUs: ${allRows.filter(r => r.error || r.source === 'not_found').length}`);
  console.log(`📦 No fitment data: ${uniqueRows.filter(r => !r.fitment_raw?.trim()).length}\n`);

  if (DRY_RUN) {
    // Just show parse stats
    let totalFitmentRows = 0;
    const unknownCodes = new Set();
    for (const row of uniqueRows) {
      const parsed = parseFitmentRaw(row.fitment_raw);
      totalFitmentRows += parsed.length;
    }
    console.log(`[DRY RUN] Would insert ~${totalFitmentRows} fitment rows`);
    console.log('[DRY RUN] Run without --dry-run to execute\n');
    return;
  }

  // ── Connect to DB ──
  const pool = new pg.Pool({ connectionString: DB_URL });
  const client = await pool.connect();

  try {
    // ── Step 1: Ensure vtwin_scrape_data table ──
    console.log('📋 Step 1/4: Ensuring vtwin_scrape_data table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS vtwin_scrape_data (
        sku           TEXT PRIMARY KEY,
        product_name  TEXT,
        product_url   TEXT,
        price_raw     TEXT,
        oem_no        TEXT,
        fitment_raw   TEXT,
        description   TEXT,
        uom           TEXT,
        finish        TEXT,
        manufacturer  TEXT,
        origin        TEXT,
        catalog_pages TEXT,
        replacement_items TEXT,
        tech_note     TEXT,
        extra_attributes TEXT,
        scraped_at    TIMESTAMPTZ DEFAULT now()
      )
    `);
    console.log('   ✓ vtwin_scrape_data ready\n');

    // ── Step 2: Upsert scrape data ──
    console.log('📋 Step 2/4: Upserting scrape data...');
    let upserted = 0;
    for (let i = 0; i < uniqueRows.length; i++) {
      const r = uniqueRows[i];
      await client.query(`
        INSERT INTO vtwin_scrape_data (
          sku, product_name, product_url, price_raw, oem_no, fitment_raw,
          description, uom, finish, manufacturer, origin, catalog_pages,
          replacement_items, tech_note, extra_attributes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (sku) DO UPDATE SET
          product_name = EXCLUDED.product_name,
          product_url  = EXCLUDED.product_url,
          price_raw    = EXCLUDED.price_raw,
          oem_no       = EXCLUDED.oem_no,
          fitment_raw  = EXCLUDED.fitment_raw,
          description  = EXCLUDED.description,
          uom          = EXCLUDED.uom,
          finish       = EXCLUDED.finish,
          manufacturer = EXCLUDED.manufacturer,
          origin       = EXCLUDED.origin,
          catalog_pages = EXCLUDED.catalog_pages,
          replacement_items = EXCLUDED.replacement_items,
          tech_note    = EXCLUDED.tech_note,
          extra_attributes = EXCLUDED.extra_attributes,
          scraped_at   = now()
      `, [
        r.sku, r.product_name || null, r.product_url || null, r.price || null,
        r.oem_no || null, r.fitment_raw || null, r.description || null,
        r.uom || null, r.finish || null, r.manufacturer || null,
        r.origin || null, r.catalog_pages || null, r.replacement_items || null,
        r.tech_note || null, r.extra_attributes || null
      ]);
      upserted++;
      if (i % 500 === 0 || i === uniqueRows.length - 1) progress('scrape data', i + 1, uniqueRows.length);
    }
    console.log(`   ✓ Upserted ${upserted} rows into vtwin_scrape_data\n`);

    // ── Step 3: Resolve SKUs → product_ids + check unknown model codes ──
    console.log('📋 Step 3/4: Resolving SKUs to catalog_unified product_ids...');

    // Load harley_models into memory
    const { rows: modelRows } = await client.query(
      `SELECT model_code, id FROM harley_models ORDER BY model_code`
    );
    const modelMap = new Map(modelRows.map(r => [r.model_code, r.id]));
    console.log(`   ✓ Loaded ${modelMap.size} model codes`);

    // Find VTwin products in catalog_unified
    const { rows: catalogRows } = await client.query(
      `SELECT id, sku FROM catalog_unified WHERE source_vendor = 'VTWIN'`
    );
    const catalogMap = new Map(catalogRows.map(r => [r.sku.replace(/^VT-/, ''), r.id]));
    console.log(`   ✓ Loaded ${catalogMap.size} VTwin SKUs from catalog_unified`);

    // Identify unknown model codes
    const unknownCodes = new Set();
    for (const row of uniqueRows) {
      for (const { model_code } of parseFitmentRaw(row.fitment_raw)) {
        if (!modelMap.has(model_code)) unknownCodes.add(model_code);
      }
    }
    if (unknownCodes.size > 0) {
      console.log(`\n   ⚠️  UNKNOWN MODEL CODES (${unknownCodes.size}) — will be SKIPPED:`);
      console.log(`   ${[...unknownCodes].sort().join(', ')}`);
      console.log(`   Add these to harley_models and re-run to capture their fitment.\n`);
    } else {
      console.log(`   ✓ All model codes recognized\n`);
    }

    // ── Step 4: Insert fitment rows ──
    console.log('📋 Step 4/4: Inserting fitment rows into catalog_fitment_v2...');

    // Delete existing vtwin fitment rows first (clean re-import)
    const { rowCount: deleted } = await client.query(
      `DELETE FROM catalog_fitment_v2 WHERE fitment_source = 'vtwin_partial'`
    );
    console.log(`   🗑️  Cleared ${deleted} existing vtwin fitment rows`);

    let inserted = 0;
    let skipped_no_product = 0;
    let skipped_no_model = 0;
    let skipped_no_fitment = 0;

    // Batch insert
    const BATCH = 500;
    let batch = [];

    const flush = async () => {
      if (!batch.length) return;
      const placeholders = batch.map((_, i) => {
        const b = i * 5;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5})`;
      }).join(',');
      await client.query(`
        INSERT INTO catalog_fitment_v2
          (product_id, harley_model_id, year_start, year_end, fitment_source)
        VALUES ${placeholders}
        ON CONFLICT DO NOTHING
      `, batch.flat());
      inserted += batch.length;
      batch = [];
    };

    for (let i = 0; i < uniqueRows.length; i++) {
      const row = uniqueRows[i];
      const product_id = catalogMap.get(row.sku);

      if (!product_id) { skipped_no_product++; continue; }

      const parsed = parseFitmentRaw(row.fitment_raw);
      if (!parsed.length) { skipped_no_fitment++; continue; }

      for (const { model_code, year_start, year_end, notes } of parsed) {
        const harley_model_id = modelMap.get(model_code);
        if (!harley_model_id) { skipped_no_model++; continue; }

        batch.push([product_id, harley_model_id, year_start, year_end, 'vtwin_partial']);
        if (batch.length >= BATCH) await flush();
      }

      if (i % 500 === 0 || i === uniqueRows.length - 1) progress('fitment rows', i + 1, uniqueRows.length);
    }
    await flush();

    console.log(`\n   ✓ Inserted ${inserted} fitment rows`);
    console.log(`   ⚠️  Skipped — no catalog match: ${skipped_no_product}`);
    console.log(`   ⚠️  Skipped — unknown model code: ${skipped_no_model}`);
    console.log(`   ⚠️  Skipped — no fitment data: ${skipped_no_fitment}`);

    // ── Step 5: Backfill oem_numbers on catalog_unified ──
    console.log('\n📋 Bonus: Backfilling oem_numbers from scraped oem_no...');
    const { rowCount: oemUpdated } = await client.query(`
      UPDATE catalog_unified cu
      SET oem_numbers = ARRAY[TRIM(vsd.oem_no)]::text[]
      FROM vtwin_scrape_data vsd
      WHERE cu.source_vendor = 'VTWIN'
        AND cu.sku = vsd.sku
        AND vsd.oem_no IS NOT NULL AND vsd.oem_no <> ''
        AND (cu.oem_numbers IS NULL OR cu.oem_numbers = '{}')
    `);
    console.log(`   ✓ Backfilled oem_numbers on ${oemUpdated} VTwin products\n`);

    // ── Summary ──
    const { rows: [{ count: totalFitment }] } = await client.query(
      `SELECT COUNT(*) FROM catalog_fitment_v2 WHERE fitment_source = 'vtwin_partial'`
    );
    console.log('═══════════════════════════════════════════════');
    console.log(`✅  DONE`);
    console.log(`   vtwin_scrape_data rows:    ${upserted}`);
    console.log(`   catalog_fitment_v2 (vtwin): ${totalFitment}`);
    console.log(`   oem_numbers updated:        ${oemUpdated}`);
    if (unknownCodes.size > 0) {
      console.log(`\n   ⚠️  ${unknownCodes.size} unknown model codes were skipped.`);
      console.log(`   Run add_missing_vtwin_models.sql to add them, then re-run.`);
    }
    console.log('═══════════════════════════════════════════════\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  process.exit(1);
});
