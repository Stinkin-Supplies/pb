const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const FILE = process.argv[2] || path.join(__dirname, 'fatbookcrossref.txt');

const DB_CONFIG = {
  host:     '2a01:4ff:f0:fa6f::1',
  user:     'catalog_app',
  password: 'smelly',
  database: 'stinkin_catalog',
};

function normalizeSku(raw) {
  return raw.replace(/-/g, '').toUpperCase().trim();
}

function parseFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (i === 0 && line.toLowerCase().startsWith('oem')) continue;
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const oem = parts[0].trim().toUpperCase();
    const dsSkuRaw = parts[1].trim();
    const fatbookPage = parseInt(parts[2].trim(), 10);
    if (!oem || !dsSkuRaw || isNaN(fatbookPage)) continue;
    rows.push({ oem, dsSkuRaw, dsSku: normalizeSku(dsSkuRaw), fatbookPage });
  }
  return rows;
}

async function main() {
  const rows = parseFile(FILE);
  console.log(`Parsed ${rows.length} rows from ${FILE}`);

  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('Connected to DB');

  try {
    await client.query('BEGIN');

    await client.query(`ALTER TABLE catalog_oem_crossref ADD COLUMN IF NOT EXISTS fatbook_page INTEGER`);

    await client.query(`CREATE TEMP TABLE tmp_fatbook_xref (oem_number TEXT, sku TEXT, sku_raw TEXT, fatbook_page INTEGER) ON COMMIT DROP`);

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const placeholders = slice.map((_, j) => `($${j*4+1}, $${j*4+2}, $${j*4+3}, $${j*4+4})`).join(', ');
      const values = slice.flatMap(r => [r.oem, r.dsSku, r.dsSkuRaw, r.fatbookPage]);
      await client.query(`INSERT INTO tmp_fatbook_xref VALUES ${placeholders}`, values);
    }
    console.log(`Loaded ${rows.length} rows into temp table`);

    const upsertRes = await client.query(`
      INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, fatbook_page, source)
      SELECT DISTINCT ON (sku, oem_number) sku, oem_number, 'HD', fatbook_page, 'fatbook_crossref'
      FROM tmp_fatbook_xref
      ORDER BY sku, oem_number, fatbook_page
      ON CONFLICT (sku, oem_number, oem_manufacturer)
        DO UPDATE SET fatbook_page = EXCLUDED.fatbook_page
    `);
    console.log(`catalog_oem_crossref upsert: ${upsertRes.rowCount} rows`);

    const f1 = await client.query(`
      UPDATE catalog_unified cu
      SET in_fatbook = true
      FROM tmp_fatbook_xref fx
      WHERE cu.sku = fx.sku
        AND cu.in_fatbook IS DISTINCT FROM true
    `);
    console.log(`in_fatbook (normalized): ${f1.rowCount} updated`);

    const f2 = await client.query(`
      UPDATE catalog_unified cu
      SET in_fatbook = true
      FROM tmp_fatbook_xref fx
      WHERE cu.sku = fx.sku_raw
        AND cu.in_fatbook IS DISTINCT FROM true
    `);
    console.log(`in_fatbook (raw): ${f2.rowCount} updated`);

    const matchRes = await client.query(`
      SELECT COUNT(DISTINCT fx.sku) AS ds_skus_in_file, COUNT(DISTINCT cu.sku) AS matched_in_catalog
      FROM tmp_fatbook_xref fx
      LEFT JOIN catalog_unified cu ON cu.sku = fx.sku OR cu.sku = fx.sku_raw
    `);
    const { ds_skus_in_file, matched_in_catalog } = matchRes.rows[0];
    console.log(`\nMatch report:`);
    console.log(`  Distinct DS SKUs in file:   ${ds_skus_in_file}`);
    console.log(`  Matched in catalog_unified: ${matched_in_catalog}`);
    console.log(`  Match rate: ${((matched_in_catalog / ds_skus_in_file) * 100).toFixed(1)}%`);

    await client.query('COMMIT');
    console.log('\nDone.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR — rolled back:', err.message);
    if (err.hint) console.error('Hint:', err.hint);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
