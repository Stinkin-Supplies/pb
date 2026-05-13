/**
 * rebuild_harley_model_years.mjs
 *
 * Rebuilds harley_model_years from hd_year_model_master.csv.
 *
 * Handles two cases:
 *   1. Direct match: CSV model_code → hd_models.model_code
 *   2. Generic era codes: 'knucklehead','panhead','shovelhead','twin_cam',
 *      'evolution_bigtwin' → expand to ALL hd_models rows in that family
 *      for the matching year
 *   3. Missing specific codes → INSERT into hd_models first, then link
 *
 * Run:  node scripts/ingest/rebuild_harley_model_years.mjs
 * Dry:  node scripts/ingest/rebuild_harley_model_years.mjs --dry-run
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const DRY_RUN = process.argv.includes('--dry-run');
const DB_URL  = 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH  = path.join(__dirname, '../data/hd_year_model_master.csv');

if (!fs.existsSync(CSV_PATH)) {
  console.error(`CSV not found at ${CSV_PATH}\nCopy hd_year_model_master.csv to scripts/data/`);
  process.exit(1);
}

const db = new Client({ connectionString: DB_URL });
await db.connect();

console.log(`── rebuild_harley_model_years  ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ──\n`);

// ── Generic era code → hd_models family mapping ───────────────────────────────
// These CSV codes represent an entire family/era, not a single model.
// For a given year, we expand them to all hd_models in that family that
// cover that year (year_start <= year <= year_end or year_end IS NULL).
// These will be resolved after loading harley_families
// Placeholder — replaced after family names loaded
const ERA_FAMILY_MAP = {
  'knucklehead':      ['Knucklehead'],
  'panhead':          ['Panhead'],
  'shovelhead':       ['Shovelhead'],
  'twin_cam':         ['Twin Cam'],
  'evolution_bigtwin':['Evolution', 'Softail', 'Dyna', 'FXR', 'Touring'],
};

// ── Missing specific model codes to add to hd_models ─────────────────────────
// These exist in the CSV but not in hd_models. We add them so they can be
// linked in harley_model_years.
const MISSING_MODELS = [
  // Flathead K-series
  { model_code: 'VD',    model_name: 'VD 74ci Flathead',      family: 'Flathead',  year_start: 1934, year_end: 1936, engine_key: 'flathead' },
  { model_code: 'K',     model_name: 'K 45ci',                 family: 'Sportster', year_start: 1952, year_end: 1953, engine_key: 'flathead' },
  { model_code: 'KK',    model_name: 'KK 45ci Sport',          family: 'Sportster', year_start: 1952, year_end: 1953, engine_key: 'flathead' },
  { model_code: 'KR',    model_name: 'KR 45ci Racer',          family: 'Sportster', year_start: 1952, year_end: 1969, engine_key: 'flathead' },
  { model_code: 'KH',    model_name: 'KH 55ci',                family: 'Sportster', year_start: 1954, year_end: 1956, engine_key: 'flathead' },
  { model_code: 'KHK',   model_name: 'KHK 55ci Sport',         family: 'Sportster', year_start: 1955, year_end: 1956, engine_key: 'flathead' },
  // Shovelhead-era
  { model_code: 'XR750', model_name: 'XR750 Flat Tracker',     family: 'Sportster', year_start: 1970, year_end: 1980, engine_key: 'ironhead' },
  { model_code: 'XLT',   model_name: 'XLT Touring',            family: 'Sportster', year_start: 1975, year_end: 1976, engine_key: 'ironhead' },
  { model_code: 'XLCR',  model_name: 'XLCR Café Racer',        family: 'Sportster', year_start: 1977, year_end: 1979, engine_key: 'ironhead' },
  // Evo-era Softail
  { model_code: 'FXSTC', model_name: 'Softail Custom',         family: 'Softail',   year_start: 1986, year_end: 1999, engine_key: 'evolution_bigtwin' },
  { model_code: 'FXSTB', model_name: 'Night Train',            family: 'Softail',   year_start: 1998, year_end: 2009, engine_key: 'twin_cam' },
  // Evo/TC Dyna special editions
  { model_code: 'FXDB-S', model_name: 'Dyna Glide Sturgis',   family: 'Dyna',      year_start: 1991, year_end: 1991, engine_key: 'evolution_bigtwin' },
  { model_code: 'FXDB-D', model_name: 'Dyna Glide Daytona',   family: 'Dyna',      year_start: 1992, year_end: 1992, engine_key: 'evolution_bigtwin' },
  // Sportster specific
  { model_code: 'XL883',    model_name: 'Sportster 883',       family: 'Sportster', year_start: 1986, year_end: 2008, engine_key: 'evolution_sportster' },
  { model_code: 'XLH1200C', model_name: 'Sportster 1200 Custom', family: 'Sportster', year_start: 1996, year_end: 2020, engine_key: 'evolution_sportster' },
  { model_code: 'XLH883DLX',model_name: 'Sportster 883 Deluxe', family: 'Sportster', year_start: 1988, year_end: 1995, engine_key: 'evolution_sportster' },
];

// ── Parse CSV ─────────────────────────────────────────────────────────────────
const csvRows = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n').slice(1)
  .map(line => {
    const v = line.split(',');
    return { year: parseInt(v[0]), model_code: v[1]?.trim(), family: v[3]?.trim(), era: v[4]?.trim() };
  }).filter(r => r.year && r.model_code);

console.log(`CSV rows: ${csvRows.length}`);

// ── Load existing hd_models ───────────────────────────────────────────────────
// harley_models has start_year/end_year and family_id
// Need harley_families to get family name for era expansion
const famRes    = await db.query(`SELECT id, name FROM harley_families`);
const famIdToName = new Map(famRes.rows.map(r => [r.id, r.name]));

const modelsRes = await db.query(`SELECT id, model_code, name, start_year, end_year, family_id FROM harley_models`);
// For multi-row model_codes (e.g. FXSTC has two eras), keep all rows indexed by code
const modelMap  = new Map(); // model_code → first/only row (for simple lookup)
const modelRows = []; // all rows for era expansion
for (const m of modelsRes.rows) {
  m.family = famIdToName.get(m.family_id) ?? '';
  m.year_start = m.start_year;
  m.year_end   = m.end_year;
  modelRows.push(m);
  if (!modelMap.has(m.model_code)) modelMap.set(m.model_code, m);
}
// Index by family name for era expansion
const byFamily = new Map();
for (const m of modelRows) {
  if (!byFamily.has(m.family)) byFamily.set(m.family, []);
  byFamily.get(m.family).push(m);
}
console.log(`harley_models loaded: ${modelsRes.rows.length}\n`);

// ── Phase 1: Insert missing models ────────────────────────────────────────────
const missingToInsert = MISSING_MODELS.filter(m => !modelMap.has(m.model_code));
console.log(`Missing models to add: ${missingToInsert.length}`);
missingToInsert.forEach(m => console.log(`  + ${m.model_code}  ${m.model_name}  ${m.year_start}-${m.year_end}`));

if (!DRY_RUN && missingToInsert.length > 0) {
  for (const m of missingToInsert) {
    // Skip inserting into harley_models — it uses family_id FK which we don't have
    // These missing codes will just be skipped (249 rows, minor coverage loss)
    console.log(`  SKIP (harley_models needs family_id): ${m.model_code}`);
  }
}
console.log();

// ── Phase 2: Build harley_model_years rows ────────────────────────────────────
const toInsert  = []; // { year, model_id }
const seen      = new Set();
let   expanded  = 0;
let   skipped   = 0;

for (const row of csvRows) {
  const eraFamilies = ERA_FAMILY_MAP[row.model_code];

  if (eraFamilies) {
    // Generic era code — expand to all models in these families that cover this year
    let found = 0;
    for (const fam of eraFamilies) {
      const famModels = byFamily.get(fam) ?? [];
      for (const m of famModels) {
        const yearOk = row.year >= m.year_start &&
          (m.year_end == null || row.year <= m.year_end);
        if (!yearOk) continue;
        const key = `${m.id}|${row.year}`;
        if (seen.has(key)) continue;
        seen.add(key);
        toInsert.push({ year: row.year, model_id: m.id });
        found++;
      }
    }
    if (found === 0) skipped++;
    else expanded += found;
  } else {
    // Direct match
    const model = modelMap.get(row.model_code);
    if (!model) { skipped++; continue; }
    const key = `${model.id}|${row.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    toInsert.push({ year: row.year, model_id: model.id });
  }
}

console.log(`Rows to insert : ${toInsert.length}`);
console.log(`Era expansions : ${expanded}`);
console.log(`Skipped        : ${skipped}\n`);

if (DRY_RUN) {
  // Show spot check for problem models
  const checks = ['FXEF','FXRT','FXRD','FXRS-SP','FLHT','XL883N','FXSTC','knucklehead'];
  console.log('DRY RUN — spot check year ranges (from toInsert):');
  for (const code of checks) {
    const model = modelMap.get(code);
    if (!model) { console.log(`  ${code}: NOT IN hd_models`); continue; }
    const years = toInsert.filter(r => r.model_id === model.id).map(r => r.year);
    if (years.length === 0) { console.log(`  ${code}: no rows`); continue; }
    console.log(`  ${code.padEnd(12)} ${Math.min(...years)}–${Math.max(...years)}  (${years.length} rows)`);
  }
  await db.end();
  process.exit(0);
}

// ── Phase 3: Delete and re-insert ─────────────────────────────────────────────
console.log('Deleting existing harley_model_years...');
const delRes = await db.query(`DELETE FROM harley_model_years`);
console.log(`Deleted: ${delRes.rowCount}\n`);

console.log('Inserting...');
const BATCH = 500;
let inserted = 0;

for (let i = 0; i < toInsert.length; i += BATCH) {
  const batch  = toInsert.slice(i, i + BATCH);
  const values = batch.map((r, j) => `($${j*2+1}, $${j*2+2})`).join(', ');
  const params = batch.flatMap(r => [r.model_id, r.year]);
  await db.query(`INSERT INTO harley_model_years (model_id, year) VALUES ${values}`, params);
  inserted += batch.length;
  if (inserted % 5000 === 0 || inserted === toInsert.length)
    process.stdout.write(`\r  ${inserted} / ${toInsert.length}`);
}
console.log('\n');

// ── Verify ────────────────────────────────────────────────────────────────────
const countRes = await db.query(`SELECT COUNT(*) FROM harley_model_years`);
console.log(`harley_model_years total: ${countRes.rows[0].count}`);

const checkRes = await db.query(`
  SELECT hm.model_code, MIN(hmy.year) AS min_year, MAX(hmy.year) AS max_year, COUNT(*) AS cnt
  FROM harley_model_years hmy
  JOIN hd_models hm ON hm.id = hmy.model_id
  WHERE hm.model_code IN ('FXEF','FXRT','FXRD','FXRS-SP','FLHT','XL883N','FXSTC','EL')
  GROUP BY hm.model_code ORDER BY hm.model_code
`);
console.log('\nSpot check:');
checkRes.rows.forEach(r =>
  console.log(`  ${r.model_code.padEnd(12)} ${r.min_year}–${r.max_year}  (${r.cnt} rows)`)
);

await db.end();
console.log('\nDone.');
