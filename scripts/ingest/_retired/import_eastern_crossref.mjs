/**
 * import_eastern_crossref.mjs
 *
 * Parses the Eastern Motorcycle Parts 2022-2024 catalog PDF and extracts
 * OEM crossref rows into catalog_oem_crossref.
 *
 * Table format per page:
 *   DIAGRAM NUMBER | EASTERN NUMBER | REPLACES OEM | QTY | DESCRIPTION
 *
 * Extracts: eastern_part_no → hd_oem_part_no, with description, year range,
 * and model family parsed from the DESCRIPTION column.
 *
 * Usage:
 *   node scripts/ingest/import_eastern_crossref.mjs [--dry-run]
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const dotenv  = require('dotenv');
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const { Pool } = require('pg');

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const PDF_PATH    = path.resolve('/Users/home/Downloads/eastern catalog.pdf');
const CACHE_PATH  = path.resolve(__dirname, '_eastern_raw.json');
const DRY_RUN     = process.argv.includes('--dry-run');

// ── Python extraction ─────────────────────────────────────────────────────────

const PYTHON_SCRIPT = `
import sys, json, re, collections
import pdfplumber

PDF = sys.argv[1]
rows = []
current_section = ''

YEAR_RE = re.compile(
    r'(?:(?:L/|E/)?(\\d{4}))[-\\u2013](?:(?:L/|E/)?(\\d{4})|PRESENT|PRES\\.?)',
    re.IGNORECASE
)
YEAR_SINGLE_RE = re.compile(r'\\b(1[89]\\d{2}|20[012]\\d)\\b')

def parse_years(text):
    m = YEAR_RE.search(text)
    if m:
        y_start = int(m.group(1))
        y_end   = int(m.group(2)) if m.group(2) else 2024
        return y_start, y_end
    m2 = YEAR_SINGLE_RE.search(text)
    if m2:
        y = int(m2.group(1))
        return y, y
    return None, None

def detect_family(text):
    t = text.upper()
    if 'SPORTSTER' in t: return 'XL'
    if 'FORTY-FIVE' in t: return 'WL'
    if 'XR-750' in t: return 'XR'
    if any(w in t for w in ('BIG TWIN','SHOVELHEAD','EVOLUTION','TWIN CAM')): return 'FL'
    return None

# Eastern part numbers look like: A-18105-79, E-371, L-3-657, M-4-4650, W-14-189, 29-0620
EASTERN_RE = re.compile(r'^[A-Z0-9]+[\\-]\\d')
# OEM numbers: pure digits or digits-with-letter-suffix like 18105-79A, 7130W
OEM_RE = re.compile(r'^[0-9][0-9A-Za-z\\-]{2,}$')
# Quantities to filter out from OEM column
QTY_RE  = re.compile(r'^(pk|set|ea|each)[-\\d]', re.IGNORECASE)

with pdfplumber.open(PDF) as pdf:
    for page_num, page in enumerate(pdf.pages, start=1):
        text = page.extract_text() or ''

        # Update section context from page header lines (lines 1-5)
        for line in text.split('\\n')[:8]:
            line = line.strip().replace('*','').strip()
            if YEAR_RE.search(line) or any(w in line.upper() for w in
               ('BIG TWIN','SPORTSTER','FORTY-FIVE','SHOVELHEAD','EVOLUTION','TWIN CAM','XR-750')):
                current_section = line

        # Get all words with bounding boxes
        words = page.extract_words(x_tolerance=3, y_tolerance=3, keep_blank_chars=False)
        if not words:
            continue

        # Cluster words into lines by y-midpoint (within 4pt = same line)
        lines_map = collections.defaultdict(list)
        for w in words:
            y_key = round(w['top'] / 4) * 4
            lines_map[y_key].append(w)

        # Sort lines top-to-bottom, words left-to-right within each line
        sorted_lines = sorted(lines_map.items())

        # Find the header line to determine column x-boundaries
        # Look for a line containing 'EASTERN' and 'REPLACES' or 'OEM'
        col_eastern_x = None
        col_oem_x     = None
        col_desc_x    = None

        for y_key, line_words in sorted_lines:
            texts = [w['text'].upper() for w in line_words]
            joined = ' '.join(texts)
            if 'EASTERN' in joined and ('REPLACES' in joined or 'OEM' in joined):
                # Map column start x positions
                for w in line_words:
                    t = w['text'].upper()
                    if t in ('EASTERN', 'NUMBER') and col_eastern_x is None:
                        if t == 'EASTERN': col_eastern_x = w['x0']
                    if t in ('REPLACES', 'OEM') and col_oem_x is None:
                        col_oem_x = w['x0']
                    if t == 'DESCRIPTION' and col_desc_x is None:
                        col_desc_x = w['x0']
                break

        if col_eastern_x is None or col_oem_x is None:
            continue

        # Default desc_x if not found
        if col_desc_x is None:
            col_desc_x = col_oem_x + 80

        # Process data rows after the header
        header_found = False
        for y_key, line_words in sorted_lines:
            texts_upper = [w['text'].upper() for w in line_words]
            joined = ' '.join(texts_upper)

            if not header_found:
                if 'EASTERN' in joined and ('REPLACES' in joined or 'OEM' in joined):
                    header_found = True
                continue

            # Bin words by column using detected x positions
            eastern_words, oem_words, desc_words = [], [], []
            for w in sorted(line_words, key=lambda x: x['x0']):
                if w['x0'] < col_oem_x - 5:
                    eastern_words.append(w['text'])
                elif w['x0'] < col_desc_x - 5:
                    oem_words.append(w['text'])
                else:
                    desc_words.append(w['text'])

            eastern = ' '.join(eastern_words).strip()
            oem_raw = ' '.join(oem_words).strip()
            desc    = ' '.join(desc_words).strip()

            # Strip leading diagram/row number (bare integer) from eastern column
            tokens = eastern.split()
            if tokens and re.match(r'^\\d+$', tokens[0]):
                eastern = ' '.join(tokens[1:]).strip()

            # Take first token from oem_words that looks like an OEM part number
            # (skip qty tokens like pk-10, set-6, each)
            oem = ''
            for tok in oem_raw.split():
                if QTY_RE.match(tok):
                    continue
                if OEM_RE.match(tok):
                    oem = tok
                    break

            # Filter: eastern must look like an Eastern part number
            if not eastern or not EASTERN_RE.match(eastern):
                continue
            # Filter: oem must look like an OEM number
            if not oem or not OEM_RE.match(oem):
                continue

            context = desc + ' ' + current_section
            y_start, y_end = parse_years(context)
            family = detect_family(context)

            rows.append({
                'eastern_no': eastern,
                'oem_no':     oem,
                'description': desc,
                'section':    current_section,
                'year_start': y_start,
                'year_end':   y_end,
                'family':     family,
                'page':       page_num,
            })

print(json.dumps(rows))
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeOem(raw) {
  return raw.replace(/\s+/g, '').toUpperCase().trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let rows;

  if (existsSync(CACHE_PATH)) {
    console.log('📄  Using cached extraction:', CACHE_PATH);
    rows = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
  } else {
    console.log('🐍  Extracting with pdfplumber…');
    const tmpScript = '/tmp/eastern_extract.py';
    writeFileSync(tmpScript, PYTHON_SCRIPT);
    const json = execSync(`python3 ${tmpScript} "${PDF_PATH}"`, { maxBuffer: 50 * 1024 * 1024 }).toString();
    rows = JSON.parse(json);
    writeFileSync(CACHE_PATH, JSON.stringify(rows, null, 2));
    console.log(`    Extracted ${rows.length} raw rows, cached to ${CACHE_PATH}`);
  }

  // Deduplicate: keyed by (eastern_no, oem_no)
  const seen = new Map();
  for (const r of rows) {
    const key = `${r.eastern_no}|${normalizeOem(r.oem_no)}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  const deduped = [...seen.values()];
  console.log(`\n📊  Rows after dedup: ${deduped.length} (from ${rows.length} raw)`);

  // Stats
  const withOem    = deduped.filter(r => r.oem_no).length;
  const withYears  = deduped.filter(r => r.year_start).length;
  console.log(`    With OEM#: ${withOem}  |  With years: ${withYears}`);

  if (DRY_RUN) {
    console.log('\n⚡  DRY RUN — sample rows:');
    deduped.slice(0, 20).forEach(r =>
      console.log(`  [p${r.page}] ${r.eastern_no} → OEM ${r.oem_no}  (${r.year_start ?? '?'}–${r.year_end ?? '?'})  ${r.description?.slice(0, 60)}`)
    );
    return;
  }

  // ── DB upsert ───────────────────────────────────────────────────────────────
  const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('\n💾  Upserting into catalog_oem_crossref…');
    await client.query('BEGIN');

    await client.query(`
      CREATE TEMP TABLE tmp_eastern (
        eastern_no   TEXT,
        oem_no       TEXT,
        description  TEXT,
        year_start   INT,
        year_end     INT,
        family       TEXT
      ) ON COMMIT DROP
    `);

    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < deduped.length; i += BATCH) {
      const slice = deduped.slice(i, i + BATCH);
      const placeholders = slice.map((_, j) =>
        `($${j*6+1}, $${j*6+2}, $${j*6+3}, $${j*6+4}, $${j*6+5}, $${j*6+6})`
      ).join(', ');
      const values = slice.flatMap(r => [
        r.eastern_no,
        normalizeOem(r.oem_no),
        r.description || null,
        r.year_start || null,
        r.year_end   || null,
        r.family     || null,
      ]);
      await client.query(`INSERT INTO tmp_eastern VALUES ${placeholders}`, values);
      inserted += slice.length;
    }
    console.log(`    Loaded ${inserted} rows into temp table`);

    // Upsert into catalog_oem_crossref
    // Schema: sku (eastern#), oem_number (HD OEM#), oem_manufacturer, source_file, source, page_reference
    const { rowCount } = await client.query(`
      INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, source_file, source, page_reference)
      SELECT
        t.eastern_no,
        t.oem_no,
        'EASTERN',
        'eastern_2022_catalog',
        'eastern',
        TRIM(COALESCE(t.description, '') ||
          CASE WHEN t.year_start IS NOT NULL
               THEN ' [' || t.year_start || '-' || COALESCE(t.year_end::TEXT, 'present') || ']'
               ELSE '' END ||
          CASE WHEN t.family IS NOT NULL THEN ' [' || t.family || ']' ELSE '' END)
      FROM tmp_eastern t
      ON CONFLICT (sku, oem_number, oem_manufacturer) DO UPDATE
        SET source_file    = EXCLUDED.source_file,
            page_reference = EXCLUDED.page_reference
    `);

    await client.query('COMMIT');
    console.log(`\n✅  Upserted ${rowCount} rows into catalog_oem_crossref (vendor='eastern')`);

    // Summary
    const { rows: summary } = await client.query(`
      SELECT COUNT(*) AS total, COUNT(DISTINCT oem_number) AS unique_oem
      FROM catalog_oem_crossref WHERE oem_manufacturer = 'EASTERN'
    `);
    console.log(`    eastern total: ${summary[0].total} rows, ${summary[0].unique_oem} unique OEM#s`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
