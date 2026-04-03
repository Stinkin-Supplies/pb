/**
 * scripts/ingest/build-catalog-allowlist.cjs
 *
 * Builds catalog_allowlist table for Typesense index filtering.
 *
 * WPS catalogs:
 *   Hard Drive (HDTwin) — HD-focused brands from catalog_products
 *   Tires/Wheels/Tools/Chemicals — tire brands + category filter
 *
 * PU catalogs:
 *   Fatbook  — fatbook_catalog != '' in dealerprice_batch_ rows
 *   Oldbook  — oldbook_catalog != '' in dealerprice_batch_ rows
 *   Tire     — tire_catalog != '' in dealerprice_batch_ rows
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/build-catalog-allowlist.cjs
 */

'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function bar(pct) {
  const fill = Math.round(pct * 26);
  return '█'.repeat(fill) + '░'.repeat(26 - fill);
}

async function createTable() {
  await pool.query(`
    DROP TABLE IF EXISTS catalog_allowlist;
    CREATE TABLE catalog_allowlist (
      sku        TEXT NOT NULL,
      source     TEXT NOT NULL,
      catalog    TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (sku, source)
    );
    CREATE INDEX idx_allowlist_sku ON catalog_allowlist(sku);
  `);
  console.log('[Allowlist] Table created');
}

async function insertSkus(skus, source, catalog) {
  if (!skus.length) return 0;
  const CHUNK = 500;
  for (let i = 0; i < skus.length; i += CHUNK) {
    const chunk  = skus.slice(i, i + CHUNK);
    const vals   = chunk.map((_, j) => `($${j*3+1},$${j*3+2},$${j*3+3})`).join(',');
    const params = chunk.flatMap(s => [s, source, catalog]);
    await pool.query(
      `INSERT INTO catalog_allowlist (sku,source,catalog) VALUES ${vals} ON CONFLICT DO NOTHING`,
      params
    );
    const pct = Math.min((i + CHUNK) / skus.length, 1);
    process.stdout.write(`\r[Allowlist]   ${bar(pct)} ${(pct*100).toFixed(0).padStart(3)}% (${Math.min(i+CHUNK, skus.length)}/${skus.length})`);
  }
  console.log('');
  return skus.length;
}

// ─── WPS Hard Drive — HD Twin focused brands ──────────────────────────────────

const HD_BRANDS = [
  'DRAG SPECIALTIES', 'DRAG SPEC.', 'KURYAKYN', 'ARLEN NESS',
  'CUSTOM CHROME', 'CHROME', 'HARDDRIVE', 'HARD DRIVE',
  'THUNDER MANUFACTURING', 'NATIONAL CYCLE', 'KHROME WERKS',
  'SHOW CHROME', 'SUMAX', 'WITCHDOCTORS', 'BIKER CHOICE',
  'CUSTOM DYNAMICS', 'PERFORMANCE MACHINE', 'PROGRESSIVE SUSPENSION',
  'LAGUNA', 'COBRA', 'VANCE AND HINES', 'SUPERTRAPP',
  'SAMSON', 'FREEDOM PERFORMANCE', 'BASSANI', 'KHROME',
  'TRASK', 'ROLAND SANDS', 'BURLY BRAND', 'MUSTANG',
  'CORBIN', 'SADDLEMEN', 'DANNY GRAY', 'LE PERA',
  'BILTWELL', 'RICK ROSS', 'NOVELLO', 'COLONY',
  'JAMES GASKETS', 'COMETIC', 'ANDREWS', 'RIVERA PRIMO',
  'BELT DRIVES', 'BAKER DRIVETRAIN', 'DARK HORSE',
  'S&S CYCLE', 'FUELING', 'REVTECH', 'TP ENGINEERING',
];

async function addWpsHardDrive() {
  console.log('\n[Allowlist] WPS Hard Drive (HDTwin brands)...');

  const conditions = HD_BRANDS.map((_, i) => `cp.brand ILIKE $${i+1}`).join(' OR ');
  const { rows } = await pool.query(
    `SELECT cp.sku FROM catalog_products cp
     JOIN vendor_offers vo ON vo.catalog_product_id = cp.id
     WHERE vo.vendor_code = 'wps'
       AND cp.is_active = true
       AND (${conditions})`,
    HD_BRANDS.map(b => `%${b}%`)
  );

  console.log(`[Allowlist] WPS Hard Drive: ${rows.length} SKUs`);
  return insertSkus(rows.map(r => r.sku), 'wps_hard_drive', 'WPS Hard Drive');
}

// ─── WPS Tires/Wheels ─────────────────────────────────────────────────────────

const TIRE_BRANDS = [
  'SHINKO', 'SEDONA', 'MICHELIN', 'DUNLOP', 'BRIDGESTONE',
  'MAXXIS', 'IRC', 'PIRELLI', 'METZELER', 'CONTINENTAL',
  'KENDA', 'HEIDENAU', 'GBC', 'ITP', 'PRO-WHEEL',
  'DUBYA', 'SYSTEM 3', 'RACELINE', 'DWT', 'CARLISLE',
  'KOLD KUTTER', 'BYKAS', 'BULLDOG', 'CST', 'VEE',
  'DURO', 'KINGS', 'AWC',
];

const TIRE_CATEGORIES = [
  'Tires', 'Wheels', 'Tubes', 'Tire Care', 'Tire Chains',
  'Chemicals', 'Tools', 'Lubricants', 'Cleaners',
];

async function addWpsTiresWheels() {
  console.log('\n[Allowlist] WPS Tires/Wheels — brand filter...');

  const brandConds = TIRE_BRANDS.map((_, i) => `cp.brand ILIKE $${i+1}`).join(' OR ');
  const { rows: brandRows } = await pool.query(
    `SELECT cp.sku FROM catalog_products cp
     JOIN vendor_offers vo ON vo.catalog_product_id = cp.id
     WHERE vo.vendor_code = 'wps'
       AND cp.is_active = true
       AND (${brandConds})`,
    TIRE_BRANDS.map(b => `%${b}%`)
  );
  console.log(`[Allowlist] Tire brands: ${brandRows.length} SKUs`);
  await insertSkus(brandRows.map(r => r.sku), 'wps_tire_brands', 'WPS Tires/Wheels');

  console.log('[Allowlist] WPS Tools/Chemicals — category filter...');
  const catConds = TIRE_CATEGORIES.map((_, i) => `cp.category ILIKE $${i+1}`).join(' OR ');
  const { rows: catRows } = await pool.query(
    `SELECT cp.sku FROM catalog_products cp
     JOIN vendor_offers vo ON vo.catalog_product_id = cp.id
     WHERE vo.vendor_code = 'wps'
       AND cp.is_active = true
       AND (${catConds})`,
    TIRE_CATEGORIES.map(c => `%${c}%`)
  );
  console.log(`[Allowlist] Tools/Chemicals categories: ${catRows.length} SKUs`);
  await insertSkus(catRows.map(r => r.sku), 'wps_tools_chemicals', 'WPS Tools/Chemicals');
}

// ─── PU — from dealerprice_batch_ rows ───────────────────────────────────────

async function addPuCatalog(field, source, catalog) {
  const { rows } = await pool.query(`
    SELECT DISTINCT (item->>'sku') AS sku
    FROM raw_vendor_pu,
    LATERAL jsonb_array_elements(payload) AS item
    WHERE source_file LIKE 'dealerprice_batch_%'
      AND item->>'${field}' IS NOT NULL
      AND item->>'${field}' != ''
      AND item->>'sku' IS NOT NULL
  `);
  console.log(`[Allowlist] PU ${catalog}: ${rows.length} SKUs`);
  return insertSkus(rows.map(r => r.sku), source, catalog);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

async function summary() {
  const { rows } = await pool.query(`
    SELECT catalog, COUNT(DISTINCT sku) as n
    FROM catalog_allowlist GROUP BY catalog ORDER BY n DESC
  `);
  const { rows: [{ total }] } = await pool.query(
    `SELECT COUNT(DISTINCT sku) as total FROM catalog_allowlist`
  );
  console.log('\n[Allowlist] ── SUMMARY ──');
  rows.forEach(r => console.log(`  ${r.catalog.padEnd(35)} ${Number(r.n).toLocaleString()} SKUs`));
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  ${'TOTAL UNIQUE SKUs TO INDEX'.padEnd(35)} ${Number(total).toLocaleString()}`);
  console.log('\n  Next: delete .stage3_checkpoint.json then run Stage 3 reindex.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[Allowlist] Building catalog allowlist...\n');
  await createTable();
  await addWpsHardDrive();
  await addWpsTiresWheels();
  console.log('\n[Allowlist] PU catalogs...');
  await addPuCatalog('fatbook_catalog', 'pu_fatbook', 'PU Fatbook');
  await addPuCatalog('oldbook_catalog', 'pu_oldbook', 'PU Oldbook');
  await addPuCatalog('tire_catalog',    'pu_tire',    'PU Tire/Service');
  await summary();
  await pool.end();
}

main().catch(err => { console.error('[Allowlist] Fatal:', err); process.exit(1); });
