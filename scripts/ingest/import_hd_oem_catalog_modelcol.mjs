/**
 * import_hd_oem_catalog_modelcol.mjs
 *
 * Second parser for hd_oem_catalog_reference, covering the "MODEL(S)" column
 * table format used by the bulk of the local parts-catalog library (anything
 * sourced from the modern H-D Service Information Portal, regardless of
 * which vintage of vehicle it documents -- confirmed identical column
 * structure across Dyna/Touring/Softail/Sportster/Police catalogs spanning
 * 1991-2026). Distinct from import_hd_oem_catalog.mjs, which handles the
 * older factory-typeset "USED ON: 72 to *" year-range format (XR750, and a
 * handful of 1980s-90s original catalogs like the FXR 1984-86 book) --
 * that format was confirmed NOT to apply here (0% year-range resolution
 * across all 121 files tried), because these catalogs express fitment as
 * real model codes (+ optional specific year) instead of a bare year range:
 *
 *   INDEX NO.   PART NO.   DESCRIPTION                      MODEL(S)
 *   1           855B       SCREW                            ALL
 *   2           4716W      SCREW (2)                        FXDB 1992, FXDC
 *   7           16163-91   ENGINE ASSEMBLY, complete        FXDB 1991
 *                          (1340 cc) (black) (California)
 *
 * Row detection uses CHARACTER-COLUMN slicing (not whitespace-token regex):
 * pdftotext -layout preserves visual alignment, so once a page's own
 * "INDEX NO. / PART NO. / DESCRIPTION / MODEL(S)" header line is found, its
 * column start offsets are reused to slice every following line until the
 * next header. A line whose PART NO. slice is empty is a continuation of
 * the previous row (wrapped description or wrapped model list), appended
 * rather than treated as a new part.
 *
 * MODEL(S) values: comma-separated segments, each either 'ALL' (applies
 * across the catalog's whole covered span) or 'CODE' / 'CODE YYYY' (a
 * specific year restricts that segment to just that year). One output row
 * per resolved segment -- vehicle_model holds the resolved code itself
 * (e.g. 'FXDB'), not the source folder name, since that's the real,
 * higher-precision signal this format provides over the year-range format.
 *
 * Usage:
 *   pdftotext -layout catalog.pdf catalog.txt
 *   node import_hd_oem_catalog_modelcol.mjs <catalog.txt> "<source doc id>" "<source doc title>" <catalog_year_start> <catalog_year_end> [--apply]
 */
'use strict';

import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const argv = process.argv.slice(2).filter((a) => a !== '--apply');
const APPLY = process.argv.includes('--apply');
const [txtPath, sourceDocId, sourceDocTitle, yearStartArg, yearEndArg] = argv;

if (!txtPath || !sourceDocId || !yearStartArg || !yearEndArg) {
  console.error('Usage: node import_hd_oem_catalog_modelcol.mjs <catalog.txt> "<source doc id>" "<source doc title>" <catalog_year_start> <catalog_year_end> [--apply]');
  process.exit(1);
}
const CATALOG_YEAR_START = parseInt(yearStartArg, 10);
const CATALOG_YEAR_END = parseInt(yearEndArg, 10);

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// OCR'd catalogs sometimes drop the parens ("MODELS" instead of "MODEL(S)")
// and/or split the header across two lines ("INDEX  PART" then "NO.  NO.
// DESCRIPTION  MODEL(S)") rather than one -- both are handled below.
const HEADER_LINE_RE = /INDEX\s*(NO\.)?\s{2,}PART\s*(NO\.)?\s{2,}DESCRIPTION\s{2,}MODEL(\(S\)|S)?\b/i;
const HEADER_LINE1_RE = /^\s*INDEX\s+PART\s*$/i;
const HEADER_LINE2_RE = /^\s*NO\.\s+(?:NO\.\s+)?(?:NAME|DESCRIPTION)\s+MODEL(\(S\)|S)?\b/i;
const CATEGORY_RE = /^[A-Z][A-Z0-9 \/,.…'\-]{2,50}$/;
const BLOCKED_SECTIONS = new Set([
  "READER'S COMMENTS", 'PLEASE ADD ANY OTHER COMMENTS HERE', 'GENERAL INFORMATION',
  'VEHICLE IDENTIFICATION NUMBER', 'VIEW INTERACTIVE IMAGE', 'NOTES',
  'SIP (SERVICE INFORMATION PORTAL)', 'NUMERICAL INDEX', 'LOOSE PARTS',
  'COMPONENT TYPES AND INTRODUCTION DATES', 'COMMON SERVICE PARTS', 'HARDWARE LIST',
  'NEW PARTS LIST', 'ALPHABETICAL LIST', 'ALPHABETICAL INDEX',
]);

function isPartNumberToken(t) {
  return t.length >= 3 && /^[A-Za-z0-9][A-Za-z0-9\-]*$/.test(t) && /\d/.test(t);
}

function parseModelSegment(seg) {
  const s = seg.trim().replace(/[.,;]+$/, '');
  if (!s) return null;
  if (/^ALL$/i.test(s)) return { code: 'ALL', year: null };
  const m = s.match(/^([A-Za-z0-9\-\/]+)(?:\s+(\d{4}))?$/);
  if (!m) return null;
  return { code: m[1].toUpperCase(), year: m[2] ? parseInt(m[2], 10) : null };
}

async function run() {
  const raw = fs.readFileSync(txtPath, 'utf-8').replace(/\f/g, '');
  const lines = raw.split('\n');

  let cols = null; // { part, desc, model }
  let currentCategory = null;
  let currentPage = 1;
  let acc = null; // { part_number, description, model_text, page }
  const rawRecords = [];

  function finalize() {
    if (acc && acc.part_number && acc.description.trim()) {
      rawRecords.push({ ...acc, description: acc.description.trim(), model_text: acc.model_text.trim(), category: currentCategory });
    }
    acc = null;
  }

  let pendingPartIdx = null;
  for (const line of lines) {
    if (HEADER_LINE1_RE.test(line)) {
      pendingPartIdx = line.search(/PART/i);
      continue;
    }
    if (HEADER_LINE2_RE.test(line) && pendingPartIdx !== null) {
      finalize();
      const descIdx = line.search(/NAME|DESCRIPTION/i);
      const modelIdx = line.search(/MODEL(\(S\)|S)?\b/i);
      cols = { part: pendingPartIdx, desc: descIdx, model: modelIdx };
      pendingPartIdx = null;
      continue;
    }
    const headerMatch = line.match(HEADER_LINE_RE);
    if (headerMatch) {
      finalize();
      const partIdx = line.search(/PART/i);
      const descIdx = line.search(/DESCRIPTION/i);
      const modelIdx = line.search(/MODEL(\(S\)|S)?\b/i);
      cols = { part: partIdx, desc: descIdx, model: modelIdx };
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) { finalize(); continue; }
    if (/^\d+$/.test(trimmed) && trimmed.length <= 4) { currentPage = parseInt(trimmed, 10); finalize(); continue; }

    if (!cols) {
      // Not inside a table yet -- track section headers for when a table starts.
      if (CATEGORY_RE.test(trimmed) && !BLOCKED_SECTIONS.has(trimmed)) currentCategory = trimmed;
      continue;
    }

    const partSeg = line.slice(cols.part, cols.desc).trim();
    const descSeg = line.slice(cols.desc, cols.model).trim();
    const modelSeg = line.slice(cols.model).trim();

    // Section titles are a single block of text with nothing in the MODEL(S)
    // column and no valid part number -- distinguished this way rather than
    // requiring the title to fit entirely before the PART column, since long
    // titles (e.g. "WIRING HARNESS, SIDECAR LIGHTING") run past it.
    if (!isPartNumberToken(partSeg) && !modelSeg && CATEGORY_RE.test(trimmed) && /[A-Z]{4,}/.test(trimmed)) {
      finalize();
      currentCategory = BLOCKED_SECTIONS.has(trimmed) ? currentCategory : trimmed;
      continue;
    }

    if (isPartNumberToken(partSeg)) {
      finalize();
      acc = { part_number: partSeg, description: descSeg, model_text: modelSeg, page: currentPage };
    } else if (acc) {
      if (descSeg) acc.description += ' ' + descSeg;
      if (modelSeg) acc.model_text += (acc.model_text ? ', ' : '') + modelSeg;
    }
  }
  finalize();

  // Expand each raw record's comma-separated MODEL(S) into one row per segment.
  const records = [];
  for (const r of rawRecords) {
    const segments = r.model_text.split(',').map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) continue;
    for (const seg of segments) {
      const parsed = parseModelSegment(seg);
      if (!parsed) continue;
      const year_start = parsed.year ?? CATALOG_YEAR_START;
      const year_end = parsed.year ?? CATALOG_YEAR_END;
      records.push({
        part_number: r.part_number,
        description: r.description,
        category: r.category,
        used_on_raw: r.model_text,
        year_start,
        year_end,
        vehicle_model: parsed.code,
        page: r.page,
      });
    }
  }

  console.log(`Parsed ${rawRecords.length} raw rows -> ${records.length} expanded (part, model) rows from ${txtPath}`);
  console.log('Sample:', records.slice(0, 8));

  if (!APPLY) {
    console.log('\nDry run -- no writes made. Re-run with --apply to persist.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  let inserted = 0;
  const BATCH = 500;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let idx = 1;
    for (const r of batch) {
      values.push(`($${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++},$${idx++})`);
      params.push(r.part_number, r.description, r.category, r.used_on_raw, r.year_start, r.year_end, r.vehicle_model, sourceDocId, sourceDocTitle ?? null, r.page);
    }
    const res = await client.query(
      `INSERT INTO hd_oem_catalog_reference
         (part_number, description, category, used_on_raw, year_start, year_end, vehicle_model, source_document_id, source_document_title, source_page)
       VALUES ${values.join(',')}
       ON CONFLICT (source_document_id, part_number, category, used_on_raw) DO NOTHING`,
      params
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
