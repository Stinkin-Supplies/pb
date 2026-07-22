#!/usr/bin/env node
/**
 * import_supplementary_oem_crossref.mjs
 *
 * Imports two user-supplied OEM crossref sources into catalog_oem_crossref:
 *   1. Cross Reference Data-Table 1.csv (structured fatbook/oldbook export,
 *      cleaner than the raw fatbookcrossref.txt/oldbookcrossref.txt parsed
 *      earlier in this recovery -- 8,665/8,729 pairs were net-new against
 *      the DB when checked)
 *   2. OEM_Crossref_Merged.xlsx "OEM Crossref - Full" sheet, pre-unpivoted
 *      into scripts/ingest/_unverified/oem_crossref_merged_xlsx_unpivoted.csv
 *      by a one-off script (wide format: one row per OEM number with a
 *      column per vendor -> long format triples). Adds VTwin/WPS sources
 *      beyond fatbook/oldbook.
 *
 * Both insert into the same catalog_oem_crossref (sku, oem_number, source)
 * shape as today's earlier crossref imports. ON CONFLICT (sku, oem_number)
 * DO NOTHING -- first-inserted wins, cross-file duplicates are naturally
 * deduped at the DB level regardless of import order.
 *
 * Usage:
 *   node import_supplementary_oem_crossref.mjs --dry
 *   node import_supplementary_oem_crossref.mjs
 */

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DRY = process.argv.includes('--dry');
const BATCH = 500;

const STRUCTURED_CSV = '/Users/home/Desktop/Stanky/FITMENT/oem_cross_reference_database/Cross Reference Data-Table 1.csv';
const XLSX_UNPIVOTED_CSV = 'scripts/ingest/_unverified/oem_crossref_merged_xlsx_unpivoted.csv';

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.CATALOG_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // ── 1. Structured fatbook/oldbook CSV ──────────────────────────────────
  const rawStructured = fs.readFileSync(STRUCTURED_CSV, 'utf8');
  const structuredRows = parse(rawStructured, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`Structured CSV: ${structuredRows.length.toLocaleString()} rows`);

  const structured = structuredRows
    .filter(r => r.part_number && r.oem_number)
    .map(r => {
      const isFatbook = r.source.includes('FatBook');
      const isOldbook = r.source.includes('Oldbook');
      const page = r.page_number && r.page_number !== 'NULL' ? parseInt(r.page_number, 10) : null;
      return {
        sku: r.part_number.trim(),
        oem_number: r.oem_number.trim(),
        source: 'structured_' + r.source.toLowerCase().replace(/\|/g, '_'),
        fatbook_page: isFatbook ? page : null,
        oldbook_page: isOldbook ? page : null,
        duplicate_count: r.duplicate_count ? parseInt(r.duplicate_count, 10) : null,
        is_cross_source: r.is_cross_source === 'TRUE',
      };
    });

  // ── 2. Unpivoted merged-XLSX CSV ───────────────────────────────────────
  const rawXlsx = fs.readFileSync(XLSX_UNPIVOTED_CSV, 'utf8');
  const xlsxRows = parse(rawXlsx, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`Unpivoted XLSX CSV: ${xlsxRows.length.toLocaleString()} rows`);

  const fromXlsx = xlsxRows
    .filter(r => r.part_number && r.oem_number)
    .map(r => ({
      sku: r.part_number.trim(),
      oem_number: r.oem_number.trim(),
      source: r.source,
      oem_manufacturer: r.oem_manufacturer || null,
      fatbook_page: null,
      oldbook_page: null,
      duplicate_count: null,
      is_cross_source: false,
    }));

  // Combine, dedup on (sku, oem_number) within the batch itself (first wins) --
  // separate from the DB-level ON CONFLICT, which handles dedup against what's
  // already in the table.
  const seen = new Set();
  const all = [];
  for (const r of [...structured, ...fromXlsx]) {
    const key = `${r.sku}::${r.oem_number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(r);
  }
  console.log(`Combined, deduped within batch: ${all.length.toLocaleString()} candidate rows`);

  if (DRY) {
    const existing = await client.query('SELECT sku, oem_number FROM catalog_oem_crossref');
    const existingSet = new Set(existing.rows.map(r => `${r.sku}::${r.oem_number}`));
    const netNew = all.filter(r => !existingSet.has(`${r.sku}::${r.oem_number}`));
    console.log(`\n[DRY RUN] Net new vs current catalog_oem_crossref: ${netNew.length.toLocaleString()}`);
    console.log('Sample:', netNew.slice(0, 5));
    await client.end();
    return;
  }

  let inserted = 0;
  for (const batch of chunks(all, BATCH)) {
    const values = [];
    const params = [];
    let i = 1;
    for (const r of batch) {
      values.push(`($${i++},$${i++},$${i++},$${i++},$${i++},$${i++},$${i++})`);
      params.push(r.sku, r.oem_number, r.source, r.fatbook_page, r.oldbook_page, r.duplicate_count, r.is_cross_source);
    }
    const res = await client.query(
      `INSERT INTO catalog_oem_crossref (sku, oem_number, source, fatbook_page, oldbook_page, duplicate_count, is_cross_source)
       VALUES ${values.join(',')}
       ON CONFLICT (sku, oem_number) DO NOTHING`,
      params
    );
    inserted += res.rowCount;
    process.stdout.write(`\r  ${inserted.toLocaleString()} inserted`);
  }
  console.log();

  const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM catalog_oem_crossref');
  console.log(`\ncatalog_oem_crossref total now: ${parseInt(count).toLocaleString()}`);
  await client.end();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
