#!/usr/bin/env node
/**
 * test_orphan_crossref_matching.mjs
 *
 * Read-only. catalog_oem_crossref has ~17,150 rows with product_id IS NULL,
 * clustered in specific import batches (vtwin_scrape: 5,511, eastern: 1,729,
 * HD_OEM: 63, plus 8,069 with source=NULL). These rows DO have a `sku`
 * value, but formats are inconsistent (bare VTwin numbers like "23-9176"
 * missing the "VT-" prefix catalog_unified actually uses; PU "DS197025"
 * vs "DS-193711" — same format, inconsistent dash).
 *
 * This tests several matching strategies against catalog_unified and
 * reports the hit rate for each, BY SOURCE, so we pick the best one (or
 * combination) before writing any actual UPDATE. No writes here.
 *
 * Strategies tested:
 *   A. exact sku match:            oc.sku = cu.sku
 *   B. exact vendor_sku match:     oc.sku = cu.vendor_sku
 *   C. VT- prefix added:           'VT-' || oc.sku = cu.sku
 *   D. normalized sku (strip dashes/spaces, uppercase) vs normalized cu.sku
 *   E. normalized sku vs normalized cu.vendor_sku
 *   F. oem_number found in cu.oem_numbers[] (Eastern's session-68 approach)
 *
 * Usage:
 *   node scripts/ingest/test_orphan_crossref_matching.mjs
 */

import pg from 'pg';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: new URL('../../.env.local', import.meta.url).pathname }); } catch {}
try { require('dotenv').config({ path: new URL('../../.env', import.meta.url).pathname }); } catch {}

const { Pool } = pg;
if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not set — check .env.local/.env at the project root.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  console.log('=== Orphaned crossref rows by source (baseline) ===\n');
  const { rows: baseline } = await pool.query(`
    SELECT COALESCE(source, '(null)') AS source, count(*) AS total
    FROM catalog_oem_crossref
    WHERE product_id IS NULL
    GROUP BY source
    ORDER BY total DESC;
  `);
  for (const r of baseline) console.log(`  ${r.source.padEnd(20)} ${r.total}`);

  const strategies = [
    {
      key: 'A. exact sku = cu.sku',
      sql: `
        SELECT COALESCE(oc.source, '(null)') AS source, count(DISTINCT oc.id) AS matches
        FROM catalog_oem_crossref oc
        JOIN catalog_unified cu ON cu.sku = oc.sku
        WHERE oc.product_id IS NULL
        GROUP BY oc.source
        ORDER BY matches DESC;
      `,
    },
    {
      key: 'B. exact sku = cu.vendor_sku',
      sql: `
        SELECT COALESCE(oc.source, '(null)') AS source, count(DISTINCT oc.id) AS matches
        FROM catalog_oem_crossref oc
        JOIN catalog_unified cu ON cu.vendor_sku = oc.sku
        WHERE oc.product_id IS NULL
        GROUP BY oc.source
        ORDER BY matches DESC;
      `,
    },
    {
      key: 'C. VT- prefix added = cu.sku',
      sql: `
        SELECT COALESCE(oc.source, '(null)') AS source, count(DISTINCT oc.id) AS matches
        FROM catalog_oem_crossref oc
        JOIN catalog_unified cu ON cu.sku = ('VT-' || oc.sku)
        WHERE oc.product_id IS NULL
        GROUP BY oc.source
        ORDER BY matches DESC;
      `,
    },
    {
      key: 'D. normalized sku vs normalized cu.sku (strip dash/space, upper)',
      sql: `
        SELECT COALESCE(oc.source, '(null)') AS source, count(DISTINCT oc.id) AS matches
        FROM catalog_oem_crossref oc
        JOIN catalog_unified cu
          ON upper(regexp_replace(cu.sku, '[\\s-]', '', 'g')) = upper(regexp_replace(oc.sku, '[\\s-]', '', 'g'))
        WHERE oc.product_id IS NULL
        GROUP BY oc.source
        ORDER BY matches DESC;
      `,
    },
    {
      key: 'E. normalized sku vs normalized cu.vendor_sku',
      sql: `
        SELECT COALESCE(oc.source, '(null)') AS source, count(DISTINCT oc.id) AS matches
        FROM catalog_oem_crossref oc
        JOIN catalog_unified cu
          ON upper(regexp_replace(cu.vendor_sku, '[\\s-]', '', 'g')) = upper(regexp_replace(oc.sku, '[\\s-]', '', 'g'))
        WHERE oc.product_id IS NULL
        GROUP BY oc.source
        ORDER BY matches DESC;
      `,
    },
    {
      key: 'F. oem_number found in cu.oem_numbers[] (Eastern-style) — FIXED, distinct oc.id',
      sql: `
        SELECT COALESCE(oc.source, '(null)') AS source, count(DISTINCT oc.id) AS matches
        FROM catalog_oem_crossref oc
        JOIN catalog_unified cu ON oc.oem_number = ANY(cu.oem_numbers)
        WHERE oc.product_id IS NULL
        GROUP BY oc.source
        ORDER BY matches DESC;
      `,
    },
  ];

  for (const s of strategies) {
    console.log(`\n=== ${s.key} ===\n`);
    const { rows } = await pool.query(s.sql);
    if (rows.length === 0) {
      console.log('  no matches');
    } else {
      for (const r of rows) console.log(`  ${r.source.padEnd(20)} ${r.matches}`);
    }
  }

  console.log('\n=== Combined: rows matched by ANY strategy vs still fully unmatched ===\n');
  const { rows: combined } = await pool.query(`
    WITH matched_ids AS (
      SELECT DISTINCT oc.id
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu ON cu.sku = oc.sku
      WHERE oc.product_id IS NULL
      UNION
      SELECT DISTINCT oc.id
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu ON cu.vendor_sku = oc.sku
      WHERE oc.product_id IS NULL
      UNION
      SELECT DISTINCT oc.id
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu ON cu.sku = ('VT-' || oc.sku)
      WHERE oc.product_id IS NULL
      UNION
      SELECT DISTINCT oc.id
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu
        ON upper(regexp_replace(cu.sku, '[\\s-]', '', 'g')) = upper(regexp_replace(oc.sku, '[\\s-]', '', 'g'))
      WHERE oc.product_id IS NULL
      UNION
      SELECT DISTINCT oc.id
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu
        ON upper(regexp_replace(cu.vendor_sku, '[\\s-]', '', 'g')) = upper(regexp_replace(oc.sku, '[\\s-]', '', 'g'))
      WHERE oc.product_id IS NULL
      UNION
      SELECT DISTINCT oc.id
      FROM catalog_oem_crossref oc
      JOIN catalog_unified cu ON oc.oem_number = ANY(cu.oem_numbers)
      WHERE oc.product_id IS NULL
    )
    SELECT
      COALESCE(oc.source, '(null)') AS source,
      count(*) AS total_orphaned,
      count(*) FILTER (WHERE oc.id IN (SELECT id FROM matched_ids)) AS matched_by_any,
      count(*) FILTER (WHERE oc.id NOT IN (SELECT id FROM matched_ids)) AS still_unmatched
    FROM catalog_oem_crossref oc
    WHERE oc.product_id IS NULL
    GROUP BY oc.source
    ORDER BY total_orphaned DESC;
  `);
  for (const r of combined) {
    console.log(`  ${r.source.padEnd(20)} total=${r.total_orphaned}  matched=${r.matched_by_any}  still_unmatched=${r.still_unmatched}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
