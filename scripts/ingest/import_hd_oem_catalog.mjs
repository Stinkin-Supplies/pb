/**
 * import_hd_oem_catalog.mjs
 *
 * Parses a text-extracted (pdftotext -layout) H-D official parts catalog
 * into hd_oem_catalog_reference. This table is a standalone, authoritative
 * reference -- it does NOT feed catalog_oem_crossref or catalog_fitment_v2
 * directly (see 117_hd_oem_catalog_reference.sql for why). Cross-checking
 * it against the existing crossref/fitment tables is a separate, later
 * step.
 *
 * Catalog table rows look like:
 *   16774-72R    FOR CYLINDER BASE (2) .............................. 72 to *
 *   11110        FOR Rocker arm shaft — left (4) .................... 72 thru 88
 * grouped under bold section headers (ALL CAPS lines with no leading
 * whitespace and no part number, e.g. "GASKETS", "SEALS").
 *
 * Only handles the "PART NO. | NAME....... | USED ON" table shape (the
 * dominant one). Multi-column tables like "HOSE FITTINGS" (PART NO / ANGLE /
 * THREAD SIZE / HOSE SIZE / I.D.) are skipped -- confirmed by spot-check
 * that they don't carry a year-range "used on" column at all, so there's no
 * fitment signal to extract from them anyway.
 *
 * Usage:
 *   pdftotext -layout catalog.pdf catalog.txt
 *   node scripts/ingest/import_hd_oem_catalog.mjs <catalog.txt> "<vehicle model, e.g. XR750>" "<source doc id, e.g. 99442-08R>" "<source doc title>" [--apply]
 */
'use strict';

import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const args = process.argv.slice(2).filter((a) => a !== '--apply');
const APPLY = process.argv.includes('--apply');
const [txtPath, vehicleModel, sourceDocId, sourceDocTitle] = args;

if (!txtPath || !vehicleModel || !sourceDocId) {
  console.error('Usage: node import_hd_oem_catalog.mjs <catalog.txt> "<vehicle model>" "<source doc id>" ["<source doc title>"] [--apply]');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Section headers: short, all-caps, no digits, standalone line.
const HEADER_RE = /^[A-Z][A-Z0-9 \/,.…'\-]{2,40}$/;
// "PART_NO   NAME......... USED_ON" -- dot-leader separated, or plain multi-space columns.
const ROW_RE = /^\s*(\S+)\s{2,}(.+?)\.{2,}\s*(.+?)\s*$/;
const ROW_RE_NODOTS = /^\s*(\S+)\s{3,}(.+?)\s{3,}(\S.*?)\s*$/;

function parseUsedOn(raw) {
  const toStar = raw.match(/^(\d{2})\s*to\s*\*$/i);
  if (toStar) {
    const y = parseInt(toStar[1], 10);
    return { year_start: y >= 30 ? 1900 + y : 2000 + y, year_end: null };
  }
  const thru = raw.match(/^(\d{2})\s*thru\s*(\d{2})$/i);
  if (thru) {
    const y1 = parseInt(thru[1], 10), y2 = parseInt(thru[2], 10);
    return {
      year_start: y1 >= 30 ? 1900 + y1 : 2000 + y1,
      year_end: y2 >= 30 ? 1900 + y2 : 2000 + y2,
    };
  }
  return { year_start: null, year_end: null };
}

function isPartNumberToken(t) {
  return /^[A-Za-z0-9][A-Za-z0-9\-]*$/.test(t) && /\d/.test(t);
}

async function run() {
  const raw = fs.readFileSync(txtPath, 'utf-8');
  const lines = raw.split('\n');

  let currentCategory = null;
  let currentPage = 1;
  const records = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\d+$/.test(trimmed) && trimmed.length <= 3) { currentPage = parseInt(trimmed, 10); continue; } // page-number-only line
    if (HEADER_RE.test(trimmed) && !/\d{2}-\d/.test(trimmed)) {
      currentCategory = trimmed;
      continue;
    }
    let m = line.match(ROW_RE) || line.match(ROW_RE_NODOTS);
    if (!m) continue;
    const [, partNo, name, usedOnRaw] = m;
    if (!isPartNumberToken(partNo)) continue;
    const { year_start, year_end } = parseUsedOn(usedOnRaw.trim());
    records.push({
      part_number: partNo,
      description: name.trim(),
      category: currentCategory,
      used_on_raw: usedOnRaw.trim(),
      year_start,
      year_end,
      page: currentPage,
    });
  }

  console.log(`Parsed ${records.length} part rows from ${txtPath}`);
  console.log('Sample:', records.slice(0, 5));

  if (!APPLY) {
    console.log('\nDry run -- no writes made. Re-run with --apply to persist.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  let inserted = 0;
  for (const r of records) {
    const res = await client.query(
      `INSERT INTO hd_oem_catalog_reference
         (part_number, description, category, used_on_raw, year_start, year_end, vehicle_model, source_document_id, source_document_title, source_page)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (source_document_id, part_number, category, used_on_raw) DO NOTHING`,
      [r.part_number, r.description, r.category, r.used_on_raw, r.year_start, r.year_end, vehicleModel, sourceDocId, sourceDocTitle ?? null, r.page]
    );
    inserted += res.rowCount;
  }
  console.log(`Inserted ${inserted} rows into hd_oem_catalog_reference.`);
  client.release();
  await pool.end();
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
