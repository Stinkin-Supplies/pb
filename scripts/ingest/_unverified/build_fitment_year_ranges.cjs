#!/usr/bin/env node
/**
 * build_fitment_year_ranges.cjs
 * Stinkin' Supplies — Fitment Year Range Builder
 *
 * For every product × model_code combination in catalog_fitment_v2,
 * collapses individual year rows into contiguous spans (gaps-and-islands).
 *
 * Output:
 *   1. Populates product_fitment_year_model table (recreates it)
 *   2. Writes fitment_year_ranges.csv  (human-readable, like FLHR / Front Brake Pads / oem 41854-99 / 1999–2004)
 *
 * Usage:
 *   node build_fitment_year_ranges.cjs            # run for all products
 *   node build_fitment_year_ranges.cjs --dry      # show first 50 rows, no DB write
 *   node build_fitment_year_ranges.cjs --family Touring   # one family only
 *   node build_fitment_year_ranges.cjs --model FLHR       # one model_code only
 */

'use strict';

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// ── Connection ────────────────────────────────────────────────────────────────
const DB_CONFIG = process.env.CATALOG_DATABASE_URL
  ? { connectionString: process.env.CATALOG_DATABASE_URL }
  : {
      host     : '2a01:4ff:f0:fa6f::1',
      port     : 5432,
      database : 'stinkin_catalog',
      user     : 'catalog_app',
      password : 'smelly',
    };

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY   = args.includes('--dry');
const familyFilter = args.includes('--family') ? args[args.indexOf('--family') + 1] : null;
const modelFilter  = args.includes('--model')  ? args[args.indexOf('--model')  + 1] : null;

const OUTPUT_CSV = path.join(__dirname, 'fitment_year_ranges.csv');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a 4-digit year as 2-digit (1999 → '99, 2004 → '04) */
function yr(y) {
  return `'${String(y).slice(2)}`;
}

/** Format an OEM array → "oem 41854-99 / 41854-05" or blank */
function fmtOem(arr) {
  if (!arr || arr.length === 0) return '';
  return 'oem ' + arr.slice(0, 3).join(' / ');  // cap at 3 for readability
}

/** Collapse an array of integer years into contiguous spans.
 *  [1999,2000,2001,2003,2004] → [{start:1999,end:2001},{start:2003,end:2004}]
 */
function collapseYears(years) {
  if (!years || years.length === 0) return [];
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const spans = [];
  let spanStart = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - prev > 1) {
      spans.push({ start: spanStart, end: prev });
      spanStart = sorted[i];
    }
    prev = sorted[i];
  }
  spans.push({ start: spanStart, end: prev });
  return spans;
}

// ── Schema DDL ────────────────────────────────────────────────────────────────
const CREATE_TABLE_SQL = `
DROP TABLE IF EXISTS product_fitment_year_model;

CREATE TABLE product_fitment_year_model (
  id                BIGSERIAL PRIMARY KEY,
  product_id        INT          NOT NULL REFERENCES catalog_unified(id) ON DELETE CASCADE,
  model_code        TEXT         NOT NULL,   -- e.g. 'FLHR'
  family_id         INT          NOT NULL,   -- FK → harley_families.id
  family_name       TEXT         NOT NULL,   -- e.g. 'Touring'
  year_start        SMALLINT     NOT NULL,
  year_end          SMALLINT     NOT NULL,
  year_count        SMALLINT     NOT NULL GENERATED ALWAYS AS (year_end - year_start + 1) STORED,
  span_label        TEXT         NOT NULL,   -- e.g. '99–04'
  product_name      TEXT         NOT NULL,
  brand             TEXT,
  category          TEXT,
  oem_numbers       TEXT[],                  -- from catalog_unified.oem_numbers
  source_vendors    TEXT[],                  -- which vendors contributed this fitment
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX pfym_product_id   ON product_fitment_year_model(product_id);
CREATE INDEX pfym_model_code   ON product_fitment_year_model(model_code);
CREATE INDEX pfym_family_id    ON product_fitment_year_model(family_id);
CREATE INDEX pfym_year_range   ON product_fitment_year_model(year_start, year_end);
`;

// ── Core query — gaps-and-islands in SQL ──────────────────────────────────────
// We use the classic row_number() - year trick to group consecutive years.
// Each (product_id, model_code) gets islands of consecutive years,
// then we GROUP to get start/end of each island.

function buildRangeQuery(familyFilter, modelFilter) {
  const conditions = [];
  const params = [];

  if (familyFilter) {
    params.push(familyFilter);
    conditions.push(`hf.name = $${params.length}`);
  }
  if (modelFilter) {
    params.push(modelFilter);
    conditions.push(`hm.model_code = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const sql = `
    WITH base AS (
      SELECT
        cfv.product_id,
        hm.model_code,
        hm.family_id,
        hf.name                          AS family_name,
        hmy.year,
        cfv.fitment_source
      FROM catalog_fitment_v2 cfv
      JOIN harley_model_years hmy ON hmy.id = cfv.model_year_id
      JOIN harley_models       hm  ON hm.id  = hmy.model_id
      JOIN harley_families     hf  ON hf.id  = hm.family_id
      ${whereClause}
    ),
    island_key AS (
      -- classic gaps-and-islands: year - ROW_NUMBER() is constant within a run
      SELECT
        product_id,
        model_code,
        family_id,
        family_name,
        year,
        fitment_source,
        year - ROW_NUMBER() OVER (
          PARTITION BY product_id, model_code
          ORDER BY year
        ) AS grp
      FROM base
    ),
    spans AS (
      SELECT
        product_id,
        model_code,
        family_id,
        family_name,
        MIN(year)                        AS year_start,
        MAX(year)                        AS year_end,
        COUNT(*)::SMALLINT               AS span_years,
        ARRAY_AGG(DISTINCT fitment_source ORDER BY fitment_source)
                                         AS source_vendors,
        grp
      FROM island_key
      GROUP BY product_id, model_code, family_id, family_name, grp
    )
    SELECT
      s.product_id,
      s.model_code,
      s.family_id,
      s.family_name,
      s.year_start,
      s.year_end,
      s.source_vendors,
      cu.name                            AS product_name,
      cu.brand,
      cu.category,
      cu.oem_numbers
    FROM spans s
    JOIN catalog_unified cu ON cu.id = s.product_id
    ORDER BY s.product_id, s.model_code, s.year_start
  `;

  return { sql, params };
}

// ── Insert batch ──────────────────────────────────────────────────────────────
async function insertBatch(client, rows) {
  if (rows.length === 0) return;

  const values = [];
  const placeholders = rows.map((r, i) => {
    const o = i * 10;
    values.push(
      r.product_id,
      r.model_code,
      r.family_id,
      r.family_name,
      r.year_start,
      r.year_end,
      r.span_label,
      r.product_name,
      r.brand    || null,
      r.category || null,
    );
    return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10})`;
  });

  await client.query(`
    INSERT INTO product_fitment_year_model
      (product_id, model_code, family_id, family_name,
       year_start, year_end, span_label,
       product_name, brand, category)
    VALUES ${placeholders.join(',')}
  `, values);

  // oem_numbers and source_vendors are arrays — update separately to keep batch simple
  for (const r of rows) {
    await client.query(`
      UPDATE product_fitment_year_model
         SET oem_numbers   = $1,
             source_vendors = $2
       WHERE product_id = $3
         AND model_code  = $4
         AND year_start  = $5
         AND year_end    = $6
    `, [
      r.oem_numbers   || null,
      r.source_vendors || null,
      r.product_id,
      r.model_code,
      r.year_start,
      r.year_end,
    ]);
  }
}

// ── CSV writer ────────────────────────────────────────────────────────────────
function writeCsv(rows) {
  const header = [
    'family_name',
    'model_code',
    'product_name',
    'brand',
    'category',
    'year_start',
    'year_end',
    'span_label',
    'oem_numbers',
    'source_vendors',
    'product_id',
  ].join(',');

  const lines = rows.map(r => {
    const oem = (r.oem_numbers || []).join(' / ');
    const src = (r.source_vendors || []).filter(Boolean).join('+');
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [
      esc(r.family_name),
      esc(r.model_code),
      esc(r.product_name),
      esc(r.brand || ''),
      esc(r.category || ''),
      r.year_start,
      r.year_end,
      esc(r.span_label),
      esc(oem),
      esc(src),
      r.product_id,
    ].join(',');
  });

  fs.writeFileSync(OUTPUT_CSV, [header, ...lines].join('\n'), 'utf8');
  console.log(`📄  CSV written → ${OUTPUT_CSV} (${lines.length.toLocaleString()} rows)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔧  Fitment Year Range Builder');
  console.log(`    Mode   : ${DRY ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  if (familyFilter) console.log(`    Family : ${familyFilter}`);
  if (modelFilter)  console.log(`    Model  : ${modelFilter}`);
  console.log('');

  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('✅  DB connected');

  // ── 1. Recreate table (skip in dry mode) ─────────────────────────────────
  if (!DRY) {
    console.log('🗑️   Dropping + recreating product_fitment_year_model …');
    await client.query(CREATE_TABLE_SQL);
    console.log('✅  Table created');
  }

  // ── 2. Run gaps-and-islands query ─────────────────────────────────────────
  console.log('⏳  Running gaps-and-islands range query (may take ~30s on 2.2M rows) …');
  const { sql, params } = buildRangeQuery(familyFilter, modelFilter);
  const t0 = Date.now();
  const result = await client.query(sql, params);
  console.log(`✅  Query returned ${result.rows.length.toLocaleString()} span rows in ${((Date.now()-t0)/1000).toFixed(1)}s`);

  // ── 3. Enrich rows with span_label ────────────────────────────────────────
  const enriched = result.rows.map(r => {
    const start = Number(r.year_start);
    const end   = Number(r.year_end);
    const label = start === end
      ? `${yr(start)}`
      : `${yr(start)}–${yr(end)}`;

    return {
      ...r,
      year_start   : start,
      year_end     : end,
      span_label   : label,
      oem_numbers  : r.oem_numbers  || [],
      source_vendors: (r.source_vendors || []).filter(Boolean),
    };
  });

  // ── 4. DRY MODE — print sample ────────────────────────────────────────────
  if (DRY) {
    console.log('\n📋  Sample (first 50 rows):\n');
    const sample = enriched.slice(0, 50);
    for (const r of sample) {
      const oem = fmtOem(r.oem_numbers);
      const oemStr = oem ? ` / ${oem}` : '';
      console.log(`  ${r.model_code.padEnd(8)} ${r.family_name.padEnd(12)} ${r.span_label.padEnd(8)} ${r.product_name.slice(0,50)}${oemStr}`);
    }
    console.log(`\n  … and ${(enriched.length - 50).toLocaleString()} more rows`);
    writeCsv(enriched);
    await client.end();
    return;
  }

  // ── 5. Insert in batches of 500 ───────────────────────────────────────────
  const BATCH = 500;
  let inserted = 0;
  console.log(`\n⏳  Inserting ${enriched.length.toLocaleString()} rows in batches of ${BATCH} …`);

  for (let i = 0; i < enriched.length; i += BATCH) {
    const batch = enriched.slice(i, i + BATCH);
    await insertBatch(client, batch);
    inserted += batch.length;
    if (inserted % 10000 === 0 || inserted === enriched.length) {
      process.stdout.write(`\r    ${inserted.toLocaleString()} / ${enriched.length.toLocaleString()}`);
    }
  }
  console.log('\n✅  Insert complete');

  // ── 6. Write CSV ──────────────────────────────────────────────────────────
  writeCsv(enriched);

  // ── 7. Summary stats ──────────────────────────────────────────────────────
  const stats = await client.query(`
    SELECT
      family_name,
      COUNT(DISTINCT model_code)   AS models,
      COUNT(DISTINCT product_id)   AS products,
      COUNT(*)                     AS span_rows,
      MIN(year_start)              AS earliest,
      MAX(year_end)                AS latest
    FROM product_fitment_year_model
    GROUP BY family_name
    ORDER BY family_name
  `);

  console.log('\n📊  Summary by family:\n');
  console.log('  Family'.padEnd(16) + 'Models'.padEnd(8) + 'Products'.padEnd(12) + 'Spans'.padEnd(10) + 'Years');
  console.log('  ' + '─'.repeat(54));
  for (const r of stats.rows) {
    console.log(
      `  ${r.family_name.padEnd(14)} ${String(r.models).padEnd(7)} ${String(r.products).padEnd(11)} ${String(r.span_rows).padEnd(9)} ${r.earliest}–${r.latest}`
    );
  }

  await client.end();
  console.log('\n🏁  Done.');
}

main().catch(err => {
  console.error('❌  Fatal:', err.message);
  process.exit(1);
});
