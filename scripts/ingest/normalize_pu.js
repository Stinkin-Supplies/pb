/**
 * Stage 1 — Parts Unlimited (PU) Normalization
 * Reads: raw_vendor_pu (CSV rows), raw_vendor_pies (XML), raw_vendor_aces (XML)
 * Writes to: catalog_products, catalog_specs, catalog_media,
 *             catalog_fitment, vendor_offers
 *
 * PU has two data sources that must be merged by SKU:
 *   1. CSV price file (D00108) — SKU, price, stock, basic fields
 *   2. PIES XML — descriptions, specs, images, ACES fitment
 */

import { sql } from '../lib/db.js';
import { parseStringPromise } from 'xml2js';

// ─── field helpers ────────────────────────────────────────────────────────────

function slugify(str = '') {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildSlug(name, sku) {
  return `${slugify(name)}-${slugify(sku)}`;
}

function toNum(v) {
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ─── CSV row mapper ───────────────────────────────────────────────────────────
// Handles D00108_PriceFile.csv shape:
//   Part Number | Punctuated Part Number | Your Dealer Price
// Extended rows may include: Description, Brand, Category, Stock fields

function mapPuCsvRow(row) {
  const sku   = row['Part Number'] ?? row['PartNumber'] ?? row['part_number'];
  const price = toNum(row['Your Dealer Price'] ?? row['dealer_price'] ?? row['price']);
  const msrp  = toNum(row['MSRP'] ?? row['msrp'] ?? null);
  const map   = toNum(row['MAP']  ?? row['map']  ?? null);

  const name     = row['Description'] ?? row['description'] ?? row['product_name'] ?? null;
  const brand    = row['Brand']       ?? row['brand']       ?? 'Parts Unlimited';
  const category = row['Category']    ?? row['category']    ?? null;
  const mpn      = row['Manufacturer Part Number'] ?? row['MPN'] ?? row['mpn'] ?? sku;

  // Stock — CSV may include warehouse columns
  const warehouseJson = {};
  const warehouseCols = ['WI', 'NY', 'TX', 'NV', 'NC'];
  for (const wh of warehouseCols) {
    if (row[wh] !== undefined) warehouseJson[wh.toLowerCase()] = Number(row[wh]) || 0;
  }
  const totalQty = Object.values(warehouseJson).reduce((s, v) => s + v, 0)
    || toNum(row['Stock'] ?? row['stock_quantity'] ?? row['qty']) ?? 0;

  if (!sku) return null;

  return {
    product: {
      sku,
      name:                    name ?? sku,
      brand,
      manufacturer_part_number: mpn,
      slug:                    buildSlug(name ?? sku, sku),
      description:             null, // filled by PIES pass
      category,
    },
    offer: {
      vendor:        'pu',
      cost:          price,   // dealer price = our cost
      msrp,
      map_price:     map,
      total_qty:     totalQty,
      warehouse_json: warehouseJson,
    },
  };
}

// ─── PIES XML mapper ─────────────────────────────────────────────────────────
// Extracts per-SKU: description, bullets→specs, images

function parsePiesItem(item) {
  const sku  = item.PartNumber?.[0] ?? item.ItemLevelGTIN?.[0] ?? null;
  if (!sku) return null;

  const desc = item.MarketingCopy?.[0]
    ?? item.LongDescription?.[0]
    ?? item.ShortDescription?.[0]
    ?? null;

  // Bullets → specs (bullet1..bullet24 or Expi/Features nodes)
  const specs = [];
  for (let i = 1; i <= 24; i++) {
    const bullet = item[`bullet${i}`]?.[0] ?? item[`Bullet${i}`]?.[0];
    if (bullet) specs.push({ attribute: `feature_${i}`, value: bullet });
  }
  // ExtendedAttributes / PIES PAdb attributes
  const extAttrs = item.ExtendedProductInformation ?? item.ExtendedAttributes ?? [];
  for (const block of extAttrs) {
    const attrs = block.ExtendedProductInformationCode ?? block.Attribute ?? [];
    for (const attr of attrs) {
      const name  = attr.$?.EXPICode ?? attr.$?.Name ?? attr.EXPICode?.[0];
      const value = attr._ ?? attr.Value?.[0];
      if (name && value) specs.push({ attribute: name, value: String(value) });
    }
  }

  // Digital assets → images
  const images = [];
  const assets = item.DigitalAssets?.[0]?.DigitalAsset ?? [];
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const uri   = asset.URI?.[0] ?? asset.AssetURI?.[0];
    const type  = asset.AssetType?.[0] ?? 'P04'; // P04 = primary image in PIES
    if (uri) images.push({ url: uri, media_type: 'image', priority: type === 'P04' ? 0 : i + 1 });
  }

  return { sku, desc, specs, images };
}

// ─── ACES XML mapper ─────────────────────────────────────────────────────────

function parseAcesApp(app) {
  const sku   = app.Part?.[0]?._ ?? app.PartNumber?.[0] ?? app.Part?.[0];
  const make  = app.BaseVehicle?.[0]?.Make?.[0] ?? app.Make?.[0] ?? null;
  const model = app.BaseVehicle?.[0]?.Model?.[0] ?? app.Model?.[0] ?? null;
  const year  = toNum(app.BaseVehicle?.[0]?.Year?.[0] ?? app.Year?.[0]);
  const yearEnd = toNum(app.BaseVehicle?.[0]?.YearTo?.[0]) ?? year;
  if (!sku || !make || !model || !year) return null;
  return { sku, make, model, year_start: year, year_end: yearEnd ?? year };
}

// ─── DB writers ───────────────────────────────────────────────────────────────

async function upsertProduct(p) {
  const rows = await sql`
    INSERT INTO catalog_products
      (sku, name, brand, manufacturer_part_number, slug, description, category, is_active, updated_at)
    VALUES
      (${p.sku}, ${p.name}, ${p.brand}, ${p.manufacturer_part_number},
       ${p.slug}, ${p.description}, ${p.category}, true, NOW())
    ON CONFLICT (sku) DO UPDATE SET
      name                     = COALESCE(EXCLUDED.name,     catalog_products.name),
      brand                    = COALESCE(EXCLUDED.brand,    catalog_products.brand),
      manufacturer_part_number = COALESCE(EXCLUDED.manufacturer_part_number, catalog_products.manufacturer_part_number),
      description              = COALESCE(EXCLUDED.description, catalog_products.description),
      category                 = COALESCE(EXCLUDED.category, catalog_products.category),
      is_active                = true,
      updated_at               = NOW()
    RETURNING id
  `;
  return rows[0].id;
}

async function upsertOffer(productId, offer) {
  await sql`
    INSERT INTO vendor_offers
      (product_id, vendor, cost, msrp, map_price, total_qty, warehouse_json, updated_at)
    VALUES
      (${productId}, ${offer.vendor}, ${offer.cost}, ${offer.msrp}, ${offer.map_price},
       ${offer.total_qty}, ${JSON.stringify(offer.warehouse_json)}, NOW())
    ON CONFLICT (product_id, vendor) DO UPDATE SET
      cost           = COALESCE(EXCLUDED.cost,      vendor_offers.cost),
      msrp           = COALESCE(EXCLUDED.msrp,      vendor_offers.msrp),
      map_price      = COALESCE(EXCLUDED.map_price, vendor_offers.map_price),
      total_qty      = EXCLUDED.total_qty,
      warehouse_json = EXCLUDED.warehouse_json,
      updated_at     = NOW()
  `;
}

async function applyPiesData(sku, { desc, specs, images }) {
  if (desc) {
    await sql`
      UPDATE catalog_products SET description = ${desc}, updated_at = NOW()
      WHERE sku = ${sku} AND description IS NULL
    `;
  }
  if (specs.length) {
    await sql`DELETE FROM catalog_specs WHERE product_id = (SELECT id FROM catalog_products WHERE sku = ${sku}) AND vendor = 'pu'`;
    for (const s of specs) {
      await sql`
        INSERT INTO catalog_specs (product_id, attribute, value, vendor)
        SELECT id, ${s.attribute}, ${s.value}, 'pu'
        FROM catalog_products WHERE sku = ${sku}
        ON CONFLICT DO NOTHING
      `;
    }
  }
  if (images.length) {
    await sql`DELETE FROM catalog_media WHERE product_id = (SELECT id FROM catalog_products WHERE sku = ${sku}) AND vendor = 'pu'`;
    for (const img of images) {
      await sql`
        INSERT INTO catalog_media (product_id, url, media_type, priority, vendor)
        SELECT id, ${img.url}, ${img.media_type}, ${img.priority}, 'pu'
        FROM catalog_products WHERE sku = ${sku}
        ON CONFLICT DO NOTHING
      `;
    }
  }
}

async function applyFitment(fitmentRows) {
  for (const f of fitmentRows) {
    await sql`
      INSERT INTO catalog_fitment (product_id, make, model, year_start, year_end, vendor)
      SELECT id, ${f.make}, ${f.model}, ${f.year_start}, ${f.year_end}, 'pu'
      FROM catalog_products WHERE sku = ${f.sku}
      ON CONFLICT DO NOTHING
    `;
  }
}

// ─── pass 1: CSV rows ─────────────────────────────────────────────────────────

async function runCsvPass() {
  console.log('[Stage1-PU] Pass 1 — CSV price file rows...');
  const rows = await sql`SELECT id, payload FROM raw_vendor_pu ORDER BY id`;
  let upserted = 0, failed = 0;

  for (const row of rows) {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    const items   = Array.isArray(payload) ? payload : [payload];

    for (const item of items) {
      const mapped = mapPuCsvRow(item);
      if (!mapped) { failed++; continue; }
      try {
        const productId = await upsertProduct(mapped.product);
        await upsertOffer(productId, mapped.offer);
        upserted++;
      } catch (err) {
        console.error(`[Stage1-PU] CSV fail SKU ${item['Part Number']}: ${err.message}`);
        failed++;
      }
    }
  }
  console.log(`[Stage1-PU] CSV pass done. Upserted: ${upserted} | Failed: ${failed}`);
}

// ─── pass 2: PIES XML ─────────────────────────────────────────────────────────

async function runPiesPass() {
  console.log('[Stage1-PU] Pass 2 — PIES XML...');
  const rows = await sql`SELECT id, payload FROM raw_vendor_pies ORDER BY id`;
  let applied = 0, failed = 0;

  for (const row of rows) {
    try {
      const xmlStr = typeof row.payload === 'string'
        ? row.payload
        : JSON.stringify(row.payload);

      const parsed = await parseStringPromise(xmlStr, { explicitArray: true });
      const root   = parsed.PIES ?? parsed.Items ?? parsed.PartsList;
      if (!root) continue;

      const items = root.Item ?? root.Part ?? root.Items?.[0]?.Item ?? [];
      for (const item of items) {
        const mapped = parsePiesItem(item);
        if (!mapped) { failed++; continue; }
        try {
          await applyPiesData(mapped.sku, mapped);
          applied++;
        } catch (err) {
          console.error(`[Stage1-PU] PIES fail SKU ${mapped.sku}: ${err.message}`);
          failed++;
        }
      }
    } catch (err) {
      console.error(`[Stage1-PU] PIES XML parse error row ${row.id}: ${err.message}`);
    }
  }
  console.log(`[Stage1-PU] PIES pass done. Applied: ${applied} | Failed: ${failed}`);
}

// ─── pass 3: ACES XML ─────────────────────────────────────────────────────────

async function runAcesPass() {
  console.log('[Stage1-PU] Pass 3 — ACES fitment XML...');
  const rows = await sql`SELECT id, payload FROM raw_vendor_aces ORDER BY id`;
  let applied = 0, failed = 0;

  for (const row of rows) {
    try {
      const xmlStr = typeof row.payload === 'string'
        ? row.payload
        : JSON.stringify(row.payload);

      const parsed = await parseStringPromise(xmlStr, { explicitArray: true });
      const apps   = parsed.ACES?.Catalog?.[0]?.App
        ?? parsed.ACES?.App
        ?? [];

      const fitmentRows = [];
      for (const app of apps) {
        const f = parseAcesApp(app);
        if (f) fitmentRows.push(f);
        else failed++;
      }

      // Batch in chunks of 500
      for (let i = 0; i < fitmentRows.length; i += 500) {
        await applyFitment(fitmentRows.slice(i, i + 500));
        applied += Math.min(500, fitmentRows.length - i);
      }
    } catch (err) {
      console.error(`[Stage1-PU] ACES parse error row ${row.id}: ${err.message}`);
    }
  }
  console.log(`[Stage1-PU] ACES pass done. Applied: ${applied} | Failed: ${failed}`);
}

// ─── main ─────────────────────────────────────────────────────────────────────

export async function normalizePu() {
  console.log('[Stage1-PU] Starting PU normalization (3 passes)...');
  await runCsvPass();
  await runPiesPass();
  await runAcesPass();
  console.log('[Stage1-PU] All passes complete.');
}
