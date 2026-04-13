import { createBrokerAPI } from './lib/broker'

// Create broker API instance
const broker = createBrokerAPI()

console.log('Broker API URL:', (broker as any).constructor['BROKER_BASE_URL'] || 'Not accessible')
console.log('Key ID length:', broker['keyId'].length)
console.log('Secret Key length:', broker['secretKey'].length)
console.log('Key ID:', broker['keyId'])
console.log('Secret Key:', broker['secretKey'])