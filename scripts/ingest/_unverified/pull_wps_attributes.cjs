#!/usr/bin/env node
// pull_wps_attributes.cjs
// Discovers attribute keys/values for Motion Pro cable SKUs via WPS API
// Run: WPS_API_KEY=your_key node scripts/ingest/pull_wps_attributes.cjs

const { Pool } = require('pg');

const API_KEY = process.env.WPS_API_KEY;
const BASE = 'https://api.wps-inc.com';

if (!API_KEY) {
  console.error('ERROR: Set WPS_API_KEY env var\n  WPS_API_KEY=xxx node scripts/ingest/pull_wps_attributes.cjs');
  process.exit(1);
}

const pool = new Pool({
  host: '2a01:4ff:f0:fa6f::1', port: 5432,
  database: 'stinkin_catalog', user: 'catalog_app', password: 'smelly',
});
const q = async (sql, p = []) => { const { rows } = await pool.query(sql, p); return rows; };

async function get(path, retries = 3) {
  const url = `${BASE}${path}`;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Accept': 'application/json' }
      });
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      if (!res.ok) return { error: res.status, url, body: await res.text().then(t => t.slice(0, 200)) };
      return res.json();
    } catch (e) {
      if (i === retries - 1) return { error: e.message, url };
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

// Paginate through all pages of a collection endpoint
async function getAll(path, maxPages = 20) {
  const results = [];
  let url = path;
  let page = 0;
  while (url && page < maxPages) {
    const data = await get(url);
    if (data.error || !data.data) { console.error('  fetch error:', data); break; }
    results.push(...data.data);
    url = data.links?.next ? data.links.next.replace(BASE, '') : null;
    page++;
    if (url) await new Promise(r => setTimeout(r, 200)); // polite rate limit
  }
  return results;
}

async function main() {

  // ── 1. What attribute keys exist? ─────────────────────────────────────────
  console.log('\n── 1. ALL ATTRIBUTE KEYS ──');
  const keys = await getAll('/attributekeys?page[size]=100');
  if (keys.length) {
    keys.forEach(k => console.log(`  [${String(k.id).padStart(4)}] ${k.name || k.slug || JSON.stringify(k)}`));
  } else {
    // Try raw
    const raw = await get('/attributekeys');
    console.log(JSON.stringify(raw, null, 2).slice(0, 2000));
  }

  // ── 2. Fetch attributes directly on a known cable item ───────────────────
  console.log('\n\n── 2. ITEM ATTRIBUTES — single item lookup ──');
  // Try both possible endpoint formats
  const testSku = '70-62403'; // BLACKOUT CLUTCH LW CABLE
  const r2a = await get(`/items/${testSku}/attributevalues`);
  console.log(`  /items/${testSku}/attributevalues:`);
  console.log(JSON.stringify(r2a, null, 2).slice(0, 1000));

  const r2b = await get(`/items/${testSku}/attributes`);
  console.log(`\n  /items/${testSku}/attributes:`);
  console.log(JSON.stringify(r2b, null, 2).slice(0, 1000));

  // ── 3. Try include= param ─────────────────────────────────────────────────
  console.log('\n\n── 3. ITEM WITH include=attributevalues ──');
  const r3 = await get(`/items/${testSku}?include=attributevalues`);
  console.log(JSON.stringify(r3, null, 2).slice(0, 2000));

  // ── 4. Pull all attribute values for ALL Motion Pro cable SKUs ────────────
  console.log('\n\n── 4. ATTRIBUTE VALUES FOR ALL 17 BLACKOUT CLUTCH LW CABLES ──');
  const blackoutSkus = [
    '70-62403','70-62145','70-62146','70-62164','70-62261',
    '70-62327','70-62329','70-62369','70-62379','70-62389',
    '70-62390','70-62391','70-62392','70-62395','70-62400',
    '70-62406','70-62400'
  ];

  // Try batch fetch if API supports it
  const r4batch = await get(`/items?filter[sku]=${blackoutSkus.join(',')}&include=attributevalues&page[size]=20`);
  if (r4batch.data?.length) {
    console.log('\n  Batch with include=attributevalues:');
    r4batch.data.forEach(item => {
      const attrs = item.attributevalues || item.attributes || item.included || [];
      console.log(`  [${item.sku}] ${item.name}`);
      if (Array.isArray(attrs) && attrs.length) {
        attrs.forEach(a => console.log(`    attr: ${JSON.stringify(a)}`));
      } else if (item.relationships) {
        console.log(`    relationships: ${JSON.stringify(item.relationships).slice(0,200)}`);
      } else {
        console.log(`    (no attrs found — keys: ${Object.keys(item).join(', ')})`);
      }
    });
  } else {
    // Fall back: hit each one individually
    console.log('\n  Fetching individually...');
    for (const sku of blackoutSkus.slice(0, 5)) {
      const r = await get(`/items/${sku}/attributevalues`);
      console.log(`\n  [${sku}]:`);
      console.log(JSON.stringify(r, null, 2).slice(0, 500));
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ── 5. Check if items have a supplier_item_id we can use to get MP data ───
  console.log('\n\n── 5. SUPPLIER ITEM IDs FOR BLACKOUT CABLES (in DB) ──');
  const dbRows = await q(`
    SELECT sku, vendor_number, supplier_item_id, name, list_price,
           length_in, width_in, height_in, weight
    FROM wps_catalog
    WHERE sku = ANY($1)
    ORDER BY list_price
  `, [blackoutSkus]);
  dbRows.forEach(r => {
    console.log(`  [${r.sku}] VN:${r.vendor_number} MP:${r.supplier_item_id} $${r.list_price}`);
    console.log(`         box: ${r.length_in}"L x ${r.width_in}"W x ${r.height_in}"H  wt:${r.weight}lb`);
  });

  // ── 6. Look at Indian cables — they have length in name, compare attrs ────
  console.log('\n\n── 6. INDIAN BLACKOUT CABLES (control — have length in name) ──');
  const indianSkus = ['70-182000','70-182001','70-182002','70-182003'];
  for (const sku of indianSkus) {
    const r = await get(`/items/${sku}/attributevalues`);
    console.log(`\n  [${sku}]:`);
    console.log(JSON.stringify(r, null, 2).slice(0, 600));
    await new Promise(r => setTimeout(r, 300));
  }

  // ── 7. Explore a known attribute key that might be "Cable Length" ─────────
  // First look at what keys relate to cables
  console.log('\n\n── 7. ATTRIBUTE KEY SEARCH — "length" or "cable" ──');
  const allKeys = await getAll('/attributekeys?page[size]=100');
  const cableRelated = allKeys.filter(k =>
    JSON.stringify(k).toLowerCase().includes('length') ||
    JSON.stringify(k).toLowerCase().includes('cable') ||
    JSON.stringify(k).toLowerCase().includes('size') ||
    JSON.stringify(k).toLowerCase().includes('fitment')
  );
  console.log('  Possibly relevant attribute keys:');
  cableRelated.forEach(k => console.log(`  ${JSON.stringify(k)}`));

  if (cableRelated.length) {
    // Pull all values for the first relevant key
    const firstKey = cableRelated[0];
    console.log(`\n  Sample values for key ${firstKey.id}:`);
    const vals = await get(`/attributekeys/${firstKey.id}/attributevalues?page[size]=20`);
    console.log(JSON.stringify(vals, null, 2).slice(0, 1000));
  }

  await pool.end();
  console.log('\nDone.');
}
main().catch(e => { console.error(e.message); process.exit(1); });
