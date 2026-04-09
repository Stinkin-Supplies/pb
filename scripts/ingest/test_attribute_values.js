#!/usr/bin/env node

/**
 * Test WPS Attribute Values Fetch
 * Tries different methods to get attribute values
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
  
  const response = await axios.get(url.toString(), {
    headers: {
      'Authorization': `Bearer ${WPS_API_TOKEN}`,
      'Accept': 'application/json',
    },
  });
  
  return response.data;
}

async function testAttributeValueFetch() {
  console.log('\n🧪 Testing WPS Attribute Value Fetch Methods\n');
  
  // Method 1: Try bulk fetch with cursor pagination
  console.log('Method 1: Bulk fetch with pagination');
  try {
    const result = await wpsApiRequest('/attributevalues', {
      'page[size]': '10'
    });
    
    console.log('✓ Response received');
    console.log('  Sample data:', JSON.stringify(result.data?.slice(0, 2), null, 2));
    
    const nonNullValues = result.data?.filter(v => v.value !== null && v.value !== '') || [];
    console.log(`  Non-null values: ${nonNullValues.length} / ${result.data?.length || 0}`);
    
    if (nonNullValues.length > 0) {
      console.log('  ✅ Found actual values!');
      console.log('  Sample:', nonNullValues[0]);
    } else {
      console.log('  ⚠️  All values are null');
    }
  } catch (error) {
    console.log('  ❌ Error:', error.response?.data || error.message);
  }
  
  // Method 2: Try fetching a specific attribute value by ID
  console.log('\nMethod 2: Specific attribute value by ID (901)');
  try {
    const result = await wpsApiRequest('/attributevalues/901');
    console.log('✓ Response:', JSON.stringify(result.data, null, 2));
    
    if (result.data?.value) {
      console.log('  ✅ Has value:', result.data.value);
    } else {
      console.log('  ⚠️  Value is null');
    }
  } catch (error) {
    console.log('  ❌ Error:', error.response?.data || error.message);
  }
  
  // Method 3: Try fetching via product (items endpoint with includes)
  console.log('\nMethod 3: Via product with includes');
  try {
    // Search for a HardDrive product
    const itemResult = await wpsApiRequest('/items', {
      'filter[sku]': '015-01001',
      'include': 'product,attributevalues,brand'
    });
    
    if (itemResult.data && itemResult.data.length > 0) {
      console.log('✓ Found item');
      
      // Check included data
      if (itemResult.included) {
        const attributeValues = itemResult.included.filter(inc => inc.type === 'attributevalues');
        console.log(`  Attribute values in response: ${attributeValues.length}`);
        
        if (attributeValues.length > 0) {
          console.log('  ✅ Sample attribute value:');
          console.log(JSON.stringify(attributeValues[0], null, 2));
        }
      } else {
        console.log('  ⚠️  No included data');
      }
      
      // Check relationships
      if (itemResult.data[0].relationships?.attributevalues) {
        const attrData = itemResult.data[0].relationships.attributevalues.data;
        console.log(`  Attribute relationships: ${attrData?.length || 0}`);
      }
    } else {
      console.log('  ⚠️  Item not found');
    }
  } catch (error) {
    console.log('  ❌ Error:', error.response?.data || error.message);
  }
  
  // Method 4: Try fetching attributes of a specific item by ID
  console.log('\nMethod 4: Item attributes by item ID');
  try {
    // First get an item ID
    const itemResult = await wpsApiRequest('/items', {
      'filter[sku]': '015-01001'
    });
    
    if (itemResult.data && itemResult.data.length > 0) {
      const itemId = itemResult.data[0].id;
      console.log(`✓ Found item ID: ${itemId}`);
      
      // Try to get its attributes
      const attrResult = await wpsApiRequest(`/items/${itemId}`, {
        'include': 'attributevalues'
      });
      
      if (attrResult.included) {
        const attributeValues = attrResult.included.filter(inc => inc.type === 'attributevalues');
        console.log(`  ✅ Attribute values: ${attributeValues.length}`);
        
        if (attributeValues.length > 0) {
          attributeValues.slice(0, 3).forEach(attr => {
            console.log(`    - ${attr.attributes?.name || 'Unknown'}: ${attr.attributes?.value || 'N/A'}`);
          });
        }
      }
    }
  } catch (error) {
    console.log('  ❌ Error:', error.response?.data || error.message);
  }
  
  console.log('\n✅ Test complete\n');
}

testAttributeValueFetch().catch(console.error);
