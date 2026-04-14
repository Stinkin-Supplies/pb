/**
 * IMPORT HARDDRIVE → OEM CROSS-REFERENCE DATA
 *
 * Reads HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv and upserts every row into
 * catalog_oem_crossref using this column mapping:
 *
 *   CSV "OEM#"       → oem_number        (HD OEM part number)
 *   CSV "WPS#"       → sku               (WPS catalog number)
 *   CSV "Brand"      → oem_manufacturer  (aftermarket brand name)
 *   CSV "Brand-Part#"→ page_reference    (brand's own part number)
 *   source_file      → 'HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv'
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/import-harddrive-crossref.js [/path/to/file.csv]
 *
 * If no path is given, defaults to data/HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv
 * relative to the project root.
 */

'use strict';

const { Pool }  = require('pg');
const fs        = require('fs');
const path      = require('path');
const readline  = require('readline');

// ── DB connection ─────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString:
    process.env.CATALOG_DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
  ssl: false,
  max: 5,
  connectionTimeoutMillis: 10_000,
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  // Simple CSV parser – handles quoted fields
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(field.trim());
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field.trim());
  return fields;
}

async function streamCsv(filePath) {
  const rows = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, 'utf8'),
    crlfDelay: Infinity,
  });

  let headers = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    if (!headers) {
      headers = fields;
      continue;
    }
    const row = {};
    headers.forEach((h, i) => { row[h] = fields[i] ?? ''; });
    rows.push(row);
  }
  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function run() {
  const csvPath =
    process.argv[2] ||
    path.join(__dirname, '../../data/HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`\n❌  File not found: ${csvPath}`);
    console.error('    Pass the CSV path as the first argument, or place it at data/HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv\n');
    process.exit(1);
  }

  console.log('\n📥  HardDrive → OEM Cross-Reference Import');
  console.log('─'.repeat(55));
  console.log(`    File : ${csvPath}`);

  // Verify table
  const tableCheck = await pool.query(`
    SELECT EXISTS (
      SELECT FROM pg_tables WHERE tablename = 'catalog_oem_crossref'
    )
  `);
  if (!tableCheck.rows[0].exists) {
    console.error('\n❌  Table catalog_oem_crossref does not exist.');
    console.error('    Run scripts/ingest/migration_add_oem_table.sql first.\n');
    await pool.end();
    process.exit(1);
  }
  console.log('    Table: catalog_oem_crossref ✓\n');

  // Parse CSV
  console.log('📂  Parsing CSV…');
  const rows = await streamCsv(csvPath);
  console.log(`    ${rows.length} data rows found\n`);

  // Upsert in batches
  const BATCH = 200;
  let inserted = 0;
  let updated  = 0;
  let skipped  = 0;
  const errors  = [];

  console.log('💾  Importing…');

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);

    // Filter out rows with missing required fields
    const valid = batch.filter(r => {
      const oem = (r['OEM#'] || '').trim();
      const wps = (r['WPS#'] || '').trim();
      if (!oem || !wps) { skipped++; return false; }
      return true;
    });

    if (!valid.length) continue;

    // Build multi-row upsert
    const valuePlaceholders = [];
    const params = [];
    let p = 1;

    for (const r of valid) {
      const oem       = r['OEM#'].trim();
      const wps       = r['WPS#'].trim();
      const brand     = (r['Brand'] || '').trim();
      const brandPart = (r['Brand-Part#'] || '').trim();

      valuePlaceholders.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(wps, oem, brand, brandPart, 'HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv');
    }

    try {
      const result = await pool.query(`
        INSERT INTO catalog_oem_crossref
          (sku, oem_number, oem_manufacturer, page_reference, source_file)
        VALUES ${valuePlaceholders.join(', ')}
        ON CONFLICT (sku, oem_number, oem_manufacturer) DO UPDATE
          SET page_reference = EXCLUDED.page_reference,
              source_file    = EXCLUDED.source_file
        RETURNING (xmax = 0) AS was_inserted
      `, params);

      result.rows.forEach(r => {
        if (r.was_inserted) inserted++; else updated++;
      });
    } catch (err) {
      errors.push({ batch: i, message: err.message });
    }

    const done = Math.min(i + BATCH, rows.length);
    process.stdout.write(`\r    ${done} / ${rows.length} rows processed…`);
  }

  console.log('\n');

  // Summary
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM catalog_oem_crossref WHERE source_file = 'HARDDRIVE_TO_OEM_CROSS_REFERENCE.csv'`
  );

  console.log('─'.repeat(55));
  console.log(`✅  Done`);
  console.log(`    Inserted : ${inserted}`);
  console.log(`    Updated  : ${updated}`);
  console.log(`    Skipped  : ${skipped}  (missing OEM# or WPS#)`);
  if (errors.length) {
    console.log(`    Errors   : ${errors.length}`);
    errors.forEach(e => console.error(`      Batch ${e.batch}: ${e.message}`));
  }
  console.log(`    Total rows in DB (this source): ${count}`);
  console.log('─'.repeat(55) + '\n');

  await pool.end();
}

run().catch(err => {
  console.error('\n❌  Fatal error:', err.message);
  pool.end();
  process.exit(1);
});
