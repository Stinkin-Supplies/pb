/**
 * Build Catalog Allowlist for Typesense Indexing
 * Filters products to only include Tire, Oldbook, and Fatbook catalogs
 */

import dotenv from 'dotenv';
import { sql } from '../lib/db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true });

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m${String(r).padStart(2, '0')}s`;
}

/**
 * Check if item has any target catalog
 */
function hasTargetCatalog(item) {
  const fatbook = item.fatbook_catalog?.trim();
  const fatbookMid = item.fatbook_midyear_catalog?.trim();
  const tire = item.tire_catalog?.trim();
  const oldbook = item.oldbook_catalog?.trim();
  const oldbookMid = item.oldbook_midyear_catalog?.trim();

  return fatbook || fatbookMid || tire || oldbook || oldbookMid;
}

/**
 * Get all catalog sources for an item
 */
function getCatalogSources(item) {
  const sources = [];

  if (item.fatbook_catalog?.trim()) {
    sources.push({ source: 'pu_fatbook', catalog: 'PU Fatbook' });
  }
  if (item.fatbook_midyear_catalog?.trim()) {
    sources.push({ source: 'pu_fatbook_midyear', catalog: 'PU Fatbook Mid-Year' });
  }
  if (item.tire_catalog?.trim()) {
    sources.push({ source: 'pu_tire', catalog: 'PU Tire/Service' });
  }
  if (item.oldbook_catalog?.trim()) {
    sources.push({ source: 'pu_oldbook', catalog: 'PU Oldbook' });
  }
  if (item.oldbook_midyear_catalog?.trim()) {
    sources.push({ source: 'pu_oldbook_midyear', catalog: 'PU Oldbook Mid-Year' });
  }

  return sources;
}

async function buildAllowlist() {
  console.log('🏗️  Building Catalog Allowlist...\n');
  console.log('Target catalogs: Fatbook, Fatbook Mid-Year, Tire, Oldbook, Oldbook Mid-Year\n');
  const t0 = Date.now();

  // Clear existing allowlist (table is created in migrations-100-110.sql)
  console.log('Clearing existing allowlist...');
  await sql`TRUNCATE TABLE catalog_allowlist`;

  // Get all dealer price batches
  console.log('Fetching dealer price data...');
  const batches = await sql`
    SELECT source_file, payload
    FROM raw_vendor_pu
    WHERE source_file LIKE 'dealerprice_batch_%'
    ORDER BY source_file
  `;

  console.log(`Found ${batches.length} batches to process\n`);

  const totalRows = batches.reduce((sum, b) => sum + (b.payload?.length || 0), 0);

  const allowlistEntries = [];
  const skuSet = new Set();
  let processedRows = 0;
  let matchedRows = 0;

  for (const batch of batches) {
    const items = batch.payload || [];

    for (const item of items) {
      processedRows++;

      if (!hasTargetCatalog(item)) {
        continue;
      }

      const sku = item.part_number?.trim();
      if (!sku) continue;

      matchedRows++;
      skuSet.add(sku);

      const sources = getCatalogSources(item);
      for (const src of sources) {
        allowlistEntries.push({
          sku,
          source: src.source,
          catalog: src.catalog,
        });
      }
    }

    if (processedRows % 20000 === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const rate = processedRows / Math.max(1, elapsed);
      const pct = totalRows > 0 ? (processedRows / totalRows) * 100 : 0;
      const eta = rate > 0 ? (totalRows - processedRows) / rate : Infinity;
      process.stdout.write(
        `\r  ${processedRows.toLocaleString()}/${totalRows.toLocaleString()} (${pct.toFixed(1)}%)` +
          ` | Matched: ${matchedRows.toLocaleString()} | Unique SKUs: ${skuSet.size.toLocaleString()}` +
          ` | ${rate.toFixed(0)}/s | ETA ${formatEta(eta)}`
      );
    }
  }

  console.log('\n');
  console.log(`✓ Processing complete`);
  console.log(`  Total rows processed: ${processedRows}`);
  console.log(`  Rows in target catalogs: ${matchedRows}`);
  console.log(`  Unique SKUs: ${skuSet.size}`);
  console.log(`  Total allowlist entries: ${allowlistEntries.length}`);

  // Insert in batches
  console.log('\nInserting into catalog_allowlist...');

  const BATCH_SIZE = 1000;
  let inserted = 0;
  let insertErrors = 0;

  for (let i = 0; i < allowlistEntries.length; i += BATCH_SIZE) {
    const batch = allowlistEntries.slice(i, i + BATCH_SIZE);

    try {
      for (const row of batch) {
        await sql`
          INSERT INTO catalog_allowlist (sku, source, catalog, created_at)
          VALUES (${row.sku}, ${row.source}, ${row.catalog}, NOW())
          ON CONFLICT (sku, source) DO UPDATE
            SET catalog = EXCLUDED.catalog, created_at = NOW()
        `;
      }
      inserted += batch.length;
      process.stdout.write(`\r  Inserted: ${inserted}/${allowlistEntries.length}`);
    } catch (e) {
      console.error(`Batch insert error:`, e.message);
      insertErrors++;
    }
  }

  console.log('\n');
  console.log('✅ Allowlist build complete!');
  console.log(`  Entries inserted: ${inserted}`);
  console.log(`  Errors: ${insertErrors}`);

  // Show catalog breakdown
  console.log('\n📊 Catalog Breakdown:');
  const breakdown = await sql`
    SELECT catalog, COUNT(*)::int AS count
    FROM catalog_allowlist
    GROUP BY catalog
  `;
  for (const row of breakdown.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))) {
    console.log(`  ${row.catalog}: ${Number(row.count).toLocaleString()} entries`);
  }

  // Show unique SKU count
  const unique = await sql`SELECT COUNT(DISTINCT sku)::int AS count FROM catalog_allowlist`;
  console.log(`\n  Total unique SKUs in allowlist: ${unique?.[0]?.count ?? skuSet.size}`);
}

buildAllowlist().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
