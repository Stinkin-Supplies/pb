/**
 * Stage 0/1 hybrid: WPS vehicle fitment -> catalog_fitment
 *
 * Why this exists:
 * - WPS item payloads do not contain structured fitment keys.
 * - WPS exposes vehicle/make/model/year via /vehicles and item associations via /vehicles/{id}/items.
 *
 * What it does:
 * 1) Fetches WPS /vehicles?include=vehiclemodel.vehiclemake,vehicleyear pages.
 * 2) Writes each vehicles page to raw_vendor_wps_vehicles for audit/resume.
 * 3) For each vehicle, fetches /vehicles/{id}/items and maps item numbers to catalog_products.sku.
 * 4) Inserts deduped rows into public.catalog_fitment.
 *
 * Usage:
 *   npx dotenv -e .env.local -- node scripts/ingest/stage0-wps-fitment.js
 *
 * Tuning (env vars):
 *   WPS_FITMENT_VEHICLES_PAGE_SIZE=100
 *   WPS_FITMENT_ITEMS_PAGE_SIZE=200
 *   WPS_FITMENT_MAX_VEHICLES=0           # 0 = no limit
 *   WPS_FITMENT_CONCURRENCY=1            # keep low; WPS may rate-limit
 *   WPS_FITMENT_FROM_PAGE=1              # 1-based
 *   WPS_FITMENT_RESET=0                  # 1 = ignore checkpoint
 *
 * Notes:
 * - Uses WPS_API_KEY Bearer auth.
 * - Uses CATALOG_DATABASE_URL for writes.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import sql from '../lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true });

const WPS_BASE = 'https://api.wps-inc.com';

const CHECKPOINT_FILE = path.resolve(__dirname, '.stage0_wps_fitment_checkpoint.json');

const VEHICLES_PAGE_SIZE = parseInt(process.env.WPS_FITMENT_VEHICLES_PAGE_SIZE || '100', 10) || 100;
const ITEMS_PAGE_SIZE = parseInt(process.env.WPS_FITMENT_ITEMS_PAGE_SIZE || '200', 10) || 200;
const MAX_VEHICLES = parseInt(process.env.WPS_FITMENT_MAX_VEHICLES || '0', 10) || 0;
const CONCURRENCY = Math.max(1, parseInt(process.env.WPS_FITMENT_CONCURRENCY || '1', 10) || 1);
const FROM_PAGE = Math.max(1, parseInt(process.env.WPS_FITMENT_FROM_PAGE || '1', 10) || 1);
const RESET = (process.env.WPS_FITMENT_RESET || '0') === '1';

const WPS_KEY = process.env.WPS_API_KEY || '';
if (!WPS_KEY) {
  console.error('❌ Missing WPS_API_KEY in .env.local');
  process.exit(1);
}

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('❌ Missing CATALOG_DATABASE_URL in .env.local');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeFacetValue(s) {
  if (s == null) return null;
  const v = String(s).trim().toLowerCase();
  if (!v) return null;
  return v.replace(/\s+/g, ' ');
}

function safeInt(v) {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

function buildIncludedIndex(included) {
  const map = new Map();
  if (!Array.isArray(included)) return map;
  for (const item of included) {
    if (!item || !item.id) continue;
    const type = item.type || item.resourceType || item.kind || 'unknown';
    map.set(`${type}:${String(item.id)}`, item);
  }
  return map;
}

function getJsonApiAttr(node, key) {
  if (!node) return null;
  if (node.attributes && Object.prototype.hasOwnProperty.call(node.attributes, key)) {
    return node.attributes[key];
  }
  if (Object.prototype.hasOwnProperty.call(node, key)) return node[key];
  return null;
}

function resolveRelationship(node, relName, includedIndex) {
  const rel = node?.relationships?.[relName]?.data;
  if (!rel) return null;
  const type = rel.type || rel.resourceType || rel.kind;
  const id = rel.id;
  if (!type || !id) return null;
  return includedIndex.get(`${type}:${String(id)}`) || null;
}

function extractVehicleYmm(vehicleNode, includedIndex) {
  // JSON:API style: vehiclemodel + vehicleyear relationships
  const modelNode = resolveRelationship(vehicleNode, 'vehiclemodel', includedIndex);
  const yearNode = resolveRelationship(vehicleNode, 'vehicleyear', includedIndex);

  const makeNode = modelNode ? resolveRelationship(modelNode, 'vehiclemake', includedIndex) : null;

  const make = normalizeFacetValue(
    getJsonApiAttr(makeNode, 'name') ??
      getJsonApiAttr(makeNode, 'label') ??
      getJsonApiAttr(makeNode, 'make') ??
      null
  );
  const model = normalizeFacetValue(
    getJsonApiAttr(modelNode, 'name') ??
      getJsonApiAttr(modelNode, 'label') ??
      getJsonApiAttr(modelNode, 'model') ??
      null
  );

  const year =
    safeInt(getJsonApiAttr(yearNode, 'year')) ??
    safeInt(getJsonApiAttr(yearNode, 'value')) ??
    safeInt(getJsonApiAttr(vehicleNode, 'year')) ??
    null;

  return { make, model, year };
}

async function fetchJson(url, { retries = 6 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${WPS_KEY}`,
        Accept: 'application/json',
      },
    });

    if (res.status === 429 || res.status >= 500) {
      const backoff = Math.min(30_000, 500 * attempt * attempt);
      console.warn(`[WPS] ${res.status} on ${url}. Backing off ${backoff}ms (attempt ${attempt}/${retries})`);
      await sleep(backoff);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`WPS API error ${res.status} for ${url}${body ? ` — ${body.slice(0, 200)}` : ''}`);
    }

    return res.json();
  }

  throw new Error(`WPS API failed after ${retries} retries: ${url}`);
}

function loadCheckpoint() {
  if (RESET) return null;
  if (!fs.existsSync(CHECKPOINT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveCheckpoint(obj) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(obj, null, 2));
}

async function upsertRawVehiclesPage(payload, key) {
  await sql`
    INSERT INTO public.raw_vendor_wps_vehicles (payload, source_file, imported_at)
    VALUES (${JSON.stringify(payload)}::jsonb, ${key}, NOW())
    ON CONFLICT (source_file) DO UPDATE
      SET payload = EXCLUDED.payload,
          imported_at = NOW()
  `;
}

async function getProductIdMapForSkus(skus) {
  if (!skus.length) return new Map();
  const rows = await sql`
    SELECT id, sku
    FROM public.catalog_products
    WHERE sku = ANY(${skus})
  `;
  const m = new Map();
  for (const r of rows) m.set(String(r.sku), Number(r.id));
  return m;
}

async function insertFitmentRows(rows) {
  // rows: { product_id, make, model, year_start, year_end, notes }
  if (!rows.length) return 0;

  const productIds = [];
  const makes = [];
  const models = [];
  const yearStarts = [];
  const yearEnds = [];
  const notesArr = [];

  for (const r of rows) {
    productIds.push(r.product_id);
    makes.push(r.make);
    models.push(r.model);
    yearStarts.push(r.year_start);
    yearEnds.push(r.year_end);
    notesArr.push(r.notes ?? null);
  }

  const inserted = await sql`
    INSERT INTO public.catalog_fitment (product_id, make, model, year_start, year_end, notes, created_at)
    SELECT *
    FROM UNNEST(
      ${productIds}::int[],
      ${makes}::text[],
      ${models}::text[],
      ${yearStarts}::int[],
      ${yearEnds}::int[],
      ${notesArr}::text[],
      ARRAY(SELECT NOW() FROM generate_series(1, array_length(${productIds}::int[], 1)))::timestamptz[]
    )
    ON CONFLICT DO NOTHING
    RETURNING 1
  `;

  return inserted.length;
}

async function fetchVehicleItems(vehicleId) {
  // We assume /vehicles/{id}/items supports JSON:API-ish pagination with page[number]/page[size].
  // If this endpoint uses cursor pagination, we still terminate when data length is 0.
  const allSkus = [];
  let page = 1;
  for (;;) {
    const url = new URL(`${WPS_BASE}/vehicles/${vehicleId}/items`);
    url.searchParams.set('page[size]', String(ITEMS_PAGE_SIZE));
    url.searchParams.set('page[number]', String(page));

    const json = await fetchJson(url.toString());
    const items = json?.data ?? json?.items ?? [];
    if (!Array.isArray(items) || items.length === 0) break;

    for (const it of items) {
      const sku =
        getJsonApiAttr(it, 'sku') ??
        getJsonApiAttr(it, 'itemNumber') ??
        getJsonApiAttr(it, 'item_number') ??
        getJsonApiAttr(it, 'number') ??
        getJsonApiAttr(it, 'id') ??
        null;
      if (sku) allSkus.push(String(sku));
    }

    page++;
    if (page > 10000) throw new Error(`Aborting: too many item pages for vehicle ${vehicleId}`);
  }

  return allSkus;
}

async function main() {
  console.log('🚚 Stage0-WPS-Fitment: Building catalog_fitment from WPS vehicles');
  console.log(`Vehicles page size: ${VEHICLES_PAGE_SIZE}`);
  console.log(`Items page size:   ${ITEMS_PAGE_SIZE}`);
  console.log(`Concurrency:       ${CONCURRENCY}`);
  console.log(`Max vehicles:      ${MAX_VEHICLES || 'no limit'}`);

  const checkpoint = loadCheckpoint();
  let page = checkpoint?.page ?? FROM_PAGE;
  let processedVehicles = checkpoint?.processedVehicles ?? 0;
  let insertedRows = checkpoint?.insertedRows ?? 0;
  let skippedNoSku = checkpoint?.skippedNoSku ?? 0;
  let skippedNoProduct = checkpoint?.skippedNoProduct ?? 0;
  let skippedBadYmm = checkpoint?.skippedBadYmm ?? 0;

  console.log(checkpoint ? `♻️  Resuming from page ${page}` : `▶  Starting at page ${page}`);

  let active = 0;
  const queue = [];
  async function runTask(fn) {
    if (active >= CONCURRENCY) await new Promise((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = queue.shift();
      if (next) next();
    }
  }

  for (;;) {
    const vehiclesUrl = new URL(`${WPS_BASE}/vehicles`);
    vehiclesUrl.searchParams.set('include', 'vehiclemodel.vehiclemake,vehicleyear');
    vehiclesUrl.searchParams.set('page[size]', String(VEHICLES_PAGE_SIZE));
    vehiclesUrl.searchParams.set('page[number]', String(page));

    const payload = await fetchJson(vehiclesUrl.toString());
    const data = payload?.data ?? [];
    if (!Array.isArray(data) || data.length === 0) {
      console.log(`\n✓ No more vehicles at page ${page}. Done.`);
      break;
    }

    await upsertRawVehiclesPage(payload, `wps_vehicles_page_${String(page).padStart(6, '0')}`);

    const includedIndex = buildIncludedIndex(payload?.included);

    // Process vehicles (bounded concurrency)
    const tasks = data.map((v) =>
      runTask(async () => {
        const vehicleId = String(v.id ?? getJsonApiAttr(v, 'id') ?? '');
        if (!vehicleId) return;

        const { make, model, year } = extractVehicleYmm(v, includedIndex);
        if (!make || !model || !year) {
          skippedBadYmm++;
          return;
        }

        const skus = await fetchVehicleItems(vehicleId);
        if (!skus.length) {
          skippedNoSku++;
          return;
        }

        // Resolve to product IDs in chunks to keep query params sane.
        const fitmentRows = [];
        const notes = `wps_vehicle_id=${vehicleId}`;

        for (let i = 0; i < skus.length; i += 2000) {
          const chunk = skus.slice(i, i + 2000);
          const idMap = await getProductIdMapForSkus(chunk);
          for (const sku of chunk) {
            const productId = idMap.get(sku);
            if (!productId) {
              skippedNoProduct++;
              continue;
            }
            fitmentRows.push({
              product_id: productId,
              make,
              model,
              year_start: year,
              year_end: year,
              notes,
            });
          }
        }

        if (fitmentRows.length) {
          // Insert in manageable batches.
          for (let i = 0; i < fitmentRows.length; i += 2000) {
            const batch = fitmentRows.slice(i, i + 2000);
            insertedRows += await insertFitmentRows(batch);
          }
        }

        processedVehicles++;
      })
    );

    await Promise.all(tasks);

    saveCheckpoint({
      page,
      processedVehicles,
      insertedRows,
      skippedNoSku,
      skippedNoProduct,
      skippedBadYmm,
      updatedAt: new Date().toISOString(),
    });

    process.stdout.write(
      `\rPage ${page} | vehicles: ${processedVehicles} | fitment inserted: ${insertedRows} | skipped ymm:${skippedBadYmm} noSku:${skippedNoSku} noProduct:${skippedNoProduct}        `
    );

    if (MAX_VEHICLES && processedVehicles >= MAX_VEHICLES) {
      console.log(`\n✓ Reached WPS_FITMENT_MAX_VEHICLES=${MAX_VEHICLES}. Stopping.`);
      break;
    }

    page++;
    if (page > 1000000) throw new Error('Aborting: too many vehicle pages');
  }

  console.log('\n');
  console.log('✅ Stage0-WPS-Fitment complete');
  console.log(`Vehicles processed: ${processedVehicles}`);
  console.log(`Fitment inserted:   ${insertedRows}`);
  console.log(`Skipped bad Y/M/Y:  ${skippedBadYmm}`);
  console.log(`Skipped no items:   ${skippedNoSku}`);
  console.log(`Skipped no product: ${skippedNoProduct}`);
  console.log(`Checkpoint:         ${CHECKPOINT_FILE}`);
}

process.on('SIGINT', () => {
  console.log('\n[WPS-Fitment] Caught SIGINT. Checkpoint is saved; re-run to resume.');
  process.exit(130);
});

main().catch((err) => {
  console.error('\n❌ Stage0-WPS-Fitment failed:', err?.message ?? err);
  process.exit(1);
});

