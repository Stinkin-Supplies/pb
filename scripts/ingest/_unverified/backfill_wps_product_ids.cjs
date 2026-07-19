#!/usr/bin/env node
// backfill_wps_product_ids.cjs
const { Pool } = require('pg');

const DRY   = process.argv.includes('--dry');
const TOKEN = 'eceGqPuosZVzZeZ74vBIWUqNwPbG1aP2YUL24fBO';
const BASE  = 'http://api.wps-inc.com';
const BATCH = 50;
const DELAY = 250;

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1', port: 5432,
  database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly',
});
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

async function apiFetch(skus) {
  const url = `${BASE}/items?filter[sku]=${skus.join(',')}&page[size]=${BATCH}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().then(t => t.slice(0,200))}`);
  return res.json();
}

async function main() {
  console.log(`Mode: ${DRY ? 'DRY RUN' : 'LIVE'}`);

  // Check if column already exists
  const colCheck = await q(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'wps_catalog' AND column_name = 'wps_product_id'
  `);
  const colExists = colCheck.length > 0;
  console.log(`wps_product_id column exists: ${colExists}`);

  if (DRY) {
    const total = await q(`SELECT COUNT(*) as cnt FROM wps_catalog`);
    console.log(`Total WPS SKUs: ${total[0].cnt}`);
    console.log(`Would fetch ~${Math.ceil(parseInt(total[0].cnt) / BATCH)} API batches`);
    console.log(`Estimated time: ~${Math.round(parseInt(total[0].cnt) / BATCH * DELAY / 60000)} minutes`);
    if (colExists) {
      const filled = await q(`SELECT COUNT(*) as cnt FROM wps_catalog WHERE wps_product_id IS NOT NULL`);
      const remaining = await q(`SELECT COUNT(*) as cnt FROM wps_catalog WHERE wps_product_id IS NULL`);
      console.log(`Already filled: ${filled[0].cnt}  Remaining: ${remaining[0].cnt}`);
    }
    await pool.end();
    return;
  }

  // Add columns
  await pool.query(`
    ALTER TABLE wps_catalog
    ADD COLUMN IF NOT EXISTS wps_product_id INTEGER,
    ADD COLUMN IF NOT EXISTS wps_item_id    INTEGER
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_wps_catalog_product_id ON wps_catalog(wps_product_id)`);
  console.log('Columns ready: wps_product_id, wps_item_id');

  const toFill = await q(`SELECT sku FROM wps_catalog WHERE wps_product_id IS NULL ORDER BY sku`);
  const skus = toFill.map(r => r.sku);
  console.log(`SKUs to process: ${skus.length}`);

  let filled = 0, missed = 0, errors = 0;
  const batches = Math.ceil(skus.length / BATCH);

  for (let i = 0; i < skus.length; i += BATCH) {
    const batch = skus.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    try {
      const data = await apiFetch(batch);
      const items = data.data || [];
      if (items.length > 0) {
        await pool.query(`
          UPDATE wps_catalog AS w
          SET wps_product_id = u.product_id::integer,
              wps_item_id    = u.item_id::integer
          FROM unnest($1::text[], $2::integer[], $3::integer[])
            AS u(sku, product_id, item_id)
          WHERE w.sku = u.sku
        `, [items.map(i => i.sku), items.map(i => i.product_id), items.map(i => i.id)]);
        filled += items.length;
        missed += batch.length - items.length;
      } else {
        missed += batch.length;
      }
      if (batchNum % 20 === 0 || batchNum === batches) {
        const pct = ((i + batch.length) / skus.length * 100).toFixed(1);
        console.log(`  [${pct}%] batch ${batchNum}/${batches} — filled: ${filled}, missed: ${missed}, errors: ${errors}`);
      }
    } catch (e) {
      errors++;
      console.error(`  batch ${batchNum} error: ${e.message}`);
      await new Promise(r => setTimeout(r, 1000));
    }
    await new Promise(r => setTimeout(r, DELAY));
  }

  console.log('\n═══ COMPLETE ═══');
  console.log(`  Filled: ${filled}  Missed: ${missed}  Errors: ${errors}`);
  const stats = await q(`
    SELECT COUNT(*) as total, COUNT(wps_product_id) as with_id,
           COUNT(DISTINCT wps_product_id) as distinct_products
    FROM wps_catalog
  `);
  console.log(`  ${JSON.stringify(stats[0])}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
