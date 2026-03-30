require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const WPS_KEY = process.env.WPS_API_KEY;
const PAGE_SIZE = 100;

async function fetchPage(cursor = null) {
  const url = new URL('https://api.wps-inc.com/items');
  url.searchParams.set('page[size]', PAGE_SIZE);
  url.searchParams.set('include', 'images,inventory,brand,product');
  if (cursor) url.searchParams.set('page[cursor]', cursor);
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${WPS_KEY}`, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`WPS API error: ${res.status} - ${await res.text()}`);
  return res.json();
}

async function upsertProduct(client, item) {
  await client.query(`
    INSERT INTO vendor.vendor_products (
      id, vendor_code,
      vendor_item_id, vendor_product_id,
      vendor_part_number, manufacturer_part_number,
      title, description_raw, brand,
      categories_raw, attributes_raw,
      msrp, map_price, wholesale_cost,
      drop_ship_fee, drop_ship_eligible,
      images_raw, fitment_raw,
      weight, length, width, height,
      upc, superseded_sku,
      status, status_id, product_type, unit_of_measurement,
      has_map_policy, carb, prop_65_code, prop_65_detail,
      country_id,
      published_at, vendor_created_at, vendor_updated_at,
      created_at, updated_at
    ) VALUES (
      gen_random_uuid(), 'wps',
      $1, $2, $3, $4, $5, $6, $7,
      $8::jsonb, $9::jsonb,
      $10, $11, $12, $13, $14,
      $15::jsonb, $16::jsonb,
      $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26,
      $27, $28, $29, $30, $31,
      $32, $33, $34,
      NOW(), NOW()
    )
    ON CONFLICT (vendor_part_number) DO UPDATE SET
      vendor_item_id        = EXCLUDED.vendor_item_id,
      vendor_product_id     = EXCLUDED.vendor_product_id,
      manufacturer_part_number = EXCLUDED.manufacturer_part_number,
      title                 = EXCLUDED.title,
      description_raw       = EXCLUDED.description_raw,
      brand                 = EXCLUDED.brand,
      categories_raw        = EXCLUDED.categories_raw,
      attributes_raw        = EXCLUDED.attributes_raw,
      msrp                  = EXCLUDED.msrp,
      map_price             = EXCLUDED.map_price,
      wholesale_cost        = EXCLUDED.wholesale_cost,
      drop_ship_fee         = EXCLUDED.drop_ship_fee,
      drop_ship_eligible    = EXCLUDED.drop_ship_eligible,
      images_raw            = EXCLUDED.images_raw,
      weight                = EXCLUDED.weight,
      length                = EXCLUDED.length,
      width                 = EXCLUDED.width,
      height                = EXCLUDED.height,
      upc                   = EXCLUDED.upc,
      superseded_sku        = EXCLUDED.superseded_sku,
      status                = EXCLUDED.status,
      status_id             = EXCLUDED.status_id,
      product_type          = EXCLUDED.product_type,
      unit_of_measurement   = EXCLUDED.unit_of_measurement,
      has_map_policy        = EXCLUDED.has_map_policy,
      carb                  = EXCLUDED.carb,
      prop_65_code          = EXCLUDED.prop_65_code,
      prop_65_detail        = EXCLUDED.prop_65_detail,
      country_id            = EXCLUDED.country_id,
      published_at          = EXCLUDED.published_at,
      vendor_created_at     = EXCLUDED.vendor_created_at,
      vendor_updated_at     = EXCLUDED.vendor_updated_at,
      updated_at            = NOW()
  `, [
    String(item.id ?? ''),                            // $1  vendor_item_id
    String(item.product_id ?? ''),                    // $2  vendor_product_id
    item.sku,                                         // $3  vendor_part_number
    item.supplier_product_id ?? item.sku,             // $4  manufacturer_part_number
    item.name ?? null,                                // $5  title
    item.product?.description ?? null,                // $6  description_raw
    item.brand?.name ?? null,                         // $7  brand
    JSON.stringify(item.product?.categories ?? []),   // $8  categories_raw
    JSON.stringify({                                  // $9  attributes_raw
      propd1: item.propd1 ?? null,
      propd2: item.propd2 ?? null,
      sort: item.sort ?? null,
      unit_of_measurement_id: item.unit_of_measurement_id ?? null,
    }),
    item.list_price ?? null,                          // $10 msrp
    item.mapp_price ?? null,                          // $11 map_price
    item.standard_dealer_price ?? null,               // $12 wholesale_cost
    item.drop_ship_fee ?? 0,                          // $13 drop_ship_fee
    item.drop_ship_eligible ?? false,                 // $14 drop_ship_eligible
    JSON.stringify(                                   // $15 images_raw
      Array.isArray(item.images)
        ? item.images.map(img => ({
            url: img.url ?? img.link ?? img,
            position: img.position ?? null,
            primary: img.primary ?? false,
          }))
        : []
    ),
    JSON.stringify([]),                               // $16 fitment_raw
    item.weight ?? null,                              // $17 weight
    item.length ?? null,                              // $18 length
    item.width  ?? null,                              // $19 width
    item.height ?? null,                              // $20 height
    item.upc ?? null,                                 // $21 upc
    item.superseded_sku ?? null,                      // $22 superseded_sku
    item.status ?? null,                              // $23 status
    item.status_id ?? null,                           // $24 status_id
    item.product_type ?? null,                        // $25 product_type
    item.unit_of_measurement_id?.toString() ?? null,  // $26 unit_of_measurement
    item.has_map_policy ?? false,                     // $27 has_map_policy
    item.carb ?? null,                                // $28 carb
    item.prop_65_code ?? null,                        // $29 prop_65_code
    item.prop_65_detail ?? null,                      // $30 prop_65_detail
    item.country_id ?? null,                          // $31 country_id
    item.published_at ? new Date(item.published_at) : null, // $32
    item.created_at  ? new Date(item.created_at)  : null,   // $33
    item.updated_at  ? new Date(item.updated_at)  : null,   // $34
  ]);
}

async function upsertInventory(client, item) {
  if (!Array.isArray(item.inventory)) return;
  for (const inv of item.inventory) {
    await client.query(`
      INSERT INTO vendor.vendor_inventory (
        id, vendor_code, vendor_part_number,
        warehouse_id, quantity_on_hand, quantity_on_order,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), 'wps', $1, $2, $3, $4, NOW(), NOW()
      )
      ON CONFLICT (vendor_code, vendor_part_number, warehouse_id) DO UPDATE SET
        quantity_on_hand  = EXCLUDED.quantity_on_hand,
        quantity_on_order = EXCLUDED.quantity_on_order,
        updated_at        = NOW()
    `, [
      item.sku,
      String(inv.warehouse_id ?? inv.id ?? 'default'),
      inv.quantity_on_hand ?? inv.qty ?? inv.quantity ?? 0,
      inv.quantity_on_order ?? inv.on_order ?? 0,
    ]);
  }
}

async function logSync(client, stats) {
  await client.query(`
    INSERT INTO vendor.vendor_sync_log
      (id, vendor_code, sync_type, status, rows_inserted, rows_failed, started_at, completed_at, notes)
    VALUES (gen_random_uuid(), 'wps', 'full_catalog', $1, $2, $3, $4, NOW(), $5)
  `, [stats.status, stats.inserted, stats.failed, stats.startedAt, stats.notes]);
}

async function run() {
  const client = await pool.connect();
  const startedAt = new Date();
  let cursor = null, page = 0, inserted = 0, failed = 0;

  console.log('▶  Starting WPS full catalog ingestion (all fields)...\n');

  try {
    do {
      const data = await fetchPage(cursor);
      const items = data.data ?? [];
      cursor = data.meta?.cursor?.next ?? null;
      page++;

      for (const item of items) {
        try {
          await upsertProduct(client, item);
          await upsertInventory(client, item);
          inserted++;
        } catch (err) {
          failed++;
          await client.query(`
            INSERT INTO vendor.vendor_error_log
              (id, vendor_code, vendor_part_number, error_type, error_message, created_at)
            VALUES (gen_random_uuid(), 'wps', $1, 'insert_failed', $2, NOW())
          `, [item.sku ?? 'unknown', err.message]);
        }
      }

      console.log(`  Page ${page} | inserted: ${inserted} | failed: ${failed} | next: ${cursor ?? 'DONE'}`);

    } while (cursor !== null);

    await logSync(client, {
      status: failed === 0 ? 'success' : 'partial',
      inserted, failed, startedAt,
      notes: `${page} pages processed. ${failed} errors.`,
    });

    console.log(`\n✅  Done — ${inserted} products ingested, ${failed} errors`);

  } catch (err) {
    await logSync(client, { status: 'failed', inserted, failed, startedAt, notes: err.message });
    console.error('\n❌  Sync failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();