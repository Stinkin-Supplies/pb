require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const WPS_KEY = process.env.WPS_API_KEY;
const PAGE_SIZE = 100;

// ─────────────────────────────────────────────
// STEP 1: Fetch one page from WPS API
// ─────────────────────────────────────────────
async function fetchPage(cursor = null) {
  const url = new URL('https://api.wps-inc.com/items');
  url.searchParams.set('page[size]', PAGE_SIZE);
  url.searchParams.set('include', 'images,inventory,brand');
  if (cursor) url.searchParams.set('page[cursor]', cursor);

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${WPS_KEY}`,
      'Accept': 'application/json',
    }
  });

  if (!res.ok) throw new Error(`WPS API error: ${res.status} - ${await res.text()}`);
  return res.json();
}

// ─────────────────────────────────────────────
// STEP 2: Upsert one product row
// ─────────────────────────────────────────────
async function upsertProduct(client, item) {
  await client.query(`
    INSERT INTO vendor.vendor_products (
      id,
      vendor_code,
      vendor_part_number,
      manufacturer_part_number,
      title,
      description_raw,
      brand,
      categories_raw,
      attributes_raw,
      msrp,
      map_price,
      wholesale_cost,
      drop_ship_fee,
      images_raw,
      fitment_raw,
      weight,
      length,
      width,
      height,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(), 'wps',
      $1, $2, $3, $4, $5,
      $6::jsonb, $7::jsonb,
      $8, $9, $10, $11,
      $12::jsonb, $13::jsonb,
      $14, $15, $16, $17,
      NOW(), NOW()
    )
    ON CONFLICT (vendor_part_number) DO UPDATE SET
      title            = EXCLUDED.title,
      description_raw  = EXCLUDED.description_raw,
      msrp             = EXCLUDED.msrp,
      map_price        = EXCLUDED.map_price,
      wholesale_cost   = EXCLUDED.wholesale_cost,
      images_raw       = EXCLUDED.images_raw,
      updated_at       = NOW()
  `, [
    item.sku,                                         // $1  vendor_part_number
    item.supplier_product_id ?? item.sku,             // $2  manufacturer_part_number
    item.name,                                        // $3  title
    null,                                             // $4  description_raw (not in items endpoint)
    item.brand?.name ?? null,                         // $5  brand (requires include=brand)
    JSON.stringify([]),                               // $6  categories_raw
    JSON.stringify({}),                               // $7  attributes_raw
    item.list_price ?? null,                          // $8  msrp
    item.mapp_price ?? null,                          // $9  map_price  ← was item.map_price
    item.standard_dealer_price ?? null,               // $10 wholesale_cost  ← was item.cost
    item.drop_ship_fee ?? 0,                          // $11 drop_ship_fee
    JSON.stringify(item.images ?? []),                // $12 images_raw
    JSON.stringify([]),                               // $13 fitment_raw (separate endpoint)
    item.weight ?? null,                              // $14 weight
    item.length ?? null,                              // $15 length
    item.width  ?? null,                              // $16 width
    item.height ?? null,                              // $17 height
  ]);
}

// ─────────────────────────────────────────────
// STEP 3: Log sync result
// ─────────────────────────────────────────────
async function logSync(client, stats) {
  await client.query(`
    INSERT INTO vendor.vendor_sync_log
      (id, vendor_code, sync_type, status, rows_inserted, rows_failed, started_at, completed_at, notes)
    VALUES
      (gen_random_uuid(), 'wps', 'full_catalog', $1, $2, $3, $4, NOW(), $5)
  `, [
    stats.status,
    stats.inserted,
    stats.failed,
    stats.startedAt,
    stats.notes,
  ]);
}

// ─────────────────────────────────────────────
// MAIN: Cursor-paginated ingestion loop
// ─────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  const startedAt = new Date();
  let cursor = null;
  let page = 0;
  let inserted = 0;
  let failed = 0;

  console.log('▶  Starting WPS catalog ingestion...\n');

  try {
    do {
      const data = await fetchPage(cursor);
      const items = data.data ?? [];
      cursor = data.meta?.cursor?.next ?? null;
      page++;

      for (const item of items) {
        try {
          await upsertProduct(client, item);
          inserted++;
        } catch (err) {
          failed++;
          // Log the failure row
          await client.query(`
            INSERT INTO vendor.vendor_error_log
              (id, vendor_code, vendor_part_number, error_type, error_message, created_at)
            VALUES
              (gen_random_uuid(), 'wps', $1, 'insert_failed', $2, NOW())
          `, [item.sku ?? 'unknown', err.message]);
        }
      }

      console.log(`  Page ${page} | inserted: ${inserted} | failed: ${failed} | next: ${cursor ?? 'DONE'}`);

    } while (cursor !== null);

    // Write sync log
    await logSync(client, {
      status: failed === 0 ? 'success' : 'partial',
      inserted,
      failed,
      startedAt,
      notes: `${page} pages processed. ${failed} errors.`,
    });

    console.log(`\n✅  Done — ${inserted} products ingested, ${failed} errors`);

  } catch (err) {
    await logSync(client, {
      status: 'failed',
      inserted,
      failed,
      startedAt,
      notes: err.message,
    });
    console.error('\n❌  Sync failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
