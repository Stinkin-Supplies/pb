#!/usr/bin/env node

/**
 * WPS Dealer Pricing Fetcher
 * Requests and downloads your custom dealer pricing file from WPS API
 * 
 * Usage:
 *   WPS_API_TOKEN=your_token node fetch_wps_pricing.js
 */

import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });

const WPS_API_BASE = 'https://api.wps-inc.com';
const WPS_API_TOKEN = process.env.WPS_API_TOKEN;
const POLL_INTERVAL = 5000; // 5 seconds
const MAX_ATTEMPTS = 120; // 10 minutes max wait

if (!WPS_API_TOKEN) {
  console.error('❌ WPS_API_TOKEN environment variable not set');
  console.log('\nUsage:');
  console.log('  WPS_API_TOKEN=your_token node fetch_wps_pricing.js');
  process.exit(1);
}

async function requestPricingFile() {
  console.log('📋 Requesting WPS dealer pricing file...\n');
  
  try {
    const response = await axios.get(`${WPS_API_BASE}/dealer-pricing`, {
      headers: {
        'Authorization': `Bearer ${WPS_API_TOKEN}`,
        'Accept': 'application/json',
      },
      validateStatus: (status) => status === 200 || status === 202
    });
    
    if (response.status === 202) {
      console.log('⏳ Pricing file is being generated...');
      console.log('   Status: 202 - File generation in progress');
      console.log('   Polling every 5 seconds...\n');
      return null; // File not ready yet
    }
    
    if (response.status === 200) {
      console.log('✅ Pricing file is ready!');
      return response.data;
    }
    
  } catch (error) {
    console.error('❌ Error requesting pricing file:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

async function pollForPricingFile() {
  console.log('🔄 Starting polling process...\n');
  
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await requestPricingFile();
      
      if (result) {
        return result; // File is ready
      }
      
      // File not ready, wait and try again
      console.log(`   Attempt ${attempt}/${MAX_ATTEMPTS} - waiting 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      
    } catch (error) {
      console.error(`Error on attempt ${attempt}:`, error.message);
      if (attempt === MAX_ATTEMPTS) {
        throw error;
      }
      console.log('   Retrying...\n');
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }
  
  throw new Error('Timeout: Pricing file generation took too long');
}

async function downloadPricingFile(fileUrl, outputPath) {
  console.log(`\n📥 Downloading pricing file from: ${fileUrl}`);
  
  try {
    const response = await axios.get(fileUrl, {
      headers: {
        'Authorization': `Bearer ${WPS_API_TOKEN}`,
      },
      responseType: 'stream'
    });
    
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        const stats = fs.statSync(outputPath);
        const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`✅ Downloaded: ${outputPath}`);
        console.log(`   File size: ${fileSizeInMB} MB`);
        resolve();
      });
      writer.on('error', reject);
    });
    
  } catch (error) {
    console.error('❌ Error downloading file:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 WPS Dealer Pricing Fetcher\n');
  console.log('This will request your custom dealer pricing file from WPS.\n');
  
  try {
    // Step 1: Request/poll for pricing file
    const pricingData = await pollForPricingFile();
    
    console.log('\n📦 Pricing file response:');
    console.log(JSON.stringify(pricingData, null, 2));
    
    // Step 2: Extract file URL from response
    // The response structure may vary - common patterns:
    let fileUrl = null;
    
    if (typeof pricingData === 'string' && pricingData.startsWith('http')) {
      fileUrl = pricingData;
    } else if (pricingData.url) {
      fileUrl = pricingData.url;
    } else if (pricingData.file_url) {
      fileUrl = pricingData.file_url;
    } else if (pricingData.location) {
      fileUrl = pricingData.location;
    } else if (pricingData.data?.url) {
      fileUrl = pricingData.data.url;
    }
    
    if (!fileUrl) {
      console.error('\n❌ Could not find file URL in response');
      console.log('Response structure:', pricingData);
      console.log('\nPlease check the WPS API documentation for the correct response format.');
      process.exit(1);
    }
    
    // Step 3: Download the file
    const timestamp = new Date().toISOString().split('T')[0];
    const outputPath = path.join(process.cwd(), `WPS_DealerPricing_${timestamp}.csv`);
    
    await downloadPricingFile(fileUrl, outputPath);
    
    console.log('\n🎉 Success! Your WPS dealer pricing file is ready.');
    console.log(`\nNext step - Import the pricing:`);
    console.log(`  node scripts/ingest/import_wps_pricing.js ${outputPath}\n`);
    
  } catch (error) {
    console.error('\n❌ Failed to fetch pricing file:', error.message);
    process.exit(1);
  }
}

main();
