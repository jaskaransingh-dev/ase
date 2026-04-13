// Test Alpaca paper trading keys with trading API
require('dotenv').config({ path: '.env.local.backup' });
const fetch = require('node-fetch');

const keyId = process.env.ALPACA_KEY_ID;
const secretKey = process.env.ALPACA_SECRET_KEY;
const baseUrl = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

console.log('Testing Alpaca paper trading keys with trading API...');
console.log('Base URL:', baseUrl);
console.log('Key ID:', keyId);
console.log('Secret Key length:', secretKey ? secretKey.length : 0);

if (!keyId || !secretKey) {
  console.error('Missing credentials');
  process.exit(1);
}

// Trading API uses different headers
const headers = {
  'APCA-API-KEY-ID': keyId,
  'APCA-API-SECRET-KEY': secretKey,
  'Content-Type': 'application/json',
};

console.log('Headers:', headers);

// Test account endpoint
const testUrl = `${baseUrl}/v2/account`;
console.log('Testing URL:', testUrl);

fetch(testUrl, {
  method: 'GET',
  headers: headers
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