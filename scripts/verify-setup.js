/**
 * VERIFY TYPESENSE SETUP
 * 
 * This script verifies that everything is set up correctly:
 * - Database OEM table exists and has data
 * - Typesense collection exists with correct schema
 * - Sample searches work correctly
 * 
 * Usage: npx dotenv -e .env.local -- node verify-setup.js
 */

const { Pool } = require('pg');
const Typesense = require('typesense');

const pool = new Pool({
  connectionString: process.env.CATALOG_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const client = new Typesense.Client({
  nodes: [{
    host: process.env.TYPESENSE_HOST,
    port: '443',
    protocol: 'https'
  }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 10
});

async function verify() {
  console.log('🔍 Verifying Typesense Setup\n');
  console.log('━'.repeat(60));

  const results = {
    database: false,
    typesense: false,
    oemData: false,
    search: false
  };

  try {
    // Test 1: Database Connection
    console.log('\n✓ TEST 1: Database Connection');
    await pool.query('SELECT NOW()');
    results.database = true;
    console.log('  ✅ Connected to Postgres\n');

    // Test 2: OEM Table Exists
    console.log('✓ TEST 2: OEM Cross-Reference Table');
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_tables 
        WHERE tablename = 'catalog_oem_crossref'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('  ❌ Table catalog_oem_crossref does not exist');
      console.log('     Run: npm run setup:db\n');
    } else {
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT sku) as unique_skus,
          COUNT(DISTINCT oem_number) as unique_oem_numbers
        FROM catalog_oem_crossref
      `);

      results.oemData = stats.rows[0].total > 0;

      console.log(`  ✅ Table exists`);
      console.log(`     Total Records: ${stats.rows[0].total}`);
      console.log(`     Unique SKUs: ${stats.rows[0].unique_skus}`);
      console.log(`     Unique OEM Numbers: ${stats.rows[0].unique_oem_numbers}`);

      if (stats.rows[0].total === 0) {
        console.log('     ⚠️  No data yet - Run: npm run import:oem');
      }
      console.log('');
    }

    // Test 3: Typesense Collection
    console.log('✓ TEST 3: Typesense Collection');
    try {
      const collection = await client.collections('products').retrieve();
      results.typesense = true;

      console.log(`  ✅ Collection exists`);
      console.log(`     Name: ${collection.name}`);
      console.log(`     Documents: ${collection.num_documents}`);
      console.log(`     Fields: ${collection.fields.length}`);

      // Check for OEM fields
      const hasOEMFields = collection.fields.some(f => f.name === 'oem_numbers');
      if (hasOEMFields) {
        console.log(`     ✅ OEM fields present (oem_numbers, oem_manufacturers)`);
      } else {
        console.log(`     ⚠️  Missing OEM fields - Run: npm run typesense:recreate`);
      }

      if (collection.num_documents === 0) {
        console.log('     ⚠️  No documents indexed - Run: npm run typesense:index');
      }
      console.log('');
    } catch (err) {
      if (err.httpStatus === 404) {
        console.log('  ❌ Collection not found');
        console.log('     Run: npm run typesense:recreate\n');
      } else {
        throw err;
      }
    }

    // Test 4: Sample OEM Search
    if (results.typesense) {
      console.log('✓ TEST 4: OEM Cross-Reference Search');
      try {
        const searchResult = await client.collections('products')
          .documents()
          .search({
            q: '14-1977',
            query_by: 'oem_numbers,sku,name',
            per_page: 1
          });

        if (searchResult.hits.length > 0) {
          results.search = true;
          const doc = searchResult.hits[0].document;

          console.log(`  ✅ OEM search working`);
          console.log(`     Query: "14-1977"`);
          console.log(`     Found: ${doc.name} (SKU: ${doc.sku})`);
          if (doc.oem_numbers) {
            console.log(`     OEM Numbers: ${doc.oem_numbers.join(', ')}`);
          }
        } else {
          console.log('  ⚠️  No results for test OEM search');
          console.log('     Make sure you have indexed products with OEM data');
        }
      } catch (err) {
        console.log('  ❌ Search failed:', err.message);
      }
      console.log('');
    }

    // Test 5: Fitment Search
    if (results.typesense) {
      console.log('✓ TEST 5: Fitment Filtering');
      try {
        const fitmentResult = await client.collections('products')
          .documents()
          .search({
            q: '*',
            filter_by: 'fitment_make:=Harley-Davidson && fitment_year:=2015',
            per_page: 1
          });

        if (fitmentResult.hits.length > 0) {
          console.log(`  ✅ Fitment filtering working`);
          console.log(`     Filter: 2015 Harley-Davidson`);
          console.log(`     Results: ${fitmentResult.found} products`);
        } else {
          console.log('  ⚠️  No fitment data indexed yet');
        }
      } catch (err) {
        console.log('  ❌ Fitment search failed:', err.message);
      }
      console.log('');
    }

    // Summary
    console.log('━'.repeat(60));
    console.log('\n📊 VERIFICATION SUMMARY\n');

    const checks = [
      { name: 'Database Connection', status: results.database },
      { name: 'OEM Data Imported', status: results.oemData },
      { name: 'Typesense Collection', status: results.typesense },
      { name: 'OEM Search Working', status: results.search }
    ];

    checks.forEach(check => {
      const icon = check.status ? '✅' : '❌';
      console.log(`   ${icon} ${check.name}`);
    });

    const allPassed = Object.values(results).every(r => r);

    console.log('');
    if (allPassed) {
      console.log('🎉 All checks passed! Your setup is complete.\n');
    } else {
      console.log('⚠️  Some checks failed. Follow the instructions above.\n');
      console.log('Quick Setup:');
      console.log('  npm run setup:all\n');
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  verify()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { verify };
