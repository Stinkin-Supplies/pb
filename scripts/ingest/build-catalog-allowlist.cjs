/**
 * scripts/ingest/build-catalog-allowlist.cjs
 *
 * Builds a catalog_allowlist table that controls which products
 * get indexed in Typesense. Only SKUs in this table are indexed.
 *
 * Catalogs included:
 *
 * WPS:
 *   - Hard Drive (HDTwin Products) — vocabulary_id 1
 *   - Hard Drive Indian — vocabulary_id 1 (Indian = HD Twin platform)
 *   - Tires/Wheels/Tools/Chemicals — vocabulary_id 10 (Sedona) + 11 (Shinko)
 *     + taxonomy classification terms for Tires/Tools/Chemicals
 *
 * PU:
 *   - Street catalog (is_street = true) — proxy for Fatbook + Oldbook
 *   - Tire catalog (watercraft_catalog IS NOT NULL) — best available proxy
 *   - All PU products with is_street OR is_watercraft flag
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/build-catalog-allowlist.cjs
 *
 * After running, Stage 3 will only index products in this allowlist.
 */

'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const WPS_BASE = 'https://api.wps-inc.com';
function wpsHeaders() {
  return {
    Authorization:  `Bearer ${process.env.WPS_API_KEY}`,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  };
}

// ─── WPS vocabulary IDs to include ───────────────────────────────────────────

const WPS_VOCABULARIES = [
  { id: 1,  name: 'Hard Drive (HDTwin)'       },
  { id: 10, name: 'Tires/Wheels (Sedona)'     },
  { id: 11, name: 'Tires (Shinko)'            },
];

// Also include WPS catalog classification taxonomy terms for:
// Tools = look for "tools" in category names
// Chemicals = look for "chemical" in category names
const WPS_EXTRA_CATEGORIES = [
  'Chemicals',
  'Tools',
  'Lubricants',
  'Tire Care',
  'Cleaners',
];

// ─── Create allowlist table ───────────────────────────────────────────────────

async function createAllowlistTable() {
  await pool.query(`
    DROP TABLE IF EXISTS catalog_allowlist;
    CREATE TABLE catalog_allowlist (
      sku         TEXT NOT NULL,
      source      TEXT NOT NULL,  -- 'wps_vocab_1', 'wps_vocab_10', 'pu_street' etc.
      catalog     TEXT NOT NULL,  -- human readable catalog name
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (sku, source)
    );
    CREATE INDEX idx_allowlist_sku ON catalog_allowlist(sku);
  `);
  console.log('[Allowlist] Table created');
}

// ─── Fetch all items for a WPS vocabulary ─────────────────────────────────────

async function fetchVocabularySkus(vocabId, vocabName) {
  const skus = new Set();

  // Get all taxonomy terms for this vocabulary
  const termRes = await fetch(
    `${WPS_BASE}/vocabularies/${vocabId}/taxonomyterms?page[size]=100`,
    { headers: wpsHeaders() }
  );
  const termData = await termRes.json();
  const terms = termData.data ?? [];

  console.log(`[Allowlist] Vocabulary ${vocabId} (${vocabName}): ${terms.length} terms`);

  // Fetch items for each term
  for (const term of terms) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${WPS_BASE}/taxonomyterms/${term.id}/items?page[size]=500&page[number]=${page}`;
      const res = await fetch(url, { headers: wpsHeaders() });
      if (!res.ok) { hasMore = false; break; }

      const json = await res.json();
      const items = json.data ?? [];

      for (const item of items) {
        const sku = item.sku ?? item.item_number;
        if (sku) skus.add(sku);
      }

      const links = json.links ?? {};
      hasMore = !!(links.next);
      page++;
      if (!items.length) break;
    }

    const pct  = (terms.indexOf(term) + 1) / terms.length;
    const fill = Math.round(pct * 26);
    const bar  = '█'.repeat(fill) + '░'.repeat(26 - fill);
    process.stdout.write(`\r[Allowlist]   │${bar}│ ${(pct*100).toFixed(0).padStart(3)}% "${term.name}" — ${skus.size} SKUs`);
  }

  console.log(''); // newline
  return [...skus];
}

// ─── Insert WPS allowlist entries ─────────────────────────────────────────────

async function insertWpsAllowlist(skus, source, catalog) {
  if (!skus.length) return 0;
  let inserted = 0;
  const CHUNK = 500;

  for (let i = 0; i < skus.length; i += CHUNK) {
    const chunk = skus.slice(i, i + CHUNK);
    const values = chunk.map((_, idx) => `($${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3})`).join(',');
    const params = chunk.flatMap(sku => [sku, source, catalog]);

    await pool.query(
      `INSERT INTO catalog_allowlist (sku, source, catalog)
       VALUES ${values}
       ON CONFLICT (sku, source) DO NOTHING`,
      params
    );
    inserted += chunk.length;
  }
  return inserted;
}

// ─── WPS extra categories (Tools/Chemicals) from catalog_products ─────────────

async function addWpsExtraCategories() {
  const categoryConditions = WPS_EXTRA_CATEGORIES
    .map((_, i) => `cp.category ILIKE $${i + 1}`)
    .join(' OR ');

  const params = WPS_EXTRA_CATEGORIES.map(c => `%${c}%`);

  const { rows } = await pool.query(
    `SELECT cp.sku
     FROM catalog_products cp
     JOIN vendor_offers vo ON vo.catalog_product_id = cp.id
     WHERE vo.vendor_code = 'wps'
       AND cp.is_active = true
       AND (${categoryConditions})`,
    params
  );

  if (!rows.length) return 0;
  const skus = rows.map(r => r.sku);
  return insertWpsAllowlist(skus, 'wps_categories', 'Tools/Chemicals');
}

// ─── PU allowlist — street flag proxy for Fatbook/Oldbook/Tire ───────────────

async function addPuAllowlist() {
  console.log('\n[Allowlist] Building PU allowlist from raw_vendor_pu flags...');

  // PU Tire — category contains Tire
  const { rows: tireRows } = await pool.query(`
    SELECT cp.sku
    FROM catalog_products cp
    JOIN vendor_offers vo ON vo.catalog_product_id = cp.id
    WHERE vo.vendor_code = 'pu'
      AND cp.is_active = true
      AND cp.category ILIKE '%tire%'
  `);

  console.log(`[Allowlist] PU Tire/Service: ${tireRows.length} SKUs`);

  if (tireRows.length) {
    const skus = tireRows.map(r => r.sku);
    await insertWpsAllowlist(skus, 'pu_tire', 'PU Tire/Service');
  }


}

// ─── Summary ──────────────────────────────────────────────────────────────────

async function printSummary() {
  const { rows } = await pool.query(`
    SELECT catalog, COUNT(DISTINCT sku) as unique_skus
    FROM catalog_allowlist
    GROUP BY catalog
    ORDER BY unique_skus DESC
  `);

  const { rows: [{ total }] } = await pool.query(`
    SELECT COUNT(DISTINCT sku) as total FROM catalog_allowlist
  `);

  console.log('\n[Allowlist] ── SUMMARY ──');
  rows.forEach(r => console.log(`  ${r.catalog}: ${r.unique_skus.toLocaleString()} SKUs`));
  console.log(`  TOTAL UNIQUE SKUs TO INDEX: ${Number(total).toLocaleString()}`);
  console.log('\n  Run Stage 3 reindex after this.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[Allowlist] Building catalog allowlist...\n');

  await createAllowlistTable();

  // WPS vocabularies
  for (const vocab of WPS_VOCABULARIES) {
    console.log(`\n[Allowlist] Fetching WPS vocabulary ${vocab.id}: ${vocab.name}...`);
    const skus = await fetchVocabularySkus(vocab.id, vocab.name);
    console.log(`[Allowlist] ${vocab.name}: ${skus.length} total SKUs`);
    const inserted = await insertWpsAllowlist(skus, `wps_vocab_${vocab.id}`, vocab.name);
    console.log(`[Allowlist] Inserted ${inserted} rows`);
  }

  // WPS extra categories (Tools/Chemicals)
  console.log('\n[Allowlist] Adding WPS Tools/Chemicals categories...');
  const extraInserted = await addWpsExtraCategories();
  console.log(`[Allowlist] Tools/Chemicals: ${extraInserted} rows`);

  // PU
  await addPuAllowlist();

  await printSummary();
  await pool.end();
}

main().catch(err => {
  console.error('[Allowlist] Fatal:', err);
  process.exit(1);
});
