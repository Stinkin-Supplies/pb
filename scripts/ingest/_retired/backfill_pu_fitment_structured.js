/**
 * backfill_pu_fitment_structured.js
 *
 * Promotes fitment data from pu_fitment (30K rows, regex-parsed from PU product
 * names) into catalog_fitment (the canonical structured fitment table used by
 * the frontend and Typesense index).
 *
 * pu_fitment schema (per-SKU, one row per product):
 *   sku, brand, year_start, year_end, year_ranges (jsonb),
 *   hd_families[], hd_models[], hd_codes[], other_makes[],
 *   is_harley, is_universal
 *
 * catalog_fitment schema (per-fitment-row, one row per year/make/model combo):
 *   product_id, make, model, year_start, year_end, notes
 *
 * Expansion strategy:
 *   - Each HD family (Touring, Softail, etc.) becomes a separate catalog_fitment row
 *   - year_ranges jsonb used when available for precise year spans per model
 *   - Fallback to year_start/year_end for simple ranges
 *   - Universal parts: single row with model='Universal', year_start=NULL
 *
 * Safe to re-run — unique index on (product_id, make, model, year_start, year_end)
 * with NULLS NOT DISTINCT prevents duplicates.
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/backfill_pu_fitment_structured.js [--dry-run]
 */

import pg from 'pg';
import { ProgressBar, BatchProgressBar } from './progress_bar.js';

const DRY_RUN    = process.argv.includes('--dry-run');
const BATCH_SIZE = 500;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Map pu_fitment hd_families values → canonical make/model for catalog_fitment
// These match what extract_fitment.js already writes for WPS products.
const FAMILY_MODEL_MAP = {
  'Touring':   'Touring',
  'Softail':   'Softail',
  'Dyna':      'Dyna',
  'FXR':       'FXR',
  'Sportster': 'Sportster',
};

const MAKE_HARLEY = 'Harley-Davidson';

/**
 * Given a pu_fitment row, expand into array of catalog_fitment-compatible objects:
 *   { make, model, year_start, year_end, notes }
 */
function expandFitmentRow(row) {
  const rows = [];

  // ── Universal parts ───────────────────────────────────────────────────────────
  if (row.is_universal) {
    rows.push({ make: MAKE_HARLEY, model: 'Universal', year_start: null, year_end: null, notes: 'Universal fit' });
    return rows;
  }

  // ── Harley families ───────────────────────────────────────────────────────────
  const families = row.hd_families ?? [];
  if (families.length > 0) {
    // Try to use year_ranges for per-family precision
    // year_ranges is jsonb, typically: {"Touring": [[1999, 2025]], "Softail": [[2018, 2025]]}
    // or flat: [[1999, 2025]]
    let yearRanges = null;
    try {
      yearRanges = typeof row.year_ranges === 'string'
        ? JSON.parse(row.year_ranges)
        : row.year_ranges;
    } catch { yearRanges = null; }

    for (const family of families) {
      const model = FAMILY_MODEL_MAP[family] ?? family;

      // Get year range for this family
      let ranges = null;
      if (yearRanges && typeof yearRanges === 'object' && !Array.isArray(yearRanges)) {
        ranges = yearRanges[family] ?? yearRanges[model] ?? null;
      } else if (Array.isArray(yearRanges)) {
        ranges = yearRanges;
      }

      if (ranges && Array.isArray(ranges) && ranges.length > 0) {
        // Multiple year spans for this family
        for (const span of ranges) {
          if (Array.isArray(span) && span.length === 2) {
            rows.push({ make: MAKE_HARLEY, model, year_start: span[0] || null, year_end: span[1] || null, notes: null });
          } else {
            rows.push({ make: MAKE_HARLEY, model, year_start: row.year_start || null, year_end: row.year_end || null, notes: null });
          }
        }
      } else {
        // Fall back to top-level year range
        rows.push({ make: MAKE_HARLEY, model, year_start: row.year_start || null, year_end: row.year_end || null, notes: null });
      }
    }
  }

  // ── Other makes (non-Harley) ──────────────────────────────────────────────────
  const otherMakes = row.other_makes ?? [];
  for (const make of otherMakes) {
    if (!make || make === MAKE_HARLEY) continue;
    rows.push({ make: String(make).trim(), model: 'All Models', year_start: row.year_start || null, year_end: row.year_end || null, notes: null });
  }

  // If no families and no other_makes but is_harley — generic HD row
  if (rows.length === 0 && row.is_harley) {
    rows.push({ make: MAKE_HARLEY, model: 'All Models', year_start: row.year_start || null, year_end: row.year_end || null, notes: null });
  }

  return rows;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(`\n🏍  backfill_pu_fitment_structured.js${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

    // Load all pu_fitment rows
    console.log('Loading pu_fitment...');
    const { rows: puFitRows } = await client.query(`
      SELECT pf.sku, pf.year_start, pf.year_end, pf.year_ranges,
             pf.hd_families, pf.hd_models, pf.hd_codes, pf.other_makes,
             pf.is_harley, pf.is_universal,
             cp.id AS product_id
      FROM pu_fitment pf
      JOIN catalog_products cp ON (
        cp.sku = pf.sku
        OR cp.sku = REPLACE(pf.sku, '-', '')
        OR REPLACE(cp.sku, '-', '') = REPLACE(pf.sku, '-', '')
      )
      WHERE cp.source_vendor = 'pu'
        AND cp.is_active = true
    `);
    console.log(`  Loaded ${puFitRows.length} pu_fitment rows with product_id matches\n`);

    if (puFitRows.length === 0) {
      console.log('⚠️  No pu_fitment rows matched catalog_products. Check SKU format alignment.');
      return;
    }

    // Also load catalog_fitment to know current state
    const { rows: [{ count: existingCount }] } = await client.query(
      `SELECT COUNT(*) AS count FROM catalog_fitment cf
       JOIN catalog_products cp ON cp.id = cf.product_id
       WHERE cp.source_vendor = 'pu'`
    );
    console.log(`  Existing PU rows in catalog_fitment: ${existingCount}`);

    // Expand all fitment rows
    const bar = new ProgressBar(puFitRows.length, 'Expanding fitment rows');
    const toInsert = []; // { product_id, make, model, year_start, year_end, notes }

    for (const row of puFitRows) {
      bar.increment();
      const expanded = expandFitmentRow(row);
      for (const e of expanded) {
        toInsert.push({ product_id: row.product_id, ...e });
      }
    }
    bar.finish();

    console.log(`\n  Expanded to ${toInsert.length} catalog_fitment rows`);

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const r of toInsert) {
      const key = `${r.product_id}|${r.make}|${r.model}|${r.year_start ?? 'N'}|${r.year_end ?? 'N'}`;
      if (!seen.has(key)) { seen.add(key); unique.push(r); }
    }
    console.log(`  After dedup: ${unique.length} rows\n`);

    if (DRY_RUN) {
      console.log('DRY RUN — sample (first 30):');
      console.table(unique.slice(0, 30).map(r => ({
        product_id: r.product_id,
        make: r.make,
        model: r.model,
        year_start: r.year_start,
        year_end: r.year_end,
      })));

      // Family breakdown
      const familyCounts = {};
      for (const r of unique) {
        familyCounts[r.model] = (familyCounts[r.model] ?? 0) + 1;
      }
      console.log('\nFamily distribution:');
      console.table(Object.entries(familyCounts).sort((a,b) => b[1]-a[1]).map(([model, count]) => ({ model, count })));
      return;
    }

    // Batch insert
    const totalBatches = Math.ceil(unique.length / BATCH_SIZE);
    const batchBar = new BatchProgressBar(totalBatches, BATCH_SIZE, 'Inserting into catalog_fitment');
    let inserted = 0;
    let skipped  = 0;
    let batchNum = 0;

    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const batch = unique.slice(i, i + BATCH_SIZE);
      batchNum++;
      batchBar.updateBatch(batchNum, batch.length);

      const values = [];
      const params = [];
      let p = 1;
      for (const r of batch) {
        values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(r.product_id, r.make, r.model, r.year_start ?? null, r.year_end ?? null, r.notes ?? null);
      }

      const res = await client.query(`
        INSERT INTO catalog_fitment (product_id, make, model, year_start, year_end, notes)
        VALUES ${values.join(', ')}
        ON CONFLICT (product_id, make, model, year_start, year_end) DO NOTHING
      `, params);

      inserted += res.rowCount ?? 0;
      skipped  += batch.length - (res.rowCount ?? 0);
    }
    batchBar.finish();

    console.log(`\n✅ Done`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Already existed (skipped): ${skipped}`);

    // Updated totals
    const { rows: totals } = await client.query(`
      SELECT model, COUNT(*) AS products
      FROM catalog_fitment cf
      JOIN catalog_products cp ON cp.id = cf.product_id
      GROUP BY model
      ORDER BY products DESC
      LIMIT 15
    `);
    console.log('\n📊 catalog_fitment by model (all vendors):');
    console.table(totals);

    const { rows: [{ count: newTotal }] } = await client.query(`SELECT COUNT(*) AS count FROM catalog_fitment`);
    console.log(`\n   Total catalog_fitment rows: ${newTotal}`);

    console.log('\n⚠️  Remember to reindex Typesense to pick up new fitment facets:');
    console.log('   npx dotenv -e .env.local -- node -e "import(\'./scripts/ingest/index_unified.js\').then(m => m.buildTypesenseIndex({ recreate: true, resume: false }))"\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
