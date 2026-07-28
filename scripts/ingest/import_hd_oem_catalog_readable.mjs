/**
 * import_hd_oem_catalog_readable.mjs
 *
 * Third parser for hd_oem_catalog_reference, covering the older
 * factory-typeset "USED ON" format found in a handful of 1980s original
 * catalogs (1984-86 FXR, 1984-86 FX-FXST, 1986-90 XLH -- confirmed the ONLY
 * 3 of 121 candidate files that produced zero rows under
 * import_hd_oem_catalog_modelcol.mjs). Distinct from both other parsers:
 *
 *   RETAIL   INDEX   PART
 *   PRICE     NO.     NO.        NAME                          USED ON
 *
 *              1     4721        BOLT (2) ....................  84 to * - All Models
 *              5     6701        WASHER (2) ...................  84 to * - FXRS, FXRT; 86 to * - FXR
 *             10     16478-83    SCREW (4) ....................  84 & Early 85 - FXRS, FXRT
 *                    16478-85A   SCREW, internal thread (4) ....  Late 85 to * - All Models
 *
 * Unlike the MODEL(S)-column format, fitment here is prose: one or more
 * semicolon-separated "<year-expr> - <model list>" clauses per row, where
 * year-expr is "NN to *" (open-ended, still current as of the catalog's
 * print date), "NN & [Early/Late ]NN2" (a bounded range), "Late NN to *", or
 * a bare "NN". These are 1980s Adobe-typeset PDFs with known font/glyph
 * quirks (the '*' marker sometimes extracts as '•' or other stray glyphs,
 * occasional OCR-like character substitution e.g. 'FJCRS' for 'FXRS') --
 * clauses that don't match a recognized shape are skipped rather than
 * guessed at; this format's coverage is inherently imperfect but still a
 * large improvement over zero.
 *
 * Row detection: character-column slicing using the header's *second* line
 * (the one with two 'NO.' occurrences + 'NAME' + 'USED ON' -- the 'RETAIL/
 * INDEX/PART' line above it is uninteresting metadata, and the PRICE column
 * is always blank per this catalog's own note that "prices are published
 * separately").
 *
 * Usage:
 *   pdftotext -layout catalog.pdf catalog.txt
 *   node import_hd_oem_catalog_readable.mjs <catalog.txt> "<source doc id>" "<source doc title>" <catalog_year_end> [--apply]
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
  console.error('Usage: node import_hd_oem_catalog_readable.mjs <catalog.txt> "<source doc id>" "<source doc title>" <catalog_year_end> [--apply]');
  process.exit(1);
}
const CATALOG_YEAR_END = parseInt(yearEndArg, 10);

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// 5-column (RETAIL/INDEX/PART/NAME/USED ON) or simpler 3-column (PART/NAME/
// USED ON) catalogs -- some smaller/older books skip the price+index columns.
const HEADER_LINE_RE = /NO\.\s+(?:NO\.\s+)?NAME\s+USED\s*ON/i;
// The "NO." sub-label on the header's 2nd line sits shifted right of the
// true column edge (likely center/right-justified under the wider label
// above it); the line-1 label 'PART' aligns exactly with where data
// actually starts. Confirmed: 'PART'.indexOf on "RETAIL INDEX PART"
// == '4721'.indexOf on a real data row, both at char 17. Also matches a
// bare "PART" line-1 (no RETAIL/INDEX) for the simpler 3-column books.
const HEADER_LINE1_RE = /(?:RETAIL\s+INDEX\s+)?\bPART\b/i;
const CATEGORY_RE = /^[A-Z][A-Z0-9 \/,.…'\-]{2,50}$/;
const BLOCKED_SECTIONS = new Set([
  "READER'S COMMENTS", 'PLEASE ADD ANY OTHER COMMENTS HERE', 'GENERAL INFORMATION', 'NOTES',
]);

function isPartNumberToken(t) {
  return t.length >= 3 && /^[A-Za-z0-9][A-Za-z0-9\-]*$/.test(t) && /\d/.test(t);
}

function twoDigitYear(yy) {
  const n = parseInt(yy, 10);
  return n >= 30 ? 1900 + n : 2000 + n;
}

function parseUsedOnClause(clause) {
  const c = clause.trim();
  const dashIdx = c.search(/\s[-–]\s/);
  if (dashIdx === -1) return null;
  const yearExpr = c.slice(0, dashIdx).trim();
  const modelListRaw = c.slice(dashIdx).replace(/^\s*[-–]\s*/, '').trim();
  if (!modelListRaw) return null;

  let year_start = null;
  let year_end = null;
  let m;
  if ((m = yearExpr.match(/^(?:Late\s+|Early\s+)?(\d{2})\s*(?:(?:to|&)\s*(?:Late\s+|Early\s+)?(?:[*•]|(\d{2})))?$/i))) {
    year_start = twoDigitYear(m[1]);
    year_end = m[2] ? twoDigitYear(m[2]) : CATALOG_YEAR_END;
  } else {
    return null; // unrecognized year expression (typo/OCR-ish artifact) -- skip rather than guess
  }

  const models = modelListRaw.split(',').map((s) => s.trim()).filter(Boolean);
  return { year_start, year_end, models };
}

async function run() {
  // OCR'd catalogs (Tesseract) consistently render the hyphen before
  // "USED ON" model lists as an em-dash rather than a plain hyphen.
  const raw = fs.readFileSync(txtPath, 'utf-8').replace(/\f/g, '').replace(/—/g, '-');
  const lines = raw.split('\n');

  let cols = null; // { part, name, usedOn }
  let currentCategory = null;
  let currentPage = 1;
  let acc = null;
  const rawRecords = [];

  function finalize() {
    if (acc && acc.part_number && acc.description.trim()) {
      rawRecords.push({ ...acc, description: acc.description.trim(), used_on_raw: acc.used_on_raw.trim(), category: currentCategory });
    }
    acc = null;
  }

  let pendingPartIdx = null;
  for (const line of lines) {
    if (HEADER_LINE1_RE.test(line)) {
      pendingPartIdx = line.search(/PART/i);
      continue;
    }
    if (HEADER_LINE_RE.test(line)) {
      finalize();
      const noMatches = [...line.matchAll(/NO\./gi)];
      const nameIdx = line.search(/NAME/i);
      const usedOnIdx = line.search(/USED\s*ON/i);
      const partIdx = pendingPartIdx ?? (noMatches.length >= 2 ? noMatches[1].index : null);
      if (partIdx !== null) {
        cols = { part: partIdx, name: nameIdx, usedOn: usedOnIdx };
      }
      pendingPartIdx = null;
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) { finalize(); continue; }
    if (/^\d+$/.test(trimmed) && trimmed.length <= 4) { currentPage = parseInt(trimmed, 10); finalize(); continue; }

    if (!cols) {
      if (CATEGORY_RE.test(trimmed) && !BLOCKED_SECTIONS.has(trimmed)) currentCategory = trimmed;
      continue;
    }

    const partSeg = line.slice(cols.part, cols.name).trim();
    const nameSeg = line.slice(cols.name, cols.usedOn).replace(/[.\s]{2,}/g, ' ').replace(/\s*\.\s*$/, '').trim();
    const usedOnSeg = line.slice(cols.usedOn).trim();

    if (!isPartNumberToken(partSeg) && !usedOnSeg && CATEGORY_RE.test(trimmed) && /[A-Z]{4,}/.test(trimmed)) {
      finalize();
      currentCategory = BLOCKED_SECTIONS.has(trimmed) ? currentCategory : trimmed;
      continue;
    }

    if (isPartNumberToken(partSeg)) {
      finalize();
      acc = { part_number: partSeg, description: nameSeg, used_on_raw: usedOnSeg, page: currentPage };
    } else if (acc) {
      if (nameSeg) acc.description += ' ' + nameSeg;
      if (usedOnSeg) acc.used_on_raw += ' ' + usedOnSeg;
    }
  }
  finalize();

  const records = [];
  let unparseableClauses = 0;
  for (const r of rawRecords) {
    const clauses = r.used_on_raw.split(/[;:]/).map((s) => s.trim()).filter(Boolean);
    for (const clause of clauses) {
      const parsed = parseUsedOnClause(clause);
      if (!parsed) { unparseableClauses++; continue; }
      for (const modelRaw of parsed.models) {
        const code = /^all\s*models?$/i.test(modelRaw) ? 'ALL' : modelRaw.toUpperCase().replace(/[^\w-]/g, '');
        if (!code) continue;
        records.push({
          part_number: r.part_number,
          description: r.description,
          category: r.category,
          used_on_raw: r.used_on_raw,
          year_start: parsed.year_start,
          year_end: parsed.year_end,
          vehicle_model: code,
          page: r.page,
        });
      }
    }
  }

  console.log(`Parsed ${rawRecords.length} raw rows -> ${records.length} expanded (part, model) rows from ${txtPath}`);
  console.log(`Unparseable used-on clauses skipped: ${unparseableClauses}`);
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
