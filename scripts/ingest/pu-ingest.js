require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

// ─────────────────────────────────────────────
// CONFIG — point this at your extracted ZIPs
// ─────────────────────────────────────────────
const EXTRACTED_DIR = './extracted'; // folder containing one subfolder per brand

// ─────────────────────────────────────────────
// STEP 1: Upsert one PU product row
// ─────────────────────────────────────────────
async function upsertProduct(client, item, brandName) {
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
      msrp,
      map_price,
      wholesale_cost,
      images_raw,
      fitment_raw,
      weight,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(), 'pu',
      $1, $2, $3, $4, $5,
      $6::jsonb,
      $7, $8, $9,
      $10::jsonb, $11::jsonb,
      $12,
      NOW(), NOW()
    )
    ON CONFLICT (vendor_part_number) DO UPDATE SET
      title            = EXCLUDED.title,
      description_raw  = EXCLUDED.description_raw,
      msrp             = EXCLUDED.msrp,
      map_price        = EXCLUDED.map_price,
      wholesale_cost   = EXCLUDED.wholesale_cost,
      images_raw       = EXCLUDED.images_raw,
      fitment_raw      = EXCLUDED.fitment_raw,
      updated_at       = NOW()
  `, [
    item.sku ?? item.part_number,                     // $1  vendor_part_number
    item.mfr_part_number ?? item.sku ?? item.part_number, // $2  manufacturer_part_number
    item.name ?? item.description ?? '',              // $3  title
    item.long_description ?? item.description ?? null,// $4  description_raw
    item.brand ?? brandName,                          // $5  brand
    JSON.stringify(item.categories ?? []),             // $6  categories_raw
    item.msrp ?? item.list_price ?? null,             // $7  msrp
    item.map ?? item.map_price ?? null,               // $8  map_price
    item.cost ?? item.dealer_price ?? null,           // $9  wholesale_cost
    JSON.stringify(item.images ?? []),                 // $10 images_raw
    JSON.stringify(item.fitment ?? item.vehicles ?? []), // $11 fitment_raw
    item.weight ?? null,                              // $12 weight
  ]);
}

// ─────────────────────────────────────────────
// STEP 2: Process one brand folder
// ─────────────────────────────────────────────
async function processBrand(client, brandDir) {
  const brandName = path.basename(brandDir);
  let processed = 0;
  let failed = 0;

  // Try items.json first
  const jsonFile = path.join(brandDir, 'items.json');
  if (fs.existsSync(jsonFile)) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    } catch (err) {
      console.log(`  ⚠️  ${brandName}: JSON parse error — ${err.message}`);
      return { processed: 0, failed: 1 };
    }

    // PU brands use different root keys — try each
    const items = Array.isArray(raw)
      ? raw
      : raw.items ?? raw.products ?? raw.data ?? [];

    for (const item of items) {
      try {
        await upsertProduct(client, item, brandName);
        processed++;
      } catch (err) {
        failed++;
        await client.query(`
          INSERT INTO vendor.vendor_error_log
            (id, vendor_code, vendor_part_number, error_type, error_message, created_at)
          VALUES
            (gen_random_uuid(), 'pu', $1, 'insert_failed', $2, NOW())
        `, [item.sku ?? item.part_number ?? 'unknown', err.message]);
      }
    }
  } else {
    console.log(`  ⚠️  ${brandName}: no items.json found — skipping (check for XML)`);
  }

  console.log(`  ${brandName}: ${processed} ok, ${failed} failed`);
  return { processed, failed };
}

// ─────────────────────────────────────────────
// MAIN: Walk every brand folder
// ─────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  const startedAt = new Date();
  let total = 0;
  let totalFailed = 0;

  // Get all brand directories
  const brands = fs.readdirSync(EXTRACTED_DIR).filter(name => {
    return fs.statSync(path.join(EXTRACTED_DIR, name)).isDirectory();
  });

  console.log(`▶  Processing ${brands.length} PU brand folders...\n`);

  try {
    for (const brand of brands) {
      const { processed, failed } = await processBrand(
        client,
        path.join(EXTRACTED_DIR, brand)
      );
      total += processed;
      totalFailed += failed;
    }

    // Write sync log
    await client.query(`
      INSERT INTO vendor.vendor_sync_log
        (id, vendor_code, sync_type, status, rows_inserted, rows_failed, started_at, completed_at, notes)
      VALUES
        (gen_random_uuid(), 'pu', 'full_catalog', $1, $2, $3, $4, NOW(), $5)
    `, [
      totalFailed === 0 ? 'success' : 'partial',
      total,
      totalFailed,
      startedAt,
      `${brands.length} brands processed`,
    ]);

    console.log(`\n✅  Done — ${total} PU products ingested, ${totalFailed} errors`);

  } catch (err) {
    await client.query(`
      INSERT INTO vendor.vendor_sync_log
        (id, vendor_code, sync_type, status, rows_inserted, rows_failed, started_at, completed_at, notes)
      VALUES
        (gen_random_uuid(), 'pu', 'full_catalog', 'failed', $1, $2, $3, NOW(), $4)
    `, [total, totalFailed, startedAt, err.message]);
    console.error('\n❌  PU sync failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
