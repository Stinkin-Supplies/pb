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

// ─── progress (terminal status bar) ───────────────────────────────────────────

function countPuPayloadItems(rows) {
  let n = 0;
  for (const row of rows) {
    try {
      const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
      const items = Array.isArray(payload) ? payload : [payload];
      n += items.length;
    } catch {
      n += 1;
    }
  }
  return n;
}

function writeProgressLine(label, current, total, tail = '') {
  if (total <= 0) {
    process.stdout.write(`\r\x1b[K[Stage1-PU] ${label} … ${current}${tail}\n`);
    return;
  }
  const pct = Math.min(100, (current / total) * 100);
  const w = 26;
  const filled = Math.round((pct / 100) * w);
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, w - filled));
  const extra = tail ? ` ${tail}` : '';
  process.stdout.write(
    `\r\x1b[K[Stage1-PU] ${label} │${bar}│ ${pct.toFixed(1)}% (${current}/${total})${extra}`,
  );
}

function writeActivityLine(label, detail) {
  process.stdout.write(`\r\x1b[K[Stage1-PU] ${label} … ${detail}`);
}

function makeProgressThrottler(minIntervalMs = 200) {
  let last = 0;
  return (fn) => {
    const now = Date.now();
    if (now - last >= minIntervalMs) {
      last = now;
      fn();
    }
  };
}

// ─── CSV row mapper ───────────────────────────────────────────────────────────
// Handles D00108_PriceFile.csv shape:
//   Part Number | Punctuated Part Number | Your Dealer Price
// Extended rows may include: Description, Brand, Category, Stock fields

function mapPuCsvRow(row) {
  // D00108 price file: Part Number, Your Dealer Price, …
  // BasePriceFile (stage0-pu-baseprice.cjs): sku, cost, warehouse_wi, …
  const sku =
    row['Part Number'] ??
    row['PartNumber'] ??
    row['part_number'] ??
    row.sku ??
    null;

  const price = toNum(
    row['Your Dealer Price'] ??
      row['dealer_price'] ??
      row['price'] ??
      row['cost'] ??
      row['Base Dealer Price'] ??
      null,
  );
  const msrp = toNum(
    row['MSRP'] ?? row['msrp'] ?? row['Current Suggested Retail'] ?? null,
  );
  const map = toNum(
    row['MAP'] ?? row['map'] ?? row['map_price'] ?? row['Ad Policy'] ?? null,
  );

  const name =
    row['Description'] ??
    row['description'] ??
    row['product_name'] ??
    row['name'] ??
    row['Part Description'] ??
    null;
  const brand =
    row['Brand'] ?? row['brand'] ?? row['Brand Name'] ?? 'Parts Unlimited';
  const category = row['Category'] ?? row['category'] ?? null;
  const mpn =
    row['Manufacturer Part Number'] ??
    row['MPN'] ??
    row['mpn'] ??
    row['vendor_part_number'] ??
    sku;

  // Stock — short codes (D00108) or BasePriceFile warehouse_* / * Availability
  const warehouseJson = {};
  const warehouseCols = ['WI', 'NY', 'TX', 'NV', 'NC'];
  const prefixedByWh = {
    WI: row.warehouse_wi ?? row['WI Availability'],
    NY: row.warehouse_ny ?? row['NY Availability'],
    TX: row.warehouse_tx ?? row['TX Availability'],
    NV: row.warehouse_nv ?? row['NV Availability'],
    NC: row.warehouse_nc ?? row['NC Availability'],
  };
  for (const wh of warehouseCols) {
    const lower = wh.toLowerCase();
    if (row[wh] !== undefined) warehouseJson[lower] = Number(row[wh]) || 0;
    else {
      const v = prefixedByWh[wh];
      if (v !== undefined && v !== null) warehouseJson[lower] = Number(v) || 0;
    }
  }

  const totalQty =
    Object.values(warehouseJson).reduce((s, v) => s + v, 0) ||
    (toNum(row['Stock'] ?? row['stock_quantity'] ?? row['qty']) ?? 0) ||
    (toNum(row['total_qty']) ?? 0) ||
    (toNum(row['National Availability']) ?? 0);

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
  const totalItems = countPuPayloadItems(rows);
  let upserted = 0, failed = 0;
  let done = 0;
  const tick = makeProgressThrottler(200);
  writeProgressLine('Pass 1 CSV', 0, totalItems, 'starting');

  for (const row of rows) {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    const items   = Array.isArray(payload) ? payload : [payload];

    for (const item of items) {
      done++;
      const mapped = mapPuCsvRow(item);
      if (!mapped) {
        failed++;
        tick(() =>
          writeProgressLine('Pass 1 CSV', done, totalItems, `ok ${upserted} err ${failed}`),
        );
        continue;
      }
      try {
        const productId = await upsertProduct(mapped.product);
        await upsertOffer(productId, mapped.offer);
        upserted++;
      } catch (err) {
        process.stdout.write('\n');
        if (failed === 0) console.error(`[Stage1-PU] First error:`, err.message);
        failed++;
      }
      tick(() =>
        writeProgressLine('Pass 1 CSV', done, totalItems, `ok ${upserted} err ${failed}`),
      );
    }
  }
  writeProgressLine('Pass 1 CSV', totalItems, totalItems, `ok ${upserted} err ${failed}`);
  process.stdout.write('\n');
  console.log(`[Stage1-PU] CSV pass done. Upserted: ${upserted} | Failed: ${failed}`);
}

// ─── pass 2: PIES XML ─────────────────────────────────────────────────────────

async function runPiesPass() {
  console.log('[Stage1-PU] Pass 2 — PIES XML...');
  const rows = await sql`SELECT id, payload FROM raw_vendor_pies ORDER BY id`;
  let applied = 0, failed = 0;
  const totalFiles = rows.length;
  let fileIdx = 0;
  let itemPass = 0;
  const tick = makeProgressThrottler(250);
  const tickItems = makeProgressThrottler(300);
  writeProgressLine('Pass 2 PIES', 0, totalFiles, 'files');

  for (const row of rows) {
    try {
      const xmlStr = typeof row.payload === 'string'
        ? row.payload
        : JSON.stringify(row.payload);

      const parsed = xmlParser.parse(xmlStr);
      const root   = parsed.PIES ?? parsed.Items ?? parsed.PartsList;
      if (!root) {
        fileIdx++;
        tick(() =>
          writeProgressLine('Pass 2 PIES', fileIdx, totalFiles, `applied ${applied} fail ${failed}`),
        );
        continue;
      }

      const items = asArray(root.Item ?? root.Part ?? root.Items?.Item ?? root.Items?.[0]?.Item ?? []);
      for (const item of items) {
        itemPass++;
        tickItems(() =>
          writeActivityLine(
            'Pass 2 PIES',
            `file ${fileIdx + 1}/${totalFiles} · items ~${itemPass} · applied ${applied}`,
          ),
        );
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
    fileIdx++;
    tick(() =>
      writeProgressLine('Pass 2 PIES', fileIdx, totalFiles, `applied ${applied} fail ${failed}`),
    );
  }
  writeProgressLine('Pass 2 PIES', totalFiles, totalFiles, `applied ${applied} fail ${failed}`);
  process.stdout.write('\n');
  console.log(`[Stage1-PU] PIES pass done. Applied: ${applied} | Failed: ${failed}`);
}

// ─── pass 3: ACES XML ─────────────────────────────────────────────────────────

async function runAcesPass() {
  console.log('[Stage1-PU] Pass 3 — ACES fitment XML...');
  const rows = await sql`SELECT id, payload FROM raw_vendor_aces ORDER BY id`;
  let applied = 0, failed = 0;
  const totalFiles = rows.length;
  let fileIdx = 0;
  const tick = makeProgressThrottler(250);
  writeProgressLine('Pass 3 ACES', 0, totalFiles, 'files');

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
        tick(() =>
          writeActivityLine(
            'Pass 3 ACES',
            `file ${fileIdx + 1}/${totalFiles} · fitment rows ${applied} fail ${failed}`,
          ),
        );
      }
    } catch (err) {
      console.error(`[Stage1-PU] ACES parse error row ${row.id}: ${err.message}`);
    }
    fileIdx++;
    tick(() =>
      writeProgressLine('Pass 3 ACES', fileIdx, totalFiles, `fitment ${applied} fail ${failed}`),
    );
  }
  writeProgressLine('Pass 3 ACES', totalFiles, totalFiles, `fitment ${applied} fail ${failed}`);
  process.stdout.write('\n');
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
