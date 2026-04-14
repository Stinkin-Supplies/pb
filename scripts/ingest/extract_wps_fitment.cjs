#!/usr/bin/env node
/**
 * Extract Fitment from WPS product_features
 * Parse HTML lists and populate catalog_fitment table
 */

const { Pool } = require('pg');
const he = require('he'); // HTML entity decoder

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://catalog_app:smelly@5.161.100.126:5432/stinkin_catalog',
});

// Extract year range from text
function extractYearRange(text) {
  // Patterns: "2015 through 2023", "2015-2023", "'15-'23", "`15-`23"
  const patterns = [
    /(\d{4})\s+through\s+(\d{4})/i,
    /(\d{4})\s*-\s*(\d{4})/,
    /[''`](\d{2})\s*-\s*[''`](\d{2})/,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let start = match[1];
      let end = match[2];
      
      // Convert 2-digit years to 4-digit
      if (start.length === 2) start = '20' + start;
      if (end.length === 2) end = '20' + end;
      
      return { year_start: parseInt(start), year_end: parseInt(end) };
    }
  }
  
  // Single year: "2023 models", "fits 2020"
  const singleYear = text.match(/(?:fits?|models?|year)\s+(\d{4})/i);
  if (singleYear) {
    const year = parseInt(singleYear[1]);
    return { year_start: year, year_end: year };
  }
  
  return null;
}

// Extract models from text
function extractModels(text) {
  const models = [];
  
  // Common Harley models
  const modelPatterns = [
    /Road Glide/gi,
    /Street Glide/gi,
    /Electra Glide/gi,
    /Ultra Limited/gi,
    /Softail/gi,
    /Touring/gi,
    /Sportster/gi,
    /Dyna/gi,
    /FLHT/gi,
    /FLHX/gi,
    /FLTR/gi,
    /FXST/gi,
    /FXDB/gi,
  ];
  
  for (const pattern of modelPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      models.push(...matches.map(m => m.trim()));
    }
  }
  
  return [...new Set(models)]; // Dedupe
}

// Parse product_features HTML and extract fitment
function parseFitment(html) {
  if (!html) return [];
  
  // Decode HTML entities
  const decoded = he.decode(html);
  
  // Extract <li> items
  const items = decoded.match(/<li>(.*?)<\/li>/gi) || [];
  
  const fitments = [];
  
  for (const item of items) {
    const text = item.replace(/<[^>]+>/g, '').trim();
    
    // Look for fitment indicators
    if (!/\b(fit|compatible|application|models?|year)\b/i.test(text)) {
      continue;
    }
    
    const years = extractYearRange(text);
    const models = extractModels(text);
    
    if (years || models.length > 0) {
      fitments.push({
        make: 'Harley-Davidson', // WPS is Harley-focused
        models: models.length > 0 ? models : ['Universal'],
        year_start: years?.year_start || null,
        year_end: years?.year_end || null,
        notes: text.substring(0, 500), // Store full fitment text
      });
    }
  }
  
  return fitments;
}

async function extractFitment() {
  const client = await pool.connect();
  
  try {
    console.log('📊 Finding WPS products with fitment data...\n');
    
    const products = await client.query(`
      SELECT id, sku, name, product_features
      FROM catalog_products
      WHERE source_vendor = 'wps'
      AND product_features IS NOT NULL
      AND (
        product_features ILIKE '%fit%20%' OR
        product_features ILIKE '%Road Glide%' OR
        product_features ILIKE '%Softail%' OR
        product_features ILIKE '%Touring%' OR
        product_features ILIKE '%Sportster%' OR
        product_features ILIKE '%Dyna%'
      )
    `);
    
    console.log(`Found ${products.rows.length.toLocaleString()} products with potential fitment data\n`);
    console.log('⚙️  Parsing fitment and inserting into catalog_fitment...\n');
    
    await client.query('BEGIN');
    
    // Clear existing WPS fitment
    await client.query(`
      DELETE FROM catalog_fitment 
      WHERE product_id IN (
        SELECT id FROM catalog_products WHERE source_vendor = 'wps'
      )
    `);
    
    let inserted = 0;
    let skipped = 0;
    
    for (const product of products.rows) {
      const fitments = parseFitment(product.product_features);
      
      if (fitments.length === 0) {
        skipped++;
        continue;
      }
      
      for (const fitment of fitments) {
        for (const model of fitment.models) {
          await client.query(`
            INSERT INTO catalog_fitment (
              product_id, make, model, year_start, year_end, notes
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            product.id,
            fitment.make,
            model,
            fitment.year_start,
            fitment.year_end,
            fitment.notes,
          ]);
          
          inserted++;
        }
      }
      
      if (inserted % 1000 === 0 && inserted > 0) {
        console.log(`  Inserted ${inserted.toLocaleString()} fitment records...`);
      }
    }
    
    await client.query('COMMIT');
    
    console.log('\n✅ Fitment extraction complete!\n');
    console.log(`   Products processed: ${products.rows.length.toLocaleString()}`);
    console.log(`   Fitment records inserted: ${inserted.toLocaleString()}`);
    console.log(`   Products skipped: ${skipped.toLocaleString()}\n`);
    
    // Show samples
    console.log('Sample fitment records:');
    const samples = await client.query(`
      SELECT 
        cp.sku,
        cp.name,
        cf.make,
        cf.model,
        cf.year_start,
        cf.year_end,
        LEFT(cf.notes, 100) as notes
      FROM catalog_fitment cf
      JOIN catalog_products cp ON cp.id = cf.product_id
      WHERE cf.year_start IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 5
    `);
    
    samples.rows.forEach(row => {
      console.log(`\n  ${row.sku} - ${row.name}`);
      console.log(`  ${row.make} ${row.model} (${row.year_start}-${row.year_end})`);
      console.log(`  ${row.notes}...`);
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

extractFitment().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
