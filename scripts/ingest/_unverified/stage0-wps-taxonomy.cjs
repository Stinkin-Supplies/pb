/**
 * scripts/ingest/stage0-wps-taxonomy.cjs
 *
 * Fetches WPS catalog classification taxonomy (vocabulary 15)
 * and stores sport type associations in catalog_specs as:
 *   attribute: 'sport_type'
 *   value:     'ATV' | 'Street' | 'Offroad' | 'Snow' | 'Watercraft' | 'Bicycle'
 *
 * This is a stopgap until SQL migrations add is_atv/is_street etc. columns.
 * After migrations run, re-map these specs to the proper boolean columns.
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/stage0-wps-taxonomy.cjs
 *
 * WPS Taxonomy IDs (vocabulary 15 — Catalog Classification):
 *   193 = ATV
 *   194 = Bicycle
 *   197 = Offroad
 *   198 = Snow
 *   199 = Street
 *   200 = Watercraft
 *   192 = Apparel  (skipped — not a sport type)
 *   195 = FLY Racing (skipped — brand, not sport type)
 *   196 = Hard Drive  (skipped — brand catalog)
 */

'use strict';

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ── Sport taxonomy IDs to import ──────────────────────────────────────────────

const SPORT_TAXONOMY = [
  { id: 193, value: 'ATV'        },
  { id: 194, value: 'Bicycle'    },
  { id: 197, value: 'Offroad'    },
  { id: 198, value: 'Snow'       },
  { id: 199, value: 'Street'     },
  { id: 200, value: 'Watercraft' },
];

const WPS_BASE = 'https://api.wps-inc.com';

function wpsHeaders() {
  return {
    Authorization:  `Bearer ${process.env.WPS_API_KEY}`,
    'Content-Type': 'application/json',
    Accept:         'application/json',
  };
}

// ── Paginate all items for a taxonomy term ────────────────────────────────────

async function fetchAllItemsForTaxonomy(termId) {
  const skus = new Set();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${WPS_BASE}/taxonomyterms/${termId}/items?page[size]=500&page[number]=${page}`;
    const res = await fetch(url, { headers: wpsHeaders() });

    if (!res.ok) {
      console.error(`[Taxonomy ${termId}] HTTP ${res.status} on page ${page}`);
      break;
    }

    const json = await res.json();
    const items = json.data ?? [];

    for (const item of items) {
      const sku = item.sku ?? item.item_number ?? item.number;
      if (sku) skus.add(sku);
    }

    // Check pagination
    const meta = json.meta ?? {};
    const links = json.links ?? {};
    hasMore = !!(links.next) || (meta.current_page < meta.last_page);
    page++;

    if (items.length === 0) break;
  }

  return [...skus];
}

// ── Upsert sport_type into catalog_specs ──────────────────────────────────────

async function upsertSportSpecs(skus, sportValue) {
  if (!skus.length) return 0;

  let upserted = 0;
  const CHUNK = 500;

  for (let i = 0; i < skus.length; i += CHUNK) {
    const chunk = skus.slice(i, i + CHUNK);
    const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(',');

    // Get product IDs for these SKUs
    const { rows: products } = await pool.query(
      `SELECT id, sku FROM catalog_products WHERE sku = ANY(ARRAY[${placeholders}])`,
      chunk
    );

    for (const product of products) {
      await pool.query(
        `INSERT INTO catalog_specs (product_id, attribute, value)
         VALUES ($1, 'sport_type', $2)
         ON CONFLICT (product_id, attribute, value) DO NOTHING`,
        [product.id, sportValue]
      );
      upserted++;
    }
  }

  return upserted;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[WPS Taxonomy] Starting sport classification import...');
  console.log(`[WPS Taxonomy] ${SPORT_TAXONOMY.length} sport types to fetch`);

  // Clear existing sport_type specs first to avoid stale data
  await pool.query(`DELETE FROM catalog_specs WHERE attribute = 'sport_type'`);
  console.log('[WPS Taxonomy] Cleared existing sport_type specs');

  let totalSkus    = 0;
  let totalUpserted = 0;

  for (const { id, value } of SPORT_TAXONOMY) {
    console.log(`\n[WPS Taxonomy] Fetching ${value} items (term ${id})...`);

    const skus = await fetchAllItemsForTaxonomy(id);
    console.log(`[WPS Taxonomy] ${value}: ${skus.length} SKUs found`);
    totalSkus += skus.length;

    const upserted = await upsertSportSpecs(skus, value);
    console.log(`[WPS Taxonomy] ${value}: ${upserted} catalog_specs rows written`);
    totalUpserted += upserted;
  }

  await pool.end();

  console.log(`\n[WPS Taxonomy] Done.`);
  console.log(`  Total SKUs fetched:  ${totalSkus}`);
  console.log(`  Total specs written: ${totalUpserted}`);
  console.log(`\n  sport_type values now in catalog_specs:`);
  SPORT_TAXONOMY.forEach(({ value }) => console.log(`    • ${value}`));
  console.log(`\n  Run Stage 3 reindex after this to surface sport facets in Typesense.`);
}

main().catch(err => {
  console.error('[WPS Taxonomy] Fatal:', err);
  process.exit(1);
});
