#!/usr/bin/env node
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const dbClient = new Client({
  connectionString: process.env.CATALOG_DATABASE_URL
});

async function analyzeData() {
  try {
    console.log('🔍 Comprehensive Data Analysis\n');
    console.log('='.repeat(60) + '\n');
    
    await dbClient.connect();

    // 1. WPS Analysis
    console.log('📊 WPS PRODUCTS\n');
    const wpsStats = await dbClient.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN price > 0 THEN 1 END) as with_price,
        COUNT(CASE WHEN category IS NOT NULL THEN 1 END) as with_category,
        COUNT(CASE WHEN description IS NOT NULL THEN 1 END) as with_description,
        AVG(CASE WHEN price > 0 THEN price END) as avg_price
      FROM catalog_products
      WHERE source_vendor = 'wps'
    `);
    
    const wps = wpsStats.rows[0];
    console.log(`   Total: ${wps.total.toLocaleString()}`);
    console.log(`   With Price: ${wps.with_price.toLocaleString()} (${((wps.with_price / wps.total) * 100).toFixed(1)}%)`);
    console.log(`   With Category: ${wps.with_category.toLocaleString()} (${((wps.with_category / wps.total) * 100).toFixed(1)}%)`);
    console.log(`   With Description: ${wps.with_description.toLocaleString()} (${((wps.with_description / wps.total) * 100).toFixed(1)}%)`);
    console.log(`   Avg Price: $${parseFloat(wps.avg_price || 0).toFixed(2)}`);

    // 2. WPS Enrichment
    console.log('\n📋 WPS ENRICHMENT\n');
    const wpsEnrich = await dbClient.query(`
      SELECT 
        COUNT(CASE WHEN attributes IS NOT NULL THEN 1 END) as with_attributes
      FROM catalog_product_enrichment
      WHERE sku IN (SELECT sku FROM catalog_products WHERE source_vendor = 'wps')
    `);
    
    const wpsE = wpsEnrich.rows[0];
    const wpsEnrichPct = ((wpsE.with_attributes / wps.total) * 100).toFixed(1);
    console.log(`   With Attributes: ${wpsE.with_attributes.toLocaleString()} (${wpsEnrichPct}%)`);

    // 3. PU Analysis
    console.log('\n📊 PU PRODUCTS\n');
    const puStats = await dbClient.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN cost > 0 THEN 1 END) as with_cost,
        COUNT(CASE WHEN msrp > 0 THEN 1 END) as with_msrp,
        AVG(CASE WHEN msrp > 0 THEN msrp END) as avg_msrp,
        SUM(total_qty) as total_inventory
      FROM pu_products
    `);
    
    const pu = puStats.rows[0];
    console.log(`   Total: ${pu.total.toLocaleString()}`);
    console.log(`   With Cost: ${pu.with_cost.toLocaleString()} (${((pu.with_cost / pu.total) * 100).toFixed(1)}%)`);
    console.log(`   With MSRP: ${pu.with_msrp.toLocaleString()} (${((pu.with_msrp / pu.total) * 100).toFixed(1)}%)`);
    console.log(`   Avg MSRP: $${parseFloat(pu.avg_msrp || 0).toFixed(2)}`);
    console.log(`   Total Inventory: ${(pu.total_inventory || 0).toLocaleString()} units`);

    // 4. PU Enrichment
    console.log('\n📋 PU ENRICHMENT\n');
    const puEnrich = await dbClient.query(`
      SELECT 
        COUNT(CASE WHEN attributes IS NOT NULL THEN 1 END) as with_attributes,
        COUNT(CASE WHEN attributes->>'size' IS NOT NULL THEN 1 END) as with_size,
        COUNT(CASE WHEN attributes->>'color' IS NOT NULL THEN 1 END) as with_color,
        COUNT(CASE WHEN attributes->>'category' IS NOT NULL THEN 1 END) as with_category
      FROM catalog_product_enrichment
      WHERE sku IN (SELECT sku FROM pu_products)
    `);
    
    const puE = puEnrich.rows[0];
    const puEnrichPct = ((puE.with_attributes / pu.total) * 100).toFixed(1);
    console.log(`   With Attributes: ${puE.with_attributes.toLocaleString()} (${puEnrichPct}%)`);
    console.log(`   With Size: ${puE.with_size.toLocaleString()} (${((puE.with_size / pu.total) * 100).toFixed(1)}%)`);
    console.log(`   With Color: ${puE.with_color.toLocaleString()} (${((puE.with_color / pu.total) * 100).toFixed(1)}%)`);
    console.log(`   With Category: ${puE.with_category.toLocaleString()} (${((puE.with_category / pu.total) * 100).toFixed(1)}%)`);

    // 5. Overlap
    console.log('\n🔗 OVERLAP\n');
    const overlap = await dbClient.query(`
      SELECT COUNT(*) as matches
      FROM pu_products pp
      WHERE EXISTS (SELECT 1 FROM catalog_products cp WHERE cp.sku = pp.sku AND cp.source_vendor = 'wps')
    `);
    
    const matchCount = overlap.rows[0].matches;
    console.log(`   Exact SKU Matches: ${matchCount.toLocaleString()}`);
    console.log(`   Unique Products: ${(parseInt(wps.total) + parseInt(pu.total) - matchCount).toLocaleString()}`);

    console.log('\n' + '='.repeat(60));
    console.log('\n✨ Analysis complete!\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await dbClient.end();
  }
}

analyzeData();
