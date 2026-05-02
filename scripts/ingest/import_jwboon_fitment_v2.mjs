/**
 * import_jwboon_fitment.mjs  (v2 — batched)
 * Import JW Boon NOS parts fitment into catalog_fitment_v2
 *
 * Usage: node import_jwboon_fitment.mjs [--dry-run] [--file=path] [--sheet=N]
 *
 * v2 changes vs v1:
 *   - Batch OEM lookups (one query per 500 OEMs, not 74k individual queries)
 *   - Fixed crossref join: coc.sku → catalog_unified.vendor_item_id
 *   - Added missing aliases: Sportster, All H-D, All Twins, etc.
 *   - ~100x faster
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
// JW Boon shorthand → canonical harley_models.model_code values
// __BIG_TWINS__ and __EVO_BIGTWIN__ are expanded dynamically from DB

const BOON_MODEL_ALIASES = {
  // ── Catch-alls ──────────────────────────────────────────────────────────────
  'Sportster':          ['KH', 'XL', 'XLH', 'XLCH', 'XLS', 'XLCR', 'XLT', 'XR1000'],
  'All Sportsters':     ['KH', 'XL', 'XLH', 'XLCH', 'XLS', 'XLCR', 'XLT', 'XR1000'],
  'Big Twins':          '__BIG_TWINS__',
  'Big Twin':           '__BIG_TWINS__',
  'All Big Twins':      '__BIG_TWINS__',
  'All Twins':          '__BIG_TWINS__',
  'Evo':                '__EVO_BIGTWIN__',
  'Evolution':          '__EVO_BIGTWIN__',
  'Evo Big Twin':       '__EVO_BIGTWIN__',
  'All H-D':            '__ALL__',
  'All Models':         '__ALL__',
  'All Harley':         '__ALL__',
  'All':                '__ALL__',

  // ── K-series ────────────────────────────────────────────────────────────────
  'K':                  ['K'],
  'KK':                 ['KK'],
  'KH':                 ['KH'],
  'KHK':                ['KHK'],
  'KR':                 ['KR'],

  // ── Ironhead Sportster ───────────────────────────────────────────────────────
  'XL':                 ['XL', 'XLH', 'XLCH', 'XLS', 'XLCR', 'XLT'],
  'XLH':                ['XLH'],
  'XLCH':               ['XLCH'],
  'XLS':                ['XLS'],
  'XR1000':             ['XR1000'],
  'XLCR':               ['XLCR'],
  'XLT':                ['XLT'],

  // ── Flathead / military ──────────────────────────────────────────────────────
  'W':                  ['W'],
  'WL':                 ['WL'],
  'WLA':                ['WLA'],
  'WLC':                ['WLC'],
  'WLDR':               ['WLDR'],
  'WLDr':               ['WLDR'],
  'UL':                 ['UL'],
  'ULH':                ['ULH'],
  'U':                  ['U'],
  'D':                  ['D'],
  'DL':                 ['DL'],
  'RL':                 ['RL'],
  'R':                  ['R'],
  'VL':                 ['VL'],
  'V':                  ['V'],
  'VLD':                ['VLD'],

  // ── Servi-Car ────────────────────────────────────────────────────────────────
  'Servi-Car':          ['G', 'GA', 'GD', 'GDT'],
  'Servi-car':          ['G', 'GA', 'GD', 'GDT'],
  'G':                  ['G', 'GA', 'GD', 'GDT'],

  // ── Knucklehead ──────────────────────────────────────────────────────────────
  'EL':                 ['EL'],
  'E':                  ['E'],

  // ── Panhead / Shovelhead Touring ─────────────────────────────────────────────
  'FL':                 ['FL', 'FLH', 'FLE', 'FLHF'],
  'FLH':                ['FLH', 'FLHF'],

  // ── FX Shovelhead ────────────────────────────────────────────────────────────
  'FX':                 ['FX', 'FXE', 'FXS', 'FXEF', 'FXWG'],
  'FXE':                ['FXE'],
  'FXS':                ['FXS'],
  'FXWG':               ['FXWG'],
  'FXST':               ['FXST', 'FXSTC'],

  // ── FXR ─────────────────────────────────────────────────────────────────────
  'FXR':                ['FXR', 'FXRS', 'FXRT', 'FXRP', 'FXRD'],

  // ── Touring ──────────────────────────────────────────────────────────────────
  'FLT':                ['FLT', 'FLTC'],
  'FLHT':               ['FLHT', 'FLHTC', 'FLHTCU'],
  'Touring':            '__FAMILY_Touring__',
  'Electra Glide':      '__FAMILY_Touring__',
  'Road King':          '__FAMILY_Touring__',
  'Road Glide':         '__FAMILY_Touring__',

  // ── Softail ────────────────────────────────────────────────────────────────
  'Softail':            '__FAMILY_Softail Evo__',
  'FLST':               ['FLST', 'FLSTC', 'FLSTF', 'FLSTFB'],
  'FLSTC':              ['FLSTC'],
  'FLSTF':              ['FLSTF'],

  // ── Dyna ──────────────────────────────────────────────────────────────────
  'Dyna':               '__FAMILY_Dyna__',
  'FXD':                ['FXD', 'FXDB', 'FXDC', 'FXDL', 'FXDWG'],
  'FXDWG':              ['FXDWG'],
  'FXDB':               ['FXDB'],

  // ── FXR extras ────────────────────────────────────────────────────────────
  'FXRT':               ['FXRT'],
  'FXRS':               ['FXRS'],
  'FXSB':               ['FXSB'],
  'FLHR':               ['FLHR', 'FLHRC', 'FLHRS'],

  // ── Family placeholders ────────────────────────────────────────────────────
  'Knucklehead':        ['knucklehead'],
  'Panhead':            ['panhead'],
  'Shovelhead':         ['shovelhead'],
  'Ironhead':           ['XL', 'XLH', 'XLCH', 'XLS', 'XLCR'],
  'Flathead':           ['G', 'U', 'UH', 'UL', 'ULH', 'V', 'VC', 'VD'],
  'Twin Cam':           ['twin_cam'],

  // ── XR racing ─────────────────────────────────────────────────────────────
  'XR':                 ['XR750', 'XR1000'],
  'XR750':              ['XR750'],

  // ── Buell (not H-D, skip) ─────────────────────────────────────────────────
  'Buell':              [],

  // ── Remaining stragglers ───────────────────────────────────────────────────
  'V-rod':              ['revolution'],
  'V-Rod':              ['revolution'],
  'FLHS':               ['FLHS'],
  'FXSTS':              ['FXSTS'],
  'FXSTC':              ['FXSTC'],
  'FXB':                ['FXB'],
  'XL883':              ['XL883', 'XLH883', 'XL883C', 'XL883N', 'XL883L', 'XL883R'],
  'XLX':                ['XLX'],
  'XG750':              ['XG750'],
  'XG500':              ['XG500'],
  'XG750A':             ['XG750A'],
  'FLTR':               ['FLTR', 'FLTRU', 'FLTRX', 'FLTRXS'],
  'FLTC':               ['FLTC'],
  'FXEF':               ['FXEF'],
  'FLSTS':              ['FLSTS'],
  'FLHTC':              ['FLHTC', 'FLHTCU', 'FLHTCUI'],
  'FXDL':               ['FXDL', 'FXDLS'],
  'FLSTN':              ['FLSTN', 'FLSTNI'],
  'JD':                 ['20JD'],
  'FLHX':               ['FLHX', 'FLHXS', 'FLHXSE'],
  'Topper':             [],
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

function resolveModelCodes(tokens, bigTwinModelCodes, evoBigTwinCodes, allModelCodes, familyCodeMap) {
  const codes = new Set();
  for (const token of tokens) {
    const mapped = BOON_MODEL_ALIASES[token] || BOON_MODEL_ALIASES[token.trim()];
    if (!mapped) {
      codes.add(token.toUpperCase().trim());
      continue;
    }
    if (mapped === '__BIG_TWINS__') { for (const c of bigTwinModelCodes) codes.add(c); }
    else if (mapped === '__EVO_BIGTWIN__') { for (const c of evoBigTwinCodes) codes.add(c); }
    else if (mapped === '__ALL__') { for (const c of allModelCodes) codes.add(c); }
    else if (typeof mapped === 'string' && mapped.startsWith('__FAMILY_')) {
      const familyName = mapped.slice(9, -2); // strip __FAMILY_ and __
      const familyCodes = (familyCodeMap && familyCodeMap.get(familyName)) || [];
      for (const c of familyCodes) codes.add(c);
    }
    else if (Array.isArray(mapped)) { for (const c of mapped) codes.add(c); }
  }
  return [...codes];
}

// ─── Batch OEM lookup ────────────────────────────────────────────────────────
// Returns Map<oemNumber, productId[]>

async function batchLookupOems(client, oemNumbers) {
  const result = new Map();
  const unique = [...new Set(oemNumbers.filter(Boolean))];
  if (unique.length === 0) return result;

  const BATCH = 500;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);

    // Path 1: oem_numbers[] array column
    const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(',');
    const { rows: cuRows } = await client.query(`
      SELECT id, unnest(oem_numbers) AS oem_num
      FROM catalog_unified
      WHERE oem_numbers && ARRAY[${placeholders}]::text[]
    `, batch);

    for (const row of cuRows) {
      if (batch.includes(row.oem_num)) {
        if (!result.has(row.oem_num)) result.set(row.oem_num, []);
        result.get(row.oem_num).push(row.id);
      }
    }

    // Path 2: catalog_oem_crossref.oem_number → sku → catalog_unified
    // catalog_oem_crossref has: sku, oem_number (no product_id)
    // Join via sku to catalog_unified — try vendor_item_id first
    try {
      const { rows: crossRows } = await client.query(`
        SELECT cu.id, coc.oem_number
        FROM catalog_oem_crossref coc
        JOIN catalog_unified cu ON cu.vendor_item_id = coc.sku
        WHERE coc.oem_number = ANY(ARRAY[${placeholders}]::text[])
      `, batch);
      for (const row of crossRows) {
        if (!result.has(row.oem_number)) result.set(row.oem_number, []);
        const existing = result.get(row.oem_number);
        if (!existing.includes(row.id)) existing.push(row.id);
      }
    } catch (_) { /* sku join failed — skip crossref path */ }
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧 JW Boon Fitment Import v2 — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
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
  console.log(`   Using: "${sheetName}"\n`);

  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
  console.log(`📄 ${rawRows.length} rows\n`);
  if (rawRows.length === 0) { console.error('❌ No rows'); process.exit(1); }

  // Normalize col names
  const normalizedRows = rawRows.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[normalizeColName(k)] = v;
    return out;
  });

  const colKeys = Object.keys(normalizedRows[0]);
  const findCol = (...c) => c.find(x => colKeys.includes(x)) || null;

  const COL_OEM    = findCol('oem_number', 'oem_no', 'oem', 'part_number', 'part_no');
  const COL_MODELS = findCol('models', 'model', 'fitment_models');
  const COL_YEARS  = findCol('all_years_fitment_', 'all_years_fitment', 'all_years', 'year_ranges', 'years');
  const COL_DESC   = findCol('description', 'desc', 'part_description');
  const COL_NOTES  = findCol('notes', 'note');

  console.log(`🔗 Columns: OEM="${COL_OEM}" Models="${COL_MODELS}" Years="${COL_YEARS}"\n`);
  if (!COL_OEM || !COL_MODELS || !COL_YEARS) {
    console.error('❌ Could not map required columns.'); process.exit(1);
  }

  // Scan
  const withModels = normalizedRows.filter(r => r[COL_MODELS] && String(r[COL_MODELS]).trim());
  const withYears  = normalizedRows.filter(r => r[COL_YEARS]  && String(r[COL_YEARS]).trim());
  console.log(`📊 Rows with Models: ${withModels.length} / with Years: ${withYears.length}`);
  // Rows that have BOTH models AND years are the actionable ones
  const actionable = normalizedRows.filter(r =>
    r[COL_OEM] && String(r[COL_OEM]).trim() &&
    r[COL_MODELS] && String(r[COL_MODELS]).trim() &&
    r[COL_YEARS] && String(r[COL_YEARS]).trim()
  );
  console.log(`📊 Actionable rows (OEM + Models + Years): ${actionable.length}\n`);
  if (actionable.length > 0) {
    console.log('🔍 First 5 actionable rows:');
    actionable.slice(0, 5).forEach(r =>
      console.log(`   OEM="${r[COL_OEM]}" Models="${r[COL_MODELS]}" Years="${r[COL_YEARS]}"`));
    console.log('');
  }

  // 2. Connect to DB
  const client = new Client(DB);
  await client.connect();
  console.log('✅ Connected to DB\n');

  // 3. Load reference data
  const { rows: hmyRows } = await client.query(`
    SELECT hmy.id, hmy.year, hm.model_code
    FROM harley_model_years hmy
    JOIN harley_models hm ON hm.id = hmy.model_id
    ORDER BY hm.model_code, hmy.year
  `);
  const hmyLookup = new Map();
  for (const row of hmyRows) hmyLookup.set(`${row.model_code}:${row.year}`, row.id);
  console.log(`📊 harley_model_years: ${hmyRows.length} rows`);

  const { rows: bigTwinRows } = await client.query(`
    SELECT DISTINCT hm.model_code FROM harley_models hm
    JOIN harley_families hf ON hf.id = hm.family_id
    WHERE hf.name ILIKE ANY(ARRAY['%Touring%','%Softail%','%Dyna%','%FXR%','%Big Twin%','%Shovelhead%','%Panhead%','%Knucklehead%'])
  `);
  const bigTwinModelCodes = bigTwinRows.map(r => r.model_code);

  const { rows: evoRows } = await client.query(`
    SELECT DISTINCT hm.model_code FROM harley_models hm
    JOIN harley_families hf ON hf.id = hm.family_id
    WHERE hf.name ILIKE '%Evo%' OR hf.name ILIKE '%Evolution%'
  `);
  const evoBigTwinCodes = evoRows.map(r => r.model_code);

  // All model codes for __ALL__ expansion
  const { rows: allModels } = await client.query(`SELECT model_code FROM harley_models`);
  const allModelCodes = allModels.map(r => r.model_code);

  // Build family → model codes map for __FAMILY_*__ aliases
  const { rows: familyRows } = await client.query(`
    SELECT hf.name, hm.model_code
    FROM harley_models hm
    JOIN harley_families hf ON hf.id = hm.family_id
    ORDER BY hf.name, hm.model_code
  `);
  const familyCodeMap = new Map();
  for (const row of familyRows) {
    if (!familyCodeMap.has(row.name)) familyCodeMap.set(row.name, []);
    familyCodeMap.get(row.name).push(row.model_code);
  }
  console.log(`📊 Big Twin: ${bigTwinModelCodes.length}, Evo: ${evoBigTwinCodes.length}, All: ${allModelCodes.length}, Families: ${familyCodeMap.size}\n`);

  // 4. Batch OEM lookup (fast — one query per 500 OEMs)
  const allOems = [...new Set(normalizedRows.map(r => r[COL_OEM] ? String(r[COL_OEM]).trim() : null).filter(Boolean))];
  console.log(`🔍 Looking up ${allOems.length} unique OEM numbers in batches...`);
  const oemProgress = new Progress(allOems.length, 'OEM lookup');

  const oemToProductIds = new Map();
  const LOOKUP_BATCH = 500;
  for (let i = 0; i < allOems.length; i += LOOKUP_BATCH) {
    const batch = allOems.slice(i, i + LOOKUP_BATCH);
    const placeholders = batch.map((_, idx) => `$${idx + 1}`).join(',');

    // Path 1: oem_numbers[] array
    const { rows: cuRows } = await client.query(`
      SELECT id, unnest(oem_numbers) AS oem_num
      FROM catalog_unified
      WHERE oem_numbers && ARRAY[${placeholders}]::text[]
    `, batch);

    for (const row of cuRows) {
      const oem = row.oem_num;
      if (!oemToProductIds.has(oem)) oemToProductIds.set(oem, new Set());
      oemToProductIds.get(oem).add(row.id);
    }

    // Path 2: catalog_oem_crossref (sku → vendor_item_id)
    try {
      const { rows: crossRows } = await client.query(`
        SELECT cu.id, coc.oem_number AS oem_num
        FROM catalog_oem_crossref coc
        JOIN catalog_unified cu ON cu.vendor_item_id = coc.sku
        WHERE coc.oem_number = ANY(ARRAY[${placeholders}]::text[])
      `, batch);
      for (const row of crossRows) {
        if (!oemToProductIds.has(row.oem_num)) oemToProductIds.set(row.oem_num, new Set());
        oemToProductIds.get(row.oem_num).add(row.id);
      }
    } catch (_) { /* sku join unavailable */ }

    oemProgress.tick(batch.length);
  }

  const matchedOems = [...oemToProductIds.entries()].filter(([, s]) => s.size > 0).length;
  console.log(`📊 OEMs with product matches: ${matchedOems} / ${allOems.length}\n`);

  // 5. Process rows (no DB queries in loop — all lookups done above)
  const inserts = [];
  const skipped = [];
  const noProductMatch = [];
  const noYearMatch = [];
  const unmappedModelTokens = new Map(); // token → count

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

    const productIdSet = oemToProductIds.get(oemRaw);
    if (!productIdSet || productIdSet.size === 0) {
      noProductMatch.push({ oem: oemRaw, models: modelsRaw });
      continue;
    }
    const productIds = [...productIdSet];

    const years = parseYears(yearsRaw);
    if (years.length === 0) { skipped.push({ reason: 'no years parsed', row }); continue; }

    const modelTokens = parseModels(modelsRaw);

    // Track unmapped tokens
    for (const t of modelTokens) {
      if (!BOON_MODEL_ALIASES[t] && !BOON_MODEL_ALIASES[t.toUpperCase()]) {
        unmappedModelTokens.set(t, (unmappedModelTokens.get(t) || 0) + 1);
      }
    }

    const modelCodes = resolveModelCodes(modelTokens, bigTwinModelCodes, evoBigTwinCodes, allModelCodes, familyCodeMap);

    if (modelCodes.length === 0) { skipped.push({ reason: "no model codes resolved", row }); continue; }

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

  // Dedup inserts (same product × model_year)
  const seen = new Set();
  const dedupedInserts = inserts.filter(r => {
    const key = `${r.product_id}:${r.model_year_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\n📊 Results:`);
  console.log(`   Rows processed:          ${normalizedRows.length}`);
  console.log(`   Actionable rows:         ${actionable.length}`);
  console.log(`   Raw fitment pairs:       ${inserts.length}`);
  console.log(`   Deduped fitment rows:    ${dedupedInserts.length}`);
  console.log(`   No product match:        ${noProductMatch.length}`);
  console.log(`   No year/model match:     ${noYearMatch.length}`);
  console.log(`   Skipped:                 ${skipped.length}`);
  const skipReasons = skipped.reduce((acc, s) => { acc[s.reason] = (acc[s.reason]||0)+1; return acc; }, {});
  console.log(`   Skip breakdown:          ${JSON.stringify(skipReasons)}`);

  if (unmappedModelTokens.size > 0) {
    const sorted = [...unmappedModelTokens.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`\n⚠️  Unmapped model tokens (top 20 by frequency):`);
    sorted.slice(0, 20).forEach(([t, n]) => console.log(`   "${t}" — ${n} rows`));
    console.log(`   (Add these to BOON_MODEL_ALIASES if needed)`);
  }

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

  if (dedupedInserts.length === 0) {
    console.log('\n⚠️  Nothing to insert.');
    await client.end();
    return;
  }

  // 6. Insert
  console.log(`\n💾 Inserting ${dedupedInserts.length} rows into catalog_fitment_v2...`);
  const insertProgress = new Progress(dedupedInserts.length, 'Inserting');
  const BATCH = 500;
  let inserted = 0;

  await client.query('BEGIN');
  try {
    for (let i = 0; i < dedupedInserts.length; i += BATCH) {
      const batch = dedupedInserts.slice(i, i + BATCH);
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
    const pids = [...new Set(dedupedInserts.map(r => r.product_id))];
    console.log(`\n🔄 Backfilling is_harley_fitment on ${pids.length} products...`);
    await client.query(
      `UPDATE catalog_unified SET is_harley_fitment = true WHERE id = ANY($1::int[])`,
      [pids]
    );

    await client.query('COMMIT');
    console.log(`✅ Committed. ${inserted} fitment rows inserted.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ Insert failed, rolled back: ${err.message}`);
  }

  await client.end();
  console.log('\n✅ Done.\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
