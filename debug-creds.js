// Simple debug to check credentials
require('dotenv').config({ path: '.env.local' });

console.log('BROKER_API_KEY_ID:', process.env.BROKER_API_KEY_ID || 'NOT SET');
console.log('BROKER_API_SECRET_KEY:', process.env.BROKER_API_SECRET_KEY ? 'SET (length: ' + process.env.BROKER_API_SECRET_KEY.length + ')' : 'NOT SET');
console.log('ALPACA_KEY_ID:', process.env.ALPACA_KEY_ID || 'NOT SET');
console.log('ALPACA_SECRET_KEY:', process.env.ALPACA_SECRET_KEY ? 'SET (length: ' + process.env.ALPACA_SECRET_KEY.length + ')' : 'NOT SET');
console.log('BROKER_API_URL:', process.env.BROKER_API_URL || 'NOT SET');
console.log('ALPACA_BASE_URL:', process.env.ALPACA_BASE_URL || 'NOT SET');

// Check what createBrokerAPI would use
const keyId = process.env.BROKER_API_KEY_ID || process.env.ALPACA_KEY_ID;
const secretKey = process.env.BROKER_API_SECRET_KEY || process.env.ALPACA_SECRET_KEY;

console.log('\nSelected credentials:');
console.log('Key ID:', keyId || 'NONE');
console.log('Secret Key:', secretKey ? 'SET (length: ' + secretKey.length + ')' : 'NONE');

// Create basic auth header
if (keyId && secretKey) {
  const auth = Buffer.from(`${keyId}:${secretKey}`).toString('base64');
  console.log('Basic Auth header:', auth);
} else {
  console.log('Cannot create auth header - missing credentials');
}