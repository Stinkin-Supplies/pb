#!/usr/bin/env node
/**
 * sync_oem_numbers_from_crossref.mjs
 *
 * Fixes gap (b) from audit_fitment_oem_health.mjs: catalog_oem_crossref has
 * OEM numbers for a product that catalog_unified.oem_numbers[] is missing
 * (either entirely empty, or only partially populated — the spot-check
 * caught cases like 24040110 where crossref had 3 numbers and the flat
 * array only had 2).
 *
 * ADDITIVE MERGE, not overwrite: new array = (existing oem_numbers[] minus
 * literal "-") UNION (crossref oem_numbers for that product, excluding
 * null/empty/literal "-"). Nothing that's currently in oem_numbers[] gets
 * dropped except an exact "-" entry — per explicit instruction, only that
 * literal value is being cleaned, nothing fuzzier without manual review.
 *
 * Also prints (but does NOT touch) a report of OEM values in crossref that
 * look questionable beyond the literal "-" case — e.g. very short strings,
 * or values with a trailing "+N" suffix like "56525-02 +6" seen in the
 * audit spot-check — so you can eyeball them before deciding what, if
 * anything, to do about that class of value.
 *
 * DRY RUN BY DEFAULT. Pass --apply to write.
 *
 * Usage:
 *   node scripts/ingest/sync_oem_numbers_from_crossref.mjs
 *   node scripts/ingest/sync_oem_numbers_from_crossref.mjs --vendor=PU
 *   node scripts/ingest/sync_oem_numbers_from_crossref.mjs --apply
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

async function findMerges(client) {
  const { rows } = await client.query(`
    WITH crossref_agg AS (
      SELECT
        product_id,
        array_agg(DISTINCT oem_number) FILTER (
          WHERE oem_number IS NOT NULL
            AND trim(oem_number) != ''
            AND oem_number != '-'
            -- length>2 alone correctly separates real OEM numbers (including
            -- legitimate "+N" size/length suffixes like "A-25581-70+5" or
            -- "38607-87A +6" — confirmed real data, not junk) from true
            -- junk tokens ("5", "N", ".", "35", "56" — all <=2 chars,
            -- confirmed junk, deleted at the source by delete_oem_junk_tokens.mjs)
            AND length(trim(oem_number)) > 2
        ) AS crossref_numbers
      FROM catalog_oem_crossref
      GROUP BY product_id
    ),
    merged AS (
      SELECT
        cu.id,
        cu.sku,
        cu.source_vendor,
        cu.oem_numbers AS old_numbers,
        COALESCE(
          (
            SELECT array_agg(DISTINCT val ORDER BY val)
            FROM unnest(
              array_remove(COALESCE(cu.oem_numbers, ARRAY[]::text[]), '-')
              || COALESCE(ca.crossref_numbers, ARRAY[]::text[])
            ) AS val
          ),
          ARRAY[]::text[]
        ) AS new_numbers_sorted,
        -- old, sorted the same way, purely for comparison — NOT what gets written
        COALESCE(
          (SELECT array_agg(DISTINCT val ORDER BY val)
           FROM unnest(array_remove(COALESCE(cu.oem_numbers, ARRAY[]::text[]), '-')) AS val),
          ARRAY[]::text[]
        ) AS old_numbers_sorted
      FROM catalog_unified cu
      LEFT JOIN crossref_agg ca ON ca.product_id = cu.id
      WHERE cu.is_active = true
        ${VENDOR_FILTER ? 'AND cu.source_vendor = $1' : ''}
    )
    SELECT id, sku, source_vendor, old_numbers, new_numbers_sorted AS new_numbers
    FROM merged
    WHERE old_numbers_sorted IS DISTINCT FROM new_numbers_sorted
    ORDER BY id;
  `, VENDOR_FILTER ? [VENDOR_FILTER] : []);
  return rows;
}

async function junkReport(client) {
  // Informational: should be empty after delete_oem_junk_tokens.mjs --apply
  // has run. All <=2-char tokens are now confirmed junk, not pending review.
  const { rows } = await client.query(`
    SELECT oem_number, count(*) AS occurrences
    FROM catalog_oem_crossref
    WHERE oem_number IS NOT NULL
      AND oem_number != '-'
      AND length(trim(oem_number)) <= 2
    GROUP BY oem_number
    ORDER BY occurrences DESC
    LIMIT 30;
  `);
  return rows;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log(APPLY ? 'MODE: APPLY (will update)' : 'MODE: DRY RUN (no writes)');

    const merges = await findMerges(client);
    console.log(`\nFound ${merges.length} products needing an oem_numbers[] merge.\n`);

    const sample = merges.slice(0, 15);
    for (const r of sample) {
      console.log(`  [${r.source_vendor}] id=${r.id} sku=${r.sku}`);
      console.log(`    old: ${JSON.stringify(r.old_numbers)}`);
      console.log(`    new: ${JSON.stringify(r.new_numbers)}`);
    }
    if (merges.length > sample.length) {
      console.log(`  ...and ${merges.length - sample.length} more (see export/CSV).`);
    }

    console.log('\n--- Remaining junk check (should be empty if delete_oem_junk_tokens.mjs already ran) ---');
    const junk = await junkReport(client);
    if (junk.length === 0) {
      console.log('  none found beyond the literal "-" case');
    } else {
      for (const j of junk) {
        console.log(`  "${j.oem_number}" — ${j.occurrences} occurrence(s)`);
      }
      console.log('\n  These were NOT modified. Review and tell me what to do with this class of value.');
    }

    // Always write a CSV of the merge plan, dry-run or not, for your own review.
    const outDir = path.join(process.cwd(), 'audit_output');
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(outDir, `oem_numbers_merge_${APPLY ? 'applied' : 'dryrun'}_${ts}.csv`);
    const csvLines = ['id,sku,source_vendor,old_numbers,new_numbers'];
    for (const r of merges) {
      csvLines.push([
        r.id,
        r.sku,
        r.source_vendor,
        JSON.stringify(r.old_numbers ?? []).replace(/"/g, '""'),
        JSON.stringify(r.new_numbers ?? []).replace(/"/g, '""'),
      ].join(','));
    }
    fs.writeFileSync(csvPath, csvLines.join('\n'));
    console.log(`\nWritten: ${csvPath}`);

    if (!APPLY) {
      console.log('\nDry run only — no rows updated. Review the CSV, then re-run with --apply.');
      return;
    }

    console.log('\nApplying updates...');
    await client.query('BEGIN');
    let updated = 0;
    for (const r of merges) {
      await client.query(
        `UPDATE catalog_unified SET oem_numbers = $1 WHERE id = $2`,
        [r.new_numbers, r.id]
      );
      updated++;
    }
    await client.query('COMMIT');
    console.log(`✅ Updated ${updated} products.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
