require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.CATALOG_DATABASE_URL });

function num(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

async function test() {
  // Fetch one item
  const res = await fetch('https://api.wps-inc.com/items?page[size]=1&include=images,inventory,brand,product', {
    headers: {
      'Authorization': `Bearer ${process.env.WPS_API_KEY}`,
      'Accept': 'application/json'
    }
  });
  const data = await res.json();
  const item = data.data[0];

  const brand   = item.brand?.data   ?? {};
  const product = item.product?.data ?? {};
  const images  = Array.isArray(item.images?.data) ? item.images.data : [];

  console.log('SKU:', item.sku);
  console.log('drop_ship_fee raw:', item.drop_ship_fee, typeof item.drop_ship_fee);
  console.log('drop_ship_eligible raw:', item.drop_ship_eligible, typeof item.drop_ship_eligible);
  console.log('status raw:', item.status, typeof item.status);
  console.log('status_id raw:', item.status_id, typeof item.status_id);
  console.log('has_map_policy raw:', item.has_map_policy, typeof item.has_map_policy);

  const values = [
    'wps',                                            // $1  vendor_code
    String(item.id ?? ''),                            // $2  vendor_item_id
    String(item.product_id ?? ''),                    // $3  vendor_product_id
    item.sku,                                         // $4  vendor_part_number
    item.supplier_product_id ?? item.sku,             // $5  manufacturer_part_number
    item.name ?? null,                                // $6  title
    product.description ?? null,                      // $7  description_raw
    brand.name ?? null,                               // $8  brand
    JSON.stringify(product.categories ?? []),          // $9  categories_raw
    JSON.stringify({ propd1: item.propd1, propd2: item.propd2, sort: item.sort }), // $10
    num(item.list_price),                             // $11 msrp
    num(item.mapp_price),                             // $12 map_price
    num(item.standard_dealer_price),                  // $13 wholesale_cost
    num(item.drop_ship_fee) ?? 0,                     // $14 drop_ship_fee
    item.drop_ship_eligible ?? false,                 // $15 drop_ship_eligible
    JSON.stringify(images),                           // $16 images_raw
    JSON.stringify([]),                               // $17 fitment_raw
    num(item.weight),                                 // $18 weight
    num(item.length),                                 // $19 length
    num(item.width),                                  // $20 width
    num(item.height),                                 // $21 height
    item.upc ?? null,                                 // $22 upc
    item.superseded_sku ?? null,                      // $23 superseded_sku
    item.status ?? null,                              // $24 status
    item.status_id ?? null,                           // $25 status_id
    item.product_type ?? null,                        // $26 product_type
    item.unit_of_measurement_id?.toString() ?? null,  // $27 unit_of_measurement
    item.has_map_policy ?? false,                     // $28 has_map_policy
    item.carb ?? null,                                // $29 carb
    item.prop_65_code ?? null,                        // $30 prop_65_code
    item.prop_65_detail ?? null,                      // $31 prop_65_detail
    item.country_id ?? null,                          // $32 country_id
    item.published_at ? new Date(item.published_at) : null, // $33
    item.created_at  ? new Date(item.created_at)  : null,   // $34
    item.updated_at  ? new Date(item.updated_at)  : null,   // $35
  ];

  console.log('\nValues to insert:');
  values.forEach((v, i) => console.log(`  $${i+1}: ${JSON.stringify(v)}`));

  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO vendor.vendor_products (
        id, vendor_code,
        vendor_item_id, vendor_product_id,
        vendor_part_number, manufacturer_part_number,
        title, description_raw, brand,
        categories_raw, attributes_raw,
        msrp, map_price, wholesale_cost,
        drop_ship_fee, drop_ship_eligible,
        images_raw, fitment_raw,
        weight, length, width, height,
        upc, superseded_sku,
        status, status_id, product_type, unit_of_measurement,
        has_map_policy, carb, prop_65_code, prop_65_detail,
        country_id,
        published_at, vendor_created_at, vendor_updated_at,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1,
        $2, $3, $4, $5, $6, $7, $8,
        $9::jsonb, $10::jsonb,
        $11, $12, $13, $14, $15,
        $16::jsonb, $17::jsonb,
        $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27,
        $28, $29, $30, $31, $32,
        $33, $34, $35,
        NOW(), NOW()
      )
    `, values);
    console.log('\n✅  INSERT SUCCEEDED');
  } catch (err) {
    console.error('\n❌  EXACT ERROR:', err.message);
    console.error('    Position:', err.position);
  } finally {
    client.release();
    await pool.end();
  }
}

test();
