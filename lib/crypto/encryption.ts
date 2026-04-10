import crypto from 'crypto'

/**
 * Encryption key for securing Coinbase API credentials
 * In production, this should come from an environment variable
 */
const ENCRYPTION_KEY = process.env.COINBASE_ENCRYPTION_KEY || 'default-unsafe-key-change-in-production'

/**
 * Ensure encryption key is exactly 32 bytes for AES-256
 */
function getEncryptionKey(): Buffer {
  const key = ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)
  return Buffer.from(key)
}

/**
 * Encrypt plaintext using AES-256-GCM
 * Returns: base64-encoded string containing iv:ciphertext:authTag
 */
export function encryptAES(plaintext: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])

  const authTag = cipher.getAuthTag()

  // Format: iv:ciphertext:authTag (all base64)
  const combined = Buffer.concat([iv, encrypted, authTag])
  return combined.toString('base64')
}

/**
 * Decrypt AES-256-GCM encrypted text
 * Expects: base64-encoded string containing iv:ciphertext:authTag
 */
export function decryptAES(encrypted: string): string {
  try {
    const combined = Buffer.from(encrypted, 'base64')

    // Extract parts: first 16 bytes = IV, last 16 bytes = auth tag, middle = ciphertext
    const iv = combined.slice(0, 16)
    const authTag = combined.slice(-16)
    const ciphertext = combined.slice(16, -16)

    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ])

    return decrypted.toString('utf8')
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
