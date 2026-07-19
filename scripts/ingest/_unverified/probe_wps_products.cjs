#!/usr/bin/env node
// probe_wps_products.cjs
// Investigates WPS product_id grouping for variant consolidation
// node scripts/ingest/probe_wps_products.cjs

const TOKEN = 'eceGqPuosZVzZeZ74vBIWUqNwPbG1aP2YUL24fBO';
const BASE  = 'http://api.wps-inc.com';
const get   = async (path) => {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, raw: text.slice(0, 300) }; }
};

// product_ids from our 16 blackout cables — let's find them
// We know 70-62145 has product_id: 171196
const KNOWN_PRODUCT_ID = 171196;

const CABLE_SKUS = [
  '70-62403','70-62145','70-62146','70-62164','70-62261',
  '70-62327','70-62329','70-62369','70-62379','70-62389',
  '70-62390','70-62391','70-62392','70-62395','70-62400','70-62406'
];

async function main() {

  // 1. Fetch all 16 cables to get all their product_ids
  console.log('\n══ 1. ALL PRODUCT IDs FOR BLACKOUT CLUTCH LW CABLES ══');
  const items = await get(`/items?filter[sku]=${CABLE_SKUS.join(',')}&include=attributevalues&page[size]=20`);
  const productIds = new Set();
  if (items.data?.data) {
    items.data.data.forEach(item => {
      productIds.add(item.product_id);
      console.log(`  [${item.sku}] $${item.list_price}  product_id=${item.product_id}  supplier_product_id=${item.supplier_product_id}`);
    });
    console.log(`\n  Unique product_ids: ${[...productIds].join(', ')}`);
  }

  // 2. Fetch the product record itself
  console.log('\n\n══ 2. PRODUCT RECORD — product_id 171196 ══');
  const prod = await get(`/products/${KNOWN_PRODUCT_ID}`);
  console.log(`status: ${prod.status}`);
  console.log(JSON.stringify(prod.data ?? prod.raw, null, 2).slice(0, 2000));

  // 3. Get all items belonging to this product
  console.log('\n\n══ 3. ALL ITEMS FOR PRODUCT 171196 ══');
  const prodItems = await get(`/products/${KNOWN_PRODUCT_ID}/items?page[size]=50`);
  console.log(`status: ${prodItems.status}`);
  if (prodItems.data?.data) {
    console.log(`  Total items under this product: ${prodItems.data.data.length}`);
    prodItems.data.data.forEach(item => {
      console.log(`  [${item.sku}] ${item.name} — $${item.list_price}  supplier_product_id=${item.supplier_product_id}`);
    });
  } else {
    console.log(JSON.stringify(prodItems.data ?? prodItems.raw, null, 2).slice(0, 1000));
  }

  // 4. Product with include=items+attributevalues
  console.log('\n\n══ 4. PRODUCT WITH include=items,attributevalues ══');
  const prodFull = await get(`/products/${KNOWN_PRODUCT_ID}?include=items,attributevalues`);
  console.log(`status: ${prodFull.status}`);
  console.log(JSON.stringify(prodFull.data ?? prodFull.raw, null, 2).slice(0, 2000));

  // 5. Now get the OTHER product_ids from our cable batch
  if (productIds.size > 1) {
    console.log('\n\n══ 5. OTHER PRODUCT IDs — fetch each product record ══');
    for (const pid of productIds) {
      if (pid === KNOWN_PRODUCT_ID) continue;
      const r = await get(`/products/${pid}`);
      console.log(`\n  product_id ${pid} (status ${r.status}):`);
      console.log('  ' + JSON.stringify(r.data ?? r.raw, null, 2).slice(0, 400).replace(/\n/g, '\n  '));
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // 6. Now the key question: do ALL Motion Pro blackout cables share a small
  //    number of product_ids, or does each SKU get its own?
  console.log('\n\n══ 6. PRODUCT IDs ACROSS ALL MOTION PRO BLACKOUT SKUS ══');
  // Full blackout set from earlier audit
  const allBlackoutSkus = [
    '70-62403','70-62145','70-62146','70-62164','70-62261','70-62327',
    '70-62329','70-62369','70-62379','70-62389','70-62390','70-62391',
    '70-62392','70-62395','70-62400','70-62406',
    '70-62267','70-62275','70-62269','70-62402','70-62196','70-62399',
    '70-62397','70-62279','70-62303','70-62319','70-62214', // idle
    '70-62274','70-62266','70-62398','70-62401','70-62268',
    '70-62282','70-62302','70-62396','70-62318','70-62278','70-62194','70-62208' // throttle
  ];
  const r6 = await get(`/items?filter[sku]=${allBlackoutSkus.join(',')}&page[size]=50`);
  if (r6.data?.data) {
    const byProduct = {};
    r6.data.data.forEach(item => {
      if (!byProduct[item.product_id]) byProduct[item.product_id] = [];
      byProduct[item.product_id].push({ sku: item.sku, name: item.name, price: item.list_price });
    });
    console.log(`\n  ${Object.keys(byProduct).length} distinct product_ids across ${r6.data.data.length} items:\n`);
    Object.entries(byProduct).forEach(([pid, items]) => {
      console.log(`  product_id ${pid} — ${items.length} item(s):`);
      items.forEach(i => console.log(`    [${i.sku}] ${i.name} $${i.price}`));
    });
  } else {
    console.log(JSON.stringify(r6.data ?? r6.raw, null, 2).slice(0, 500));
  }

  // 7. Check what the product record looks like for a multi-item product
  //    vs a single-item product — is name+description more useful there?
  console.log('\n\n══ 7. SAMPLE PRODUCT RECORDS ══');
  const pidsToCheck = [...productIds].slice(0, 3);
  for (const pid of pidsToCheck) {
    const r = await get(`/products/${pid}?include=attributevalues`);
    console.log(`\n  product_id ${pid}:`);
    console.log('  ' + JSON.stringify(r.data ?? r.raw, null, 2).slice(0, 800).replace(/\n/g, '\n  '));
    await new Promise(r => setTimeout(r, 200));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
