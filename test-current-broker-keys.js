// Test current broker API keys with different auth methods
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

const keyId = process.env.BROKER_API_KEY_ID;
const secretKey = process.env.BROKER_API_SECRET_KEY;
const baseUrl = process.env.BROKER_API_URL || 'https://broker-api.sandbox.alpaca.markets';

console.log('Testing current broker API keys...');
console.log('Base URL:', baseUrl);
console.log('Key ID:', keyId);
console.log('Secret Key length:', secretKey ? secretKey.length : 0);

if (!keyId || !secretKey) {
  console.error('Missing credentials');
  process.exit(1);
}

const auth = Buffer.from(`${keyId}:${secretKey}`).toString('base64');
console.log('Basic Auth header (first 20 chars):', auth.substring(0, 20) + '...');

// Test 1: Try broker API accounts endpoint
console.log('\n=== Test 1: Broker API Accounts Endpoint ===');
const testUrl1 = `${baseUrl}/v1/accounts`;
console.log('Testing URL:', testUrl1);

fetch(testUrl1, {
  method: 'GET',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
  }
})
.then(response => {
  console.log('Response status:', response.status);
  return response.text();
})
.then(text => {
  console.log('Response body:', text);
})
.catch(err => {
  console.error('Error:', err.message);
});

// Test 2: Try with trading API style headers
console.log('\n=== Test 2: Trading API Style Headers ===');
fetch(testUrl1, {
  method: 'GET',
  headers: {
    'APCA-API-KEY-ID': keyId,
    'APCA-API-SECRET-KEY': secretKey,
    'Content-Type': 'application/json',
  }
})
.then(response => {
  console.log('Response status:', response.status);
  return response.text();
})
.then(text => {
  console.log('Response body:', text);
})
.catch(err => {
  console.error('Error:', err.message);
});

// Test 3: Try paper trading base URL with broker API keys
console.log('\n=== Test 3: Paper Trading Base URL ===');
const paperUrl = 'https://paper-api.alpaca.markets';
const testUrl3 = `${paperUrl}/v2/account`;
console.log('Testing URL:', testUrl3);

fetch(testUrl3, {
  method: 'GET',
  headers: {
    'APCA-API-KEY-ID': keyId,
    'APCA-API-SECRET-KEY': secretKey,
    'Content-Type': 'application/json',
  }
})
.then(response => {
  console.log('Response status:', response.status);
  return response.text();
})
.then(text => {
  console.log('Response body:', text);
})
.catch(err => {
  console.error('Error:', err.message);
});