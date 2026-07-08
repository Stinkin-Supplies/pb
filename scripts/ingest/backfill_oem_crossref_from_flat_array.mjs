#!/usr/bin/env node
/**
 * backfill_oem_crossref_from_flat_array.mjs
 *
 * Fixes gap (a) from audit_fitment_oem_health.mjs: catalog_unified.oem_numbers[]
 * has values that were never turned into catalog_oem_crossref rows at all
 * (6,272 PU + 415 WPS per the initial audit). Since these numbers already
 * exist on the product record, this recovers real OEM crossref coverage
 * without needing a new vendor feed — pure backfill from data you already have.
 *
 * Tags every inserted row source='backfill_from_flat_array' so it's fully
 * traceable and reversible independent of every other crossref source
 * (matches the pattern used for bulk_confirm_brand_part_number_proposals.mjs's
 * reviewed_by tag in session 70).
 *
 * Skips the literal "-" placeholder value (confirmed junk, not a real OEM
 * number) — same rule as sync_oem_numbers_from_crossref.mjs. Does NOT
 * attempt to filter anything fuzzier (short strings, "+N" suffixes, etc.)
 * without manual review first.
 *
 * Assumes catalog_oem_crossref has: product_id, sku, oem_number, source,
 * and a UNIQUE(sku, oem_number) constraint (per MasterRef.md/ROADMAP.md —
 * "catalog_oem_crossref joins on sku, unique on (sku, oem_number)"). If
 * your actual column set differs, this will error out cleanly on the
 * INSERT and tell you which column is wrong.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage:
 *   node scripts/ingest/backfill_oem_crossref_from_flat_array.mjs
 *   node scripts/ingest/backfill_oem_crossref_from_flat_array.mjs --vendor=PU
 *   node scripts/ingest/backfill_oem_crossref_from_flat_array.mjs --apply
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
const APPLY = args.includes('--apply');
const vendorArg = args.find((a) => a.startsWith('--vendor='));
const VENDOR_FILTER = vendorArg ? vendorArg.split('=')[1].toUpperCase() : null;

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL not set — check .env.local/.env at the project root.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function findCandidates(client) {
  const { rows } = await client.query(`
    SELECT
      cu.id AS product_id,
      cu.sku,
      cu.source_vendor,
      array_remove(cu.oem_numbers, '-') AS numbers_to_insert
    FROM catalog_unified cu
    WHERE cu.is_active = true
      AND cu.oem_numbers IS NOT NULL
      AND array_length(cu.oem_numbers, 1) > 0
      AND NOT EXISTS (
        SELECT 1 FROM catalog_oem_crossref oc WHERE oc.product_id = cu.id
      )
      ${VENDOR_FILTER ? 'AND cu.source_vendor = $1' : ''}
    ORDER BY cu.id;
  `, VENDOR_FILTER ? [VENDOR_FILTER] : []);
  return rows.filter((r) => r.numbers_to_insert && r.numbers_to_insert.length > 0);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? 'MODE: APPLY (will insert)' : 'MODE: DRY RUN (no writes)');

    const candidates = await findCandidates(client);
    const totalRows = candidates.reduce((sum, c) => sum + c.numbers_to_insert.length, 0);
    console.log(`\n${candidates.length} products with no crossref rows, ${totalRows} OEM numbers to insert.\n`);

    for (const c of candidates.slice(0, 15)) {
      console.log(`  [${c.source_vendor}] product_id=${c.product_id} sku=${c.sku} → ${JSON.stringify(c.numbers_to_insert)}`);
    }
    if (candidates.length > 15) console.log(`  ...and ${candidates.length - 15} more (see CSV).`);

    const outDir = path.join(process.cwd(), 'audit_output');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(outDir, `oem_crossref_backfill_${APPLY ? 'applied' : 'dryrun'}_${ts}.csv`);
    const csvLines = ['product_id,sku,source_vendor,oem_numbers_inserted'];
    for (const c of candidates) {
      csvLines.push([c.product_id, c.sku, c.source_vendor, JSON.stringify(c.numbers_to_insert).replace(/"/g, '""')].join(','));
    }
    fs.writeFileSync(csvPath, csvLines.join('\n'));
    console.log(`\nWritten: ${csvPath}`);

    if (!APPLY) {
      console.log('\nDry run only — no rows inserted. Review the CSV, then re-run with --apply.');
      return;
    }

    console.log('\nInserting...');
    await client.query('BEGIN');
    let inserted = 0;
    let skipped = 0;
    for (const c of candidates) {
      for (const oemNumber of c.numbers_to_insert) {
        try {
          const res = await client.query(
            `INSERT INTO catalog_oem_crossref (product_id, sku, oem_number, source)
             VALUES ($1, $2, $3, 'backfill_from_flat_array')
             ON CONFLICT (sku, oem_number) DO NOTHING`,
            [c.product_id, c.sku, oemNumber]
          );
          if (res.rowCount > 0) inserted++;
          else skipped++;
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`\nInsert failed on product_id=${c.product_id}, oem_number="${oemNumber}":`);
          console.error(err.message);
          console.error('\nThis likely means catalog_oem_crossref\'s actual column set or constraint differs from what this script assumes. Paste this error back and I\'ll fix the query.');
          process.exit(1);
        }
      }
    }
    await client.query('COMMIT');
    console.log(`✅ Inserted ${inserted} rows, ${skipped} already existed (conflict, skipped).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
