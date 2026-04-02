require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
const CHECKPOINT = './phase2-checkpoint.json';
const fs = require('fs');
const BATCH_SIZE = 500;

function saveCheckpoint(data) { fs.writeFileSync(CHECKPOINT, JSON.stringify(data, null, 2)); }
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT)) {
    const d = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
    console.log(`\n♻️  Resuming from checkpoint — offset: ${d.offset} | inserted: ${d.inserted}\n`);
    return d;
  }
  return { offset: 0, inserted: 0, updated: 0, offers: 0 };
}
function clearCheckpoint() { if (fs.existsSync(CHECKPOINT)) fs.unlinkSync(CHECKPOINT); }

// ── Pick best value across vendors ───────────────────────────────────────────
function bestTitle(rows) {
  // Prefer longer, more descriptive title
  return rows
    .map(r => r.title)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

function bestDescription(rows) {
  // Prefer PU descriptions (richer), then WPS
  const pu  = rows.find(r => r.vendor_code === 'pu'  && r.description_raw)?.description_raw;
  const wps = rows.find(r => r.vendor_code === 'wps' && r.description_raw)?.description_raw;
  return pu ?? wps ?? null;
}

function bestBrand(rows) {
  return rows.find(r => r.brand)?.brand ?? null;
}

function mergeImages(rows) {
  const seen = new Set();
  const images = [];
  for (const row of rows) {
    const imgs = row.images_raw ?? [];
    for (const img of imgs) {
      const url = img.url ?? img;
      if (url && !seen.has(url)) {
        seen.add(url);
        images.push(img);
      }
    }
  }
  return images;
}

function bestPrice(rows) {
  // Use lowest MAP price across vendors
  const maps = rows.map(r => r.map_price).filter(v => v != null && v > 0);
  return maps.length > 0 ? Math.min(...maps) : null;
}

function bestCost(rows) {
  // Use lowest wholesale cost across vendors
  const costs = rows.map(r => r.wholesale_cost).filter(v => v != null && v > 0);
  return costs.length > 0 ? Math.min(...costs) : null;
}

function isActive(rows) {
  // Active if any vendor has active/standard status
  return rows.some(r => {
    const s = (r.status ?? '').toUpperCase();
    return s === 'STANDARD' || s === 'S' || s === 'NEW' || s === '' || s === 'NLA' === false;
  });
}

// ── Upsert one catalog product ────────────────────────────────────────────────
async function upsertCatalogProduct(client, mpn, rows) {
  const title       = bestTitle(rows);
  const description = bestDescription(rows);
  const brand       = bestBrand(rows);
  const images      = mergeImages(rows);
  const mapPrice    = bestPrice(rows);
  const cost        = bestCost(rows);
  const vendorCodes = [...new Set(rows.map(r => r.vendor_code))];
  const sourceVendor = vendorCodes.join('+');
  const active      = isActive(rows);

  // Pick best fields from any vendor
  const ref = rows[0];
  const wps = rows.find(r => r.vendor_code === 'wps') ?? ref;
  const pu  = rows.find(r => r.vendor_code === 'pu')  ?? ref;

  // Generate SKU: prefer WPS SKU (clean format), fallback to MPN
  const sku = wps.vendor_part_number ?? pu.vendor_part_number ?? mpn;

  // Weight: prefer WPS (more reliable)
  const weight = wps.weight ?? pu.weight ?? null;

  // Dimensions from WPS
  const dimensions = (wps.length || wps.width || wps.height) ? {
    length: wps.length ?? null,
    width:  wps.width  ?? null,
    height: wps.height ?? null,
  } : null;

  const result = await client.query(`
    INSERT INTO public.catalog_products (
      sku, manufacturer_part_number,
      name, description,
      brand, category,
      price, cost, map_price, msrp,
      weight, dimensions,
      status, product_type, unit_of_measurement,
      upc, has_map_policy, drop_ship_eligible,
      is_active, vendor_codes, source_vendor,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12::jsonb,
      $13, $14, $15,
      $16, $17, $18,
      $19, $20, $21,
      NOW(), NOW()
    )
    ON CONFLICT (sku) DO UPDATE SET
      name                = COALESCE(EXCLUDED.name, catalog_products.name),
      description         = COALESCE(EXCLUDED.description, catalog_products.description),
      brand               = COALESCE(EXCLUDED.brand, catalog_products.brand),
      price               = COALESCE(EXCLUDED.price, catalog_products.price),
      cost                = COALESCE(EXCLUDED.cost, catalog_products.cost),
      map_price           = COALESCE(EXCLUDED.map_price, catalog_products.map_price),
      msrp                = COALESCE(EXCLUDED.msrp, catalog_products.msrp),
      weight              = COALESCE(EXCLUDED.weight, catalog_products.weight),
      dimensions          = COALESCE(EXCLUDED.dimensions, catalog_products.dimensions),
      status              = COALESCE(EXCLUDED.status, catalog_products.status),
      upc                 = COALESCE(EXCLUDED.upc, catalog_products.upc),
      has_map_policy      = EXCLUDED.has_map_policy,
      drop_ship_eligible  = EXCLUDED.drop_ship_eligible,
      is_active           = EXCLUDED.is_active,
      vendor_codes        = EXCLUDED.vendor_codes,
      source_vendor       = EXCLUDED.source_vendor,
      updated_at          = NOW()
    RETURNING id
  `, [
    sku,                                    // $1
    mpn,                                    // $2
    title,                                  // $3
    description,                            // $4
    brand,                                  // $5
    ref.categories_raw?.[0] ?? null,        // $6  category (first category)
    mapPrice,                               // $7  price (MAP as default sell price)
    cost,                                   // $8
    mapPrice,                               // $9  map_price
    ref.msrp ?? wps.msrp ?? pu.msrp ?? null, // $10 msrp
    weight,                                 // $11
    dimensions ? JSON.stringify(dimensions) : null, // $12
    ref.status ?? null,                     // $13
    ref.product_type ?? null,               // $14
    ref.unit_of_measurement ?? null,        // $15
    wps.upc ?? pu.upc ?? null,             // $16
    wps.has_map_policy ?? false,            // $17
    wps.drop_ship_eligible ?? false,        // $18
    active,                                 // $19
    vendorCodes,                            // $20
    sourceVendor,                           // $21
  ]);

  return { sku, catalogProductId: result.rows[0]?.id ?? null, vendorRows: rows, images };
}

// ── Upsert catalog images ─────────────────────────────────────────────────────
async function upsertCatalogImages(client, catalogProductId, images) {
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const url = img.url ?? img;
    if (!url) continue;
    await client.query(`
      INSERT INTO public.catalog_images
        (catalog_product_id, url, position, is_primary, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT DO NOTHING
    `, [
      catalogProductId,
      url,
      img.position ?? i,
      i === 0,
    ]).catch(() => {}); // skip if catalog_images doesn't exist yet
  }
}

// ── Upsert vendor offers ──────────────────────────────────────────────────────
async function upsertVendorOffers(client, catalogProductId, rows) {
  for (const row of rows) {
    await client.query(`
      INSERT INTO public.vendor_offers (
        catalog_product_id,
        vendor_code,
        vendor_part_number,
        manufacturer_part_number,
        wholesale_cost,
        map_price,
        msrp,
        drop_ship_fee,
        drop_ship_eligible,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
      ON CONFLICT (catalog_product_id, vendor_code) DO UPDATE SET
        wholesale_cost     = EXCLUDED.wholesale_cost,
        map_price          = EXCLUDED.map_price,
        msrp               = EXCLUDED.msrp,
        drop_ship_fee      = EXCLUDED.drop_ship_fee,
        drop_ship_eligible = EXCLUDED.drop_ship_eligible,
        is_active          = EXCLUDED.is_active,
        updated_at         = NOW()
    `, [
      catalogProductId,
      row.vendor_code,
      row.vendor_part_number,
      row.manufacturer_part_number,
      row.wholesale_cost ?? null,
      row.map_price ?? null,
      row.msrp ?? null,
      row.drop_ship_fee ?? 0,
      row.drop_ship_eligible ?? false,
      true,
    ]).catch(() => {}); // skip if vendor_offers table not ready
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();
  const checkpoint = loadCheckpoint();
  let { offset, inserted, updated, offers } = checkpoint;
  const startedAt = new Date();

  console.log('▶  Phase 2 — Building unified catalog...\n');

  // Count total unique MPNs to process
  const { rows: [{ total }] } = await client.query(`
    SELECT COUNT(DISTINCT manufacturer_part_number) AS total
    FROM vendor.vendor_products
    WHERE manufacturer_part_number IS NOT NULL
      AND manufacturer_part_number != ''
  `);
  console.log(`   Total unique MPNs to merge: ${Number(total).toLocaleString()}\n`);

  try {
    while (true) {
      // Fetch a batch of unique MPNs
      const { rows: mpnBatch } = await client.query(`
        SELECT DISTINCT manufacturer_part_number
        FROM vendor.vendor_products
        WHERE manufacturer_part_number IS NOT NULL
          AND manufacturer_part_number != ''
        ORDER BY manufacturer_part_number
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);

      if (mpnBatch.length === 0) break;

      const mpns = mpnBatch.map(r => r.manufacturer_part_number);

      // Fetch all vendor rows for this batch of MPNs
      const { rows: vendorRows } = await client.query(`
        SELECT
          vendor_code, vendor_part_number, manufacturer_part_number,
          title, description_raw, brand,
          categories_raw, images_raw,
          msrp, map_price, wholesale_cost,
          drop_ship_fee, drop_ship_eligible,
          weight, length, width, height,
          upc, status, product_type, unit_of_measurement,
          has_map_policy
        FROM vendor.vendor_products
        WHERE manufacturer_part_number = ANY($1)
          AND manufacturer_part_number IS NOT NULL
      `, [mpns]);

      // Group vendor rows by MPN
      const byMPN = {};
      for (const row of vendorRows) {
        const mpn = row.manufacturer_part_number;
        if (!byMPN[mpn]) byMPN[mpn] = [];
        // Parse jsonb arrays
        if (typeof row.images_raw === 'string') {
          try { row.images_raw = JSON.parse(row.images_raw); } catch { row.images_raw = []; }
        }
        if (typeof row.categories_raw === 'string') {
          try { row.categories_raw = JSON.parse(row.categories_raw); } catch { row.categories_raw = []; }
        }
        byMPN[mpn].push(row);
      }

      // Merge each MPN group into catalog_products
      for (const mpn of mpns) {
        const rows = byMPN[mpn];
        if (!rows || rows.length === 0) continue;

        try {
          const { catalogProductId, images } = await upsertCatalogProduct(client, mpn, rows);
          if (catalogProductId) {
            await upsertCatalogImages(client, catalogProductId, images);
          }
          inserted++;
        } catch (err) {
          console.error(`  ❌  ${mpn}: ${err.message}`);
        }
      }

      offset += mpnBatch.length;
      saveCheckpoint({ offset, inserted, updated, offers });

      const pct = Math.round((offset / Number(total)) * 100);
      process.stdout.write(`\r  Progress: ${offset.toLocaleString()} / ${Number(total).toLocaleString()} MPNs (${pct}%) | catalog rows: ${inserted.toLocaleString()}`);
    }

    console.log(`\n\n✅  Phase 2 complete!`);
    console.log(`   Catalog products: ${inserted.toLocaleString()}`);
    console.log(`   Total MPNs processed: ${offset.toLocaleString()}`);

    clearCheckpoint();

  } catch (err) {
    console.error('\n❌  Phase 2 failed:', err.message);
    console.error('    Re-run node phase2-merge.js to resume from checkpoint.');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
