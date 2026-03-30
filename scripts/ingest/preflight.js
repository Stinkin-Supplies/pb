require('dotenv').config();
const { Pool } = require('pg');

// ─────────────────────────────────────────────
// PRE-FLIGHT: Test DB + WPS API before ingesting
// Run with: node preflight.js
// ─────────────────────────────────────────────

async function testDB() {
  console.log('--- DB CONNECTION ---');
  const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });
  try {
    const r = await pool.query('SELECT COUNT(*) FROM vendor.vendor_products');
    console.log('✅  DB connected — current vendor_products row count:', r.rows[0].count);
  } catch (err) {
    console.error('❌  DB error:', err.message);
  } finally {
    await pool.end();
  }
}

async function testWPS() {
  console.log('\n--- WPS API ---');
  try {
    const url = 'https://api.wps-inc.com/items?page[size]=2&include=images,inventory,brand';
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.WPS_API_KEY}`,
        'Accept': 'application/json',
      }
    });

    if (!res.ok) {
      console.error('❌  WPS API error:', res.status, await res.text());
      return;
    }

    const data = await res.json();
    const item = data.data?.[0];

    console.log('✅  WPS API connected');
    console.log('   Next cursor:', data.meta?.cursor?.next);
    console.log('   Total count:', data.meta?.cursor?.count);
    console.log('\n   First item field names:');
    console.log('  ', Object.keys(item ?? {}).join(', '));
    console.log('\n   Key field values to verify mapping:');
    console.log('   item.sku                 =', item?.sku);
    console.log('   item.name                =', item?.name);
    console.log('   item.mapp_price          =', item?.mapp_price);
    console.log('   item.standard_dealer_price =', item?.standard_dealer_price);
    console.log('   item.supplier_product_id =', item?.supplier_product_id);
    console.log('   item.brand (included)    =', item?.brand?.name ?? item?.brand);
    console.log('   item.images count        =', Array.isArray(item?.images) ? item.images.length : typeof item?.images);
    console.log('   item.weight              =', item?.weight);
  } catch (err) {
    console.error('❌  WPS API error:', err.message);
  }
}

(async () => {
  await testDB();
  await testWPS();
  console.log('\n--- Done. Review field names above before running wps-ingest.js ---');
})();
