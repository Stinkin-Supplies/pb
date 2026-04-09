const fs = require('fs');
const csv = require('csv-parser');
const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog'
});

const BATCH_SIZE = 1000;

async function run() {
  await client.connect();

  console.log('Connected to DB');

  const rows = [];
  let total = 0;

  const stream = fs.createReadStream('scripts/data/pu_pricefile/pu-price-file.csv')
    .pipe(csv());

  for await (const row of stream) {
    rows.push({
      part_number: row['Part Number'],
      brand: row['Brand Name'],
      description: row['Part Description'],
      upc: row['UPC Code'],
      price_retail: parseFloat(row['Current Suggested Retail']) || 0,
      price_dealer: parseFloat(row['Your Dealer Price']) || 0,
      weight: parseFloat(row['Weight']) || 0,
      status: row['Part Status']
    });

    if (rows.length >= BATCH_SIZE) {
      await insertBatch(rows);
      total += rows.length;
      console.log(`Inserted: ${total}`);
      rows.length = 0;
    }
  }

  if (rows.length > 0) {
    await insertBatch(rows);
    total += rows.length;
  }

  console.log(`Done. Total inserted: ${total}`);
  await client.end();
}

async function insertBatch(rows) {
  const values = [];
  const placeholders = [];

  rows.forEach((r, i) => {
    const idx = i * 8;
    placeholders.push(
      `($${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8})`
    );

    values.push(
      r.part_number,
      r.brand,
      r.description,
      r.upc,
      r.price_retail,
      r.price_dealer,
      r.weight,
      r.status
    );
  });

  const query = `
    INSERT INTO pu_products (
      part_number,
      brand,
      description,
      upc,
      price_retail,
      price_dealer,
      weight,
      status
    )
    VALUES ${placeholders.join(',')}
    ON CONFLICT (part_number) DO NOTHING
  `;

  await client.query(query, values);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});