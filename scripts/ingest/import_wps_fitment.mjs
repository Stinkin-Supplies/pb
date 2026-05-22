#!/usr/bin/env node
// scripts/ingest/import_wps_fitment.mjs
// Paginates taxonomyterms/196/items?include=vehicles (Hard Drive catalog)
// Resolves vehicle_ids against wps_vehicles table
// Stores fitment JSONB on wps_catalog

import pg from 'pg';
import fs from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WPS_TOKEN  = 'eceGqPuosZVzZeZ74vBIWUqNwPbG1aP2YUL24fBO';
const WPS_BASE   = 'https://api.wps-inc.com';
const CSV_PATH   = path.join(__dirname, '../data/wps/1779424242-1856360.csv');
const PAGE_SIZE  = 50;
const DELAY_MS   = 150;

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1',
  port: 5432,
  user: 'catalog_app',
  password: 'smelly',
  database: 'stinkin_catalog',
});

// ── Load wps_vehicles CSV into DB ─────────────────────────────────────────────

async function loadVehiclesTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS wps_vehicles (
      vehicle_id   INTEGER PRIMARY KEY,
      vehicle_type VARCHAR(50),
      year_id      INTEGER,
      year         SMALLINT,
      make_id      INTEGER,
      make         VARCHAR(100),
      model_id     INTEGER,
      model        VARCHAR(255)
    );
    CREATE INDEX IF NOT EXISTS idx_wps_vehicles_make ON wps_vehicles (make);
    CREATE INDEX IF NOT EXISTS idx_wps_vehicles_year ON wps_vehicles (year);
  `);

  const { rows: [{ count }] } = await client.query('SELECT COUNT(*) FROM wps_vehicles');
  if (parseInt(count) > 0) {
    console.log(`wps_vehicles already loaded (${count} rows) — skipping CSV import.`);
    return;
  }

  console.log('Loading wps_vehicles from CSV...');
  const raw  = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true });

  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vals  = batch.map((_, j) => {
      const b = j * 8;
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`;
    }).join(',');
    const params = batch.flatMap(r => [
      parseInt(r.vehicle_id), r.vehicle_type || null,
      parseInt(r.year_id),    parseInt(r.year),
      parseInt(r.make_id),    r.make  || null,
      parseInt(r.model_id),   r.model || null,
    ]);
    await client.query(
      `INSERT INTO wps_vehicles
         (vehicle_id,vehicle_type,year_id,year,make_id,make,model_id,model)
       VALUES ${vals} ON CONFLICT (vehicle_id) DO NOTHING`,
      params
    );
    inserted += batch.length;
    process.stdout.write(`\r  ${inserted}/${rows.length} rows`);
  }
  console.log(`\n  Done — ${inserted} vehicles loaded.`);
}

// ── Ensure fitment columns exist on wps_catalog ───────────────────────────────

async function ensureColumns(client) {
  await client.query(`
    ALTER TABLE wps_catalog
      ADD COLUMN IF NOT EXISTS fitment            JSONB,
      ADD COLUMN IF NOT EXISTS fitment_updated_at TIMESTAMP WITH TIME ZONE;
    CREATE INDEX IF NOT EXISTS idx_wps_catalog_fitment
      ON wps_catalog USING GIN (fitment);
  `);
}

// ── Fetch one page of Hard Drive items with vehicles included ─────────────────

async function fetchPage(cursor) {
  const cursorParam = cursor ? `&page%5Bcursor%5D=${cursor}` : '';
  const url = `${WPS_BASE}/taxonomyterms/196/items?include=vehicles&page%5Bsize%5D=${PAGE_SIZE}${cursorParam}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${WPS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const client = await pool.connect();
  try {
    await loadVehiclesTable(client);
    await ensureColumns(client);

    // Build in-memory lookup: vehicle_id → {year, make, model, vehicle_type}
    console.log('\nBuilding vehicle lookup map...');
    const { rows: vrows } = await client.query(
      `SELECT vehicle_id, year, make, model, vehicle_type FROM wps_vehicles`
    );
    const vehicleMap = new Map(vrows.map(v => [v.vehicle_id, v]));
    console.log(`  ${vehicleMap.size} vehicles in lookup.`);

    // Build lookup: supplier_product_id → wps_catalog.id
    const { rows: catRows } = await client.query(
      `SELECT id, supplier_item_id FROM wps_catalog WHERE supplier_item_id IS NOT NULL`
    );
    const catalogMap = new Map(catRows.map(r => [r.supplier_item_id, r.id]));
    console.log(`  ${catalogMap.size} wps_catalog items with supplier_item_id.`);

    let cursor     = null;
    let totalItems = 0;
    let matched    = 0;
    let withVeh    = 0;
    let page       = 0;

    console.log('\nPaginating Hard Drive items from WPS API...');

    do {
      const json = await fetchPage(cursor);
      const items = json.data ?? [];
      cursor = json.meta?.cursor?.next ?? null;
      page++;

      for (const item of items) {
        totalItems++;
        const catalogId = catalogMap.get(item.supplier_product_id);
        if (!catalogId) continue;
        matched++;

        // Resolve vehicle_ids → full records, filter Harley only
        const rawVehicles = item.vehicles?.data ?? [];
        const resolved = rawVehicles
          .map(v => vehicleMap.get(v.id))
          .filter(Boolean);

        const harley = resolved.filter(v =>
          v.make?.toLowerCase().includes('harley')
        );

        const fitment = {
          raw_vehicle_ids:  rawVehicles.map(v => v.id),
          vehicles:         resolved,
          harley_vehicles:  harley,
        };

        await client.query(
          `UPDATE wps_catalog
           SET fitment = $1::jsonb, fitment_updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(fitment), catalogId]
        );

        if (harley.length > 0) withVeh++;
      }

      process.stdout.write(
        `\r  Page ${page} | ${totalItems} API items | ${matched} matched | ${withVeh} with Harley fitment`
      );

      if (cursor) await new Promise(r => setTimeout(r, DELAY_MS));

    } while (cursor);

    console.log('\n\n── Summary ──────────────────────────────');
    console.log(`  API items seen       : ${totalItems}`);
    console.log(`  Matched in catalog   : ${matched}`);
    console.log(`  With Harley fitment  : ${withVeh}`);

    const { rows: [s] } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE fitment IS NOT NULL
          AND jsonb_array_length(fitment->'harley_vehicles') > 0) AS harley,
        COUNT(*) FILTER (WHERE fitment = '[]'::jsonb
          OR (fitment IS NOT NULL
          AND jsonb_array_length(fitment->'harley_vehicles') = 0)) AS no_harley,
        COUNT(*) FILTER (WHERE fitment IS NULL)                    AS not_fetched
      FROM wps_catalog
    `);
    console.log(`  DB — with Harley     : ${s.harley}`);
    console.log(`  DB — no Harley veh   : ${s.no_harley}`);
    console.log(`  DB — not fetched     : ${s.not_fetched}`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
