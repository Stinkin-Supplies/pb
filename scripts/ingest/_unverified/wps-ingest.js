require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const WPS_KEY = process.env.WPS_API_KEY;
const PAGE_SIZE = 100;
const CHECKPOINT_FILE = './wps-cursor-checkpoint.json';

function num(val) { const n = parseFloat(val); return isNaN(n) ? null : n; }

// ── Checkpoint: save cursor after every page ──────────────────────────────────
function saveCheckpoint(cursor, page, inserted, failed) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ cursor, page, inserted, failed }, null, 2));
}

function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    console.log(`\n♻️  Resuming from checkpoint — page ${data.page}, cursor: ${data.cursor}`);
    console.log(`   Previously inserted: ${data.inserted} | failed: ${data.failed}\n`);
    return data;
  }
  return { cursor: null, page: 0, inserted: 0, failed: 0 };
}

function clearCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

// ── Fetch one page ────────────────────────────────────────────────────────────
async function fetchPage(cursor = null) {
  const url = new URL('https://api.wps-inc.com/items');
  url.searchParams.set('page[size]', PAGE_SIZE);
  url.searchParams.set('include', 'images,inventory,brand,product');
  if (cursor) url.searchParams.set('page[cursor]', cursor);
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${WPS_KEY}`, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`WPS API error: ${res.status}`);
  return res.json();
}

// ── Upsert one product ────────────────────────────────────────────────────────
async function upsertProduct(client, item) {
  const brand     = item.brand?.data     ?? {};
  const product   = item.product?.data   ?? {};
  const images    = Array.isArray(item.images?.data)    ? item.images.data    : [];
  const inventory = Array.isArray(item.inventory?.data) ? item.inventory.data : [];

  await client.query(`
    INSERT INTO vendor.vendor_products (
      id, vendor_code, vendor_item_id, vendor_product_id,
      vendor_part_number, manufacturer_part_number,
      title, description_raw, brand, categories_raw, attributes_raw,
      msrp, map_price, wholesale_cost, drop_ship_fee, drop_ship_eligible,
      images_raw, fitment_raw, weight, length, width, height,
      upc, superseded_sku, status, status_id, product_type, unit_of_measurement,
      has_map_policy, carb, prop_65_code, prop_65_detail, country_id,
      published_at, vendor_created_at, vendor_updated_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8,
      $9::jsonb, $10::jsonb,
      $11, $12, $13, $14, $15,
      $16::jsonb, $17::jsonb,
      $18, $19, $20, $21,
      $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32,
      $33, $34, $35, NOW(), NOW()
    )
    ON CONFLICT (vendor_part_number) DO UPDATE SET
      vendor_item_id           = EXCLUDED.vendor_item_id,
      vendor_product_id        = EXCLUDED.vendor_product_id,
      manufacturer_part_number = EXCLUDED.manufacturer_part_number,
      title                    = EXCLUDED.title,
      description_raw          = EXCLUDED.description_raw,
      brand                    = EXCLUDED.brand,
      categories_raw           = EXCLUDED.categories_raw,
      attributes_raw           = EXCLUDED.attributes_raw,
      msrp                     = EXCLUDED.msrp,
      map_price                = EXCLUDED.map_price,
      wholesale_cost           = EXCLUDED.wholesale_cost,
      drop_ship_fee            = EXCLUDED.drop_ship_fee,
      drop_ship_eligible       = EXCLUDED.drop_ship_eligible,
      images_raw               = EXCLUDED.images_raw,
      weight                   = EXCLUDED.weight,
      length                   = EXCLUDED.length,
      width                    = EXCLUDED.width,
      height                   = EXCLUDED.height,
      upc                      = EXCLUDED.upc,
      superseded_sku           = EXCLUDED.superseded_sku,
      status                   = EXCLUDED.status,
      status_id                = EXCLUDED.status_id,
      product_type             = EXCLUDED.product_type,
      unit_of_measurement      = EXCLUDED.unit_of_measurement,
      has_map_policy           = EXCLUDED.has_map_policy,
      carb                     = EXCLUDED.carb,
      prop_65_code             = EXCLUDED.prop_65_code,
      prop_65_detail           = EXCLUDED.prop_65_detail,
      country_id               = EXCLUDED.country_id,
      published_at             = EXCLUDED.published_at,
      vendor_created_at        = EXCLUDED.vendor_created_at,
      vendor_updated_at        = EXCLUDED.vendor_updated_at,
      updated_at               = NOW()
  `, [
    'wps',
    String(item.id ?? ''),
    String(item.product_id ?? ''),
    item.sku,
    item.supplier_product_id ?? item.sku,
    item.name ?? null,
    product.description ?? null,
    brand.name ?? null,
    JSON.stringify(product.categories ?? []),
    JSON.stringify({ propd1: item.propd1 ?? null, propd2: item.propd2 ?? null, sort: item.sort ?? null }),
    num(item.list_price),
    num(item.mapp_price),
    num(item.standard_dealer_price),
    num(item.drop_ship_fee) ?? 0,
    item.drop_ship_eligible ?? false,
    JSON.stringify(images),
    JSON.stringify([]),
    num(item.weight),
    num(item.length),
    num(item.width),
    num(item.height),
    item.upc ?? null,
    item.superseded_sku ?? null,
    item.status ?? null,
    item.status_id ?? null,
    item.product_type ?? null,
    item.unit_of_measurement_id?.toString() ?? null,
    item.has_map_policy ?? false,
    item.carb ?? null,
    item.prop_65_code ?? null,
    item.prop_65_detail ?? null,
    item.country_id ?? null,
    item.published_at ? new Date(item.published_at) : null,
    item.created_at  ? new Date(item.created_at)  : null,
    item.updated_at  ? new Date(item.updated_at)  : null,
  ]);

  return inventory;
}

// ── Upsert inventory rows ─────────────────────────────────────────────────────
async function upsertInventory(client, item, inventory) {
  for (const inv of inventory) {
    await client.query(`
      INSERT INTO vendor.vendor_inventory
        (id, vendor_code, vendor_part_number, warehouse_id, quantity_on_hand, quantity_on_order, created_at, updated_at)
      VALUES
        (gen_random_uuid(), 'wps', $1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (vendor_code, vendor_part_number, warehouse_id) DO UPDATE SET
        quantity_on_hand  = EXCLUDED.quantity_on_hand,
        quantity_on_order = EXCLUDED.quantity_on_order,
        updated_at        = NOW()
    `, [
      item.sku,
      String(inv.warehouse_id ?? 'default'),
      num(inv.quantity_on_hand ?? inv.qty ?? inv.quantity) ?? 0,
      num(inv.quantity_on_order ?? inv.on_order) ?? 0,
    ]);
  }
}

// ── Log sync result ───────────────────────────────────────────────────────────
async function logSync(client, stats) {
  await client.query(`
    INSERT INTO vendor.vendor_sync_log
      (id, vendor_code, sync_type, status, rows_inserted, rows_failed, started_at, completed_at, notes)
    VALUES
      (gen_random_uuid(), 'wps', 'full_catalog', $1, $2, $3, $4, NOW(), $5)
  `, [stats.status, stats.inserted, stats.failed, stats.startedAt, stats.notes]);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  const startedAt = new Date();

  // Load checkpoint if exists — resumes from last saved page
  const checkpoint = loadCheckpoint();
  let cursor   = checkpoint.cursor;
  let page     = checkpoint.page;
  let inserted = checkpoint.inserted;
  let failed   = checkpoint.failed;

  if (!cursor) {
    console.log('▶  Starting WPS full catalog ingestion...\n');
  }

  try {
    do {
      const data = await fetchPage(cursor);
      const items = data.data ?? [];
      cursor = data.meta?.cursor?.next ?? null;
      page++;

      for (const item of items) {
        try {
          const inventory = await upsertProduct(client, item);
          await upsertInventory(client, item, inventory);
          inserted++;
        } catch (err) {
          failed++;
          await client.query(
            `INSERT INTO vendor.vendor_error_log
               (id, vendor_code, vendor_part_number, error_type, error_message, created_at)
             VALUES (gen_random_uuid(), 'wps', $1, 'insert_failed', $2, NOW())`,
            [item.sku ?? 'unknown', err.message]
          );
        }
      }

      // Save checkpoint after every page — safe to Ctrl+C anytime after this
      saveCheckpoint(cursor, page, inserted, failed);

      console.log(`  Page ${page} | inserted: ${inserted} | failed: ${failed} | next: ${cursor ?? 'DONE'}`);

    } while (cursor !== null);

    // Completed — write sync log and delete checkpoint
    await logSync(client, {
      status: failed === 0 ? 'success' : 'partial',
      inserted, failed, startedAt,
      notes: `${page} pages processed. ${failed} errors.`,
    });

    clearCheckpoint();
    console.log(`\n✅  Done — ${inserted} products, ${failed} errors`);

  } catch (err) {
    // Network/DB crash — checkpoint already saved, just log and exit
    await logSync(client, { status: 'failed', inserted, failed, startedAt, notes: err.message });
    console.error('\n❌  Crashed on page', page, '—', err.message);
    console.error('    Run node wps-ingest.js again to resume from this page.');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
