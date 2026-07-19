/**
 * preflight_fitment_schema.mjs
 *
 * Run this BEFORE import_pu_fitment.mjs to verify the target tables
 * have the expected columns. Exits 1 if anything is wrong.
 *
 *   node preflight_fitment_schema.mjs
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  user: 'catalog_app',
  password: 'smelly',
  database: 'stinkin_catalog',
});

async function checkTable(client, tableName, requiredCols) {
  const { rows } = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  const existing = new Set(rows.map(r => r.column_name));
  console.log(`\n${tableName} (${rows.length} cols):`);
  rows.forEach(r => console.log(`  ${r.column_name.padEnd(25)} ${r.data_type}`));

  const missing = requiredCols.filter(c => !existing.has(c));
  if (missing.length) {
    console.error(`  !! MISSING COLUMNS: ${missing.join(', ')}`);
    return false;
  }
  console.log(`  ✓ all required columns present`);
  return true;
}

async function main() {
  const client = await pool.connect();
  try {
    let ok = true;

    ok &= await checkTable(client, 'catalog_fitment_v2', [
      'product_id', 'year_start', 'year_end',
      'model_code', 'model_name', 'source'
    ]);

    // hd_model_id is optional — show if present
    ok &= await checkTable(client, 'hd_models', ['id', 'model_code']);
    ok &= await checkTable(client, 'catalog_oem_crossref', [
      'sku', 'oem_number', 'oem_manufacturer', 'source_file'
    ]);
    ok &= await checkTable(client, 'catalog_unified', ['id', 'sku']);

    // Row counts
    console.log('\n=== Current row counts ===');
    for (const t of ['catalog_fitment_v2', 'catalog_oem_crossref', 'catalog_unified', 'hd_models']) {
      const { rows } = await client.query(`SELECT COUNT(*) FROM ${t}`);
      console.log(`  ${t.padEnd(30)} ${rows[0].count}`);
    }

    // Existing sources in catalog_fitment_v2
    const { rows: sources } = await client.query(
      `SELECT source, COUNT(*) FROM catalog_fitment_v2 GROUP BY source ORDER BY 2 DESC`
    );
    console.log('\ncatalog_fitment_v2 by source:');
    sources.forEach(r => console.log(`  ${(r.source || 'NULL').padEnd(30)} ${r.count}`));

    if (!ok) {
      console.error('\n✗ Schema issues found — fix before running import');
      process.exit(1);
    } else {
      console.log('\n✓ Preflight passed');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main();
