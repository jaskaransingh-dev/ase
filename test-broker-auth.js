// Test broker API authentication
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');

const keyId = process.env.BROKER_API_KEY_ID || process.env.ALPACA_KEY_ID;
const secretKey = process.env.BROKER_API_SECRET_KEY || process.env.ALPACA_SECRET_KEY;
const baseUrl = process.env.BROKER_API_URL || process.env.ALPACA_BASE_URL || 'https://broker-api.sandbox.alpaca.markets';

console.log('Testing Broker API auth...');
console.log('Base URL:', baseUrl);
console.log('Key ID:', keyId);
console.log('Secret Key length:', secretKey ? secretKey.length : 0);

if (!keyId || !secretKey) {
  console.error('Missing credentials');
  process.exit(1);
}

const auth = Buffer.from(`${keyId}:${secretKey}`).toString('base64');
console.log('Basic Auth header:', auth);

// Test a simple endpoint - let's try to get accounts (should return empty array or similar)
const testUrl = `${baseUrl}/v1/accounts`;
console.log('Testing URL:', testUrl);

fetch(testUrl, {
  method: 'GET',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
  }
})
.then(response => {
  console.log('Response status:', response.status);
  console.log('Response headers:', Object.fromEntries(response.headers));
  return response.text();
})
.then(text => {
  console.log('Response body:', text);
})
.catch(err => {
  console.error('Error:', err.message);
});