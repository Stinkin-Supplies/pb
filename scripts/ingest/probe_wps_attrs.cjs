#!/usr/bin/env node
// probe_wps_attrs.cjs — run locally
// node scripts/ingest/probe_wps_attrs.cjs

const TOKEN = 'eceGqPuosZVzZeZ74vBIWUqNwPbG1aP2YUL24fBO';
const BASE  = 'http://api.wps-inc.com';

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, raw: text.slice(0, 300) }; }
};

// The 17 identical-named "BLACKOUT CLUTCH LW CABLE" SKUs — all different prices, no label
const CABLE_SKUS = [
  '70-62403','70-62145','70-62146','70-62164','70-62261',
  '70-62327','70-62329','70-62369','70-62379','70-62389',
  '70-62390','70-62391','70-62392','70-62395','70-62400',
  '70-62406'
];

// Indian ones WITH length in name — good control group
const INDIAN_SKUS = ['70-182000','70-182001','70-182002','70-182003'];

async function main() {

  // 1. All attribute keys ────────────────────────────────────────────────────
  console.log('\n══ 1. ALL ATTRIBUTE KEYS ══');
  const keys = await get('/attributekeys?page[size]=100');
  console.log(`status: ${keys.status}`);
  if (keys.data?.data) {
    keys.data.data.forEach(k => console.log(`  [${String(k.id).padStart(4)}] ${JSON.stringify(k)}`));
    console.log(`  total: ${keys.data.data.length} keys`);
    if (keys.data.links?.next) console.log(`  next page: ${keys.data.links.next}`);
  } else {
    console.log(JSON.stringify(keys).slice(0, 500));
  }

  // 2. Single item — attributevalues sub-endpoint ───────────────────────────
  console.log('\n\n══ 2. SINGLE ITEM ATTRIBUTEVALUES — 70-62403 ══');
  const av = await get('/items/70-62403/attributevalues');
  console.log(`status: ${av.status}`);
  console.log(JSON.stringify(av.data ?? av.raw, null, 2).slice(0, 1500));

  // 3. Single item with include ─────────────────────────────────────────────
  console.log('\n\n══ 3. ITEM?include=attributevalues ══');
  const inc = await get('/items/70-62403?include=attributevalues');
  console.log(`status: ${inc.status}`);
  console.log(JSON.stringify(inc.data ?? inc.raw, null, 2).slice(0, 1500));

  // 4. Batch items + attributes ─────────────────────────────────────────────
  console.log('\n\n══ 4. BATCH ITEMS (all 16 cables) + attributevalues ══');
  const batch = await get(`/items?filter[sku]=${CABLE_SKUS.join(',')}&include=attributevalues&page[size]=20`);
  console.log(`status: ${batch.status}`);
  if (batch.data?.data?.length) {
    // Show all fields on first item
    console.log('\n  First item full shape:');
    console.log(JSON.stringify(batch.data.data[0], null, 2));
    // Summarize all
    console.log('\n  All items summary:');
    batch.data.data.forEach(item => {
      const attrs = item.attributevalues || item.attributes || [];
      const attrStr = Array.isArray(attrs) && attrs.length
        ? attrs.map(a => `${a.attributekey?.name ?? a.key ?? a.id}=${a.name ?? a.value ?? a.id}`).join(', ')
        : '(none)';
      console.log(`  [${item.sku}] $${item.list_price}  attrs: ${attrStr}`);
    });
    if (batch.data.included?.length) {
      console.log('\n  included[] resources:');
      console.log(JSON.stringify(batch.data.included.slice(0, 5), null, 2));
    }
  } else {
    console.log(JSON.stringify(batch.data ?? batch.raw, null, 2).slice(0, 1000));
  }

  // 5. Indian cables — control group ────────────────────────────────────────
  console.log('\n\n══ 5. INDIAN CABLES attributevalues (have length in name) ══');
  for (const sku of INDIAN_SKUS) {
    const r = await get(`/items/${sku}/attributevalues`);
    console.log(`\n  [${sku}] status:${r.status}`);
    console.log('  ' + JSON.stringify(r.data ?? r.raw, null, 2).slice(0, 400).replace(/\n/g, '\n  '));
    await new Promise(r => setTimeout(r, 150));
  }

  // 6. Check /items endpoint shape directly ─────────────────────────────────
  console.log('\n\n══ 6. RAW ITEM ENDPOINT SHAPE ══');
  const raw = await get('/items/70-62403');
  console.log(`status: ${raw.status}`);
  console.log(JSON.stringify(raw.data ?? raw.raw, null, 2).slice(0, 2000));
}

main().catch(e => { console.error(e); process.exit(1); });
