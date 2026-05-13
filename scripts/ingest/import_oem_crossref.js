#!/usr/bin/env node
// import_oem_crossref.js
// Ingests OEM_Crossref_Merged.xlsx into oem_crossref table
// Back-populates oem_numbers[] on pu_catalog, wps_catalog, vtwin_catalog

import path from 'path';
import ExcelJS from 'exceljs';
import pg from 'pg';

const { Pool } = pg;

const XLSX_FILE = path.resolve('scripts/data/OEM_Crossref_Merged.xlsx');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL ||
    'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

function cleanStr(val) {
  if (val === null || val === undefined) return null;
  const s = val.toString().trim();
  return s === '' ? null : s;
}

function parseNotes(notes) {
  if (!notes) return { era: null, year_start: null, raw_notes: null };
  let era = null;
  let year_start = null;
  const eraMatch = notes.match(/\(([^)]+)\)/);
  if (eraMatch) {
    const e = eraMatch[1].toLowerCase();
    if (e.includes('vintage') || e.includes('pre-evo')) era = 'vintage';
    else if (e.includes('evo') && e.includes('tc')) era = 'evo-tc';
    else if (e.includes('evo')) era = 'evo';
    else if (e.includes('tc')) era = 'twin-cam';
    else if (e.includes('m8') || e.includes('milwaukee')) era = 'm8';
    else era = e;
  }
  const yearMatch = notes.match(/~(\d{4})\+/);
  if (yearMatch) year_start = parseInt(yearMatch[1]);
  return { era, year_start, raw_notes: notes };
}

function progress(done, total, errors) {
  const pct = Math.floor((done / total) * 100);
  const filled = Math.floor(pct / 2);
  const bar = '█'.repeat(filled) + '░'.repeat(50 - filled);
  process.stdout.write(`\r  [${bar}] ${pct}% — ${done}/${total} rows, ${errors} errors`);
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS oem_crossref (
        id                  SERIAL PRIMARY KEY,
        oem_number          VARCHAR(100) NOT NULL,
        ds_oldbook_sku      VARCHAR(50),
        ds_fatbook_sku      VARCHAR(50),
        vtwin_sku           VARCHAR(50),
        wps_sku             VARCHAR(50),
        wps_vendor          VARCHAR(200),
        vendor_part_number  VARCHAR(100),
        era                 VARCHAR(50),
        fitment_year_start  SMALLINT,
        raw_notes           TEXT,
        created_at          TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_oem_crossref_oem     ON oem_crossref(oem_number);
      CREATE INDEX IF NOT EXISTS idx_oem_crossref_oldbook ON oem_crossref(ds_oldbook_sku);
      CREATE INDEX IF NOT EXISTS idx_oem_crossref_fatbook ON oem_crossref(ds_fatbook_sku);
      CREATE INDEX IF NOT EXISTS idx_oem_crossref_vtwin   ON oem_crossref(vtwin_sku);
      CREATE INDEX IF NOT EXISTS idx_oem_crossref_wps     ON oem_crossref(wps_sku);
    `);
    await client.query('TRUNCATE oem_crossref RESTART IDENTITY');
    console.log('oem_crossref table ready');

    console.log('Reading OEM_Crossref_Merged.xlsx...');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(XLSX_FILE);
    const ws = workbook.getWorksheet('OEM Crossref - Full');

    const allRows = [];
    ws.eachRow((row, idx) => {
      if (idx === 1) return;
      const oem_number = cleanStr(row.getCell(1).value);
      if (!oem_number) return;
      allRows.push({
        oem_number,
        ds_oldbook:  cleanStr(row.getCell(2).value),
        ds_fatbook:  cleanStr(row.getCell(3).value),
        vtwin_sku:   cleanStr(row.getCell(4).value),
        wps_sku:     cleanStr(row.getCell(5).value),
        wps_vendor:  cleanStr(row.getCell(6).value),
        vendor_part: cleanStr(row.getCell(7).value),
        ...parseNotes(cleanStr(row.getCell(8).value)),
      });
    });

    const total = allRows.length;
    console.log(`Rows to insert: ${total}`);

    let inserted = 0;
    let errors = 0;
    const BATCH = 200;

    for (let i = 0; i < allRows.length; i += BATCH) {
      const batch = allRows.slice(i, i + BATCH);
      for (const r of batch) {
        try {
          await client.query(`
            INSERT INTO oem_crossref (
              oem_number, ds_oldbook_sku, ds_fatbook_sku, vtwin_sku,
              wps_sku, wps_vendor, vendor_part_number,
              era, fitment_year_start, raw_notes
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `, [
            r.oem_number, r.ds_oldbook, r.ds_fatbook, r.vtwin_sku,
            r.wps_sku, r.wps_vendor, r.vendor_part,
            r.era, r.year_start, r.raw_notes
          ]);
          inserted++;
        } catch (e) {
          errors++;
          if (errors <= 3) console.error(`\nError on ${r.oem_number}:`, e.message);
        }
      }
      progress(inserted, total, errors);
    }
    console.log(`\nInserted: ${inserted}, Errors: ${errors}`);

    // Back-populate oem_numbers on vendor tables
    console.log('\nBack-populating oem_numbers on pu_catalog...');
    const puRes = await client.query(`
      UPDATE pu_catalog p
      SET oem_numbers = subq.oems
      FROM (
        SELECT REPLACE(COALESCE(ds_oldbook_sku, ds_fatbook_sku), '-', '') as norm_sku,
               array_agg(DISTINCT oem_number) as oems
        FROM oem_crossref
        WHERE ds_oldbook_sku IS NOT NULL OR ds_fatbook_sku IS NOT NULL
        GROUP BY REPLACE(COALESCE(ds_oldbook_sku, ds_fatbook_sku), '-', '')
      ) subq
      WHERE subq.norm_sku = p.sku
    `);
    console.log(`  PU rows updated: ${puRes.rowCount}`);

    console.log('Back-populating oem_numbers on wps_catalog...');
    const wpsRes = await client.query(`
      UPDATE wps_catalog w
      SET oem_numbers = subq.oems
      FROM (
        SELECT wps_sku, array_agg(DISTINCT oem_number) as oems
        FROM oem_crossref
        WHERE wps_sku IS NOT NULL
        GROUP BY wps_sku
      ) subq
      WHERE subq.wps_sku = w.sku
    `);
    console.log(`  WPS rows updated: ${wpsRes.rowCount}`);

    console.log('Back-populating oem_numbers on vtwin_catalog...');
    const vtwinRes = await client.query(`
      UPDATE vtwin_catalog v
      SET oem_numbers = subq.oems
      FROM (
        SELECT vtwin_sku, array_agg(DISTINCT oem_number) as oems
        FROM oem_crossref
        WHERE vtwin_sku IS NOT NULL
        GROUP BY vtwin_sku
      ) subq
      WHERE subq.vtwin_sku = v.sku
    `);
    console.log(`  VTwin rows updated: ${vtwinRes.rowCount}`);

    const summary = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM oem_crossref) as crossref_rows,
        (SELECT COUNT(*) FROM pu_catalog WHERE oem_numbers IS NOT NULL) as pu_with_oem,
        (SELECT COUNT(*) FROM wps_catalog WHERE oem_numbers IS NOT NULL) as wps_with_oem,
        (SELECT COUNT(*) FROM vtwin_catalog WHERE oem_numbers IS NOT NULL) as vtwin_with_oem
    `);
    console.log('\n✅ Summary:', summary.rows[0]);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
