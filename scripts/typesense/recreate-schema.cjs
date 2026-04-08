/**
 * RECREATE TYPESENSE SCHEMA
 * 
 * This script drops the old 'products' collection and recreates it
 * with the new schema that includes OEM cross-reference fields.
 * 
 * WARNING: This will delete all existing indexed documents!
 * Make sure you have a backup before running.
 * 
 * Usage: npx dotenv -e .env.local -- node scripts/typesense/recreate-schema.cjs
 */

const Typesense = require('typesense');
const fs = require('fs');
const path = require('path');

const client = new Typesense.Client({
  nodes: [{
    host: process.env.TYPESENSE_HOST,
    port: '443',
    protocol: 'https'
  }],
  apiKey: process.env.TYPESENSE_API_KEY,
  connectionTimeoutSeconds: 10
});

async function recreateSchema() {
  console.log('🔄 Recreating Typesense Schema\n');
  console.log('━'.repeat(50));

  try {
    // Step 1: Check if collection exists
    console.log('\n📋 Checking current collection...');
    let collectionExists = false;
    
    try {
      const collection = await client.collections('products').retrieve();
      collectionExists = true;
      console.log(`✓ Found collection: ${collection.name}`);
      console.log(`  Documents: ${collection.num_documents}`);
      console.log(`  Fields: ${collection.fields.length}\n`);
    } catch (err) {
      if (err.httpStatus === 404) {
        console.log('✓ No existing collection found\n');
      } else {
        throw err;
      }
    }

    // Step 2: Backup existing collection (if it exists)
    if (collectionExists) {
      console.log('💾 Creating backup...');
      
      try {
        const docs = await client.collections('products')
          .documents()
          .export();

        const backupDir = path.join(__dirname, '../../backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }

        const backupFile = path.join(
          backupDir,
          `products_backup_${Date.now()}.jsonl`
        );

        fs.writeFileSync(backupFile, docs);
        console.log(`✓ Backup saved: ${backupFile}\n`);
      } catch (err) {
        console.error('⚠️  Backup failed:', err.message);
        console.log('   Continuing anyway...\n');
      }

      // Step 3: Delete old collection
      console.log('🗑️  Deleting old collection...');
      await client.collections('products').delete();
      console.log('✓ Deleted\n');
    }

    // Step 4: Load new schema
    console.log('📂 Loading new schema...');
    
    const schemaPath = path.join(__dirname, '../../typesense_schema_complete.json');
    
    if (!fs.existsSync(schemaPath)) {
      console.error(`❌ Schema file not found: ${schemaPath}`);
      console.error('   Make sure typesense_schema_complete.json is in your project root.');
      process.exit(1);
    }

    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    console.log(`✓ Loaded schema: ${schema.name}`);
    console.log(`  Fields: ${schema.fields.length}\n`);

    // Step 5: Create new collection
    console.log('✨ Creating new collection with updated schema...');
    
    const newCollection = await client.collections().create(schema);
    
    console.log('✓ Collection created!\n');

    // Step 6: Verify new collection
    console.log('🔍 Verifying new collection...');
    const verification = await client.collections('products').retrieve();
    
    console.log(`  Name: ${verification.name}`);
    console.log(`  Fields: ${verification.fields.length}`);
    console.log(`  Documents: ${verification.num_documents}\n`);

    // Step 7: Show new fields
    console.log('📋 New Fields Added:\n');
    
    const newFields = verification.fields.filter(f => 
      ['oem_numbers', 'oem_manufacturers', 'fitment_applications'].includes(f.name)
    );

    newFields.forEach(field => {
      console.log(`   ✓ ${field.name} (${field.type})`);
    });

    console.log('\n━'.repeat(50));
    console.log('✅ SCHEMA RECREATION COMPLETE\n');
    console.log('📝 Next Steps:');
    console.log('   1. Import OEM data: npm run import-oem');
    console.log('   2. Rebuild index: npm run index-typesense\n');

  } catch (error) {
    console.error('\n❌ Schema recreation failed:', error);
    
    if (error.httpStatus === 401) {
      console.error('\n   Check your TYPESENSE_API_KEY in .env.local');
    } else if (error.httpStatus === 404) {
      console.error('\n   Check your TYPESENSE_HOST in .env.local');
    }
    
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  recreateSchema()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { recreateSchema };
