#!/usr/bin/env node
/**
 * trace_oem_junk_source.mjs
 *
 * Read-only. Traces WHERE the junk OEM values (short tokens, "+N" suffix
 * artifacts) found by sync_oem_numbers_from_crossref.mjs's junk report
 * actually came from — which `source` value in catalog_oem_crossref,
 * and whether they cluster around specific products/vendors.
 *
 * Purpose: this junk is already live in catalog_oem_crossref, which the
 * PDP OEM tab reads directly — so there's a real chance it's user-facing
 * right now. Before deciding to clean it up (delete/fix at the row level,
 * or fix the upstream ingest script that created it), we need to know
 * which import produced it.
 *
 * Usage:
 *   node scripts/ingest/trace_oem_junk_source.mjs
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
  console.log('=== Junk OEM values by source ===\n');
  const { rows: bySource } = await pool.query(`
    SELECT
      source,
      count(*) AS junk_rows,
      count(*) FILTER (WHERE oem_number ~ '\\+\\d') AS plus_n_suffix_rows,
      count(*) FILTER (WHERE length(trim(oem_number)) <= 2) AS short_token_rows
    FROM catalog_oem_crossref
    WHERE oem_number IS NOT NULL
      AND oem_number != '-'
      AND (
        length(trim(oem_number)) <= 2
        OR oem_number ~ '\\+\\d'
        OR oem_number ~ '^\\s|\\s$'
      )
    GROUP BY source
    ORDER BY junk_rows DESC;
  `);
  for (const r of bySource) {
    console.log(`  source=${r.source ?? '(null)'}  total_junk=${r.junk_rows}  "+N"_suffix=${r.plus_n_suffix_rows}  short_token=${r.short_token_rows}`);
  }

  console.log('\n=== Sample: a "+N" suffix product with its OTHER crossref rows for context ===\n');
  const { rows: sample } = await pool.query(`
    SELECT oc.product_id, oc.oem_number, oc.source, cu.sku, cu.name, cu.source_vendor
    FROM catalog_oem_crossref oc
    JOIN catalog_unified cu ON cu.id = oc.product_id
    WHERE oc.oem_number ~ '\\+\\d'
    ORDER BY oc.product_id
    LIMIT 5;
  `);
  for (const s of sample) {
    console.log(`  product_id=${s.product_id} sku=${s.sku} [${s.source_vendor}] "${s.name}"`);
    const { rows: allForProduct } = await pool.query(
      `SELECT oem_number, source FROM catalog_oem_crossref WHERE product_id = $1 ORDER BY oem_number`,
      [s.product_id]
    );
    for (const a of allForProduct) console.log(`      "${a.oem_number}"  (source=${a.source ?? '(null)'})`);
    console.log('');
  }

  console.log('=== Short-token (<=2 char) sample, same context ===\n');
  const { rows: shortSample } = await pool.query(`
    SELECT DISTINCT oc.product_id, oc.oem_number, oc.source, cu.sku, cu.name, cu.source_vendor
    FROM catalog_oem_crossref oc
    JOIN catalog_unified cu ON cu.id = oc.product_id
    WHERE length(trim(oc.oem_number)) <= 2 AND oc.oem_number != '-'
    ORDER BY oc.product_id
    LIMIT 5;
  `);
  for (const s of shortSample) {
    console.log(`  product_id=${s.product_id} sku=${s.sku} [${s.source_vendor}] "${s.name}"`);
    const { rows: allForProduct } = await pool.query(
      `SELECT oem_number, source FROM catalog_oem_crossref WHERE product_id = $1 ORDER BY oem_number`,
      [s.product_id]
    );
    for (const a of allForProduct) console.log(`      "${a.oem_number}"  (source=${a.source ?? '(null)'})`);
    console.log('');
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
