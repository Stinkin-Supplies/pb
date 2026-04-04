import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const COLUMNS = {
  partNumber: 0, partStatus: 4, partDescription: 5,
  originalRetail: 6, currentSuggestedRetail: 7, baseDealerPrice: 8,
  yourDealerPrice: 9, hazardousCode: 10, upcCode: 24,
  brandName: 25, countryOfOrigin: 26, productCode: 28, weight: 30,
  wiAvailability: 13, nyAvailability: 14, txAvailability: 15,
  caAvailability: 16, nvAvailability: 17, ncAvailability: 18,
  nationalAvailability: 19, height: 73, length: 74, width: 75,
  dropshipFee: 76, fatbookCatalog: 40, fatbookMidYearCatalog: 45,
  tireCatalog: 50, oldbookCatalog: 55, oldbookMidYearCatalog: 60
};

function parseCSVLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += char;
  }
  result.push(current.trim());
  return result;
}

async function importDealerPrice() {
  const filePath = path.join(__dirname, '../data/pu_pricefile/D00108_DealerPrice.csv');
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  console.log('📥 Importing D00108 Dealer Price CSV...');
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const dataLines = lines.slice(1);
  console.log(`Total rows: ${dataLines.length.toLocaleString()}`);

  const BATCH_SIZE = 1000;
  let successCount = 0, errorCount = 0;

  for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
    const batch = dataLines.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(dataLines.length / BATCH_SIZE);

    const payload = batch.map((line, idx) => {
      const c = parseCSVLine(line);
      return {
        row_num: i + idx + 1,
        part_number: c[COLUMNS.partNumber] || '',
        part_status: c[COLUMNS.partStatus] || '',
        part_description: c[COLUMNS.partDescription] || '',
        original_retail: parseFloat(c[COLUMNS.originalRetail]) || null,
        current_suggested_retail: parseFloat(c[COLUMNS.currentSuggestedRetail]) || null,
        base_dealer_price: parseFloat(c[COLUMNS.baseDealerPrice]) || null,
        your_dealer_price: parseFloat(c[COLUMNS.yourDealerPrice]) || null,
        hazardous_code: c[COLUMNS.hazardousCode] || '',
        upc_code: c[COLUMNS.upcCode] || '',
        brand_name: c[COLUMNS.brandName] || '',
        country_of_origin: c[COLUMNS.countryOfOrigin] || '',
        product_code: c[COLUMNS.productCode] || '',
        weight: parseFloat(c[COLUMNS.weight]) || null,
        fatbook_catalog: c[COLUMNS.fatbookCatalog] || '',
        fatbook_midyear_catalog: c[COLUMNS.fatbookMidYearCatalog] || '',
        tire_catalog: c[COLUMNS.tireCatalog] || '',
        oldbook_catalog: c[COLUMNS.oldbookCatalog] || '',
        oldbook_midyear_catalog: c[COLUMNS.oldbookMidYearCatalog] || '',
        availability: {
          wi: c[COLUMNS.wiAvailability] || '0', ny: c[COLUMNS.nyAvailability] || '0',
          tx: c[COLUMNS.txAvailability] || '0', ca: c[COLUMNS.caAvailability] || '0',
          nv: c[COLUMNS.nvAvailability] || '0', nc: c[COLUMNS.ncAvailability] || '0',
          national: c[COLUMNS.nationalAvailability] || '0'
        },
        dimensions: {
          height: parseFloat(c[COLUMNS.height]) || null,
          length: parseFloat(c[COLUMNS.length]) || null,
          width: parseFloat(c[COLUMNS.width]) || null
        },
        dropship_fee: parseFloat(c[COLUMNS.dropshipFee]) || null
      };
    });

    try {
      const { error } = await supabase.from('raw_vendor_pu').upsert({
        source_file: `dealerprice_batch_${batchNum.toString().padStart(4, '0')}`,
        payload: payload,
        imported_at: new Date().toISOString()
      }, { onConflict: 'source_file' });

      if (error) { console.error(`\nBatch ${batchNum} error:`, error.message); errorCount++; }
      else { successCount += batch.length; process.stdout.write(`\r✓ Batch ${batchNum}/${totalBatches} - ${successCount.toLocaleString()} rows`); }
    } catch (err) { console.error(`\nBatch ${batchNum} error:`, err.message); errorCount++; }
  }

  console.log('\n\n✅ Stage 0 Complete!');
  console.log(`  Rows imported: ${successCount.toLocaleString()}`);
  console.log(`  Errors: ${errorCount}`);
}

importDealerPrice().catch(console.error);