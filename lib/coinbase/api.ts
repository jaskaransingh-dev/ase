import crypto from 'crypto'

/**
 * Coinbase API credentials
 */
interface CoinbaseCredentials {
  key: string
  secret: string
  passphrase: string
}

/**
 * Fetch USD balance from Coinbase API
 * Returns balance in cents (multiply dollars by 100)
 */
export async function fetchCoinbaseUSDBalance(credentials: CoinbaseCredentials): Promise<number> {
  const baseUrl = 'https://api.exchange.coinbase.com'
  const path = '/accounts'
  const timestamp = Math.floor(Date.now() / 1000).toString()

  // Build HMAC signature
  const message = `${timestamp}GET${path}`
  const secretBuf = Buffer.from(credentials.secret, 'base64')
  const signature = crypto
    .createHmac('sha256', secretBuf)
    .update(message)
    .digest('base64')

  // Call Coinbase API
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      'CB-ACCESS-KEY': credentials.key,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp,
      'CB-ACCESS-PASSPHRASE': credentials.passphrase,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Coinbase API error: ${error.message || response.statusText}`)
  }

  const accounts = await response.json()

  // Find USD or USDC account
  const usdAccount = accounts.find(
    (acc: any) => acc.currency === 'USD' || acc.currency === 'USDC'
  )

  if (!usdAccount) {
    throw new Error('No USD balance found in Coinbase account')
  }

  // Return balance in cents
  return Math.round(parseFloat(usdAccount.balance) * 100)
}

/**
 * Validate Coinbase credentials by making a test API call
 */
export async function validateCoinbaseCredentials(credentials: CoinbaseCredentials): Promise<boolean> {
  try {
    await fetchCoinbaseUSDBalance(credentials)
    return true
  } catch (error) {
    console.error('Coinbase credential validation failed:', error)
    return false
  }
}
