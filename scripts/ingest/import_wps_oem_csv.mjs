import fs from 'fs';
import { parse } from 'csv-parse/sync';
import pg from 'pg';

const DRY = process.argv.includes('--dry');
const DB_URL = 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog';

const FILES = [
  { path: '/Users/home/Downloads/harley_oem_cross_reference.csv',   source: 'wps_oem_csv_harley' },
  { path: '/Users/home/Downloads/HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv', source: 'wps_oem_csv_harddrive' },
];

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// Build WPS vendor_sku → product id + sku map from catalog_unified
const { rows: wpsProducts } = await client.query(
  `SELECT id, sku, vendor_sku FROM catalog_unified WHERE source_vendor = 'WPS' AND is_active = true AND vendor_sku IS NOT NULL`
);
const byVendorSku = new Map(wpsProducts.map(r => [r.vendor_sku.trim(), r]));
console.log(`WPS products loaded: ${byVendorSku.size.toLocaleString()}`);

let totalCandidate = 0, totalLinked = 0, totalInserted = 0;

for (const { path, source } of FILES) {
  const rows = parse(fs.readFileSync(path, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
  console.log(`\n${path}: ${rows.rows?.length ?? rows.length} rows`);

  const toInsert = [];
  for (const row of rows) {
    const oem = (row['OEM#'] || '').trim();
    const wpsNum = (row['WPS#'] || '').trim();
    if (!oem || !wpsNum) continue;
    totalCandidate++;
    const product = byVendorSku.get(wpsNum);
    if (!product) continue;
    totalLinked++;
    toInsert.push({ sku: product.sku, oem_number: oem, source });
  }

  console.log(`  Matched to catalog: ${toInsert.length}`);

  if (DRY) {
    console.log('  Sample:', toInsert.slice(0, 3));
    continue;
  }

  // Batch insert
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const values = batch.map((_, j) => `($${j*3+1},$${j*3+2},$${j*3+3})`).join(',');
    const params = batch.flatMap(r => [r.sku, r.oem_number, r.source]);
    const res = await client.query(
      `INSERT INTO catalog_oem_crossref (sku, oem_number, source)
       VALUES ${values} ON CONFLICT (sku, oem_number) DO NOTHING`,
      params
    );
    totalInserted += res.rowCount;
  }
  console.log(`  Inserted: ${toInsert.length} attempted`);
}

console.log(`\nTotal candidates: ${totalCandidate}`);
console.log(`Matched to WPS products: ${totalLinked}`);
if (!DRY) {
  console.log(`Net new rows inserted: ${totalInserted}`);
  // Link product_ids for the newly inserted rows
  const { rowCount } = await client.query(`
    UPDATE catalog_oem_crossref c
    SET product_id = u.id
    FROM catalog_unified u
    WHERE c.product_id IS NULL AND u.sku = c.sku AND u.is_active = true
  `);
  console.log(`Linked product_ids: ${rowCount}`);
}
await client.end();
