/**
 * Stage 1 — WPS Normalization
 * Reads raw_vendor_wps_products + raw_vendor_wps_inventory
 * Writes to: catalog_products, catalog_variants, catalog_specs,
 *             catalog_media, vendor_offers
 *
 * Run after Stage 0 has populated raw tables.
 */

import { sql } from '../lib/db.js';

// ─── field helpers ────────────────────────────────────────────────────────────

function slugify(str = '') {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSlug(name, sku) {
  return `${slugify(name)}-${slugify(sku)}`;
}

/**
 * WPS returns category as an array path e.g. ["Helmets","Full Face"]
 * We join with " > " for storage, use last segment as primary category.
 */
function parseCategory(item) {
  const path = item.category_path ?? item.categories ?? [];
  if (Array.isArray(path) && path.length) return path[path.length - 1];
  if (typeof path === 'string') return path;
  return null;
}

/**
 * Normalize a WPS item payload into canonical product shape.
 * Does NOT hit the DB — pure transform.
 */
function mapWpsProduct(item, inventoryMap) {
  const sku        = item.sku ?? item.number ?? null;
  const name       = item.name ?? item.product_name ?? null;
  const brand      = item.brand?.name ?? item.brand ?? null;
  const mpn        = item.mpn ?? item.part_number ?? sku;
  const desc       = item.long_description ?? item.description ?? null;
  const category   = parseCategory(item);
  const weight     = item.weight ?? null;
  const slug       = buildSlug(name, sku);

  // Sport flags — WPS ships these as boolean columns
  const sportFlags = {
    is_atv:        item.atv        ?? false,
    is_offroad:    item.offroad    ?? item.dirt ?? false,
    is_snow:       item.snow       ?? false,
    is_street:     item.street     ?? false,
    is_watercraft: item.watercraft ?? false,
    is_bicycle:    item.bicycle    ?? false,
  };

  // Images — may be array of objects or strings
  const images = (item.images ?? []).map((img, i) => ({
    url:        img.url ?? img.image_url ?? img,
    media_type: 'image',
    priority:   img.primary ? 0 : i + 1,
  }));

  // Specs — WPS ships as flat object or array of {name, value}
  const specs = [];
  if (Array.isArray(item.specs)) {
    for (const s of item.specs) {
      if (s.name && s.value) specs.push({ attribute: s.name, value: String(s.value) });
    }
  } else if (item.specs && typeof item.specs === 'object') {
    for (const [k, v] of Object.entries(item.specs)) {
      if (v !== null && v !== '') specs.push({ attribute: k, value: String(v) });
    }
  }

  // Variants — WPS size/color options
  const variants = [];
  if (item.sizes?.length)  item.sizes.forEach(v  => variants.push({ option_name: 'Size',  option_value: String(v) }));
  if (item.colors?.length) item.colors.forEach(v => variants.push({ option_name: 'Color', option_value: String(v) }));

  // Inventory from the inventory map keyed by sku
  const inv = inventoryMap.get(sku) ?? {};
  const warehouseJson = inv.warehouses ?? inv.inventory ?? {};
  const totalQty = inv.total ?? inv.quantity ??
    Object.values(warehouseJson).reduce((s, v) => s + (Number(v) || 0), 0);

  const cost    = item.cost    ?? item.dealer_price ?? null;
  const msrp    = item.msrp   ?? item.retail_price  ?? null;
  const mapPrice = item.map   ?? item.map_price      ?? null;

  return {
    product: { sku, name, brand, manufacturer_part_number: mpn, slug, description: desc, category, weight, stock_quantity: Number(totalQty) || 0, ...sportFlags },
    images,
    specs,
    variants,
    offer: {
      vendor_code:  'wps',
      vendor_part_number: sku,
      wholesale_cost: cost   ? Number(cost)   : null,
      msrp:         msrp   ? Number(msrp)   : null,
      map_price:    mapPrice ? Number(mapPrice) : null,
      total_qty:    Number(totalQty) || 0,
      warehouse_json: warehouseJson,
      wps_item_id:  item.id ?? null,
    },
  };
}

// ─── DB writers ───────────────────────────────────────────────────────────────

async function upsertProduct(p) {
  const rows = await sql`
    INSERT INTO catalog_products
      (sku, name, brand, manufacturer_part_number, slug, description, category,
       weight, stock_quantity, is_atv, is_offroad, is_snow, is_street, is_watercraft, is_bicycle,
       is_active, updated_at)
    VALUES
      (${p.sku}, ${p.name}, ${p.brand}, ${p.manufacturer_part_number}, ${p.slug},
       ${p.description}, ${p.category}, ${p.weight}, ${p.stock_quantity},
       ${p.is_atv}, ${p.is_offroad}, ${p.is_snow}, ${p.is_street},
       ${p.is_watercraft}, ${p.is_bicycle}, true, NOW())
    ON CONFLICT (sku) DO UPDATE SET
      name                    = EXCLUDED.name,
      brand                   = EXCLUDED.brand,
      manufacturer_part_number = EXCLUDED.manufacturer_part_number,
      description             = COALESCE(EXCLUDED.description, catalog_products.description),
      category                = COALESCE(EXCLUDED.category,    catalog_products.category),
      weight                  = COALESCE(EXCLUDED.weight,      catalog_products.weight),
      stock_quantity          = COALESCE(EXCLUDED.stock_quantity, catalog_products.stock_quantity),
      is_atv                  = EXCLUDED.is_atv,
      is_offroad              = EXCLUDED.is_offroad,
      is_snow                 = EXCLUDED.is_snow,
      is_street               = EXCLUDED.is_street,
      is_watercraft           = EXCLUDED.is_watercraft,
      is_bicycle              = EXCLUDED.is_bicycle,
      is_active               = true,
      updated_at              = NOW()
    RETURNING id
  `;
  return rows[0].id;
}

async function upsertOffer(productId, offer) {
  await sql`
    INSERT INTO vendor_offers
      (catalog_product_id, vendor_code, vendor_part_number, manufacturer_part_number, wholesale_cost, msrp, map_price, total_qty, warehouse_json, wps_item_id, updated_at)
    VALUES
      (${productId}, ${offer.vendor_code}, ${offer.vendor_part_number}, ${offer.vendor_part_number}, ${offer.wholesale_cost}, ${offer.msrp}, ${offer.map_price},
       ${offer.total_qty}, ${JSON.stringify(offer.warehouse_json)}, ${offer.wps_item_id}, NOW())
    ON CONFLICT (catalog_product_id, vendor_code) DO UPDATE SET
      vendor_part_number = COALESCE(EXCLUDED.vendor_part_number, vendor_offers.vendor_part_number),
      manufacturer_part_number = COALESCE(EXCLUDED.manufacturer_part_number, vendor_offers.manufacturer_part_number),
      wholesale_cost = COALESCE(EXCLUDED.wholesale_cost, vendor_offers.wholesale_cost),
      msrp           = COALESCE(EXCLUDED.msrp,      vendor_offers.msrp),
      map_price      = COALESCE(EXCLUDED.map_price, vendor_offers.map_price),
      total_qty      = EXCLUDED.total_qty,
      warehouse_json = EXCLUDED.warehouse_json,
      wps_item_id    = COALESCE(EXCLUDED.wps_item_id, vendor_offers.wps_item_id),
      updated_at     = NOW()
  `;
}

async function replaceMedia(productId, images) {
  if (!images.length) return;
  await sql`DELETE FROM catalog_media WHERE product_id = ${productId}`;
  for (const img of images) {
    await sql`
      INSERT INTO catalog_media (product_id, url, media_type, priority)
      VALUES (${productId}, ${img.url}, ${img.media_type}, ${img.priority})
      ON CONFLICT DO NOTHING
    `;
  }
}

async function replaceSpecs(productId, specs) {
  if (!specs.length) return;
  await sql`DELETE FROM catalog_specs WHERE product_id = ${productId}`;
  for (const s of specs) {
    await sql`
      INSERT INTO catalog_specs (product_id, attribute, value)
      VALUES (${productId}, ${s.attribute}, ${s.value})
      ON CONFLICT DO NOTHING
    `;
  }
}

async function replaceVariants(productId, variants) {
  if (!variants.length) return;
  await sql`DELETE FROM catalog_variants WHERE product_id = ${productId}`;
  for (const v of variants) {
    await sql`
      INSERT INTO catalog_variants (product_id, option_name, option_value)
      VALUES (${productId}, ${v.option_name}, ${v.option_value})
      ON CONFLICT DO NOTHING
    `;
  }
}

// ─── inventory loader ─────────────────────────────────────────────────────────

async function loadInventoryMap() {
  const rows = await sql`
    SELECT payload FROM raw_vendor_wps_inventory ORDER BY imported_at DESC
  `;
  const map = new Map();
  for (const row of rows) {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    const items = payload?.data ?? payload?.items ?? (Array.isArray(payload) ? payload : []);
    for (const inv of items) {
      const sku = inv.sku ?? inv.item_number;
      if (sku && !map.has(sku)) map.set(sku, inv);
    }
  }
  console.log(`[Stage1-WPS] Loaded ${map.size} inventory records`);
  return map;
}

// ─── main ─────────────────────────────────────────────────────────────────────

export async function normalizeWps({ batchSize = 500 } = {}) {
  console.log('[Stage1-WPS] Starting WPS normalization...');

  const inventoryMap = await loadInventoryMap();

  // Count raw rows
  const [{ count }] = await sql`SELECT COUNT(*) FROM raw_vendor_wps_products`;
  const total = Number(count);
  console.log(`[Stage1-WPS] ${total} raw WPS product rows to process`);

  let offset = 0;
  let upserted = 0;
  let failed = 0;

  while (offset < total) {
    const rows = await sql`
      SELECT id, payload FROM raw_vendor_wps_products
      ORDER BY id LIMIT ${batchSize} OFFSET ${offset}
    `;

    for (const row of rows) {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      // WPS raw rows can be a single item or wrapped in data[]
      const items = Array.isArray(payload) ? payload
        : payload?.data ? payload.data
        : [payload];

      for (const item of items) {
        if (!item.sku && !item.number) { failed++; continue; }
        try {
          const mapped     = mapWpsProduct(item, inventoryMap);
          const productId  = await upsertProduct(mapped.product);
          await Promise.all([
            upsertOffer(productId, mapped.offer),
            replaceMedia(productId, mapped.images),
            replaceSpecs(productId, mapped.specs),
            replaceVariants(productId, mapped.variants),
          ]);
          upserted++;
        } catch (err) {
          console.error(`[Stage1-WPS] Failed SKU ${item.sku ?? item.number}: ${err.message}`);
          failed++;
        }
      }
    }

    offset += batchSize;
    console.log(`[Stage1-WPS] Progress: ${Math.min(offset, total)} / ${total} | upserted: ${upserted} | failed: ${failed}`);
  }

  console.log(`[Stage1-WPS] Done. Upserted: ${upserted} | Failed: ${failed}`);
  return { upserted, failed };
}
