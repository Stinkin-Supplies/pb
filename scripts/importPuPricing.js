// scripts/ingest/import_pu_pricing.js
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const csv = require('csv-parse');
const ProgressBar = require('./progress_bar');

const client = new Client({
  host: process.env.CATALOG_DB_HOST,
  port: process.env.CATALOG_DB_PORT,
  database: process.env.CATALOG_DB_NAME,
  user: process.env.CATALOG_DB_USER,
  password: process.env.CATALOG_DB_PASSWORD,
});

async function importPUPricing() {
  await client.connect();
  
  const filePath = path.join(__dirname, '../data/pu_pricefile/20260407pu-pricefile.csv');
  const fileStream = fs.createReadStream(filePath);
  
  const parser = fileStream.pipe(csv({
    columns: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }));

  let batch = [];
  let totalRows = 0;
  const progressBar = new ProgressBar(153507);

  parser.on('data', (record) => {
    totalRows++;
    progressBar.tick();

    batch.push({
      part_number: record['Part Number'],
      punctuated_part_number: record['Punctuated Part Number'],
      dealer_price: parseFloat(record['Your Dealer Price']) || 0,
      original_retail: parseFloat(record['Original Retail']) || null,
      suggested_retail: parseFloat(record['Current Suggested Retail']) || null,
      base_dealer_price: parseFloat(record['Base Dealer Price']) || null,
      brand_name: record['Brand Name'] || null,
      part_description: record['Part Description'] || null,
      upc_code: record['UPC Code'] || null,
      country_of_origin: record['Country of Origin'] || null,
      height_inches: parseFloat(record['Height(inches)']) || null,
      length_inches: parseFloat(record['Length(inches)']) || null,
      width_inches: parseFloat(record['Width(inches)']) || null,
      unit_of_measure: record['Unit of Measure'] || null,
      truck_part_only: record['Truck Part Only'] === 'Y',
      dropship_fee: parseFloat(record['Dropship Fee']) || null,
      hazardous_code: record['Hazardous Code'] || null,
      part_status: record['Part Status'] || null,
    });

    if (batch.length >= 5000) {
      processBatch(batch);
      batch = [];
    }
  });

  parser.on('end', async () => {
    if (batch.length > 0) {
      await processBatch(batch);
    }
    
    console.log(`✅ Imported ${totalRows} PU pricing records`);
    
    // Get coverage stats
    const result = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN dealer_price > 0 THEN 1 END) as with_price
      FROM pu_pricing
    `);
    
    console.log(`📊 Coverage: ${result.rows[0].with_price}/${result.rows[0].total} have prices`);
    
    await client.end();
  });

  parser.on('error', (err) => {
    console.error('Parse error:', err);
    process.exit(1);
  });
}

async function processBatch(batch) {
  const placeholders = batch
    .map((_, i) => {
      const offset = i * 14;
      return `(
        $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4},
        $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8},
        $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12},
        $${offset + 13}, $${offset + 14}
      )`;
    })
    .join(',');

  const values = batch.flatMap(r => [
    r.part_number, r.punctuated_part_number, r.dealer_price,
    r.original_retail, r.suggested_retail, r.base_dealer_price,
    r.brand_name, r.part_description, r.upc_code, r.country_of_origin,
    r.height_inches, r.length_inches, r.width_inches, r.dropship_fee,
  ]);

  const query = `
    INSERT INTO pu_pricing (
      part_number, punctuated_part_number, dealer_price,
      original_retail, suggested_retail, base_dealer_price,
      brand_name, part_description, upc_code, country_of_origin,
      height_inches, length_inches, width_inches, dropship_fee
    ) VALUES ${placeholders}
    ON CONFLICT (part_number) DO UPDATE SET
      dealer_price = EXCLUDED.dealer_price,
      brand_name = COALESCE(pu_pricing.brand_name, EXCLUDED.brand_name)
  `;

  try {
    await client.query(query, values);
  } catch (err) {
    console.error('Batch insert error:', err);
  }
}

importPUPricing().catch(console.error);