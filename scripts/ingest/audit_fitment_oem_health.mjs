#!/usr/bin/env node
/**
 * audit_fitment_oem_health.mjs
 *
 * Read-only, catalog-wide health check across two axes:
 *
 *   1. FITMENT COMPLETENESS
 *      - Coverage by vendor (products with ANY fitment signal vs none)
 *      - DRIFT check: catalog_unified's flat fitment columns
 *        (is_harley_fitment, fitment_year_start/end, fitment_hd_families,
 *        fitment_hd_models, fitment_hd_codes, fitment_year_ranges) vs the
 *        real source of truth, catalog_fitment_v2. This is the exact bug
 *        class from session 68 (0% populated catalog-wide) — this checks
 *        whether it's stayed in sync since, since sync_fitment_flat_columns.mjs
 *        has to be re-run manually after anything writes to catalog_fitment_v2
 *        and nothing automates that yet.
 *
 *   2. OEM NUMBER COMPLETENESS
 *      - catalog_unified.oem_numbers[] populated vs catalog_oem_crossref
 *        having rows for that product — checked BOTH directions, since a
 *        mismatch either way means something isn't reaching the frontend:
 *          a) oem_numbers[] non-empty but crossref has zero rows for it
 *             (crossref import missed it, or a stale array from before
 *             a product/OEM got delinked)
 *          b) crossref has rows for a product but oem_numbers[] is empty
 *             (browse.ts's `unnest(cu.oem_numbers)` OEM search and any UI
 *             reading oem_numbers[] directly would both miss it, even
 *             though the OEM tab on PDP — sourced from crossref directly —
 *             would still show it correctly)
 *
 * Everything below is my best reconstruction of your schema from the
 * handoff docs — column/table names may need small adjustments. Nothing
 * here writes. Safe to run as-is.
 *
 * Usage:
 *   node scripts/ingest/audit_fitment_oem_health.mjs
 *   node scripts/ingest/audit_fitment_oem_health.mjs --vendor=PU
 *   node scripts/ingest/audit_fitment_oem_health.mjs --export
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
try { require('dotenv').config({ path: new URL('../../.env.local', import.meta.url).pathname }); } catch {}
try { require('dotenv').config({ path: new URL('../../.env', import.meta.url).pathname }); } catch {}

const { Pool } = pg;
const args = process.argv.slice(2);
const EXPORT = args.includes('--export');
const vendorArg = args.find((a) => a.startsWith('--vendor='));
const VENDOR_FILTER = vendorArg ? vendorArg.split('=')[1].toUpperCase() : null;

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not set — check .env.local/.env at the project root.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function bar(title) {
  console.log('\n' + '='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}

async function fitmentCoverageByVendor() {
  bar('1. FITMENT COVERAGE BY VENDOR (excl. apparel/tools/chemicals)');

  const { rows } = await pool.query(`
    SELECT
      source_vendor,
      count(*) AS total_active,
      count(*) FILTER (
        WHERE is_harley_fitment = true
           OR is_universal = true
           OR fitment_hd_models IS NOT NULL AND array_length(fitment_hd_models, 1) > 0
           OR fitment_year_start IS NOT NULL
           OR EXISTS (
                SELECT 1 FROM catalog_fitment_v2 cf
                WHERE cf.product_id = cu.id
              )
      ) AS has_fitment_signal,
      count(*) FILTER (
        WHERE NOT (
          is_harley_fitment = true
          OR is_universal = true
          OR (fitment_hd_models IS NOT NULL AND array_length(fitment_hd_models, 1) > 0)
          OR fitment_year_start IS NOT NULL
        )
        AND NOT EXISTS (
              SELECT 1 FROM catalog_fitment_v2 cf
              WHERE cf.product_id = cu.id
            )
        AND display_category NOT IN ('Riding Gear & Apparel', 'Tools & Chemicals')
      ) AS true_gap
    FROM catalog_unified cu
    WHERE is_active = true
      ${VENDOR_FILTER ? 'AND source_vendor = $1' : ''}
    GROUP BY source_vendor
    ORDER BY source_vendor;
  `, VENDOR_FILTER ? [VENDOR_FILTER] : []);

  for (const r of rows) {
    const pct = ((r.has_fitment_signal / r.total_active) * 100).toFixed(1);
    console.log(
      `  ${r.source_vendor.padEnd(8)} total=${String(r.total_active).padStart(6)}  ` +
      `has_signal=${String(r.has_fitment_signal).padStart(6)} (${pct}%)  ` +
      `true_gap=${r.true_gap}`
    );
  }
  return rows;
}

async function flatColumnDriftCheck() {
  bar('2. FLAT FITMENT COLUMN DRIFT (catalog_fitment_v2 has data, flat columns say no fitment)');
  console.log('This is the session-68 bug class — checks if sync_fitment_flat_columns.mjs is stale.\n');

  const { rows } = await pool.query(`
    SELECT cu.source_vendor, count(DISTINCT cu.id) AS drifted_products
    FROM catalog_unified cu
    JOIN catalog_fitment_v2 cf ON cf.product_id = cu.id
    WHERE cu.is_active = true
      AND cu.is_harley_fitment IS NOT TRUE
      AND (cu.fitment_hd_models IS NULL OR array_length(cu.fitment_hd_models, 1) IS NULL)
      AND cu.fitment_year_start IS NULL
      ${VENDOR_FILTER ? 'AND cu.source_vendor = $1' : ''}
    GROUP BY cu.source_vendor
    ORDER BY drifted_products DESC;
  `, VENDOR_FILTER ? [VENDOR_FILTER] : []);

  if (rows.length === 0) {
    console.log('  ✅ No drift found — flat columns match catalog_fitment_v2.');
  } else {
    let total = 0;
    for (const r of rows) {
      console.log(`  ${r.source_vendor.padEnd(8)} ${r.drifted_products} products have real fitment rows but flat columns show none`);
      total += Number(r.drifted_products);
    }
    console.log(`\n  ⚠️  ${total} total products need sync_fitment_flat_columns.mjs re-run.`);
  }
  return rows;
}

async function oemNumberConsolidationCheck() {
  bar('3. OEM NUMBER CONSOLIDATION (catalog_unified.oem_numbers[] vs catalog_oem_crossref)');

  // Direction A: oem_numbers[] populated, but crossref has nothing for this product
  const { rows: gapA } = await pool.query(`
    SELECT cu.source_vendor, count(*) AS products
    FROM catalog_unified cu
    WHERE cu.is_active = true
      AND cu.oem_numbers IS NOT NULL
      AND array_length(cu.oem_numbers, 1) > 0
      AND NOT EXISTS (
        SELECT 1 FROM catalog_oem_crossref oc WHERE oc.product_id = cu.id
      )
      ${VENDOR_FILTER ? 'AND cu.source_vendor = $1' : ''}
    GROUP BY cu.source_vendor
    ORDER BY products DESC;
  `, VENDOR_FILTER ? [VENDOR_FILTER] : []);

  console.log('\n  (a) oem_numbers[] populated but ZERO catalog_oem_crossref rows:');
  if (gapA.length === 0) console.log('      ✅ none');
  for (const r of gapA) console.log(`      ${r.source_vendor.padEnd(8)} ${r.products} products`);

  // Direction B: crossref has rows, but oem_numbers[] is empty/null
  const { rows: gapB } = await pool.query(`
    SELECT cu.source_vendor, count(DISTINCT cu.id) AS products
    FROM catalog_unified cu
    JOIN catalog_oem_crossref oc ON oc.product_id = cu.id
    WHERE cu.is_active = true
      AND (cu.oem_numbers IS NULL OR array_length(cu.oem_numbers, 1) IS NULL)
      ${VENDOR_FILTER ? 'AND cu.source_vendor = $1' : ''}
    GROUP BY cu.source_vendor
    ORDER BY products DESC;
  `, VENDOR_FILTER ? [VENDOR_FILTER] : []);

  console.log('\n  (b) catalog_oem_crossref has rows but oem_numbers[] is empty:');
  if (gapB.length === 0) console.log('      ✅ none');
  for (const r of gapB) console.log(`      ${r.source_vendor.padEnd(8)} ${r.products} products (browse.ts OEM search + any UI reading oem_numbers[] directly will miss these — PDP OEM tab still fine, it reads crossref directly)`);

  return { gapA, gapB };
}

async function typesenseFieldSpotCheck() {
  bar('4. SPOT-CHECK: sample products for manual PDP verification');
  console.log('Pulls 10 random active products WITH crossref rows so you can manually');
  console.log('load their PDPs and confirm the OEM tab actually renders the numbers.\n');

  const { rows } = await pool.query(`
    SELECT cu.id, cu.sku, cu.slug, cu.name, cu.source_vendor,
           array_agg(DISTINCT oc.oem_number) AS crossref_oem_numbers,
           cu.oem_numbers AS flat_oem_numbers
    FROM catalog_unified cu
    JOIN catalog_oem_crossref oc ON oc.product_id = cu.id
    WHERE cu.is_active = true
      ${VENDOR_FILTER ? 'AND cu.source_vendor = $1' : ''}
    GROUP BY cu.id
    ORDER BY random()
    LIMIT 10;
  `, VENDOR_FILTER ? [VENDOR_FILTER] : []);

  for (const r of rows) {
    console.log(`  /browse/${r.slug}  [${r.source_vendor} ${r.sku}]`);
    console.log(`      crossref: ${JSON.stringify(r.crossref_oem_numbers)}`);
    console.log(`      flat oem_numbers[]: ${JSON.stringify(r.flat_oem_numbers)}`);
    if (JSON.stringify(r.crossref_oem_numbers?.sort()) !== JSON.stringify(r.flat_oem_numbers?.sort())) {
      console.log('      ⚠️  MISMATCH between crossref and flat array');
    }
    console.log('');
  }
  return rows;
}

async function main() {
  const fitmentRows = await fitmentCoverageByVendor();
  const driftRows = await flatColumnDriftCheck();
  const oemGaps = await oemNumberConsolidationCheck();
  const spotCheck = await typesenseFieldSpotCheck();

  if (EXPORT) {
    const outDir = path.join(process.cwd(), 'audit_output');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(outDir, `fitment_oem_health_${ts}.json`);
    fs.writeFileSync(outPath, JSON.stringify({ fitmentRows, driftRows, oemGaps, spotCheck }, null, 2));
    console.log(`\nExported full results to ${outPath}`);
  }

  bar('DONE');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
