/**
 * build_fitment_from_oem.mjs
 *
 * Builds catalog_fitment_v2 rows from oem_crossref + oem_fitment.
 *
 * Join chain:
 *   1. oem_crossref → catalog_unified  (via wps_sku, vtwin_sku, ds_oldbook_sku, ds_fatbook_sku)
 *   2. oem_crossref.oem_number → oem_fitment.oem_part_no  (year range + model_codes)
 *   3. oem_fitment.model_codes[] → hd_models.model_code → harley_model_years (model_year_id)
 *   4. INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
 *
 * Run:  node scripts/ingest/build_fitment_from_oem.mjs
 * Dry:  node scripts/ingest/build_fitment_from_oem.mjs --dry-run
 */

import pg from 'pg';
const { Client } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const DB_URL  = 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog';
const db      = new Client({ connectionString: DB_URL });
await db.connect();

console.log(`── build_fitment_from_oem  ${DRY_RUN ? '[DRY RUN]' : '[LIVE]'} ──\n`);

// ── Step 1: build product_id lookup from oem_crossref → catalog_unified ───────
// Priority: WPS > VTwin > FatBook > OldBook
// PU vendor_sku in catalog_unified = normalised sku (dashes stripped)
// WPS vendor_sku = raw wps sku
// VTwin vendor_sku = raw vtwin sku

console.log('Loading oem_crossref → catalog_unified map...');

const crossrefRes = await db.query(`
  SELECT
    oc.oem_number,
    oc.wps_sku,
    oc.vtwin_sku,
    oc.ds_fatbook_sku,
    oc.ds_oldbook_sku,
    -- resolve catalog_unified.id via each vendor path, pick best
    cu_wps.id  AS wps_product_id,
    cu_vt.id   AS vt_product_id,
    cu_fb.id   AS fb_product_id,
    cu_ob.id   AS ob_product_id
  FROM oem_crossref oc
  LEFT JOIN catalog_unified cu_wps
    ON cu_wps.source_vendor = 'WPS'
    AND cu_wps.vendor_sku = oc.wps_sku
    AND oc.wps_sku IS NOT NULL AND oc.wps_sku != ''
  LEFT JOIN catalog_unified cu_vt
    ON cu_vt.source_vendor = 'VTWIN'
    AND cu_vt.vendor_sku = oc.vtwin_sku
    AND oc.vtwin_sku IS NOT NULL AND oc.vtwin_sku != ''
  LEFT JOIN catalog_unified cu_fb
    ON cu_fb.source_vendor = 'PU'
    AND cu_fb.vendor_sku = UPPER(REPLACE(oc.ds_fatbook_sku, '-', ''))
    AND oc.ds_fatbook_sku IS NOT NULL AND oc.ds_fatbook_sku != ''
  LEFT JOIN catalog_unified cu_ob
    ON cu_ob.source_vendor = 'PU'
    AND cu_ob.vendor_sku = UPPER(REPLACE(oc.ds_oldbook_sku, '-', ''))
    AND oc.ds_oldbook_sku IS NOT NULL AND oc.ds_oldbook_sku != ''
`);

// Build oem_number → { product_id, confidence } map (best match wins)
const oemToProduct = new Map();
let resolvedCount = 0;

for (const row of crossrefRes.rows) {
  const product_id = row.wps_product_id  ?? row.vt_product_id ??
                     row.fb_product_id   ?? row.ob_product_id;
  const confidence = row.wps_product_id ? 0.95
                   : row.vt_product_id  ? 0.85
                   : row.fb_product_id  ? 0.75
                   : row.ob_product_id  ? 0.70
                   : null;
  if (product_id) {
    // One oem_number may appear multiple times (multiple vendor SKUs for same OEM)
    // Keep highest confidence
    const existing = oemToProduct.get(row.oem_number);
    if (!existing || confidence > existing.confidence) {
      oemToProduct.set(row.oem_number, { product_id, confidence });
      if (!existing) resolvedCount++;
    }
  }
}

console.log(`oem_crossref rows     : ${crossrefRes.rows.length.toLocaleString()}`);
console.log(`Resolved to product_id: ${resolvedCount.toLocaleString()}`);
console.log(`Unresolved            : ${(crossrefRes.rows.length - resolvedCount).toLocaleString()}\n`);

// ── Step 2: build model_code → harley_model_years lookup ─────────────────────

console.log('Loading hd_models → harley_model_years map...');

const modelYearRes = await db.query(`
  SELECT hmy.id AS model_year_id, hmy.year, hm.model_code, hm.year_start, hm.year_end
  FROM harley_model_years hmy
  JOIN hd_models hm ON hm.id = hmy.model_id
`);

// Map: model_code|year → model_year_id
const modelYearMap = new Map();
for (const row of modelYearRes.rows) {
  modelYearMap.set(`${row.model_code}|${row.year}`, row.model_year_id);
}
console.log(`harley_model_years rows: ${modelYearRes.rows.length.toLocaleString()}\n`);

// ── Step 3: load oem_fitment rows that have model_codes ──────────────────────

console.log('Loading oem_fitment rows with model_codes...');

const fitmentRes = await db.query(`
  SELECT oem_part_no, model_codes, catalog_year_start, catalog_year_end
  FROM oem_fitment
  WHERE model_codes IS NOT NULL
    AND array_length(model_codes, 1) > 0
    AND catalog_year_start IS NOT NULL
`);

console.log(`oem_fitment rows to process: ${fitmentRes.rows.length.toLocaleString()}\n`);

// ── Step 4: build fitment rows ────────────────────────────────────────────────

console.log('Building catalog_fitment_v2 rows...\n');

const toInsert = []; // { product_id, model_year_id, confidence, source }
const seen     = new Set(); // dedupe product_id|model_year_id

let skippedNoProduct = 0;
let skippedNoYear    = 0;
let skippedDupe      = 0;

for (const row of fitmentRes.rows) {
  const mapped = oemToProduct.get(row.oem_part_no);
  if (!mapped) { skippedNoProduct++; continue; }

  const { product_id, confidence } = mapped;
  const yearStart = row.catalog_year_start;
  const yearEnd   = row.catalog_year_end ?? row.catalog_year_start;

  const codes = row.model_codes ?? [];
  for (const code of codes) {
    if (!code || code === 'ALL') continue;
    for (let yr = yearStart; yr <= yearEnd; yr++) {
      const mid = modelYearMap.get(`${code}|${yr}`);
      if (!mid) { skippedNoYear++; continue; }
      const dedupeKey = `${product_id}|${mid}`;
      if (seen.has(dedupeKey)) { skippedDupe++; continue; }
      seen.add(dedupeKey);
      toInsert.push({ product_id, model_year_id: mid, confidence, source: 'oem_crossref' });
    }
  }
}

console.log(`Rows to insert    : ${toInsert.length.toLocaleString()}`);
console.log(`Skipped no product: ${skippedNoProduct.toLocaleString()}`);
console.log(`Skipped no year   : ${skippedNoYear.toLocaleString()}`);
console.log(`Skipped dupes     : ${skippedDupe.toLocaleString()}\n`);

if (DRY_RUN) {
  console.log('DRY RUN — no writes.\n');

  // Enrich sample with readable names — pick 15 non-universal rows
  const sample = toInsert.filter(r => r.source === 'oem_crossref').slice(0, 15);
  const pids   = [...new Set(sample.map(r => r.product_id))];
  const mids   = [...new Set(sample.map(r => r.model_year_id))];

  const pRes = await db.query(
    `SELECT id, brand, name FROM catalog_unified WHERE id = ANY($1)`, [pids]
  );
  const mRes = await db.query(
    `SELECT hmy.id, hmy.year, hm.model_code, hm.name AS model_name
     FROM harley_model_years hmy
     JOIN harley_models hm ON hm.id = hmy.model_id
     WHERE hmy.id = ANY($1)`, [mids]
  );

  const pMap = new Map(pRes.rows.map(r => [r.id, r]));
  const mMap = new Map(mRes.rows.map(r => [r.id, r]));

  console.log('Sample (non-universal fitment rows):');
  for (const r of sample) {
    const p = pMap.get(r.product_id);
    const m = mMap.get(r.model_year_id);
    console.log(`  [${m?.model_code} ${m?.year}] ${p?.brand} — ${p?.name?.slice(0,45)}  (conf: ${r.confidence})`);
  }

  await db.end();
  process.exit(0);
}

// ── Step 5: insert in batches ─────────────────────────────────────────────────

console.log('Inserting into catalog_fitment_v2...');

const BATCH = 500;
let inserted = 0;

for (let i = 0; i < toInsert.length; i += BATCH) {
  const batch = toInsert.slice(i, i + BATCH);

  const values = batch.map((r, j) => {
    const base = j * 4;
    return `($${base+1}, $${base+2}, $${base+3}, $${base+4})`;
  }).join(', ');

  const params = batch.flatMap(r => [
    r.product_id,
    r.model_year_id,
    r.source,
    r.confidence,
  ]);

  await db.query(`
    INSERT INTO catalog_fitment_v2 (product_id, model_year_id, fitment_source, confidence_score)
    VALUES ${values}
    ON CONFLICT DO NOTHING
  `, params);

  inserted += batch.length;
  if (inserted % 10000 === 0 || inserted === toInsert.length) {
    process.stdout.write(`\r  ${inserted.toLocaleString()} / ${toInsert.length.toLocaleString()}`);
  }
}

console.log('\n');

// ── Step 6: verify ────────────────────────────────────────────────────────────

const countRes = await db.query(`SELECT COUNT(*) FROM catalog_fitment_v2`);
console.log(`catalog_fitment_v2 total rows: ${Number(countRes.rows[0].count).toLocaleString()}`);

const sampleRes = await db.query(`
  SELECT cu.brand, cu.name, hm.model_code, hmy.year, cf.confidence_score, cf.fitment_source
  FROM catalog_fitment_v2 cf
  JOIN catalog_unified cu ON cu.id = cf.product_id
  JOIN harley_model_years hmy ON hmy.id = cf.model_year_id
  JOIN hd_models hm ON hm.id = hmy.model_id
  ORDER BY cf.id DESC
  LIMIT 8
`);
console.log('\nSample inserted rows:');
for (const r of sampleRes.rows) {
  console.log(`  [${r.model_code} ${r.year}] ${r.brand} — ${r.name?.slice(0,45)}  (${r.confidence_score})`);
}

await db.end();
console.log('\nDone.');
