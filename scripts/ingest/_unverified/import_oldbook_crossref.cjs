const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const FILE = process.argv[2] || path.join(__dirname, 'oldbookcrossref.txt');

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
    const page = parseInt(parts[2].trim(), 10);
    if (!oem || !dsSkuRaw || isNaN(page)) continue;
    rows.push({ oem, dsSkuRaw, dsSku: normalizeSku(dsSkuRaw), page });
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

    await client.query(`ALTER TABLE catalog_oem_crossref ADD COLUMN IF NOT EXISTS oldbook_page INTEGER`);

    await client.query(`CREATE TEMP TABLE tmp_oldbook_xref (oem_number TEXT, sku TEXT, sku_raw TEXT, page INTEGER) ON COMMIT DROP`);

    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const placeholders = slice.map((_, j) => `($${j*4+1}, $${j*4+2}, $${j*4+3}, $${j*4+4})`).join(', ');
      const values = slice.flatMap(r => [r.oem, r.dsSku, r.dsSkuRaw, r.page]);
      await client.query(`INSERT INTO tmp_oldbook_xref VALUES ${placeholders}`, values);
    }
    console.log(`Loaded ${rows.length} rows into temp table`);

    const upsertRes = await client.query(`
      INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, oldbook_page, source)
      SELECT DISTINCT ON (sku, oem_number) sku, oem_number, 'HD', page, 'oldbook_crossref'
      FROM tmp_oldbook_xref
      ORDER BY sku, oem_number, page
      ON CONFLICT (sku, oem_number)
        DO UPDATE SET oldbook_page = EXCLUDED.oldbook_page
    `);
    console.log(`catalog_oem_crossref upsert: ${upsertRes.rowCount} rows`);

    const f1 = await client.query(`
      UPDATE catalog_unified cu
      SET in_oldbook = true
      FROM tmp_oldbook_xref fx
      WHERE cu.sku = fx.sku
        AND cu.in_oldbook IS DISTINCT FROM true
    `);
    console.log(`in_oldbook (normalized): ${f1.rowCount} updated`);

    const f2 = await client.query(`
      UPDATE catalog_unified cu
      SET in_oldbook = true
      FROM tmp_oldbook_xref fx
      WHERE cu.sku = fx.sku_raw
        AND cu.in_oldbook IS DISTINCT FROM true
    `);
    console.log(`in_oldbook (raw): ${f2.rowCount} updated`);

    const matchRes = await client.query(`
      SELECT COUNT(DISTINCT fx.sku) AS ds_skus_in_file, COUNT(DISTINCT cu.sku) AS matched_in_catalog
      FROM tmp_oldbook_xref fx
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
