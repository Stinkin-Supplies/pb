#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ProgressBar {
  constructor(total) {
    this.total = total;
    this.current = 0;
    this.startTime = Date.now();
  }
  tick() {
    this.current++;
    if (this.current % 10000 === 0 || this.current === this.total) {
      const pct = ((this.current / this.total) * 100).toFixed(1);
      const elapsed = (Date.now() - this.startTime) / 1000;
      const rate = Math.round(this.current / elapsed);
      const eta = Math.round((this.total - this.current) / rate);
      process.stdout.write(`\r⏳ ${this.current}/${this.total} (${pct}%) | ${rate}/s | ETA ${eta}s`);
    }
  }
  finish() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    console.log(`\n✅ Complete in ${elapsed.toFixed(1)}s`);
  }
}

const dbClient = new Client({
  host: process.env.CATALOG_DB_HOST || 'localhost',
  port: process.env.CATALOG_DB_PORT || 5432,
  database: process.env.CATALOG_DB_NAME || 'stinkin_catalog',
  user: process.env.CATALOG_DB_USER || 'catalog_app',
  password: process.env.CATALOG_DB_PASSWORD || 'smelly',
});

async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const lines = fileContent.split('\n');
      const headerLine = lines[0];
      const headers = headerLine.split(',').map(h => h.replace(/^"|"$/g, '').trim());
      const records = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const record = {};
        const fields = [];
        let field = '';
        let inQuotes = false;
        
        for (let j = 0; j < line.length; j++) {
          const ch = line[j];
          const nextCh = line[j + 1];
          
          if (ch === '"') {
            if (inQuotes && nextCh === '"') {
              field += '"';
              j++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (ch === ',' && !inQuotes) {
            fields.push(field.replace(/^"|"$/g, '').trim());
            field = '';
          } else {
            field += ch;
          }
        }
        fields.push(field.replace(/^"|"$/g, '').trim());
        
        for (let k = 0; k < headers.length && k < fields.length; k++) {
          record[headers[k]] = fields[k];
        }
        records.push(record);
      }
      resolve(records);
    } catch (err) {
      reject(err);
    }
  });
}

async function createTable() {
  await dbClient.query(`
    DROP TABLE IF EXISTS pu_pricing CASCADE;
    
    CREATE TABLE pu_pricing (
      id SERIAL PRIMARY KEY,
      part_number VARCHAR(100) UNIQUE NOT NULL,
      punctuated_part_number VARCHAR(100),
      dealer_price NUMERIC(10,2),
      original_retail NUMERIC(10,2),
      suggested_retail NUMERIC(10,2),
      base_dealer_price NUMERIC(10,2),
      brand_name VARCHAR(200),
      part_description TEXT,
      upc_code VARCHAR(20),
      country_of_origin VARCHAR(100),
      height_inches NUMERIC(8,2),
      length_inches NUMERIC(8,2),
      width_inches NUMERIC(8,2),
      unit_of_measure VARCHAR(20),
      truck_part_only BOOLEAN DEFAULT false,
      hazmat_code VARCHAR(20),
      part_status VARCHAR(50),
      last_updated TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX idx_pu_pricing_part_number ON pu_pricing(part_number);
    CREATE INDEX idx_pu_pricing_upc ON pu_pricing(upc_code);
    CREATE INDEX idx_pu_pricing_brand ON pu_pricing(brand_name);
  `);
  console.log('✅ Created pu_pricing table');
}

async function insertBatch(batch) {
  if (batch.length === 0) return;
  const values = [];
  const placeholders = batch.map((_, idx) => {
    const base = idx * 14;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14})`;
  }).join(',');

  batch.forEach(record => {
    values.push(
      record['Part Number'] || null,
      record['Punctuated Part Number'] || null,
      parseFloat(record['Your Dealer Price']) || null,
      parseFloat(record['Original Retail']) || null,
      parseFloat(record['Current Suggested Retail']) || null,
      parseFloat(record['Base Dealer Price']) || null,
      record['Brand Name'] || null,
      record['Part Description'] || null,
      record['UPC Code'] || null,
      record['Country of Origin'] || null,
      parseFloat(record['Height(inches)']) || null,
      parseFloat(record['Length(inches)']) || null,
      parseFloat(record['Width(inches)']) || null,
      parseFloat(record['Dropship Fee']) || null
    );
  });

  const query = `
    INSERT INTO pu_pricing (
      part_number, punctuated_part_number, dealer_price,
      original_retail, suggested_retail, base_dealer_price,
      brand_name, part_description, upc_code, country_of_origin,
      height_inches, length_inches, width_inches, truck_part_only
    ) VALUES ${placeholders}
    ON CONFLICT (part_number) DO UPDATE SET
      dealer_price = EXCLUDED.dealer_price,
      suggested_retail = COALESCE(pu_pricing.suggested_retail, EXCLUDED.suggested_retail),
      brand_name = COALESCE(pu_pricing.brand_name, EXCLUDED.brand_name)
  `;
  await dbClient.query(query, values);
}

async function importPUPricing() {
  try {
    console.log('🚀 Starting PU pricing import...\n');
    
    await dbClient.connect();
    console.log('✅ Connected to database');

    await createTable();

    const filePath = path.join(__dirname, '../data/pu_pricefile/20260407pu-pricefile.csv');
    console.log(`📂 Reading ${filePath}...`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const records = await parseCSV(filePath);
    console.log(`✅ Parsed ${records.length} records\n`);

    const batchSize = 5000;
    const progressBar = new ProgressBar(records.length);

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await insertBatch(batch);
      batch.forEach(() => progressBar.tick());
    }

    progressBar.finish();

    const { rows: stats } = await dbClient.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN dealer_price > 0 THEN 1 END) as with_price,
        COUNT(CASE WHEN brand_name IS NOT NULL THEN 1 END) as with_brand,
        COUNT(CASE WHEN part_description IS NOT NULL THEN 1 END) as with_description
      FROM pu_pricing
    `);

    console.log('\n📊 Import Summary:');
    console.log(`   Total records: ${stats[0].total}`);
    console.log(`   With dealer price: ${stats[0].with_price} (${((stats[0].with_price / stats[0].total) * 100).toFixed(1)}%)`);
    console.log(`   With brand: ${stats[0].with_brand} (${((stats[0].with_brand / stats[0].total) * 100).toFixed(1)}%)`);
    console.log(`   With description: ${stats[0].with_description} (${((stats[0].with_description / stats[0].total) * 100).toFixed(1)}%)`);

    const { rows: sample } = await dbClient.query(`
      SELECT part_number, brand_name, dealer_price FROM pu_pricing LIMIT 5
    `);

    console.log('\n📋 Sample Records:');
    sample.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.part_number} | ${row.brand_name || 'N/A'} | $${row.dealer_price}`);
    });

    console.log('\n✨ Import complete!');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await dbClient.end();
  }
}

importPUPricing();
