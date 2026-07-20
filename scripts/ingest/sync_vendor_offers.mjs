#!/usr/bin/env node
/**
 * sync_vendor_offers.mjs
 *
 * Populates vendor_offers (0 rows since the July 18 TRUNCATE incident) with
 * real per-vendor cost/price/stock data, one row per (catalog_unified.id,
 * vendor_code) via the table's existing UNIQUE (catalog_product_id,
 * vendor_code) constraint. This is the table lib/db/browse.ts and
 * app/api/browse/variants/[productId]/route.ts already LEFT JOIN against
 * for live stock_qty/offer_price display -- until this runs, every product
 * on the site shows stock_qty=0 / falls back to cu.msrp.
 *
 * Three source-quality tiers, confirmed by direct query against this DB:
 *   PU    -- pu_catalog joined via cu.sku = pu.sku (NOT vendor_sku -- confirmed
 *            36,684/36,701 match; vendor_sku join only hit 880).
 *            Has real per-warehouse qty (wi/ny/tx/nv/nc) + dealer_price +
 *            dropship_fee. Values like "20+" appear in warehouse columns --
 *            parsed as a floor (20).
 *   VTWIN -- vtwin_catalog joined via cu.vendor_sku = vt.sku (38,160/38,315
 *            match). Only has a boolean has_stock, no real quantity and no
 *            drop-ship fee data -- total_qty is a PLACEHOLDER (1 or 0),
 *            not a real count. Documented inline; do not treat as inventory.
 *   WPS   -- cu.vendor_sku = wps.sku. Two sources merged: the fresh WPS
 *            pricing CSV (scripts/data/wps/wps_pricing.csv, actual/standard
 *            dealer price + real drop_ship_fee, preferred when present) and
 *            wps_catalog (list_price/map_price/stock_quantity/in_stock,
 *            refreshed this session) as fallback + stock source. WPS's 7
 *            named warehouses (boise/fresno/elizabethtown/ashley/
 *            midlothian/jessup/midway) do NOT get force-mapped onto
 *            vendor_offers' 2-letter state qty columns (wi/ny/tx/ca/nv/nc/
 *            ga/id/in/pa) -- that mapping is not confidently known. Only
 *            total_qty (already computed by pull_wps_catalog.mjs) is used;
 *            the raw per-warehouse breakdown is preserved in warehouse_json
 *            instead of guessed into a specific state column.
 *
 * Usage:
 *   node sync_vendor_offers.mjs            # dry run (default)
 *   node sync_vendor_offers.mjs --apply    # writes changes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';
import { parse } from 'csv-parse/sync';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env.local') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const APPLY = process.argv.includes('--apply');
const WPS_PRICING_CSV = path.join(__dirname, '../data/wps/wps_pricing.csv');

if (!process.env.CATALOG_DATABASE_URL) {
  console.error('CATALOG_DATABASE_URL is not set -- check .env.local at the repo root.');
  process.exit(1);
}
// statement_timeout/query_timeout matter here: the previous run hung
// silently for ~4 hours at a dead-but-not-erroring connection (no RST/FIN
// received, so the reconnect-on-error logic in runPhase never triggered --
// there was no error, just a query that never returned). A bounded timeout
// turns that into a thrown error, which the reconnect loop already handles.
const pool = new pg.Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  statement_timeout: 15000,
  query_timeout: 15000,
  connectionTimeoutMillis: 10000,
});

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// PU warehouse columns store values like "0", "4", "20+" -- "+" means "at
// least this many", parsed as a floor rather than dropped.
function puQty(v) {
  if (v === null || v === undefined) return 0;
  const n = parseInt(String(v).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

async function upsertOffer(client, offer) {
  await client.query(
    `INSERT INTO vendor_offers (
       catalog_product_id, vendor_code, vendor_part_number, manufacturer_part_number,
       wholesale_cost, map_price, msrp, drop_ship_fee, drop_ship_eligible, is_active,
       total_qty, in_stock, wi_qty, ny_qty, tx_qty, ca_qty, nv_qty, nc_qty, ga_qty, id_qty, in_qty, pa_qty,
       our_price, last_stock_sync, computed_at, warehouse_json
     ) VALUES (
       $1,$2,$3,$4, $5,$6,$7,$8,$9,true,
       $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
       $22,now(),now(),$23
     )
     ON CONFLICT (catalog_product_id, vendor_code) DO UPDATE SET
       vendor_part_number = EXCLUDED.vendor_part_number,
       manufacturer_part_number = EXCLUDED.manufacturer_part_number,
       wholesale_cost = EXCLUDED.wholesale_cost,
       map_price = EXCLUDED.map_price,
       msrp = EXCLUDED.msrp,
       drop_ship_fee = EXCLUDED.drop_ship_fee,
       drop_ship_eligible = EXCLUDED.drop_ship_eligible,
       is_active = true,
       total_qty = EXCLUDED.total_qty,
       in_stock = EXCLUDED.in_stock,
       wi_qty = EXCLUDED.wi_qty, ny_qty = EXCLUDED.ny_qty, tx_qty = EXCLUDED.tx_qty,
       ca_qty = EXCLUDED.ca_qty, nv_qty = EXCLUDED.nv_qty, nc_qty = EXCLUDED.nc_qty,
       ga_qty = EXCLUDED.ga_qty, id_qty = EXCLUDED.id_qty, in_qty = EXCLUDED.in_qty, pa_qty = EXCLUDED.pa_qty,
       our_price = EXCLUDED.our_price,
       last_stock_sync = now(),
       computed_at = now(),
       warehouse_json = EXCLUDED.warehouse_json,
       updated_at = now()
    `,
    [
      offer.catalogProductId, offer.vendorCode, offer.vendorPartNumber ?? null, offer.manufacturerPartNumber ?? null,
      offer.wholesaleCost, offer.mapPrice, offer.msrp, offer.dropShipFee, offer.dropShipEligible ?? false,
      offer.totalQty ?? 0, offer.inStock ?? false,
      offer.wiQty ?? 0, offer.nyQty ?? 0, offer.txQty ?? 0, offer.caQty ?? 0, offer.nvQty ?? 0, offer.ncQty ?? 0,
      offer.gaQty ?? 0, offer.idQty ?? 0, offer.inQty ?? 0, offer.paQty ?? 0,
      offer.ourPrice ?? offer.msrp ?? null,
      offer.warehouseJson ? JSON.stringify(offer.warehouseJson) : null,
    ]
  );
}

// Batched commits, not one giant transaction -- a 90k-row single transaction
// over individual per-row round trips ran long enough to hit a dropped
// connection with nothing committed at all (confirmed: vendor_offers had 0
// rows after the crash, full rollback). Committing every BATCH_SIZE rows
// means a dropped connection only loses the in-progress batch; upserts are
// idempotent (ON CONFLICT DO UPDATE), so re-running is always safe.
const BATCH_SIZE = 1000;

function isConnectionError(e) {
  return /connection|ECONNRESET|ETIMEDOUT|terminated|timeout/i.test(e?.message ?? '');
}

// Takes the pool (not a single client) -- the connection dropped mid-run
// twice in practice (confirmed via background job logs, both times deep into
// VTWIN's ~38k rows), and a plain client has no way to recover once its
// socket dies. Reconnects on a fresh client from the pool and retries the
// SAME row, rather than restarting the whole phase from scratch.
async function runPhase(pool, label, rows, buildOffer) {
  console.log(`\n── ${label}: ${rows.length} candidate rows ──`);
  let written = 0, errors = 0;

  if (!APPLY) {
    for (const row of rows) { if (buildOffer(row)) written++; }
    console.log(`\r  ${written}/${rows.length} would be written, 0 errors`);
    return { written, errors };
  }

  let client = await pool.connect();
  client.on('error', () => {}); // swallow the async socket-error event -- failures are handled via query rejection below, not this listener
  let inBatch = false;

  async function reconnect(attemptNote) {
    console.error(`\n  [${label}] ${attemptNote} -- reconnecting...`);
    try { client.release(true); } catch (_) {}
    client = await pool.connect();
    client.on('error', () => {});
    inBatch = false;
  }

  for (const row of rows) {
    const offer = buildOffer(row);
    if (!offer) continue;

    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        if (!inBatch) { await client.query('BEGIN'); inBatch = true; }
        await client.query('SAVEPOINT offer_sp');
        await upsertOffer(client, offer);
        await client.query('RELEASE SAVEPOINT offer_sp');
        written++;
        break;
      } catch (e) {
        if (isConnectionError(e) && attempts < 3) {
          await reconnect(`connection lost on catalog_product_id ${offer.catalogProductId} (attempt ${attempts})`);
          continue; // retry this same row on the fresh connection
        }
        await client.query('ROLLBACK TO SAVEPOINT offer_sp').catch(() => {});
        errors++;
        if (errors <= 5) console.error(`  Error on catalog_product_id ${offer.catalogProductId}:`, e.message);
        break;
      }
    }

    if (written % BATCH_SIZE === 0 && inBatch) {
      try {
        await client.query('COMMIT');
        inBatch = false;
      } catch (e) {
        await reconnect('connection lost during batch commit');
      }
    }
    if (written % 5000 === 0) process.stdout.write(`\r  ${written}/${rows.length}`);
  }
  if (inBatch) await client.query('COMMIT').catch(() => reconnect('connection lost on final commit'));
  client.release();
  console.log(`\r  ${written}/${rows.length} written, ${errors} errors`);
  return { written, errors };
}

async function main() {
  console.log(`\n═══ sync_vendor_offers ═══  [${APPLY ? 'APPLY' : 'DRY RUN'}]\n`);

  const client = await pool.connect();
  try {
    // Each phase commits in its own batches (see runPhase) -- no single
    // outer transaction wrapping all ~90k rows.

    // ── Phase 1: PU ──────────────────────────────────────────────────────────
    const { rows: puRows } = await client.query(`
      SELECT cu.id AS catalog_unified_id, p.vendor_part_number, p.dealer_price, p.base_dealer_price,
             p.msrp AS pu_msrp, p.original_retail, p.dropship_fee,
             p.warehouse_wi, p.warehouse_ny, p.warehouse_tx, p.warehouse_nv, p.warehouse_nc,
             cu.oem_part_number
      FROM catalog_unified cu
      JOIN pu_catalog p ON p.sku = cu.sku
      WHERE cu.source_vendor = 'PU' AND cu.is_active = true
    `);
    const puResult = await runPhase(pool, 'PU', puRows, (r) => {
      const wi = puQty(r.warehouse_wi), ny = puQty(r.warehouse_ny), tx = puQty(r.warehouse_tx),
            nv = puQty(r.warehouse_nv), nc = puQty(r.warehouse_nc);
      const totalQty = wi + ny + tx + nv + nc;
      return {
        catalogProductId: r.catalog_unified_id,
        vendorCode: 'PU',
        vendorPartNumber: r.vendor_part_number,
        manufacturerPartNumber: r.oem_part_number,
        wholesaleCost: num(r.dealer_price) ?? num(r.base_dealer_price),
        mapPrice: null,
        msrp: num(r.pu_msrp) ?? num(r.original_retail),
        dropShipFee: num(r.dropship_fee),
        dropShipEligible: num(r.dropship_fee) != null && num(r.dropship_fee) > 0,
        totalQty, inStock: totalQty > 0,
        wiQty: wi, nyQty: ny, txQty: tx, nvQty: nv, ncQty: nc,
      };
    });

    // ── Phase 2: VTWIN ───────────────────────────────────────────────────────
    const { rows: vtwinRows } = await client.query(`
      SELECT cu.id AS catalog_unified_id, cu.vendor_sku, v.dealer_price, v.retail_price, v.has_stock,
             cu.oem_part_number
      FROM catalog_unified cu
      JOIN vtwin_catalog v ON v.sku = cu.vendor_sku
      WHERE cu.source_vendor = 'VTWIN' AND cu.is_active = true
    `);
    const vtwinResult = await runPhase(pool, 'VTWIN', vtwinRows, (r) => ({
      catalogProductId: r.catalog_unified_id,
      vendorCode: 'VTWIN',
      vendorPartNumber: r.vendor_sku,
      manufacturerPartNumber: r.oem_part_number,
      wholesaleCost: num(r.dealer_price),
      mapPrice: null,
      msrp: num(r.retail_price),
      dropShipFee: null,
      dropShipEligible: false,
      // No real quantity available from this vendor -- has_stock is boolean
      // only. 1/0 is a placeholder signal for "some stock" vs "none", not a
      // real count. Documented in the header above; do not treat as inventory.
      totalQty: r.has_stock ? 1 : 0,
      inStock: !!r.has_stock,
    }));

    // ── Phase 3: WPS ─────────────────────────────────────────────────────────
    let wpsPricing = new Map();
    if (fs.existsSync(WPS_PRICING_CSV)) {
      const csvRows = parse(fs.readFileSync(WPS_PRICING_CSV, 'utf8'), { columns: true, skip_empty_lines: true, trim: true });
      for (const row of csvRows) {
        wpsPricing.set(row.sku, {
          actualDealerPrice: num(row.actual_dealer_price),
          standardDealerPrice: num(row.standard_dealer_price),
          listPrice: num(row.list_price),
          dropShipEligible: String(row.drop_ship_eligible ?? '').trim().toUpperCase() === 'Y',
          dropShipFee: num(row.drop_ship_fee),
        });
      }
      console.log(`\nLoaded ${wpsPricing.size} WPS pricing rows from ${path.basename(WPS_PRICING_CSV)}`);
    } else {
      console.log(`\nNo WPS pricing CSV found at ${WPS_PRICING_CSV} -- WPS offers will use wps_catalog only.`);
    }

    const { rows: wpsRows } = await client.query(`
      SELECT cu.id AS catalog_unified_id, cu.vendor_sku, w.vendor_number,
             w.dealer_price, w.list_price, w.map_price, w.drop_ship_fee, w.drop_ship_eligible,
             w.stock_quantity, w.in_stock,
             w.warehouse_boise, w.warehouse_fresno, w.warehouse_elizabethtown, w.warehouse_ashley,
             w.warehouse_midlothian, w.warehouse_jessup, w.warehouse_midway,
             cu.oem_part_number
      FROM catalog_unified cu
      JOIN wps_catalog w ON w.sku = cu.vendor_sku
      WHERE cu.source_vendor = 'WPS' AND cu.is_active = true
    `);
    const wpsResult = await runPhase(pool, 'WPS', wpsRows, (r) => {
      const csv = wpsPricing.get(r.vendor_sku);
      const wholesaleCost = csv?.actualDealerPrice ?? csv?.standardDealerPrice ?? num(r.dealer_price);
      const msrp = csv?.listPrice ?? num(r.list_price);
      const dropShipFee = csv?.dropShipFee ?? num(r.drop_ship_fee);
      const dropShipEligible = csv ? csv.dropShipEligible : !!r.drop_ship_eligible;
      return {
        catalogProductId: r.catalog_unified_id,
        vendorCode: 'WPS',
        vendorPartNumber: r.vendor_number,
        manufacturerPartNumber: r.oem_part_number,
        wholesaleCost, mapPrice: num(r.map_price), msrp,
        dropShipFee, dropShipEligible,
        totalQty: r.stock_quantity ?? 0,
        inStock: !!r.in_stock,
        warehouseJson: {
          boise: r.warehouse_boise, fresno: r.warehouse_fresno, elizabethtown: r.warehouse_elizabethtown,
          ashley: r.warehouse_ashley, midlothian: r.warehouse_midlothian, jessup: r.warehouse_jessup,
          midway: r.warehouse_midway,
        },
      };
    });

    console.log('\n═══ SUMMARY ═══');
    console.log(`  PU:    ${puResult.written} written, ${puResult.errors} errors`);
    console.log(`  VTWIN: ${vtwinResult.written} written, ${vtwinResult.errors} errors`);
    console.log(`  WPS:   ${wpsResult.written} written, ${wpsResult.errors} errors`);

    if (!APPLY) {
      console.log('\nDry run only. Re-run with --apply to write changes.');
    } else {
      const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM vendor_offers');
      console.log(`\nDone. vendor_offers now has ${count} rows.`);
    }
  } catch (err) {
    if (APPLY) await client.query('ROLLBACK').catch(() => {});
    console.error('Fatal error:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
