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
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  isArray: (name) =>
    ['Item', 'Description', 'ExtendedProductInformation', 'DigitalAsset', 'DigitalFileInformation', 'App', 'Package'].includes(name),
});

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

function first(val) {
  if (Array.isArray(val)) return val[0] ?? null;
  return val ?? null;
}

function text(val) {
  const v = first(val);
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (typeof v === 'object') return text(v['#text'] ?? v._ ?? null);
  return null;
}

function asArray(val) {
  if (val === null || val === undefined) return [];
  return Array.isArray(val) ? val : [val];
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
    || (toNum(row['Stock'] ?? row['stock_quantity'] ?? row['qty']) ?? 0);

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
      stock_quantity:          totalQty,
    },
    offer: {
      vendor_code:   'pu',
      vendor_part_number: sku,
      manufacturer_part_number: mpn,
      wholesale_cost: price,   // dealer price = our cost
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
  const sku  = text(item.PartNumber) ?? text(item.ItemLevelGTIN) ?? null;
  if (!sku) return null;

  const desc = text(item.MarketingCopy)
    ?? text(item.LongDescription)
    ?? text(item.ShortDescription)
    ?? null;

  // Bullets → specs (bullet1..bullet24 or Expi/Features nodes)
  const specs = [];
  for (let i = 1; i <= 24; i++) {
    const bullet = text(item[`bullet${i}`]) ?? text(item[`Bullet${i}`]);
    if (bullet) specs.push({ attribute: `feature_${i}`, value: bullet });
  }
  // ExtendedAttributes / PIES PAdb attributes
  const extAttrs = asArray(item.ExtendedInformation?.ExtendedProductInformation ?? item.ExtendedProductInformation ?? item.ExtendedAttributes ?? []);
  for (const attr of extAttrs) {
    const name = attr.EXPICode ?? attr.Name ?? attr.EXPID ?? attr.AttributeName ?? null;
    const value = attr['#text'] ?? attr.Value ?? attr._ ?? null;
    if (name && value !== null && value !== undefined && String(value).trim() !== '') {
      specs.push({ attribute: String(name), value: String(value) });
    }
  }

  // Digital assets → images
  const images = [];
  const assets = asArray(item.DigitalAssets?.DigitalAsset ?? item.DigitalAssets?.DigitalFileInformation ?? []);
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const uri   = text(asset.URI) ?? text(asset.AssetURI);
    const type  = text(asset.AssetType) ?? 'P04'; // P04 = primary image in PIES
    if (uri) images.push({ url: uri, media_type: 'image', priority: type === 'P04' ? 0 : i + 1 });
  }

  return { sku, desc, specs, images };
}

// ─── ACES XML mapper ─────────────────────────────────────────────────────────

function parseAcesApp(app) {
  const partNode = first(app.Part);
  const sku   = text(partNode?._ ?? partNode ?? app.PartNumber ?? app.Part);
  const baseVehicle = first(app.BaseVehicle);
  const make  = text(baseVehicle?.Make ?? app.Make);
  const model = text(baseVehicle?.Model ?? app.Model);
  const year  = toNum(text(baseVehicle?.Year ?? app.Year));
  const yearEnd = toNum(text(baseVehicle?.YearTo ?? app.YearTo)) ?? year;
  if (!sku || !make || !model || !year) return null;
  return { sku, make, model, year_start: year, year_end: yearEnd ?? year };
}

// ─── DB writers ───────────────────────────────────────────────────────────────

async function upsertProduct(p) {
  const rows = await sql`
    INSERT INTO catalog_products
      (sku, name, brand, manufacturer_part_number, slug, description, category, stock_quantity, is_active, updated_at)
    VALUES
      (${p.sku}, ${p.name}, ${p.brand}, ${p.manufacturer_part_number},
       ${p.slug}, ${p.description}, ${p.category}, ${p.stock_quantity ?? 0}, true, NOW())
    ON CONFLICT (sku) DO UPDATE SET
      name                     = COALESCE(EXCLUDED.name,     catalog_products.name),
      brand                    = COALESCE(EXCLUDED.brand,    catalog_products.brand),
      manufacturer_part_number = COALESCE(EXCLUDED.manufacturer_part_number, catalog_products.manufacturer_part_number),
      description              = COALESCE(EXCLUDED.description, catalog_products.description),
      category                 = COALESCE(EXCLUDED.category, catalog_products.category),
      stock_quantity           = COALESCE(EXCLUDED.stock_quantity, catalog_products.stock_quantity),
      is_active                = true,
      updated_at               = NOW()
    RETURNING id
  `;
  return rows[0].id;
}

async function upsertOffer(productId, offer) {
  await sql`
    INSERT INTO vendor_offers
      (catalog_product_id, vendor_code, vendor_part_number, manufacturer_part_number, wholesale_cost, msrp, map_price, total_qty, warehouse_json, updated_at)
    VALUES
      (${productId}, ${offer.vendor_code}, ${offer.vendor_part_number}, ${offer.manufacturer_part_number}, ${offer.wholesale_cost}, ${offer.msrp}, ${offer.map_price},
       ${offer.total_qty}, ${JSON.stringify(offer.warehouse_json)}, NOW())
    ON CONFLICT (catalog_product_id, vendor_code) DO UPDATE SET
      vendor_part_number       = COALESCE(EXCLUDED.vendor_part_number, vendor_offers.vendor_part_number),
      manufacturer_part_number = COALESCE(EXCLUDED.manufacturer_part_number, vendor_offers.manufacturer_part_number),
      wholesale_cost           = COALESCE(EXCLUDED.wholesale_cost, vendor_offers.wholesale_cost),
      msrp                     = COALESCE(EXCLUDED.msrp,      vendor_offers.msrp),
      map_price                = COALESCE(EXCLUDED.map_price, vendor_offers.map_price),
      total_qty                = EXCLUDED.total_qty,
      warehouse_json           = EXCLUDED.warehouse_json,
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
    await sql`DELETE FROM catalog_specs WHERE product_id = (SELECT id FROM catalog_products WHERE sku = ${sku})`;
    for (const s of specs) {
      await sql`
        INSERT INTO catalog_specs (product_id, attribute, value)
        SELECT id, ${s.attribute}, ${s.value}
        FROM catalog_products WHERE sku = ${sku}
        ON CONFLICT DO NOTHING
      `;
    }
  }
  if (images.length) {
    await sql`DELETE FROM catalog_media WHERE product_id = (SELECT id FROM catalog_products WHERE sku = ${sku})`;
    for (const img of images) {
      await sql`
        INSERT INTO catalog_media (product_id, url, media_type, priority)
        SELECT id, ${img.url}, ${img.media_type}, ${img.priority}
        FROM catalog_products WHERE sku = ${sku}
        ON CONFLICT DO NOTHING
      `;
    }
  }
}

async function applyFitment(fitmentRows) {
  for (const f of fitmentRows) {
    await sql`
      INSERT INTO catalog_fitment (product_id, make, model, year_start, year_end)
      SELECT id, ${f.make}, ${f.model}, ${f.year_start}, ${f.year_end}
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

      const parsed = xmlParser.parse(xmlStr);
      const root   = parsed.PIES ?? parsed.Items ?? parsed.PartsList;
      if (!root) continue;

      const items = asArray(root.Item ?? root.Part ?? root.Items?.Item ?? root.Items?.[0]?.Item ?? []);
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

      const parsed = xmlParser.parse(xmlStr);
      const apps   = parsed.ACES?.Catalog?.App
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
