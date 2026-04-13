// Test broker API account creation with Alpaca paper trading keys
require('dotenv').config({ path: '.env.local.backup' });
const fetch = require('node-fetch');

const keyId = process.env.ALPACA_KEY_ID;
const secretKey = process.env.ALPACA_SECRET_KEY;
const baseUrl = 'https://broker-api.sandbox.alpaca.markets'; // Explicitly use broker sandbox

console.log('Testing Broker API account creation with Alpaca paper trading keys...');
console.log('Broker Base URL:', baseUrl);
console.log('Key ID:', keyId);
console.log('Secret Key length:', secretKey ? secretKey.length : 0);

if (!keyId || !secretKey) {
  console.error('Missing credentials');
  process.exit(1);
}

// Create basic auth header for broker API
const auth = Buffer.from(`${keyId}:${secretKey}`).toString('base64');
console.log('Basic Auth header (first 20 chars):', auth.substring(0, 20) + '...');

// Test account creation endpoint
const testUrl = `${baseUrl}/v1/accounts`;
console.log('Testing URL:', testUrl);

// Minimal valid account creation payload
const payload = {
  account_type: 'trading',
  contact: {
    email_address: 'test@example.com',
    phone_number: '',
    street_address: ['123 Test St'],
    city: 'San Francisco',
    state: 'CA',
    postal_code: '94105'
  },
  identity: {
    given_name: 'Test',
    family_name: 'User',
    date_of_birth: '1990-01-01',
    tax_id: '1234',
    tax_id_type: 'USA_SSN',
    country_of_citizenship: 'USA',
    country_of_birth: 'USA',
    country_of_tax_residence: 'USA',
    funding_source: ['employment_income']
  },
  disclosures: {
    is_control_person: false,
    is_affiliated_exchange_or_finra: false,
    is_politically_exposed: false,
    immediate_family_exposed: false
  },
  agreements: [{
    agreement: 'customer_agreement',
    signed_at: new Date().toISOString(),
    ip_address: '127.0.0.1'
  }]
};

console.log('Payload:', JSON.stringify(payload, null, 2));

fetch(testUrl, {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload)
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