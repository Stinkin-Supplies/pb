#!/usr/bin/env node

/**
 * WPS API Token Tester
 * Verifies your API token is valid
 */

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

const WPS_API_TOKEN = process.env.WPS_API_TOKEN;

console.log('🔐 WPS API Token Tester\n');

if (!WPS_API_TOKEN) {
  console.log('❌ WPS_API_TOKEN not found in environment');
  console.log('\nChecking .env.local file...');
  
  try {
    const fs = await import('fs');
    const envContent = fs.readFileSync('.env.local', 'utf8');
    const hasToken = envContent.includes('WPS_API_TOKEN');
    
    if (hasToken) {
      console.log('✅ WPS_API_TOKEN found in .env.local');
      console.log('⚠️  But not loaded into environment');
      console.log('\nPossible issues:');
      console.log('  1. Extra quotes: WPS_API_TOKEN="xyz" (remove quotes)');
      console.log('  2. Spaces: WPS_API_TOKEN= xyz (remove space)');
      console.log('  3. Wrong file: Check you\'re editing .env.local not .env');
    } else {
      console.log('❌ WPS_API_TOKEN not found in .env.local');
      console.log('\nAdd this line to .env.local:');
      console.log('  WPS_API_TOKEN=your_token_here');
    }
  } catch (err) {
    console.log('❌ Could not read .env.local:', err.message);
  }
  
  process.exit(1);
}

console.log('✅ Token found in environment');
console.log(`   Length: ${WPS_API_TOKEN.length} characters`);
console.log(`   First 10 chars: ${WPS_API_TOKEN.substring(0, 10)}...`);
console.log(`   Last 10 chars: ...${WPS_API_TOKEN.substring(WPS_API_TOKEN.length - 10)}\n`);

// Test with a simple API call
console.log('🧪 Testing token with WPS API...\n');

try {
  const response = await axios.get('https://api.wps-inc.com/brands', {
    headers: {
      'Authorization': `Bearer ${WPS_API_TOKEN}`,
      'Accept': 'application/json',
    }
  });
  
  console.log('✅ SUCCESS! Token is valid');
  console.log(`   API Response Status: ${response.status}`);
  console.log(`   You have access to the WPS API\n`);
  
  console.log('Sample response:');
  console.log(JSON.stringify(response.data, null, 2).substring(0, 500) + '...\n');
  
  console.log('🎉 Your token works! You can now run:');
  console.log('   node scripts/ingest/fetch_wps_pricing.js');
  
} catch (error) {
  console.log('❌ FAILED! Token is invalid or has no permissions\n');
  
  if (error.response) {
    console.log(`   Status: ${error.response.status}`);
    console.log(`   Message: ${JSON.stringify(error.response.data)}\n`);
    
    if (error.response.status === 401) {
      console.log('Common causes of 401 Unauthorized:');
      console.log('  1. Token is expired or invalid');
      console.log('  2. Token has extra characters (spaces, quotes, newlines)');
      console.log('  3. Token hasn\'t been activated by WPS yet');
      console.log('  4. Token was revoked\n');
      console.log('Next steps:');
      console.log('  1. Request a new token from WPS');
      console.log('  2. Check token carefully for typos');
      console.log('  3. Contact WPS support: 800-999-3388');
    }
    
    if (error.response.status === 403) {
      console.log('403 Forbidden - Token is valid but lacks permissions');
      console.log('  Contact WPS to verify your API scope/permissions');
    }
  } else {
    console.log('   Error:', error.message);
  }
  
  process.exit(1);
}
