/**
 * import_vtwin_fitment_rescrape.mjs
 *
 * Upserts a fresh VTwin scrape (/Users/home/Desktop/vtwin_scraper/vtwin_scraper/vtwin_fitment.csv,
 * 19,669 rows) into vtwin_scrape_data. Same schema as the existing table --
 * this is a re-scrape, not a new source format. Diffed against the current
 * table first: 1,833 SKUs are genuinely new (not previously scraped at all),
 * 17,760 already existed with fitment data (re-scrape of already-known
 * data), 1 SKU gained fitment where it had none before.
 *
 * ON CONFLICT (sku) DO UPDATE always takes the new scrape's data --
 * acceptable here since this is a same-source refresh, not a different
 * vendor/document being reconciled against an existing one.
 *
 * After this runs, re-run scripts/ingest/promote_vtwin_scrape_fitment.mjs
 * (idempotent, ON CONFLICT DO NOTHING against catalog_fitment_v2) to turn
 * newly-added fitment_raw rows into catalog_fitment_v2 rows.
 *
 * Usage:
 *   node scripts/ingest/import_vtwin_fitment_rescrape.mjs           # dry run
 *   node scripts/ingest/import_vtwin_fitment_rescrape.mjs --apply   # writes
 */
'use strict';

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const CSV_PATH = '/Users/home/Desktop/vtwin_scraper/vtwin_scraper/vtwin_fitment.csv';
const BATCH = 500;

const pool = new pg.Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function chunks(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function run() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
  console.log(`Parsed ${rows.length} rows from ${CSV_PATH}`);

  const usable = rows.filter(r => r.sku && r.sku.trim() && r.source === 'product_page');
  console.log(`Usable (source='product_page'): ${usable.length}  (skipped ${rows.length - usable.length} not_found/blank rows)`);

  if (!APPLY) {
    console.log('\nSample:');
    for (const r of usable.slice(0, 3)) {
      console.log(`  ${r.sku}: fitment_raw="${r.fitment_raw}"`);
    }
    console.log('\nDry run -- no writes made. Re-run with --apply to upsert into vtwin_scrape_data.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  let upserted = 0;
  try {
    for (const batch of chunks(usable, BATCH)) {
      await client.query('BEGIN');
      for (const r of batch) {
        await client.query(
          `INSERT INTO vtwin_scrape_data
             (sku, product_name, product_url, price_raw, oem_no, fitment_raw, description, uom, finish, manufacturer, origin, catalog_pages, replacement_items, tech_note, extra_attributes, scraped_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
           ON CONFLICT (sku) DO UPDATE SET
             product_name = EXCLUDED.product_name,
             product_url = EXCLUDED.product_url,
             price_raw = EXCLUDED.price_raw,
             oem_no = EXCLUDED.oem_no,
             fitment_raw = EXCLUDED.fitment_raw,
             description = EXCLUDED.description,
             uom = EXCLUDED.uom,
             finish = EXCLUDED.finish,
             manufacturer = EXCLUDED.manufacturer,
             origin = EXCLUDED.origin,
             catalog_pages = EXCLUDED.catalog_pages,
             replacement_items = EXCLUDED.replacement_items,
             tech_note = EXCLUDED.tech_note,
             extra_attributes = EXCLUDED.extra_attributes,
             scraped_at = now()`,
          [r.sku, r.product_name || null, r.product_url || null, r.price || null, r.oem_no || null,
           r.fitment_raw || null, r.description || null, r.uom || null, r.finish || null,
           r.manufacturer || null, r.origin || null, r.catalog_pages || null,
           r.replacement_items || null, r.tech_note || null, r.extra_attributes || null]
        );
        upserted++;
      }
      await client.query('COMMIT');
      process.stdout.write(`\r  ${upserted}/${usable.length} upserted`);
    }
    console.log(`\n\nDone. ${upserted} rows upserted into vtwin_scrape_data.`);
    console.log('Next: node scripts/ingest/promote_vtwin_scrape_fitment.mjs --dry   (then without --dry to apply)');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
