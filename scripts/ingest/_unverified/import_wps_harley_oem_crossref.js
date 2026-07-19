#!/usr/bin/env node
/**
 * import_wps_harley_oem_crossref.js
 * ─────────────────────────────────────────────────────────────
 * Loads wps_harley_oem_cross_reference.csv into catalog_oem_crossref.
 *
 * CSV format: OEM#, WPS#, Vendor, Vend#
 *
 * Strategy:
 *   - Insert all rows into catalog_oem_crossref keyed by WPS SKU
 *   - Skip rows where WPS SKU not in catalog_products (log count)
 *   - After insert, re-aggregate oem_numbers[] on catalog_unified
 * ─────────────────────────────────────────────────────────────
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

const CSV_PATH = path.resolve(__dirname, '../../data/wps_harley_oem_cross_reference.csv');

function progress(tag, current, total, startMs, extra = '') {
  const pct    = total > 0 ? current / total : 0;
  const filled = Math.round(pct * 24);
  const bar    = '█'.repeat(filled) + '░'.repeat(24 - filled);
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  process.stdout.write(`\r[${tag}] │${bar}│ ${(pct*100).toFixed(1)}% (${current}/${total})${extra} | ${elapsed}s`);
}
function done(tag, msg) {
  process.stdout.write('\n');
  console.log(`[${tag}] ✓ ${msg}`);
}

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Split on comma but be careful — OEM numbers can contain commas
    // Format is always: OEM#,WPS#,Vendor,Vend#
    const parts = line.split(',');
    if (parts.length < 4) continue;
    // Last 3 are WPS#, Vendor, Vend# — everything before is OEM#
    const vend  = parts[parts.length - 1].trim();
    const vendor = parts[parts.length - 2].trim();
    const wps   = parts[parts.length - 3].trim();
    const oem   = parts.slice(0, parts.length - 3).join(',').trim();
    if (!oem || !wps) continue;
    rows.push({ oem, wps, vendor, vend });
  }
  return rows;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('\n[WPS-OEM] Loading CSV...');
    const rows = parseCSV(CSV_PATH);
    console.log(`[WPS-OEM] ${rows.length} rows parsed`);

    // ── Stage 1: Insert into catalog_oem_crossref ──
    console.log('[WPS-OEM] Inserting into catalog_oem_crossref...');
    let inserted = 0;
    let skipped  = 0;
    let dupes    = 0;
    const t = Date.now();

    // Batch in groups of 100
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, Math.min(i + BATCH, rows.length));

      for (const row of batch) {
        try {
          const result = await client.query(`
            INSERT INTO catalog_oem_crossref (sku, oem_number, oem_manufacturer, source_file)
            SELECT cp.sku, $2, $3, 'wps_harley_oem_cross_reference.csv'
            FROM catalog_products cp
            WHERE cp.sku = $1
            ON CONFLICT (sku, oem_number, oem_manufacturer) DO NOTHING
          `, [row.wps, row.oem, row.vendor]);

          if (result.rowCount > 0) inserted++;
          else {
            // Check if it was a skip (no product) or dupe
            const { rows: exists } = await client.query(
              `SELECT 1 FROM catalog_products WHERE sku = $1 LIMIT 1`, [row.wps]
            );
            if (exists.length === 0) skipped++;
            else dupes++;
          }
        } catch (err) {
          skipped++;
        }
      }
      progress('WPS-OEM', Math.min(i + BATCH, rows.length), rows.length, t,
        ` inserted:${inserted} skipped:${skipped}`);
    }
    done('WPS-OEM', `${inserted} rows inserted, ${skipped} SKUs not in catalog, ${dupes} dupes skipped`);

    // ── Stage 2: Re-aggregate oem_numbers[] on catalog_unified ──
    console.log('[WPS-OEM] Re-aggregating oem_numbers[] on catalog_unified...');
    const t2 = Date.now();
    await client.query(`
      UPDATE catalog_unified cu
      SET oem_numbers = sub.nums
      FROM (
        SELECT sku, array_agg(DISTINCT oem_number ORDER BY oem_number) AS nums
        FROM catalog_oem_crossref
        GROUP BY sku
      ) sub
      WHERE cu.sku = sub.sku
    `);
    const elapsed2 = ((Date.now() - t2) / 1000).toFixed(1);
    console.log(`[WPS-OEM] ✓ oem_numbers[] re-aggregated (${elapsed2}s)`);

    // ── Summary ──
    const { rows: [summary] } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM catalog_oem_crossref WHERE source_file = 'wps_harley_oem_cross_reference.csv') AS new_crossref_rows,
        (SELECT COUNT(*) FROM catalog_oem_crossref) AS total_crossref_rows,
        (SELECT COUNT(*) FROM catalog_unified WHERE oem_numbers IS NOT NULL AND array_length(oem_numbers,1) > 0) AS products_with_oem
    `);

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║   WPS HARLEY OEM CROSSREF COMPLETE        ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  New crossref rows:   ${String(summary.new_crossref_rows).padEnd(19)} ║`);
    console.log(`║  Total crossref rows: ${String(summary.total_crossref_rows).padEnd(19)} ║`);
    console.log(`║  Products with OEM#:  ${String(summary.products_with_oem).padEnd(19)} ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('\nNext: reindex Typesense to surface new OEM numbers in search\n');

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
