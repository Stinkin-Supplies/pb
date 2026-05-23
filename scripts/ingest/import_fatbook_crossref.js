#!/usr/bin/env node
/**
 * import_fatbook_crossref.js
 *
 * Reads fatbookcrossref.txt and does two things:
 *   1. Inserts OEM → DS part number pairs into catalog_oem_crossref
 *   2. Sets in_fatbook = true on catalog_unified rows whose SKU matches
 *      a DS part number in the file
 *
 * Usage:
 *   node import_fatbook_crossref.cjs [path/to/fatbookcrossref.txt]
 */

const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

// ── Config ────────────────────────────────────────────────────────────────────

const FILE = process.argv[2] || path.join(__dirname, 'fatbookcrossref.txt');

// Pass params as object to avoid IPv6 URL parsing issues
const DB_CONFIG = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host:     '2a01:4ff:f0:fa6f::1',
      user:     'catalog_app',
      password: 'smelly',
      database: 'stinkin_catalog',
    };

// ── Helpers ───────────────────────────────────────────────────────────────────

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

    const oem         = parts[0].trim().toUpperCase();
    const dsSkuRaw    = parts[1].trim();
    const fatbookPage = parseInt(parts[2].trim(), 10);

    if (!oem || !dsSkuRaw || isNaN(fatbookPage)) continue;

    rows.push({
      oem,
      dsSkuRaw,
      dsSku: normalizeSku(dsSkuRaw),
      fatbookPage,
    });
  }

  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const rows = parseFile(FILE);
  console.log(`Parsed ${rows.length} rows from ${FILE}`);

  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('Connected to DB');

  try {
    await client.query('BEGIN');

    // ── Step 0: Add fatbook_page column if missing ─────────────────────────
    await client.query(`
      ALTER TABLE catalog_oem_crossref
        ADD COLUMN IF NOT EXISTS fatbook_page INTEGER
    `);
    console.log('Ensured fatbook_page column on catalog_oem_crossref');

    // ── Step 1: Inspect table ──────────────────────────────────────────────
    const constraintRes = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'catalog_oem_crossref'
      ORDER BY ordinal_position
    `);
    console.log('catalog_oem_crossref columns:', constraintRes.rows.map(r => r.column_name).join(', '));

    const idxRes = await client.query(`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'catalog_oem_crossref'
    `);
    console.log('Indexes:');
    idxRes.rows.forEach(r => console.log(' ', r.indexdef));

    // ── Step 2: Load into temp table ───────────────────────────────────────
    await client.query(`
      CREATE TEMP TABLE tmp_fatbook_xref (
        oem_number    TEXT,
        vendor_sku    TEXT,
        vendor_sku_raw TEXT,
        fatbook_page  INTEGER
      ) ON COMMIT DROP
    `);

    const BATCH = 500;
    let loaded = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      const placeholders = slice.map((_, j) => {
        const b = j * 4;
        return `($${b+1}, $${b+2}, $${b+3}, $${b+4})`;
      }).join(', ');
      const values = slice.flatMap(r => [r.oem, r.dsSku, r.dsSkuRaw, r.fatbookPage]);
      await client.query(
        `INSERT INTO tmp_fatbook_xref (oem_number, vendor_sku, vendor_sku_raw, fatbook_page) VALUES ${placeholders}`,
        values
      );
      loaded += slice.length;
    }
    console.log(`Loaded ${loaded} rows into temp table`);

    // ── Step 3: Upsert into catalog_oem_crossref ───────────────────────────
    const upsertRes = await client.query(`
      INSERT INTO catalog_oem_crossref (oem_number, vendor_sku, fatbook_page)
      SELECT oem_number, vendor_sku, fatbook_page
      FROM tmp_fatbook_xref
      ON CONFLICT (oem_number, vendor_sku)
        DO UPDATE SET fatbook_page = EXCLUDED.fatbook_page
    `);
    console.log(`catalog_oem_crossref upsert: ${upsertRes.rowCount} rows affected`);

    // ── Step 4: Backfill in_fatbook on catalog_unified ─────────────────────
    const flagRes = await client.query(`
      UPDATE catalog_unified cu
      SET in_fatbook = true
      FROM tmp_fatbook_xref fx
      WHERE cu.sku = fx.vendor_sku
        AND cu.in_fatbook IS DISTINCT FROM true
    `);
    console.log(`catalog_unified in_fatbook (normalized): ${flagRes.rowCount} rows updated`);

    const flagRes2 = await client.query(`
      UPDATE catalog_unified cu
      SET in_fatbook = true
      FROM tmp_fatbook_xref fx
      WHERE cu.sku = fx.vendor_sku_raw
        AND cu.in_fatbook IS DISTINCT FROM true
    `);
    console.log(`catalog_unified in_fatbook (raw SKU): ${flagRes2.rowCount} additional rows updated`);

    // ── Step 5: Match rate report ──────────────────────────────────────────
    const matchRes = await client.query(`
      SELECT
        COUNT(DISTINCT fx.vendor_sku)  AS ds_skus_in_file,
        COUNT(DISTINCT cu.sku)         AS matched_in_catalog
      FROM tmp_fatbook_xref fx
      LEFT JOIN catalog_unified cu
        ON cu.sku = fx.vendor_sku OR cu.sku = fx.vendor_sku_raw
    `);
    const { ds_skus_in_file, matched_in_catalog } = matchRes.rows[0];
    console.log(`\nMatch report:`);
    console.log(`  Distinct DS SKUs in file:  ${ds_skus_in_file}`);
    console.log(`  Matched in catalog_unified: ${matched_in_catalog}`);
    console.log(`  Match rate: ${((matched_in_catalog / ds_skus_in_file) * 100).toFixed(1)}%`);

    await client.query('COMMIT');
    console.log('\nDone. Transaction committed.');

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
