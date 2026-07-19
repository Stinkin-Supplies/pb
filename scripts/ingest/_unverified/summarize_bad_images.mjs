/**
 * scripts/ingest/summarize_bad_images.mjs
 *
 * Quick breakdown of a bad_content_type_images_*.csv file: tallies by
 * content_type and by source_vendor so you can see the shape of the
 * problem before deciding on a fix.
 *
 * Usage:
 *   node scripts/ingest/summarize_bad_images.mjs bad_content_type_images_2026-06-16T08-12-21.csv
 */

import { readFileSync } from 'fs';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node summarize_bad_images.mjs <csv_path>');
  process.exit(1);
}

// Minimal CSV parser that respects quoted fields (commas can appear inside
// the "name" column, so a naive split(',') would misalign columns).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const text = readFileSync(path, 'utf-8');
const rows = parseCsv(text);
const header = rows[0];
const data = rows.slice(1).filter(r => r.length === header.length);

const idx = (name) => header.indexOf(name);
const ctIdx = idx('content_type');
const vendorIdx = idx('source_vendor');
const skuIdx = idx('sku');
const urlIdx = idx('image_url');

const byContentType = new Map();
const byVendor = new Map();

for (const row of data) {
  const ct = row[ctIdx] || '(empty)';
  const vendor = row[vendorIdx] || '(unknown)';
  byContentType.set(ct, (byContentType.get(ct) ?? 0) + 1);
  byVendor.set(vendor, (byVendor.get(vendor) ?? 0) + 1);
}

console.log(`Total affected rows: ${data.length}\n`);

console.log('By content_type:');
for (const [ct, count] of [...byContentType.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(5)}  ${ct}`);
}

console.log('\nBy source_vendor:');
for (const [vendor, count] of [...byVendor.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(5)}  ${vendor}`);
}

console.log('\nFirst 5 examples:');
for (const row of data.slice(0, 5)) {
  console.log(`  [${row[vendorIdx]}] ${row[skuIdx]} — ${row[ctIdx]}`);
  console.log(`    ${row[urlIdx]}`);
}
