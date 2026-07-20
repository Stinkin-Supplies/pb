#!/usr/bin/env node
/**
 * sync_catalog_media.mjs
 *
 * Populates catalog_media (0 rows since the July 18 TRUNCATE incident) from
 * the WPS image export (scripts/data/wps/Catalogs/hdmstr_with_urls.csv --
 * sku, name, brand, supplier_item_id, image_uri, image_width, image_height).
 * catalog_media is the multi-image gallery store -- app/browse/[slug]/page.jsx
 * and app/api/browse/variants/[productId]/route.ts already read from it
 * (COALESCE'd with catalog_unified.image_url/image_urls, which win when
 * present -- this only actually surfaces for products with no image_urls
 * already restored via the Typesense snapshot).
 *
 * Priority: no explicit ordering field in the source file. Rows sharing a
 * sku appear grouped together (confirmed: same supplier_item_id across a
 * sku's rows, just different angles/crops) -- file-encounter order is used
 * as priority (0 = first/primary), matching catalog_media's own
 * idx_catalog_media_priority (ORDER BY priority ASC).
 *
 * Usage:
 *   node sync_catalog_media.mjs            # dry run (default)
 *   node sync_catalog_media.mjs --apply    # writes changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const APPLY = process.argv.includes('--apply');
const IMAGES_CSV = path.join(__dirname, '../data/wps/Catalogs/hdmstr_with_urls.csv');

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set -- check .env.local at the repo root.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

async function main() {
  console.log(`\n═══ sync_catalog_media ═══  [${APPLY ? 'APPLY' : 'DRY RUN'}]\n`);

  if (!fs.existsSync(IMAGES_CSV)) {
    console.error(`Missing images file: ${IMAGES_CSV}`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    console.log('Loading image export...');
    const rows = parse(fs.readFileSync(IMAGES_CSV, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
    console.log(`  ${rows.length} rows loaded`);

    // Assign priority = encounter order within each sku.
    const bySku = new Map();
    for (const row of rows) {
      if (!row.sku || !row.image_uri) continue;
      if (!bySku.has(row.sku)) bySku.set(row.sku, []);
      bySku.get(row.sku).push(row.image_uri);
    }
    console.log(`  ${bySku.size} distinct SKUs with at least one image`);

    console.log('\nMatching against catalog_unified (WPS, active)...');
    const { rows: matches } = await client.query(`
      SELECT id, vendor_sku FROM catalog_unified
      WHERE source_vendor = 'WPS' AND is_active = true AND vendor_sku = ANY($1::text[])
    `, [[...bySku.keys()]]);
    console.log(`  ${matches.length} SKUs matched to an active catalog_unified row`);

    const productItems = []; // { productId, url, priority }
    for (const m of matches) {
      const urls = bySku.get(m.vendor_sku) ?? [];
      urls.forEach((url, i) => productItems.push({ productId: m.id, url, priority: i }));
    }
    console.log(`  ${productItems.length} total (product, image) pairs to write`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
      return;
    }

    // Batched multi-row upserts, not one query per row -- a per-row
    // SAVEPOINT loop against vendor_offers (90k rows) hung indefinitely
    // twice this session at a batch boundary (confirmed via pg_stat_activity
    // as a stuck client-side await, not a Postgres-side timeout). Cutting
    // round trips from one-per-row to one-per-500-rows sidesteps it. See
    // sync_vendor_offers.mjs for the fuller writeup.
    console.log('\nApplying (batched)...');
    const BATCH_SIZE = 500;
    let written = 0, errors = 0;
    for (let i = 0; i < productItems.length; i += BATCH_SIZE) {
      const batch = productItems.slice(i, i + BATCH_SIZE);
      const values = [];
      const params = [];
      batch.forEach((item, j) => {
        values.push(`($${j * 3 + 1}, $${j * 3 + 2}, 'image', $${j * 3 + 3}, 'wps_csv')`);
        params.push(item.productId, item.url, item.priority);
      });
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO catalog_media (product_id, url, media_type, priority, source)
           VALUES ${values.join(',')}
           ON CONFLICT (product_id, url) DO UPDATE SET priority = EXCLUDED.priority`,
          params
        );
        await client.query('COMMIT');
        written += batch.length;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        errors += batch.length;
        if (errors <= 5 * BATCH_SIZE) console.error(`  Batch error at offset ${i}:`, e.message);
      }
      process.stdout.write(`\r  ${written}/${productItems.length}`);
    }
    console.log(`\r  ${written}/${productItems.length} written, ${errors} errors`);

    const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM catalog_media');
    console.log(`\nDone. catalog_media now has ${count} rows.`);
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK').catch(() => {});
    console.error('Fatal error:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
