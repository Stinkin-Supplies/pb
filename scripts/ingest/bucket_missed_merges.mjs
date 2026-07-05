#!/usr/bin/env node
/**
 * bucket_missed_merges.mjs
 *
 * Reads the missed_merges_<timestamp>.csv produced by
 * audit_canonical_matches.mjs and buckets it two ways:
 *
 *   1. NULL-PATTERN — for each normalized_part_number group, how many
 *      members have canonical_product_id = (none) vs how many have a
 *      real (but different) canonical_product_id.
 *        - "all_null"        -> nobody canonical-matched yet (easy: run matcher)
 *        - "one_real_rest_null" -> one member matched, others weren't swept in (easy: attach)
 *        - "multiple_real"   -> two+ real canonical entries need merging (hard: other
 *                                 tables may reference both IDs, needs care)
 *
 *   2. VENDOR COMBINATION — which source_vendor pairs show up together in each
 *      group (e.g. "PU+WPS", "PU+VTWIN", "WPS+VTWIN", "PU+WPS+VTWIN", single-vendor
 *      dupes). Tells you if this is concentrated in one vendor pairing or systemic.
 *
 * READ-ONLY. Only reads the CSV, prints a summary, writes two small
 * breakdown CSVs. No DB connection, no writes to source data.
 *
 * Usage:
 *   node bucket_missed_merges.mjs ./audit_output/missed_merges_<timestamp>.csv
 */

import fs from 'fs';
import path from 'path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node bucket_missed_merges.mjs <path-to-missed_merges-csv>');
  process.exit(1);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => (row[h] = values[idx] ?? ''));
    rows.push(row);
  }
  return rows;
}

// Minimal CSV line splitter handling quoted fields with embedded commas/quotes.
function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        result.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
  }
  result.push(cur);
  return result;
}

function writeCsv(filepath, headers, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => esc(row[h])).join(','));
  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
}

function main() {
  const text = fs.readFileSync(inputPath, 'utf8');
  const rows = parseCsv(text);
  console.log(`Loaded ${rows.length} rows from ${inputPath}`);

  const groups = new Map();
  for (const row of rows) {
    const key = row.normalized_part_number;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  console.log(`Grouped into ${groups.size} distinct part numbers.\n`);

  // --- Bucket 1: null pattern ---
  const nullPatternCounts = { all_null: 0, one_real_rest_null: 0, multiple_real: 0 };
  const nullPatternDetail = [];

  for (const [partNumber, members] of groups) {
    const realIds = members
      .map((m) => m.canonical_product_id)
      .filter((v) => v && v !== '(none)');
    const uniqueRealIds = new Set(realIds);

    let bucket;
    if (uniqueRealIds.size === 0) {
      bucket = 'all_null';
    } else if (uniqueRealIds.size === 1) {
      bucket = 'one_real_rest_null';
    } else {
      bucket = 'multiple_real';
    }
    nullPatternCounts[bucket]++;

    nullPatternDetail.push({
      normalized_part_number: partNumber,
      bucket,
      member_count: members.length,
      distinct_real_canonical_ids: uniqueRealIds.size,
      canonical_ids: [...uniqueRealIds].join('|'),
      skus: members.map((m) => m.sku).join('|'),
    });
  }

  console.log('--- NULL-PATTERN BREAKDOWN ---');
  console.log(`all_null (nobody matched yet, run matcher):        ${nullPatternCounts.all_null}`);
  console.log(`one_real_rest_null (attach the unmatched ones):    ${nullPatternCounts.one_real_rest_null}`);
  console.log(`multiple_real (two+ canonical entries, need merge - handle carefully): ${nullPatternCounts.multiple_real}`);
  console.log('');

  // --- Bucket 2: vendor combination ---
  const vendorComboCounts = new Map();
  const vendorComboDetail = [];

  for (const [partNumber, members] of groups) {
    const vendors = [...new Set(members.map((m) => m.source_vendor))].sort();
    const comboKey = vendors.join('+');
    vendorComboCounts.set(comboKey, (vendorComboCounts.get(comboKey) || 0) + 1);
    vendorComboDetail.push({
      normalized_part_number: partNumber,
      vendor_combo: comboKey,
      member_count: members.length,
      skus: members.map((m) => m.sku).join('|'),
    });
  }

  console.log('--- VENDOR COMBINATION BREAKDOWN ---');
  const sortedCombos = [...vendorComboCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [combo, count] of sortedCombos) {
    console.log(`${combo.padEnd(30)} ${count}`);
  }

  const outDir = path.dirname(inputPath);
  const base = path.basename(inputPath, '.csv');

  const nullPatternPath = path.join(outDir, `${base}_by_null_pattern.csv`);
  writeCsv(
    nullPatternPath,
    ['normalized_part_number', 'bucket', 'member_count', 'distinct_real_canonical_ids', 'canonical_ids', 'skus'],
    nullPatternDetail
  );

  const vendorComboPath = path.join(outDir, `${base}_by_vendor_combo.csv`);
  writeCsv(
    vendorComboPath,
    ['normalized_part_number', 'vendor_combo', 'member_count', 'skus'],
    vendorComboDetail
  );

  console.log(`\nWritten: ${nullPatternPath}`);
  console.log(`Written: ${vendorComboPath}`);
}

main();
