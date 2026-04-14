/**
 * IMPORT OEM CROSS-REFERENCE DATA
 * 
 * This script imports OEM cross-reference mappings into the catalog_oem_crossref table.
 * 
 * Usage: npx dotenv -e .env.local -- node scripts/ingest/import-oem-crossref.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Sample OEM data structure
 * 
 * In production, you'll extract this from:
 * - FatBook PDF (Harley-Davidson)
 * - Vendor API feeds
 * - Manual catalog entries
 */
const SAMPLE_OEM_DATA = {
  // DS SKU -> Array of OEM cross-references
  '1975': [
    { oem_number: '14-1977', manufacturer: 'Harley-Davidson', page: '511' },
    { oem_number: '63790-77', manufacturer: 'Harley-Davidson', page: '511' },
    { oem_number: '63805-80', manufacturer: 'Harley-Davidson', page: '511' }
  ],
  'DS-193711': [
    { oem_number: '1975704', manufacturer: 'Harley-Davidson', page: '2013' },
    { oem_number: '44209-87T', manufacturer: 'Harley-Davidson', page: '2013' }
  ],
  '2401-1601': [
    { oem_number: '1081A', manufacturer: 'Harley-Davidson', page: '1654' },
    { oem_number: '17030-99', manufacturer: 'Harley-Davidson', page: '1654' }
  ],
  // Add more mappings here...
};

async function importOEMData() {
  console.log('📥 Importing OEM Cross-Reference Data\n');
  console.log('━'.repeat(50));

  try {
    // Step 1: Verify table exists
    console.log('\n📋 Verifying catalog_oem_crossref table exists...');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE tablename = 'catalog_oem_crossref'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('❌ Table catalog_oem_crossref does not exist!');
      console.error('   Run migration_add_oem_table.sql first.');
      process.exit(1);
    }
    console.log('✓ Table exists\n');

    // Step 2: Load OEM data (from JSON, CSV, or hardcoded)
    let oemData = SAMPLE_OEM_DATA;

    // Optionally load from JSON file if it exists
    const jsonPath = path.join(__dirname, 'oem_data.json');
    if (fs.existsSync(jsonPath)) {
      console.log('📂 Loading OEM data from oem_data.json...');
      oemData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      console.log(`✓ Loaded from file\n`);
    } else {
      console.log('📝 Using sample OEM data (3 products)\n');
    }

    // Step 3: Import data
    console.log('💾 Importing cross-references...\n');

    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const [sku, refs] of Object.entries(oemData)) {
      for (const ref of refs) {
        try {
          const result = await pool.query(`
            INSERT INTO catalog_oem_crossref 
              (sku, oem_number, oem_manufacturer, page_reference, source_file)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (sku, oem_number, oem_manufacturer) 
            DO UPDATE SET 
              page_reference = EXCLUDED.page_reference
            RETURNING id
          `, [
            sku,
            ref.oem_number,
            ref.manufacturer,
            ref.page || null,
            ref.source_file || 'manual_import'
          ]);

          if (result.rowCount > 0) {
            inserted++;
            if (inserted % 100 === 0) {
              process.stdout.write(`\r  Progress: ${inserted} records inserted...`);
            }
          }
        } catch (err) {
          console.error(`\n❌ Failed: ${sku} -> ${ref.oem_number}`);
          console.error(`   Error: ${err.message}`);
          failed++;
        }
      }
    }

    console.log('\n');
    console.log('━'.repeat(50));
    console.log('✅ IMPORT COMPLETE\n');
    console.log(`   Inserted/Updated: ${inserted}`);
    console.log(`   Failed: ${failed}`);
    console.log('━'.repeat(50));

    // Step 4: Show statistics
    console.log('\n📊 Database Statistics:\n');

    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT sku) as unique_skus,
        COUNT(DISTINCT oem_number) as unique_oem_numbers,
        COUNT(DISTINCT oem_manufacturer) as unique_manufacturers
      FROM catalog_oem_crossref
    `);

    console.log(`   Total Cross-References: ${stats.rows[0].total_records}`);
    console.log(`   Unique SKUs: ${stats.rows[0].unique_skus}`);
    console.log(`   Unique OEM Numbers: ${stats.rows[0].unique_oem_numbers}`);
    console.log(`   Manufacturers: ${stats.rows[0].unique_manufacturers}\n`);

    // Step 5: Show sample records
    console.log('📋 Sample Records:\n');

    const samples = await pool.query(`
      SELECT sku, oem_number, oem_manufacturer, page_reference
      FROM catalog_oem_crossref
      ORDER BY created_at DESC
      LIMIT 5
    `);

    samples.rows.forEach(row => {
      console.log(`   ${row.sku} → ${row.oem_number} (${row.oem_manufacturer})`);
    });

    console.log('\n✅ Ready for Typesense indexing!\n');

  } catch (error) {
    console.error('\n❌ Import failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Export for use in other scripts
module.exports = { importOEMData };

// Run if called directly
if (require.main === module) {
  importOEMData()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

/**
 * TO ADD MORE OEM DATA:
 * 
 * Create a file: scripts/data/oem_data.json
 * 
 * Format:
 * {
 *   "DS_SKU": [
 *     {
 *       "oem_number": "OEM_PART_NUMBER",
 *       "manufacturer": "MANUFACTURER_NAME",
 *       "page": "PAGE_NUMBER",
 *       "source_file": "SOURCE_CATALOG.pdf"
 *     }
 *   ]
 * }
 * 
 * Example:
 * {
 *   "1975": [
 *     {
 *       "oem_number": "14-1977",
 *       "manufacturer": "Harley-Davidson",
 *       "page": "511",
 *       "source_file": "FatBook_2026-ref.pdf"
 *     }
 *   ]
 * }
 */