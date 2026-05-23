#!/usr/bin/env node
/**
 * import_fatbook_crossref.cjs
 *
 * Imports 1779563614602_fatbookcrossref.txt into catalog_oem_crossref
 * Format: OEM #, Drag Specialties Part #, FatBook Page
 *
 * Skips rows already in catalog_oem_crossref (ON CONFLICT DO NOTHING)
 *
 * Run: node import_fatbook_crossref.cjs
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  database: 'stinkin_catalog',
  user: 'catalog_app',
  password: 'smelly',
});

const FILE = path.join(__dirname, '1779563614602_fatbookcrossref.txt');

async function main() {
  const client = await pool.connect();
  try {
    const lines = fs.readFileSync(FILE, 'utf8').split('\n').slice(1); // skip header

    const rows = [];
    for (const line of lines) {
      const parts = line.trim().split(',');
      if (parts.length < 2) continue;
      const oem = parts[0].trim();
      const sku = parts[1].trim();
      const page = parts[2] ? parts[2].trim() : null;
      if (!oem || !sku) continue;
      rows.push({ oem, sku, page });
    }

    process.stderr.write(`Parsed ${rows.length} rows\n`);

    // Check existing count
    const { rows: existing } = await client.query(
      `SELECT COUNT(*) FROM catalog_oem_crossref WHERE source_file = 'FatBook_crossref_txt'`
    );
    process.stderr.write(`Existing rows from this source: ${existing[0].count}\n`);

    // Batch insert
    const BATCH = 500;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      
      // Build values
      const values = [];
      const params = [];
      let p = 1;
      for (const r of batch) {
        values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(r.sku, r.oem, 'Harley-Davidson', r.page, 'FatBook_crossref_txt', false);
      }

      const result = await client.query(`
        INSERT INTO catalog_oem_crossref
          (sku, oem_number, oem_manufacturer, page_reference, source_file, is_cross_source)
        VALUES ${values.join(', ')}
        ON CONFLICT DO NOTHING
      `, params);

      inserted += result.rowCount;
      skipped += batch.length - result.rowCount;
      process.stderr.write(`  ${i + batch.length}/${rows.length} processed, ${inserted} inserted\r`);
    }

    process.stderr.write(`\nDone. Inserted: ${inserted}, Skipped (duplicates): ${skipped}\n`);

    // Verify
    const { rows: total } = await client.query(`SELECT COUNT(*) FROM catalog_oem_crossref`);
    process.stderr.write(`catalog_oem_crossref total rows: ${total[0].count}\n`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  process.stderr.write('Error: ' + err.message + '\n');
  process.exit(1);
});
