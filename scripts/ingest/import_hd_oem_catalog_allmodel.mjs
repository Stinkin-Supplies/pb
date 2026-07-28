/**
 * import_hd_oem_catalog_allmodel.mjs
 *
 * Fourth parser for hd_oem_catalog_reference, covering the "All Model"
 * combined catalogs (4 files spanning 1987-1996) that list FLT/FXR/Softail/
 * Dyna fitment side by side in separate columns per page, rather than a
 * single MODEL(S) or USED ON column:
 *
 *   INDEX  PART                                          FLT       FXR      SOFTAIL   DYNA
 *   NO.    NO.        NAME                                MODELS    MODELS   MODELS    MODEL
 *   34     18011-86   INSERT, exhaust valve seat (2)      91*-ALL   91*-ALL  91*-ALL   91*-ALL
 *
 *   FLT MODELS       FXR MODELS       SOFTAIL MODELS    DYNA MODEL
 *   FLTC       DB    FXR        EA    FXST      BH      FXDB-D  GA
 *   FLHT       DJ    FXRS       EB    FLST/C    BJ      FXDB-S  GB
 *
 * Each file has a DIFFERENT number of family columns (3 for the 1987-90 and
 * 1995-96 books before/without Dyna, 4 for 1991-94) and inconsistent header
 * spacing, so columns are detected dynamically per document rather than
 * assumed fixed. A per-document legend (CODE -> real model name, e.g.
 * 'EA' -> 'FXR') is built by scanning every "{FAMILY} MODEL(S)" legend block
 * in the document (they repeat per page and should be consistent).
 *
 * These are 1987-96 Adobe-typeset originals with real, but sometimes
 * corrupted, embedded text -- the '*' marker especially extracts as
 * different stray glyphs inconsistently ('8t-ALL', "90'-ALL" instead of
 * '87*-ALL', '90*-ALL'). Cells that don't match a recognizable
 * <year><junk>-<code list> shape are skipped rather than guessed at.
 *
 * Usage:
 *   pdftotext -layout catalog.pdf catalog.txt
 *   node import_hd_oem_catalog_allmodel.mjs <catalog.txt> "<source doc id>" "<source doc title>" <catalog_year_end> [--apply]
 */
'use strict';

import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const argv = process.argv.slice(2).filter((a) => a !== '--apply');
const APPLY = process.argv.includes('--apply');
const [txtPath, sourceDocId, sourceDocTitle, yearEndArg] = argv;

if (!txtPath || !sourceDocId || !yearEndArg) {
  console.error('Usage: node import_hd_oem_catalog_allmodel.mjs <catalog.txt> "<source doc id>" "<source doc title>" <catalog_year_end> [--apply]');
  process.exit(1);
}
const CATALOG_YEAR_END = parseInt(yearEndArg, 10);

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// Line 2 of the main table header: "NO.  NO.  NAME  MODELS  MODELS  MODEL(S)..."
const TABLE_HEADER2_RE = /NO\.\s+NO\.\s+(?:NAME|DESCRIPTION)\s+MODEL/i;
// A legend block header: "FLT MODELS   FXR MODELS   SOFTAIL MODELS   DYNA MODEL"
const LEGEND_HEADER_RE = /^([A-Z][A-Z0-9]*\s+MODELS?\s*)+$/;

function isPartNumberToken(t) {
  return t.length >= 3 && /^[A-Za-z0-9][A-Za-z0-9\-]*$/.test(t) && /\d/.test(t);
}

function twoDigitYear(yy) {
  const n = parseInt(yy, 10);
  return n >= 30 ? 1900 + n : 2000 + n;
}

// Parse one family-column cell, e.g. '91*-ALL', '91-DB/J/M/P', '87 to 89-ALL'.
// Returns null for unrecognized shapes (corrupted glyphs, blanks) rather than guessing.
function parseCell(cell) {
  const c = cell.trim();
  if (!c) return null;
  const m = c.match(/^(\d{2,4})(?:\s*(?:to|thru)\s*(\d{2,4}))?\D{0,3}-(.+)$/i);
  if (!m) return null;
  const year_start = twoDigitYear(m[1]);
  const year_end = m[2] ? twoDigitYear(m[2]) : CATALOG_YEAR_END;
  const codes = m[3].split('/').map((s) => s.trim()).filter(Boolean);
  return { year_start, year_end, codes };
}

async function run() {
  // Known font/kerning extraction corruptions spotted across these 1987-96
  // originals: a stray space splitting "SOFTAIL" into two regex matches, and
  // "DYNA" occasionally extracting as "DVNA" (V for Y) run into "MODEL".
  const raw = fs.readFileSync(txtPath, 'utf-8')
    .replace(/\f/g, '')
    .replace(/SOFT\s+AIL/g, 'SOFTAIL')
    .replace(/DVNA/g, 'DYNA')
    .replace(/DYNAMODEL/g, 'DYNA MODEL');
  const lines = raw.split('\n');

  // ── Pass 1: find family columns from the first main-table header seen ──
  let familyCols = null; // [{ name, start, end }]
  for (let i = 0; i < lines.length - 1; i++) {
    if (TABLE_HEADER2_RE.test(lines[i])) {
      const line1 = lines[i - 1] ?? '';
      const familyMatches = [...line1.matchAll(/[A-Z][A-Z0-9]*/g)].filter(
        (m) => !['INDEX', 'PART', 'NO'].includes(m[0])
      );
      if (familyMatches.length >= 2) {
        familyCols = familyMatches.map((m, idx) => ({
          name: m[0],
          start: m.index,
          end: idx + 1 < familyMatches.length ? familyMatches[idx + 1].index : Infinity,
        }));
        break;
      }
    }
  }
  if (!familyCols) {
    console.error('Could not detect family columns from table header. Aborting.');
    process.exit(1);
  }
  console.log('Detected family columns:', familyCols.map((f) => f.name));

  // ── Pass 2: build CODE -> real model name legend from every legend block ──
  const legend = new Map(); // code -> modelName
  for (let i = 0; i < lines.length; i++) {
    if (!LEGEND_HEADER_RE.test(lines[i].trim())) continue;
    const legendLine1 = lines[i];
    const famMatches = [...legendLine1.matchAll(/[A-Z][A-Z0-9]*(?=\s+MODELS?)/g)];
    if (famMatches.length < 2) continue;
    const bounds = famMatches.map((m, idx) => ({
      start: m.index,
      end: idx + 1 < famMatches.length ? famMatches[idx + 1].index : Infinity,
    }));
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const row = lines[j];
      if (!row.trim()) break;
      let any = false;
      for (const b of bounds) {
        const chunk = row.slice(b.start, b.end).trim();
        const m = chunk.match(/^(\S+)\s+(\S+)$/);
        if (m) { legend.set(m[2].toUpperCase(), m[1].toUpperCase()); any = true; }
      }
      if (!any) break;
    }
  }
  console.log(`Legend entries: ${legend.size}`);

  // ── Pass 3: parse data rows ──
  const partIdx = familyCols[0] ? null : null; // placeholder, computed below per header occurrence
  let cols = null; // { part, name, families: [...familyCols with start/end] }
  let currentCategory = null;
  let currentPage = 1;
  let acc = null;
  const rawRecords = [];

  const CATEGORY_RE = /^[A-Z][A-Z0-9 \/,.…'\-]{2,60}$/;

  function finalize() {
    if (acc && acc.part_number && acc.description.trim()) rawRecords.push({ ...acc, description: acc.description.trim(), category: currentCategory });
    acc = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TABLE_HEADER2_RE.test(line)) {
      finalize();
      const line1 = lines[i - 1] ?? '';
      const partIdxMatch = line1.search(/PART/i);
      const nameIdx = line.search(/NAME|DESCRIPTION/i);
      const famMatches = [...line1.matchAll(/[A-Z][A-Z0-9]*/g)].filter((m) => !['INDEX', 'PART', 'NO'].includes(m[0]));
      if (partIdxMatch >= 0 && nameIdx >= 0 && famMatches.length >= 2) {
        cols = {
          part: partIdxMatch,
          name: nameIdx,
          families: famMatches.map((m, idx) => ({
            name: m[0],
            start: m.index,
            end: idx + 1 < famMatches.length ? famMatches[idx + 1].index : Infinity,
          })),
        };
      }
      continue;
    }
    if (LEGEND_HEADER_RE.test(line.trim())) { finalize(); continue; } // skip legend blocks during data parsing

    const trimmed = line.trim();
    if (!trimmed) { finalize(); continue; }
    if (/^\d+$/.test(trimmed) && trimmed.length <= 4) { currentPage = parseInt(trimmed, 10); finalize(); continue; }
    if (!cols) {
      if (CATEGORY_RE.test(trimmed) && /[A-Z]{4,}/.test(trimmed)) currentCategory = trimmed;
      continue;
    }

    const partSeg = line.slice(cols.part, cols.name).trim();
    const nameSeg = line.slice(cols.name, cols.families[0].start).trim();
    const familyCells = cols.families.map((f) => line.slice(f.start, f.end).trim());
    const anyFamilyCell = familyCells.some(Boolean);

    if (!isPartNumberToken(partSeg) && !anyFamilyCell && CATEGORY_RE.test(trimmed) && /[A-Z]{4,}/.test(trimmed)) {
      finalize();
      currentCategory = trimmed;
      continue;
    }

    if (isPartNumberToken(partSeg)) {
      finalize();
      acc = { part_number: partSeg, description: nameSeg, cells: familyCells, page: currentPage };
    } else if (acc) {
      if (nameSeg) acc.description += ' ' + nameSeg;
      familyCells.forEach((c, idx) => { if (c) acc.cells[idx] = (acc.cells[idx] ? acc.cells[idx] + ' ' : '') + c; });
    }
  }
  finalize();

  // ── Expand ──
  const records = [];
  let unparseableCells = 0;
  for (const r of rawRecords) {
    for (let fi = 0; fi < familyCols.length; fi++) {
      const cellRaw = r.cells[fi];
      if (!cellRaw) continue;
      const parsed = parseCell(cellRaw);
      if (!parsed) { unparseableCells++; continue; }
      for (const code of parsed.codes) {
        const resolved = /^ALL$/i.test(code) ? 'ALL' : legend.get(code.toUpperCase()) ?? code.toUpperCase();
        records.push({
          part_number: r.part_number,
          description: r.description,
          category: r.category,
          used_on_raw: `${familyCols[fi].name}: ${cellRaw}`,
          year_start: parsed.year_start,
          year_end: parsed.year_end,
          vehicle_model: resolved,
          page: r.page,
        });
      }
    }
  }

  console.log(`Parsed ${rawRecords.length} raw rows -> ${records.length} expanded (part, model) rows from ${txtPath}`);
  console.log(`Unparseable cells skipped: ${unparseableCells}`);
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
