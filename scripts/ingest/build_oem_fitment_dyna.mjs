#!/usr/bin/env node
/**
 * build_oem_fitment.mjs
 *
 * Extracts every part row from all 30 Sportster catalog PDFs (1986–2022),
 * loads them into oem_fitment, then matches against catalog_unified.oem_numbers[].
 *
 * Copy your Sportster PDF folder to:  scripts/data/sportster_catalogs/
 *
 * Usage:
 *   node build_oem_fitment.mjs              # full run
 *   node build_oem_fitment.mjs --dry-run    # extract + print, skip DB
 *   node build_oem_fitment.mjs --year 1997  # single catalog only
 *   node build_oem_fitment.mjs --reset      # drop + recreate tables first
 *   node build_oem_fitment.mjs --match-only # skip extraction, just run match step
 */

import pg       from 'pg';
import fs       from 'fs';
import path     from 'path';
import { fileURLToPath } from 'url';
import { execSync }      from 'child_process';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const DB_CONFIG = {
  host:     '2a01:4ff:f0:fa6f::1',
  port:     5432,
  user:     'catalog_app',
  password: 'smelly',
  database: 'stinkin_catalog',
};

const CATALOG_DIR = '/Users/home/Desktop/Stanky/parts-catalogs/Dyna';

// ── Catalog manifest ──────────────────────────────────────────────────────────
const CATALOGS = [
  {
    "ys": 1991,
    "ye": 1992,
    "file": "1991-92 Dyna Models Parts Catalog.pdf"
  },
  {
    "ys": 1998,
    "ye": 1998,
    "file": "1998 Dyna Models Parts Catalog.pdf"
  },
  {
    "ys": 2009,
    "ye": 2009,
    "file": "Dyna-Models-2009.pdf"
  }
];

// ── Master Sportster model reference ─────────────────────────────────────────
// [model_code, model_name, common_name, displacement_cc, year_start, year_end]
const HD_SPORTSTER_MODELS = [
  ['XLH883',   'XLH 883',                        'Sportster 883',             883,  1986, 2003],
  ['XLH1200',  'XLH 1200',                       'Sportster 1200',           1200,  1988, 2003],
  ['XL883HUG', 'XLH 883 Hugger',                 '883 Hugger',                883,  1987, 2003],
  ['XL883DLX', 'XLH 883 Deluxe',                 '883 Deluxe',                883,  1991, 1995],
  ['XL1200S',  'XL 1200 Sport',                  '1200 Sport',               1200,  1995, 2003],
  ['XL883C',   'XL 883C Custom',                 '883 Custom',                883,  1998, 2009],
  ['XL883R',   'XL 883R Roadster',               '883 Roadster',              883,  2002, 2014],
  ['XL1200C',  'XL 1200C Custom',                '1200 Custom',              1200,  1996, 2020],
  ['XL883',    'XL883',                          'Sportster 883',             883,  2004, 2008],
  ['XL1200R',  'XL 1200R Roadster',              '1200 Roadster',            1200,  2004, 2008],
  ['XL883L',   'XL 883L SuperLow',               '883 Low / SuperLow',        883,  2005, 2022],
  ['XL883N',   'XL 883N Iron 883',               'Iron 883',                  883,  2009, 2022],
  ['XL1200L',  'XL 1200L Low',                   '1200 Low',                 1200,  2006, 2011],
  ['XL1200N',  'XL 1200N Nightster',             'Nightster',                1200,  2007, 2012],
  ['XL1200X',  'XL 1200X Forty-Eight',           'Forty-Eight',              1200,  2010, 2022],
  ['XL1200V',  'XL 1200V Seventy-Two',           'Seventy-Two',              1200,  2012, 2017],
  ['XL1200CP', 'XL 1200CP Custom (factory)',      '1200 Custom (factory)',    1200,  2012, 2022],
  ['XL1200T',  'XL 1200T SuperLow 1200T',        'SuperLow 1200T',           1200,  2014, 2020],
  ['XL1200CA', 'XL 1200CA Custom Limited A',      '1200 Custom Limited A',   1200,  2014, 2016],
  ['XL1200CB', 'XL 1200CB Custom Limited B',      '1200 Custom Limited B',   1200,  2014, 2016],
  ['XL1200CX', 'XL 1200CX Roadster',             'Roadster',                 1200,  2016, 2020],
  ['XL1200NS', 'XL 1200NS Iron 1200',            'Iron 1200',                1200,  2018, 2022],
  ['XL1200XS', 'XL 1200XS Forty-Eight Special',  'Forty-Eight Special',      1200,  2018, 2020],
  ['XR1200',   'XR1200',                         'XR1200',                   1200,  2008, 2012],
  ['XR1200X',  'XR1200X',                        'XR1200X',                  1200,  2010, 2012],
  ['XL50',     'XL50 Anniversary',               '50th Anniversary',         1200,  2007, 2007],
];

// ── DDL ───────────────────────────────────────────────────────────────────────
const DDL = `
CREATE TABLE IF NOT EXISTS hd_sportster_models (
  id               SERIAL PRIMARY KEY,
  model_code       VARCHAR(20) UNIQUE NOT NULL,
  model_name       TEXT NOT NULL,
  common_name      TEXT,
  displacement_cc  SMALLINT,
  year_start       SMALLINT NOT NULL,
  year_end         SMALLINT NOT NULL,
  family           VARCHAR(20) DEFAULT 'Sportster',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oem_fitment (
  id                  BIGSERIAL PRIMARY KEY,

  -- Source catalog
  catalog_year_start  SMALLINT NOT NULL,
  catalog_year_end    SMALLINT NOT NULL,
  catalog_file        TEXT NOT NULL,
  page_number         SMALLINT,
  section             TEXT,

  -- OEM part  (H-D numbers, e.g. 16446-86B)
  oem_part_no         VARCHAR(30) NOT NULL,
  description         TEXT NOT NULL,
  qty_note            TEXT,

  -- Fitment
  models_raw          TEXT,
  model_codes         TEXT[] NOT NULL DEFAULT '{}',
  fits_all_models     BOOLEAN DEFAULT FALSE,

  -- Match results  (filled by step 4)
  matched_product_id  BIGINT,
  matched_sku         TEXT,
  match_method        VARCHAR(30),       -- 'oem_numbers_array' | 'oem_crossref'
  match_confidence    NUMERIC(4,3),

  extracted_at        TIMESTAMPTZ DEFAULT NOW(),
  matched_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oef_part_no   ON oem_fitment (oem_part_no);
CREATE INDEX IF NOT EXISTS idx_oef_models    ON oem_fitment USING GIN (model_codes);
CREATE INDEX IF NOT EXISTS idx_oef_years     ON oem_fitment (catalog_year_start, catalog_year_end);
CREATE INDEX IF NOT EXISTS idx_oef_section   ON oem_fitment (section);
CREATE INDEX IF NOT EXISTS idx_oef_matched   ON oem_fitment (matched_product_id);
CREATE INDEX IF NOT EXISTS idx_oef_fits_all  ON oem_fitment (fits_all_models);

-- Aggregated view: one row per unique OEM part # with full fitment history
CREATE OR REPLACE VIEW v_oem_fitment AS
SELECT
  f.oem_part_no,
  MIN(f.description)                                             AS description,
  MIN(f.section)                                                 AS primary_section,
  MIN(f.catalog_year_start)                                      AS first_catalog_year,
  MAX(f.catalog_year_end)                                        AS last_catalog_year,
  array_agg(DISTINCT m) FILTER (WHERE m IS NOT NULL)            AS all_model_codes,
  bool_or(f.fits_all_models)                                     AS fits_all_models,
  COUNT(DISTINCT f.catalog_year_start)                           AS catalog_appearances,
  MIN(f.matched_product_id)                                      AS matched_product_id,
  MIN(f.matched_sku)                                             AS matched_sku,
  MIN(f.match_method)                                            AS match_method
FROM oem_fitment f,
  LATERAL unnest(f.model_codes) AS m
GROUP BY f.oem_part_no;
`;

// ── Match queries ─────────────────────────────────────────────────────────────
// Primary: oem_part_no = ANY(catalog_unified.oem_numbers)  — direct, 36K SKUs covered
// Fallback: via catalog_oem_crossref bridge
const MATCH_P1 = `
  UPDATE oem_fitment f
  SET
    matched_product_id = cu.id,
    matched_sku        = cu.sku,
    match_method       = 'oem_numbers_array',
    match_confidence   = 1.000,
    matched_at         = NOW()
  FROM catalog_unified cu
  WHERE f.oem_part_no = ANY(cu.oem_numbers)
    AND f.matched_product_id IS NULL
`;

const MATCH_P2 = `
  UPDATE oem_fitment f
  SET
    matched_product_id = cu.id,
    matched_sku        = cu.sku,
    match_method       = 'oem_crossref',
    match_confidence   = 0.950,
    matched_at         = NOW()
  FROM catalog_oem_crossref x
  JOIN catalog_unified cu ON cu.sku = x.sku
  WHERE f.oem_part_no = x.oem_number
    AND f.matched_product_id IS NULL
`;

// ── Python extractor (written to temp file, shelled out per catalog) ──────────
const PYTHON_SRC = String.raw`
import sys, json, re, pdfplumber

PART_ROW_RE   = re.compile(r'^(?:\d+\s+)?([0-9A-Z]{4,8}-[0-9]{2}[A-Z]{0,2})\s+(.+)$')
MODEL_BARE_RE = re.compile(r'^(XL[0-9A-Z]+|XLH[0-9A-Z]*|XR[0-9A-Z]+|ALL)$')
CONT_RE       = re.compile(r'^(XL[0-9A-Z]+|XLH|XR[0-9A-Z]+|ALL)[\s,0-9A-Z]*$')
PART_NO_ANY   = re.compile(r'[0-9]{4,8}-[0-9]{2}')
SECTION_SKIP  = re.compile(r'^(VIEW|INDEX|PART NO|NO\.|TABLE|POSITION|MARKET|ASSEMBLY|VIN )', re.I)
COLUMN_HDR    = re.compile(r'INDEX.*PART|PART.*DESCRIPTION|NO\.\s+NO\.', re.I)
MODEL_ONLY_RE = re.compile(r'^(XL[0-9A-Z]+|XLH[0-9A-Z]*|XR[0-9A-Z]+|ALL)(\s*[,\s]\s*(XL[0-9A-Z]+|XLH|XR[0-9A-Z]+|ALL|\d{4}))*$')
QTY_RE        = re.compile(r'\(\d+\)\s*$|\(\d+ required\)\s*$|\(use [^)]+\)\s*$')

def is_section(line):
    line = line.strip()
    if len(line) < 6 or len(line) > 90: return False
    if PART_NO_ANY.search(line): return False
    if COLUMN_HDR.search(line): return False
    if SECTION_SKIP.match(line): return False
    if MODEL_ONLY_RE.match(line): return False
    alpha = re.sub(r'[^A-Za-z]', '', line)
    if not alpha or len(alpha) < 4: return False
    upper_ratio = sum(1 for c in alpha if c.isupper()) / len(alpha)
    has_struct = any(ch in line for ch in [' ', '-', '&', ',', '('])
    return upper_ratio > 0.85 and has_struct

def parse_codes(raw):
    return [p.strip().rstrip(',') for p in re.split(r'[,\s]+', raw.strip())
            if MODEL_BARE_RE.match(p.strip().rstrip(','))]

def split_desc_models(rest):
    tokens = rest.split()
    model_start = len(tokens)
    i = len(tokens) - 1
    while i >= 0:
        tok = tokens[i].rstrip(',')
        if MODEL_BARE_RE.match(tok):
            model_start = i
            i -= 1
        elif re.match(r'^\d{4}$', tok) and model_start < len(tokens):
            i -= 1   # year qualifier attached to model code
        else:
            break
    desc       = ' '.join(tokens[:model_start]).rstrip(',').strip()
    models_raw = ' '.join(tokens[model_start:]).strip()
    codes      = parse_codes(models_raw)
    qty_note   = None
    qm = QTY_RE.search(desc)
    if qm:
        qty_note = qm.group(0).strip()
        desc = desc[:qm.start()].strip()
    return desc, qty_note, models_raw, codes

args     = json.loads(sys.argv[1])
pdf_path = args['path']
ys       = args['ys']
ye       = args['ye']
filename = args['filename']

try:
    pdf = pdfplumber.open(pdf_path)
except Exception as e:
    print(json.dumps({'error': str(e), 'rows': []}))
    sys.exit(0)

rows     = []
section  = 'UNKNOWN'
last_row = None

for i, page in enumerate(pdf.pages):
    if i < 7: continue
    text = page.extract_text()
    if not text: continue
    for line in text.split('\n'):
        line = line.strip()
        if not line: continue

        if is_section(line):
            section  = line
            last_row = None
            continue

        # Continuation: model list wrapped to next line
        if last_row is not None and CONT_RE.match(line):
            extra = parse_codes(line)
            if extra:
                last_row['model_codes'].extend(extra)
                last_row['models_raw'] += ' ' + line
                if 'ALL' in last_row['model_codes']:
                    last_row['model_codes']     = ['ALL']
                    last_row['fits_all_models'] = True
            continue

        m = PART_ROW_RE.match(line)
        if m:
            if last_row:
                rows.append(last_row)
            desc, qty_note, models_raw, codes = split_desc_models(m.group(2))
            fits_all = 'ALL' in codes
            if fits_all: codes = ['ALL']
            last_row = {
                'catalog_year_start': ys,
                'catalog_year_end':   ye,
                'catalog_file':       filename,
                'page_number':        i + 1,
                'section':            section,
                'oem_part_no':        m.group(1),
                'description':        desc,
                'qty_note':           qty_note,
                'models_raw':         models_raw,
                'model_codes':        codes,
                'fits_all_models':    fits_all,
            }
        else:
            if last_row:
                rows.append(last_row)
                last_row = None

if last_row:
    rows.append(last_row)

print(json.dumps({'rows': rows}))
`;

// ── Progress bar ──────────────────────────────────────────────────────────────
class Progress {
  constructor(total, label) {
    this.total = total; this.n = 0; this.label = label; this.t0 = Date.now();
  }
  tick(msg = '') {
    this.n++;
    const pct  = Math.round(this.n / this.total * 100);
    const fill = Math.floor(pct / 2);
    const bar  = '█'.repeat(fill) + '░'.repeat(50 - fill);
    const secs = ((Date.now() - this.t0) / 1000).toFixed(1);
    process.stdout.write(`\r${this.label} [${bar}] ${pct}% ${this.n}/${this.total}  ${secs}s  ${msg}`.padEnd(120));
  }
  done() { process.stdout.write('\n'); }
}

// ── Bulk insert ───────────────────────────────────────────────────────────────
async function bulkInsert(pool, rows) {
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch  = rows.slice(i, i + BATCH);
    const vals   = [];
    const params = [];
    let   p      = 1;
    for (const r of batch) {
      vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        r.catalog_year_start, r.catalog_year_end, r.catalog_file,
        r.page_number, r.section,
        r.oem_part_no, r.description, r.qty_note,
        r.models_raw, r.model_codes, r.fits_all_models
      );
    }
    await pool.query(`
      INSERT INTO oem_fitment
        (catalog_year_start, catalog_year_end, catalog_file,
         page_number, section,
         oem_part_no, description, qty_note,
         models_raw, model_codes, fits_all_models)
      VALUES ${vals.join(',')}
    `, params);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const argv      = process.argv.slice(2);
  const DRY       = argv.includes('--dry-run');
  const RESET     = argv.includes('--reset');
  const MATCHONLY = argv.includes('--match-only');
  const yearIdx   = argv.findIndex(a => a === '--year');
  const YEAR      = yearIdx >= 0 ? parseInt(argv[yearIdx + 1]) : null;

  console.log('\n🏍️  Dyna OEM Fitment Builder');
  console.log('═════════════════════════════════════════\n');

  const pyPath = path.join(__dirname, '_oem_extractor.py');
  if (!MATCHONLY) fs.writeFileSync(pyPath, PYTHON_SRC);

  const pool = DRY ? null : new Pool(DB_CONFIG);

  // ── 1. Schema ───────────────────────────────────────────────────────────────
  if (!DRY && !MATCHONLY) {
    process.stdout.write('▸ Schema...');
    if (RESET) {
      await pool.query('DROP TABLE IF EXISTS oem_fitment CASCADE');
      await pool.query('DROP TABLE IF EXISTS hd_sportster_models CASCADE');
      process.stdout.write(' (reset)');
    }
    await pool.query(DDL);
    console.log(' ✓');
  }

  // ── 2. Seed hd_sportster_models ────────────────────────────────────────────
  if (!DRY && !MATCHONLY) {
    process.stdout.write('▸ Seeding model reference...');
    for (const [code, name, common, cc, ys, ye] of HD_SPORTSTER_MODELS) {
      await pool.query(`
        INSERT INTO hd_sportster_models
          (model_code, model_name, common_name, displacement_cc, year_start, year_end)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (model_code) DO UPDATE SET
          model_name=EXCLUDED.model_name, common_name=EXCLUDED.common_name,
          displacement_cc=EXCLUDED.displacement_cc,
          year_start=EXCLUDED.year_start, year_end=EXCLUDED.year_end
      `, [code, name, common, cc, ys, ye]);
    }
    console.log(` ✓  (${HD_SPORTSTER_MODELS.length} models)`);
  }

  // ── 3. Extract + load catalogs ──────────────────────────────────────────────
  if (!MATCHONLY) {
    const catalogs = YEAR
      ? CATALOGS.filter(c => c.ys <= YEAR && c.ye >= YEAR)
      : CATALOGS;

    let totalRows = 0;
    const prog = new Progress(catalogs.length, '▸ Catalogs');

    for (const cat of catalogs) {
      const pdfPath = path.join(CATALOG_DIR, cat.file);
      if (!fs.existsSync(pdfPath)) {
        prog.tick(`MISSING: ${cat.file}`);
        continue;
      }

      let result;
      try {
        const argStr = JSON.stringify({ path: pdfPath, ys: cat.ys, ye: cat.ye, filename: cat.file });
        const out = execSync(`python3 ${pyPath} '${argStr.replace(/'/g, "'\\''")}'`, {
          timeout: 180_000,
          maxBuffer: 60 * 1024 * 1024,
        });
        result = JSON.parse(out.toString());
      } catch (e) {
        prog.tick(`ERR: ${cat.file}: ${e.message.slice(0, 50)}`);
        continue;
      }

      const rows = result.rows || [];
      totalRows += rows.length;

      if (!DRY && rows.length > 0) {
        await bulkInsert(pool, rows);
      }

      prog.tick(`${cat.ys}–${cat.ye}: ${rows.length} rows${DRY ? ' (dry)' : ''}`);
    }

    prog.done();
    console.log(`\n  ✓ ${totalRows.toLocaleString()} total rows extracted\n`);

    if (fs.existsSync(pyPath)) fs.unlinkSync(pyPath);
  }

  // ── 4. Match against catalog_unified ───────────────────────────────────────
  if (!DRY) {
    console.log('▸ Matching OEM part numbers → catalog_unified...');

    const r1 = await pool.query(MATCH_P1);
    console.log(`  ✓ Pass 1 (oem_numbers[]):    ${r1.rowCount.toLocaleString()} rows matched`);

    const r2 = await pool.query(MATCH_P2);
    console.log(`  ✓ Pass 2 (oem_crossref):     ${r2.rowCount.toLocaleString()} rows matched`);

    console.log(`  ✓ Total matched: ${(r1.rowCount + r2.rowCount).toLocaleString()}\n`);
  }

  // ── 5. Summary ──────────────────────────────────────────────────────────────
  if (!DRY) {
    const { rows: [s] } = await pool.query(`
      SELECT
        COUNT(*)                                                   AS total,
        COUNT(DISTINCT oem_part_no)                                AS uniq_parts,
        COUNT(DISTINCT catalog_year_start)                         AS catalogs,
        COUNT(*) FILTER (WHERE fits_all_models)                    AS fits_all,
        COUNT(*) FILTER (WHERE NOT fits_all_models
          AND cardinality(model_codes) > 0)                       AS model_specific,
        COUNT(*) FILTER (WHERE cardinality(model_codes) = 0)       AS no_model,
        COUNT(*) FILTER (WHERE matched_product_id IS NOT NULL)     AS matched,
        COUNT(*) FILTER (WHERE match_method = 'oem_numbers_array') AS match_p1,
        COUNT(*) FILTER (WHERE match_method = 'oem_crossref')      AS match_p2,
        COUNT(DISTINCT section)                                     AS sections
      FROM oem_fitment
    `);

    const pct = s.total > 0
      ? (parseInt(s.matched) / parseInt(s.total) * 100).toFixed(1)
      : '0.0';

    console.log(`
┌──────────────────────────────────────────────────┐
│  oem_fitment — complete                          │
├──────────────────────────────────────────────────┤
│  Total rows              ${String(s.total).padStart(10)}              │
│  Unique OEM part #s      ${String(s.uniq_parts).padStart(10)}              │
│  Catalogs loaded         ${String(s.catalogs).padStart(10)}              │
├──────────────────────────────────────────────────┤
│  Fits ALL models         ${String(s.fits_all).padStart(10)}              │
│  Model-specific          ${String(s.model_specific).padStart(10)}              │
│  Hardware / no model     ${String(s.no_model).padStart(10)}              │
│  Unique categories       ${String(s.sections).padStart(10)}              │
├──────────────────────────────────────────────────┤
│  Matched → unified       ${String(s.matched).padStart(10)}  (${pct}%)      │
│    via oem_numbers[]     ${String(s.match_p1).padStart(10)}              │
│    via oem_crossref      ${String(s.match_p2).padStart(10)}              │
└──────────────────────────────────────────────────┘`);

    await pool.end();
  }

  console.log('\n✅  Done.\n');
}

main().catch(e => {
  console.error('\n❌ Fatal:', e.message);
  process.exit(1);
});
