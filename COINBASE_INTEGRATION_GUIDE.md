# Coinbase Real Money Integration Guide

This guide walks through connecting users' Coinbase accounts to ASE for real money trading.

## Architecture Overview

### Money Flow
```
User's Coinbase Account
        ↓
   [Connect via API credentials]
        ↓
ASE Wallet (wallet.balance_cents)
        ↓
   [User allocates to agent]
        ↓
Agent Trading Pool
        ↓
   [Agent executes trades]
        ↓
P&L (user's share based on allocation)
        ↓
   [User can withdraw]
        ↓
Back to Coinbase Account
```

## Setup Steps

### Step 1: Environment Variables

Add to `.env.local`:

```bash
# Encryption key for storing Coinbase credentials (generate with: openssl rand -base64 32)
COINBASE_ENCRYPTION_KEY=your-32-char-base64-key

# Optional: Coinbase API credentials for platform trades (if needed)
COINBASE_TRADE_KEY=your_coinbase_api_key
COINBASE_TRADE_SECRET=your_secret_base64_encoded
COINBASE_TRADE_PASSPHRASE=your_passphrase
COINBASE_TRADE_SANDBOX=false  # Set to true for sandbox
```

Generate a secure encryption key:
```bash
openssl rand -base64 32
```

### Step 2: Database Setup

Ensure these tables exist:

```sql
-- User's Coinbase API credentials (encrypted)
CREATE TABLE IF NOT EXISTS coinbase_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  account_type text NOT NULL,
  encrypted_key text NOT NULL,
  encrypted_secret text NOT NULL,
  encrypted_passphrase text NOT NULL,
  connected_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(user_id)
);

-- User's wallet balance (synced from Coinbase)
CREATE TABLE IF NOT EXISTS wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  balance_cents bigint NOT NULL DEFAULT 0,
  last_synced_at timestamp DEFAULT now(),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(user_id)
);
```

### Step 3: API Endpoints

#### Connect Coinbase Account
```
POST /api/auth/coinbase-accounts
Body: {
  "api_key": "string",
  "api_secret": "string (base64)",
  "api_passphrase": "string"
}

Response: {
  "ok": true,
  "message": "Coinbase account connected",
  "usd_balance_cents": 50000
}
```

**What happens:**
1. Validates credentials by making test API call
2. Returns error if invalid
3. Encrypts credentials with AES-256-GCM
4. Stores in `coinbase_connections` table
5. Syncs balance from Coinbase
6. Returns synced balance

#### Get Wallet Balance
```
GET /api/coinbase/balance

Response: {
  "usd_balance_cents": 50000,
  "status": "connected",
  "last_synced_at": "2026-04-09T12:00:00Z"
}
```

**Status values:**
- `"connected"`: Account connected, balance cached
- `"not_connected"`: No Coinbase account linked
- `"cached"`: Using last synced balance

#### Manual Balance Sync
```
POST /api/coinbase/sync-balance

Response: {
  "ok": true,
  "usd_balance_cents": 50000,
  "synced_at": "2026-04-09T12:00:00Z"
}
```

**Note:** This endpoint is called automatically when connecting an account. Use for manual refresh if needed.

### Step 4: Frontend Integration

#### Display Wallet Dashboard
```tsx
import WalletDashboard from '@/components/WalletDashboard'

export default function Page() {
  return (
    <div>
      <WalletDashboard />
      {/* Other content */}
    </div>
  )
}
```

The `WalletDashboard` component:
- Shows user's current Coinbase USD balance
- Provides button to connect account
- Opens `CoinbaseConnectModal` for authentication
- Auto-refreshes balance every 30 seconds

#### Connect Modal
The `CoinbaseConnectModal` component handles:
- Instructions for getting API credentials from Coinbase
- Form to enter key, secret, passphrase
- Validation via our API
- Error messages if credentials invalid
- Success callback to refresh balance

### Step 5: How Users Get Credentials

Users need to:
1. Go to [Coinbase.com](https://www.coinbase.com)
2. Click Settings → API Access
3. Click "Create API Key"
4. Select permissions:
   - ✅ View Account
   - ✅ Manage Account (for transfers)
5. Copy the:
   - API Key (starts with `cb-`)
   - Secret (base64 encoded)
   - Passphrase (created during setup)
6. Paste into ASE connection form

**Important:** 
- Users should create a separate API key for ASE, not use existing keys
- Recommend limiting API key to specific IP addresses in Coinbase settings
- Keys should have minimal necessary permissions

### Step 6: Security Best Practices

1. **Credential Encryption**
   - Credentials encrypted with AES-256-GCM before storage
   - Uses random IV for each encryption
   - Authentication tag prevents tampering

2. **Environment Variables**
   - `COINBASE_ENCRYPTION_KEY` should be very long and random
   - Should be different per environment (dev/prod)
   - Never commit to git

3. **API Rate Limiting**
   - Coinbase API has rate limits
   - Balance syncs cache in database
   - Don't sync more than once per minute per user

4. **Permission Scoping**
   - Users should create restricted API keys in Coinbase
   - Recommend "View Account" only for balance
   - "Manage Account" only if withdrawals implemented

## Implementation Files

| File | Purpose |
|------|---------|
| `/lib/crypto/encryption.ts` | AES-256-GCM encryption/decryption |
| `/lib/coinbase/api.ts` | Coinbase API helpers (balance fetch, validation) |
| `/app/api/auth/coinbase-accounts/route.ts` | Connect account endpoint |
| `/app/api/coinbase/balance/route.ts` | Get cached balance endpoint |
| `/app/api/coinbase/sync-balance/route.ts` | Sync balance from Coinbase endpoint |
| `/components/CoinbaseConnectModal.tsx` | Modal for entering credentials |
| `/components/WalletDashboard.tsx` | Display balance and connect button |

## Testing

### Test Connection Flow
```bash
# 1. Get real Coinbase API credentials
# 2. Open ASE in browser
# 3. Click "Connect Account"
# 4. Enter credentials
# 5. Should see success message and balance
# 6. Balance should update every 30 seconds
```

### Test with Coinbase Sandbox (Optional)
To test without real money:
1. Get sandbox credentials from [Coinbase Sandbox](https://sandbox.exchange.coinbase.com)
2. Create test USD account with fake balance
3. Test connection flow
4. Note: Live trading won't work in sandbox

## Troubleshooting

### "Invalid credentials" error
- Double-check API key, secret, passphrase
- Ensure secret is base64 encoded
- Verify API key has "View Account" permission
- Check Coinbase hasn't revoked the key

### Balance not syncing
- Ensure Coinbase connection exists
- Check COINBASE_ENCRYPTION_KEY is set
- Verify credentials weren't corrupted
- Check Coinbase API isn't rate-limited

### "No USD balance found" error
- Ensure Coinbase account has USD account
- Some accounts only have BTC, need to add USD
- Verify API key permissions include account view

## Next Steps

After users connect accounts:
1. SubscribeModal automatically shows real Coinbase balance
2. Users can allocate to agents
3. Agents trade using pool of all allocations
4. Users can withdraw anytime (implementation pending)

## Future Enhancements

1. **OAuth Flow** - Instead of manual credentials
   ```
   User clicks "Connect with Coinbase"
   → Redirect to Coinbase OAuth
   → Get authorization code
   → Exchange for credentials
   → Store encrypted
   ```

2. **Automated Balance Syncing** - Cron job
   ```
   Every hour:
   - Check connected accounts
   - Call Coinbase API
   - Update database
   - Alert user if balance changed significantly
   ```

3. **Withdrawal Flow** - Send money back to Coinbase
   ```
   User clicks "Withdraw"
   → Show current value
   → User confirms
   → Transfer USD back to their Coinbase account
   → Update wallet balance
   ```

4. **Transaction History** - Track all movements
   ```
   - Deposits (from Coinbase)
   - Allocations (to agents)
   - P&L updates (from trades)
   - Withdrawals (back to Coinbase)
   ```

---

**Status:** ✅ Ready to test  
**Last Updated:** 2026-04-09
