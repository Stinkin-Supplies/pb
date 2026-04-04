/**
 * Stage 0: Import Parts Unlimited D00108 Dealer Price CSV
 * Imports raw CSV data into raw_vendor_pu table as JSONB batches
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase connection
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Check .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// CSV column mapping (0-indexed)
const COLUMNS = {
  partNumber: 0,
  punctuatedPartNumber: 1,
  vendorPartNumber: 2,
  partStatus: 4,
  partDescription: 5,
  originalRetail: 6,
  currentSuggestedRetail: 7,
  baseDealerPrice: 8,
  yourDealerPrice: 9,
  hazardousCode: 10,
  upcCode: 24,
  brandName: 25,
  countryOfOrigin: 26,
  productCode: 28,
  weight: 30,
  // Catalog codes
  fatbookCatalog: 40,
  fatbookMidYearCatalog: 45,
  tireCatalog: 50,
  oldbookCatalog: 55,
  oldbookMidYearCatalog: 60,
  // Availability
  wiAvailability: 13,
  nyAvailability: 14,
  txAvailability: 15,
  caAvailability: 16,
  nvAvailability: 17,
  ncAvailability: 18,
  nationalAvailability: 19,
  // Dimensions
  height: 73,
  length: 74,
  width: 75,
  dropshipFee: 76
};

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function importDealerPrice() {
  const filePath = path.join(__dirname, '../data/pu_pricefile/D00108_DealerPrice.csv');
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log('📥 Stage 0: Importing D00108 Dealer Price CSV...');
  console.log(`File: ${filePath}`);

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  
  // Skip header
  const header = lines[0];
  const dataLines = lines.slice(1);
  
  console.log(`Total rows: ${dataLines.length}`);

  // Process in batches of 1000
  const BATCH_SIZE = 1000;
  let batchCount = 0;
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
    const batch = dataLines.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(dataLines.length / BATCH_SIZE);
    
    const payload = batch.map((line, idx) => {
      const cols = parseCSVLine(line);
      return {
        row_num: i + idx + 1,
        part_number: cols[COLUMNS.partNumber] || '',
        punctuated_part_number: cols[COLUMNS.punctuatedPartNumber] || '',
        vendor_part_number: cols[COLUMNS.vendorPartNumber] || '',
        part_status: cols[COLUMNS.partStatus] || '',
        part_description: cols[COLUMNS.partDescription] || '',
        original_retail: parseFloat(cols[COLUMNS.originalRetail]) || null,
        current_suggested_retail: parseFloat(cols[COLUMNS.currentSuggestedRetail]) || null,
        base_dealer_price: parseFloat(cols[COLUMNS.baseDealerPrice]) || null,
        your_dealer_price: parseFloat(cols[COLUMNS.yourDealerPrice]) || null,
        hazardous_code: cols[COLUMNS.hazardousCode] || '',
        upc_code: cols[COLUMNS.upcCode] || '',
        brand_name: cols[COLUMNS.brandName] || '',
        country_of_origin: cols[COLUMNS.countryOfOrigin] || '',
        product_code: cols[COLUMNS.productCode] || '',
        weight: parseFloat(cols[COLUMNS.weight]) || null,
        fatbook_catalog: cols[COLUMNS.fatbookCatalog] || '',
        fatbook_midyear_catalog: cols[COLUMNS.fatbookMidYearCatalog] || '',
        tire_catalog: cols[COLUMNS.tireCatalog] || '',
        oldbook_catalog: cols[COLUMNS.oldbookCatalog] || '',
        oldbook_midyear_catalog: cols[COLUMNS.oldbookMidYearCatalog] || '',
        availability: {
          wi: cols[COLUMNS.wiAvailability] || '0',
          ny: cols[COLUMNS.nyAvailability] || '0',
          tx: cols[COLUMNS.txAvailability] || '0',
          ca: cols[COLUMNS.caAvailability] || '0',
          nv: cols[COLUMNS.nvAvailability] || '0',
          nc: cols[COLUMNS.ncAvailability] || '0',
          national: cols[COLUMNS.nationalAvailability] || '0'
        },
        dimensions: {
          height: parseFloat(cols[COLUMNS.height]) || null,
          length: parseFloat(cols[COLUMNS.length]) || null,
          width: parseFloat(cols[COLUMNS.width]) || null
        },
        dropship_fee: parseFloat(cols[COLUMNS.dropshipFee]) || null
      };
    });

    try {
      const { error } = await supabase
        .from('raw_vendor_pu')
        .upsert({
          source_file: `dealerprice_batch_${batchNum.toString().padStart(4, '0')}`,
          payload: payload,
          imported_at: new Date().toISOString()
        }, {
          onConflict: 'source_file'
        });

      if (error) {
        console.error(`Batch ${batchNum} error:`, error.message);
        errorCount++;
      } else {
        successCount += batch.length;
        batchCount++;
        process.stdout.write(`\r✓ Batch ${batchNum}/${totalBatches} - ${successCount} rows imported`);
      }
    } catch (err) {
      console.error(`Batch ${batchNum} exception:`, err.message);
      errorCount++;
    }
  }

  console.log('\n');
  console.log('✅ Stage 0 Complete!');
  console.log(`  Batches: ${batchCount}`);
  console.log(`  Rows imported: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
}

importDealerPrice().catch(console.error);
