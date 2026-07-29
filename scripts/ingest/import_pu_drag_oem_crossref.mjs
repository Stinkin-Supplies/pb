/**
 * import_pu_drag_oem_crossref.mjs
 *
 * Parses the "OEM to DRAG Specialties Cross Reference Chart" PDF (a Parts
 * Unlimited / DRAG Specialties publication) into pu_drag_oem_crossref_reference.
 * This table is standalone -- see 118_pu_drag_oem_crossref_reference.sql for
 * why it isn't staged directly into catalog_oem_crossref.
 *
 * Page layout is 3 side-by-side column groups, each "OEM # / PART # /
 * FATBOOK PAGE # / OLD BOOK PAGE #", repeating per page (confirmed across
 * all 22 pages of the source PDF). Column boundaries are detected per page
 * from each occurrence of the "OEM #  PART #  PAGE #  PAGE #" header line,
 * since pdftotext -layout spacing can drift slightly page to page.
 *
 * Usage:
 *   pdftotext -layout "pu cross ref.pdf" pu_cross_ref.txt
 *   node import_pu_drag_oem_crossref.mjs pu_cross_ref.txt [--apply]
 */
'use strict';

import fs from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const txtPath = process.argv.find((a) => a.endsWith('.txt'));

if (!txtPath) {
  console.error('Usage: node import_pu_drag_oem_crossref.mjs <chart.txt> [--apply]');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const HEADER_RE = /^OEM #\s+PART #\s+PAGE #\s+PAGE #/;

async function run() {
  const raw = fs.readFileSync(txtPath, 'utf-8').replace(/\f/g, '');
  const lines = raw.split('\n');

  let groupBounds = null;
  const records = [];
  let skippedLines = 0;

  for (const line of lines) {
    if (HEADER_RE.test(line)) {
      const starts = [...line.matchAll(/OEM #/g)].map((m) => m.index);
      groupBounds = starts.map((s, i) => ({ start: s, end: i + 1 < starts.length ? starts[i + 1] : Infinity }));
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed || !groupBounds) continue;
    if (/^FATBOOK/.test(trimmed) || /OLD BOOK/.test(trimmed)) continue;
    if (trimmed.includes('SPC1203018') || /^Pg\.?\s/.test(trimmed)) continue; // page-footer artifact

    let anyParsed = false;
    for (const b of groupBounds) {
      const chunk = line.slice(b.start, b.end).trim();
      if (!chunk) continue;
      const tokens = chunk.split(/\s+/);
      if (tokens.length < 2) continue;
      const [oem, part, fb, ob] = tokens;
      if (part === 'Pg.') continue; // footer artifact caught mid-chunk
      records.push({
        oem_number: oem,
        drag_part_number: part,
        fatbook_page: fb && fb !== '-' ? fb : null,
        oldbook_page: ob && ob !== '-' ? ob : null,
      });
      anyParsed = true;
    }
    if (!anyParsed) skippedLines++;
  }

  console.log(`Parsed ${records.length} (oem, drag_part) rows. Skipped ${skippedLines} unparseable lines.`);
  console.log('Sample:', records.slice(0, 5));

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
      values.push(`($${idx++},$${idx++},$${idx++},$${idx++})`);
      params.push(r.oem_number, r.drag_part_number, r.fatbook_page, r.oldbook_page);
    }
    const res = await client.query(
      `INSERT INTO pu_drag_oem_crossref_reference (oem_number, drag_part_number, fatbook_page, oldbook_page)
       VALUES ${values.join(',')}
       ON CONFLICT (oem_number, drag_part_number) DO NOTHING`,
      params
    );
    inserted += res.rowCount;
  }
  console.log(`Inserted ${inserted} rows into pu_drag_oem_crossref_reference.`);
  client.release();
  await pool.end();
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
