/**
 * import_jwboon_fitment.mjs
 * Import JW Boon NOS parts fitment into catalog_fitment_v2
 *
 * Usage: node import_jwboon_fitment.mjs [--dry-run] [--file=path] [--sheet=N]
 */

import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import pg from 'pg';

const { Client } = pg;

// ─── Config ───────────────────────────────────────────────────────────────────

const DB = {
  host: process.env.CATALOG_DB_HOST || '2a01:4ff:f0:fa6f::1',
  port: parseInt(process.env.CATALOG_DB_PORT || '5432'),
  user: process.env.CATALOG_DB_USER || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
  database: 'stinkin_catalog',
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const fileArg = args.find(a => a.startsWith('--file='));
const sheetArg = args.find(a => a.startsWith('--sheet='));
const SHEET_INDEX = sheetArg ? parseInt(sheetArg.replace('--sheet=', '')) : 0;
const XLSX_FILE = fileArg
  ? fileArg.replace('--file=', '')
  : path.resolve(process.cwd(), 'scripts/data/jwboon_parts_final.xlsx');

// ─── Model alias map ──────────────────────────────────────────────────────────

const BOON_MODEL_ALIASES = {
  'K':          ['K'],
  'KK':         ['KK'],
  'KH':         ['KH'],
  'KHK':        ['KHK'],
  'KR':         ['KR'],
  'XL':         ['XL', 'XLH', 'XLCH', 'XLS', 'XLCR', 'XLT'],
  'XLH':        ['XLH'],
  'XLCH':       ['XLCH'],
  'XLS':        ['XLS'],
  'XR1000':     ['XR1000'],
  'XLCR':       ['XLCR'],
  'Big Twins':  '__BIG_TWINS__',
  'Big Twin':   '__BIG_TWINS__',
  'Evo':        '__EVO_BIGTWIN__',
  'Evolution':  '__EVO_BIGTWIN__',
  'W':          ['W'],
  'WL':         ['WL'],
  'WLA':        ['WLA'],
  'WLC':        ['WLC'],
  'WLDR':       ['WLDR'],
  'WLDr':       ['WLDR'],
  'UL':         ['UL'],
  'ULH':        ['ULH'],
  'U':          ['U'],
  'D':          ['D'],
  'DL':         ['DL'],
  'RL':         ['RL'],
  'R':          ['R'],
  'VL':         ['VL'],
  'V':          ['V'],
  'VLD':        ['VLD'],
  'Servi-Car':  ['G', 'GA', 'GD', 'GDT'],
  'Servi-car':  ['G', 'GA', 'GD', 'GDT'],
  'G':          ['G', 'GA', 'GD', 'GDT'],
  'FL':         ['FL', 'FLH', 'FLE', 'FLHF'],
  'FLH':        ['FLH', 'FLHF'],
  'EL':         ['EL'],
  'E':          ['E'],
  'FX':         ['FX', 'FXE', 'FXS', 'FXEF', 'FXWG'],
  'FXE':        ['FXE'],
  'FXS':        ['FXS'],
  'FXWG':       ['FXWG'],
  'FXST':       ['FXST', 'FXSTC'],
  'FLT':        ['FLT', 'FLTC'],
  'FLHT':       ['FLHT', 'FLHTC', 'FLHTCU'],
  'FXR':        ['FXR', 'FXRS', 'FXRT', 'FXRP', 'FXRD'],
};

// ─── Progress ─────────────────────────────────────────────────────────────────

class Progress {
  constructor(total, label = '') {
    this.total = total; this.current = 0;
    this.label = label; this.startTime = Date.now();
  }
  tick(n = 1) {
    this.current += n;
    const pct = Math.round((this.current / this.total) * 100);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    process.stdout.write(`\r${this.label} [${pct}%] ${this.current}/${this.total} (${elapsed}s)`);
    if (this.current >= this.total) process.stdout.write('\n');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeColName(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function parseYears(raw) {
  if (!raw) return [];
  const str = String(raw).trim();
  const years = new Set();
  for (const segment of str.split(',')) {
    const s = segment.trim();
    if (!s) continue;
    const rangeMatch = s.match(/^(\d{4})\s*[-\u2013]\s*(\d{4})$/);
    if (rangeMatch) {
      for (let y = parseInt(rangeMatch[1]); y <= parseInt(rangeMatch[2]); y++) years.add(y);
    } else if (/^\d{4}$/.test(s)) {
      years.add(parseInt(s));
    }
  }
  return [...years].sort();
}

function parseModels(raw) {
  if (!raw) return [];
  return String(raw).split(/[,\/\n]+/).map(s => s.trim()).filter(Boolean);
}

function resolveModelCodes(tokens, bigTwinModelCodes, evoBigTwinCodes) {
  const codes = new Set();
  for (const token of tokens) {
    const mapped = BOON_MODEL_ALIASES[token] || BOON_MODEL_ALIASES[token.toUpperCase()];
    if (!mapped) { codes.add(token.toUpperCase()); continue; }
    if (mapped === '__BIG_TWINS__') { for (const c of bigTwinModelCodes) codes.add(c); }
    else if (mapped === '__EVO_BIGTWIN__') { for (const c of evoBigTwinCodes) codes.add(c); }
    else { for (const c of mapped) codes.add(c); }
  }
  return [...codes];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧 JW Boon Fitment Import — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`   File: ${XLSX_FILE}\n`);

  // 1. Read xlsx
  let workbook;
  try {
    workbook = XLSX.readFile(XLSX_FILE);
  } catch (e) {
    console.error(`❌ Could not read file: ${e.message}`);
    process.exit(1);
  }

  console.log(`📄 All sheets: ${workbook.SheetNames.map((s, i) => `[${i}] "${s}"`).join(', ')}`);
  const sheetName = workbook.SheetNames[SHEET_INDEX];
  console.log(`   Using sheet [${SHEET_INDEX}]: "${sheetName}"\n`);

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log(`📄 ${rawRows.length} rows\n`);

  if (rawRows.length === 0) { console.error('❌ No rows'); process.exit(1); }

  // Show columns
  const actualCols = Object.keys(rawRows[0]);
  console.log('📋 Columns found:');
  actualCols.forEach(c => console.log(`   "${c}"`));
  console.log('');

  // Normalize col names
  const normalizedRows = rawRows.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[normalizeColName(k)] = v;
    return out;
  });

  const colKeys = Object.keys(normalizedRows[0]);
  const findCol = (...candidates) => candidates.find(c => colKeys.includes(c)) || null;

  const COL_OEM    = findCol('oem_number', 'oem_no', 'oem', 'part_number', 'part_no');
  const COL_MODELS = findCol('models', 'model', 'fitment_models');
  const COL_YEARS  = findCol('all_years_fitment_', 'all_years_fitment', 'all_years', 'year_ranges', 'years');
  const COL_DESC   = findCol('description', 'desc', 'part_description');
  const COL_NOTES  = findCol('notes', 'note');

  console.log(`🔗 Column mapping:`);
  console.log(`   OEM Number  → "${COL_OEM}"`);
  console.log(`   Models      → "${COL_MODELS}"`);
  console.log(`   All Years   → "${COL_YEARS}"`);
  console.log(`   Description → "${COL_DESC}"`);
  console.log(`   Notes       → "${COL_NOTES}"\n`);

  if (!COL_OEM || !COL_MODELS || !COL_YEARS) {
    console.error('❌ Could not map required columns.');
    process.exit(1);
  }

  // Scan for rows with actual data
  const withModels = normalizedRows.filter(r => r[COL_MODELS] && String(r[COL_MODELS]).trim());
  const withYears  = normalizedRows.filter(r => r[COL_YEARS]  && String(r[COL_YEARS]).trim());
  console.log(`📊 Rows with Models populated: ${withModels.length}`);
  console.log(`📊 Rows with Years populated:  ${withYears.length}`);
  if (withModels.length > 0) {
    console.log('🔍 First 5 rows WITH models:');
    withModels.slice(0, 5).forEach(r =>
      console.log(`   OEM="${r[COL_OEM]}" Models="${r[COL_MODELS]}" Years="${r[COL_YEARS]}"`));
  }
  console.log('');

  // 2. Connect to DB
  const client = new Client(DB);
  await client.connect();
  console.log('✅ Connected to DB\n');

  // Check actual catalog_oem_crossref columns
  const { rows: crossCols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'catalog_oem_crossref' ORDER BY ordinal_position
  `);
  const crossColNames = crossCols.map(r => r.column_name);
  console.log(`catalog_oem_crossref cols: ${crossColNames.join(', ')}`);

  // Detect which columns to use for the join
  const crossProductCol = crossColNames.find(c =>
    ['product_id', 'cu_id', 'unified_id', 'catalog_id'].includes(c)
  );
  const crossOemCol = crossColNames.find(c =>
    ['oem_part_no', 'oem_number', 'part_no', 'mpn', 'oem_no'].includes(c)
  );
  console.log(`   → join on product col="${crossProductCol}", oem col="${crossOemCol}"\n`);

  // 3. Load reference data
  const { rows: hmyRows } = await client.query(`
    SELECT hmy.id, hmy.year, hm.model_code
    FROM harley_model_years hmy
    JOIN harley_models hm ON hm.id = hmy.model_id
    ORDER BY hm.model_code, hmy.year
  `);
  const hmyLookup = new Map();
  for (const row of hmyRows) hmyLookup.set(`${row.model_code}:${row.year}`, row.id);
  console.log(`📊 harley_model_years loaded: ${hmyRows.length} rows`);

  const { rows: bigTwinRows } = await client.query(`
    SELECT DISTINCT hm.model_code
    FROM harley_models hm
    JOIN harley_families hf ON hf.id = hm.family_id
    WHERE hf.name ILIKE ANY(ARRAY['%Touring%','%Softail%','%Dyna%','%FXR%','%Big Twin%','%Shovelhead%','%Panhead%','%Knucklehead%'])
  `);
  const bigTwinModelCodes = bigTwinRows.map(r => r.model_code);

  const { rows: evoRows } = await client.query(`
    SELECT DISTINCT hm.model_code
    FROM harley_models hm
    JOIN harley_families hf ON hf.id = hm.family_id
    WHERE hf.name ILIKE '%Evo%' OR hf.name ILIKE '%Evolution%'
  `);
  const evoBigTwinCodes = evoRows.map(r => r.model_code);
  console.log(`📊 Big Twin codes: ${bigTwinModelCodes.length}, Evo codes: ${evoBigTwinCodes.length}\n`);

  // 4. Process rows
  const inserts = [];
  const skipped = [];
  const noProductMatch = [];
  const noYearMatch = [];

  const progress = new Progress(normalizedRows.length, 'Processing');

  for (const row of normalizedRows) {
    const oemRaw     = row[COL_OEM]    ? String(row[COL_OEM]).trim()    : null;
    const modelsRaw  = row[COL_MODELS] ? String(row[COL_MODELS]).trim() : null;
    const yearsRaw   = row[COL_YEARS];
    const description = row[COL_DESC]  ? String(row[COL_DESC]).trim()   : null;
    const notes      = COL_NOTES && row[COL_NOTES] ? String(row[COL_NOTES]).trim() : null;

    progress.tick();

    if (!oemRaw)                 { skipped.push({ reason: 'no OEM', row }); continue; }
    if (!modelsRaw && !yearsRaw) { skipped.push({ reason: 'no models or years', row }); continue; }

    // Path 1: catalog_unified.oem_numbers[]
    const { rows: cuRows } = await client.query(
      `SELECT id FROM catalog_unified WHERE $1 = ANY(oem_numbers) LIMIT 20`,
      [oemRaw]
    );

    // Path 2: catalog_oem_crossref
    let crossRows = [];
    if (crossProductCol && crossOemCol) {
      try {
        const res = await client.query(
          `SELECT cu.id FROM catalog_unified cu
           JOIN catalog_oem_crossref coc ON coc."${crossProductCol}" = cu.id
           WHERE coc."${crossOemCol}" = $1 LIMIT 20`,
          [oemRaw]
        );
        crossRows = res.rows;
      } catch (_) { /* column mismatch — skip */ }
    }

    const productIds = [...new Set([...cuRows.map(r => r.id), ...crossRows.map(r => r.id)])];

    if (productIds.length === 0) {
      noProductMatch.push({ oem: oemRaw, models: modelsRaw, years: yearsRaw });
      continue;
    }

    const years = parseYears(yearsRaw);
    if (years.length === 0) { skipped.push({ reason: 'no years parsed', row }); continue; }

    const modelTokens = parseModels(modelsRaw);
    const modelCodes  = resolveModelCodes(modelTokens, bigTwinModelCodes, evoBigTwinCodes);

    let matchedAny = false;
    for (const productId of productIds) {
      for (const code of modelCodes) {
        for (const year of years) {
          const modelYearId = hmyLookup.get(`${code}:${year}`);
          if (!modelYearId) continue;
          matchedAny = true;
          inserts.push({
            product_id: productId,
            model_year_id: modelYearId,
            fitment_source: 'jwboon',
            confidence_score: 1.0,
            parsed_snapshot: JSON.stringify({ oem: oemRaw, models: modelsRaw, years: yearsRaw, description, notes }),
          });
        }
      }
    }

    if (!matchedAny) noYearMatch.push({ oem: oemRaw, models: modelsRaw, years, modelCodes });
  }

  console.log(`\n📊 Results:`);
  console.log(`   Rows processed:         ${normalizedRows.length}`);
  console.log(`   Fitment rows to insert: ${inserts.length}`);
  console.log(`   No product match:       ${noProductMatch.length}`);
  console.log(`   No year/model match:    ${noYearMatch.length}`);
  console.log(`   Skipped:                ${skipped.length}`);
  const skipReasons = skipped.reduce((acc, s) => { acc[s.reason] = (acc[s.reason]||0)+1; return acc; }, {});
  console.log(`   Skip breakdown:         ${JSON.stringify(skipReasons)}`);

  if (noProductMatch.length > 0) {
    console.log(`\n⚠️  Sample no-product-match OEMs (first 10):`);
    noProductMatch.slice(0, 10).forEach(r => console.log(`   "${r.oem}" — Models: "${r.models}"`));
  }
  if (noYearMatch.length > 0) {
    console.log(`\n⚠️  Sample no-year-match rows (first 10):`);
    noYearMatch.slice(0, 10).forEach(r =>
      console.log(`   OEM="${r.oem}" codes=[${r.modelCodes.slice(0, 5).join(',')}] years=[${r.years.slice(0, 5).join(',')}]`));
  }

  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN — nothing written.`);
    await client.end();
    return;
  }

  if (inserts.length === 0) {
    console.log('\n⚠️  Nothing to insert.');
    await client.end();
    return;
  }

  // 5. Insert
  console.log(`\n💾 Inserting ${inserts.length} rows into catalog_fitment_v2...`);
  const insertProgress = new Progress(inserts.length, 'Inserting');
  const BATCH = 500;
  let inserted = 0;

  await client.query('BEGIN');
  try {
    for (let i = 0; i < inserts.length; i += BATCH) {
      const batch = inserts.slice(i, i + BATCH);
      const values = batch.map((_, idx) => {
        const b = idx * 5;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5})`;
      }).join(',');
      const params = batch.flatMap(r => [
        r.product_id, r.model_year_id, r.fitment_source, r.confidence_score, r.parsed_snapshot,
      ]);
      await client.query(`
        INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score, parsed_snapshot)
        VALUES ${values}
        ON CONFLICT DO NOTHING
      `, params);
      inserted += batch.length;
      insertProgress.tick(batch.length);
    }

    // Backfill is_harley_fitment
    const pids = [...new Set(inserts.map(r => r.product_id))];
    console.log(`\n🔄 Backfilling is_harley_fitment on ${pids.length} products...`);
    await client.query(
      `UPDATE catalog_unified SET is_harley_fitment = true WHERE id = ANY($1::uuid[])`,
      [pids]
    );

    await client.query('COMMIT');
    console.log(`✅ Committed. ${inserted} rows inserted.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Insert failed, rolled back: ${err.message}`);
  }

  await client.end();
  console.log('\n✅ Done.\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
