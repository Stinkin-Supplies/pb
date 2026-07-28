/**
 * import_vtwin_ds_product_details.mjs
 *
 * Second pass over /Users/home/Desktop/ds-fitment-scraper/catalog_vtwin_enriched.csv
 * (the same file import_vtwin_ds_fitment_scraper.mjs already staged fitment/OEM
 * data from) -- this pass picks up the two other usable columns that script
 * never touched:
 *
 *   product_details -> catalog_unified.product_details->>'description'
 *     Written directly (no staging table exists for descriptions, and there's
 *     no ambiguity/conflict to resolve -- it's a straight 1:1 SKU match, same
 *     pattern as update_vtwin_pricing.mjs). Only fills rows where the product
 *     has no description yet (product_details IS NULL or ->>'description' is
 *     empty) -- never overwrites an existing description from a better source.
 *     Merges into existing product_details keys (features/tech_note/attributes)
 *     rather than clobbering them, via jsonb `||`.
 *
 *   is_universal -> catalog_unified.is_universal
 *     Only ever flips false -> true, never true -> false (every VTwin row is
 *     false today -- verified via `SELECT is_universal, COUNT(*) FROM
 *     catalog_unified WHERE source_vendor='VTWIN' GROUP BY is_universal`,
 *     100% false). This is the signal recompute_era_flags.mjs's header
 *     comment flagged as missing for a trustworthy era_chopper computation.
 *
 * short_description / part_name / product_url / fitment_hd_* / no_fitment_reason
 * were checked and are NOT used here:
 *   - short_description: empty on all 14,450 rows.
 *   - part_name: catalog_unified.name is already sourced from VTwin's own
 *     catalog feed, not this scraper -- not treated as an improvement.
 *   - fitment_hd_families/models/codes/year_ranges: for the ~6,328 rows where
 *     fitment_details didn't parse, these turned out to just echo the same
 *     free text (spot-checked), except for ~1,322 rows with real recoverable
 *     code+year data (open-ended "-UP" ranges, trailing descriptive text) --
 *     those are handled separately in import_vtwin_ds_fitment_recovered.mjs.
 *   - product_url / no_fitment_reason: provenance/diagnostic only, nothing to
 *     write to the catalog.
 *
 * Usage:
 *   node scripts/ingest/import_vtwin_ds_product_details.mjs           # dry run
 *   node scripts/ingest/import_vtwin_ds_product_details.mjs --apply   # writes
 */
'use strict';

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const CSV_PATH = '/Users/home/Desktop/ds-fitment-scraper/catalog_vtwin_enriched.csv';
const BATCH = 500;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function run() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
  console.log(`Parsed ${rows.length} total rows`);

  const client = await pool.connect();

  const skuSet = new Set((await client.query(`SELECT sku FROM catalog_unified`)).rows.map((r) => r.sku));

  // ── Descriptions ────────────────────────────────────────────────────────
  const descCandidates = rows
    .filter((r) => r.product_details && r.product_details.trim() && skuSet.has(r.sku.trim()))
    .map((r) => ({ sku: r.sku.trim(), description: r.product_details.trim() }));

  const { rows: existingPd } = await client.query(
    `SELECT sku, product_details FROM catalog_unified WHERE sku = ANY($1)`,
    [descCandidates.map((c) => c.sku)]
  );
  const pdBySku = new Map(existingPd.map((r) => [r.sku, r.product_details]));

  const descToWrite = descCandidates.filter((c) => {
    const pd = pdBySku.get(c.sku);
    return !pd || !pd.description || !String(pd.description).trim();
  });
  const descSkipped = descCandidates.length - descToWrite.length;

  // ── is_universal ────────────────────────────────────────────────────────
  const univCandidates = rows
    .filter((r) => (r.is_universal || '').trim().toLowerCase() === 'true' && skuSet.has(r.sku.trim()))
    .map((r) => r.sku.trim());

  const { rows: existingUniv } = await client.query(
    `SELECT sku FROM catalog_unified WHERE sku = ANY($1) AND is_universal = false`,
    [univCandidates]
  );
  const univToWrite = existingUniv.map((r) => r.sku);
  const univSkipped = univCandidates.length - univToWrite.length;

  console.log(`\nDescriptions: ${descToWrite.length} to write, ${descSkipped} skipped (already has a description)`);
  console.log(`is_universal: ${univToWrite.length} to flip false->true, ${univSkipped} skipped (already true)`);

  if (!APPLY) {
    console.log('\nSample description writes:', descToWrite.slice(0, 3).map((c) => ({ sku: c.sku, description: c.description.slice(0, 120) })));
    console.log('Sample is_universal flips:', univToWrite.slice(0, 10));
    console.log('\nDry run -- no writes made. Re-run with --apply to write.');
    client.release();
    await pool.end();
    return;
  }

  let descWritten = 0;
  for (const batch of chunks(descToWrite, BATCH)) {
    for (const c of batch) {
      const res = await client.query(
        `UPDATE catalog_unified
         SET product_details = COALESCE(product_details, '{}'::jsonb) || jsonb_build_object('description', $2::text)
         WHERE sku = $1`,
        [c.sku, c.description]
      );
      descWritten += res.rowCount;
    }
    process.stdout.write(`\r  descriptions written: ${descWritten}`);
  }
  console.log();

  let univWritten = 0;
  for (const batch of chunks(univToWrite, BATCH)) {
    const res = await client.query(
      `UPDATE catalog_unified SET is_universal = true WHERE sku = ANY($1)`,
      [batch]
    );
    univWritten += res.rowCount;
    process.stdout.write(`\r  is_universal flipped: ${univWritten}`);
  }
  console.log();

  console.log(`\nDone. descriptions +${descWritten}, is_universal flips +${univWritten}`);
  client.release();
  await pool.end();
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
