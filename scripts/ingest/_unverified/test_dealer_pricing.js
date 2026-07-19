#!/usr/bin/env node

/**
 * Test WPS Dealer Pricing API
 * Check if /dealer-pricing endpoint works now
 */

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

const WPS_API_BASE = 'https://api.wps-inc.com';
const WPS_API_TOKEN = process.env.WPS_API_TOKEN;

async function wpsApiRequest(endpoint, params = {}) {
  const url = new URL(endpoint, WPS_API_BASE);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  
  console.log(`📡 Requesting: ${url.pathname}${url.search}`);
  
  const response = await axios.get(url.toString(), {
    headers: {
      'Authorization': `Bearer ${WPS_API_TOKEN}`,
      'Accept': 'application/json',
    },
    timeout: 10000,
  });
  
  return response.data;
}

async function testDealerPricing() {
  console.log('\n💰 Testing WPS Dealer Pricing API\n');
  
  // Test 1: Try bulk fetch
  console.log('Test 1: Bulk fetch with pagination');
  try {
    const result = await wpsApiRequest('/dealer-pricing', {
      'page[size]': '10'
    });
    
    console.log('✅ Success!');
    console.log(`   Records returned: ${result.data?.length || 0}`);
    
    if (result.data && result.data.length > 0) {
      console.log('   Sample pricing:');
      result.data.slice(0, 3).forEach(price => {
        console.log(`     SKU: ${price.sku || price.item_number || 'N/A'}, Price: $${price.dealer_price || price.price || 'N/A'}`);
      });
      
      console.log('\n   Full structure of first record:');
      console.log(JSON.stringify(result.data[0], null, 2));
    }
    
    if (result.meta?.cursor?.next) {
      console.log(`\n   ✅ Has pagination cursor - can fetch all records!`);
    }
    
  } catch (error) {
    if (error.response?.status === 503) {
      console.log('❌ 503 Service Unavailable - endpoint still broken');
      console.log('   Must use CSV download from website');
    } else {
      console.log('❌ Error:', error.response?.status, error.response?.statusText);
      console.log('   Details:', error.response?.data);
    }
  }
  
  // Test 2: Try with filter for specific SKU
  console.log('\n\nTest 2: Fetch pricing for specific SKU');
  try {
    const result = await wpsApiRequest('/dealer-pricing', {
      'filter[sku]': '015-01001'
    });
    
    console.log('✅ Success!');
    console.log('   Response:', JSON.stringify(result.data, null, 2));
    
  } catch (error) {
    console.log('❌ Error:', error.response?.status, error.response?.statusText);
  }
  
  // Test 3: Alternative - try items endpoint for pricing
  console.log('\n\nTest 3: Get pricing from /items endpoint');
  try {
    const result = await wpsApiRequest('/items', {
      'filter[sku]': '015-01001'
    });
    
    if (result.data && result.data.length > 0) {
      const item = result.data[0];
      console.log('✅ Found item');
      console.log('   Item structure:');
      console.log(JSON.stringify(item, null, 2));
      
      // Check if pricing is in the item data
      if (item.dealer_price || item.price || item.cost) {
        console.log('\n   ✅ Pricing available in items endpoint!');
        console.log(`   Dealer Price: $${item.dealer_price || 'N/A'}`);
        console.log(`   Price: $${item.price || 'N/A'}`);
        console.log(`   Cost: $${item.cost || 'N/A'}`);
      } else {
        console.log('\n   ⚠️  No pricing fields in item data');
      }
    }
    
  } catch (error) {
    console.log('❌ Error:', error.response?.status, error.message);
  }
  
  console.log('\n✅ Test complete\n');
}

testDealerPricing().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  process.exit(1);
});
