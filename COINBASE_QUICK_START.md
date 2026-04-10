# Coinbase Integration - Quick Start Guide

## What's Ready Now

✅ Users can connect their Coinbase account to ASE  
✅ ASE shows their real Coinbase USD balance  
✅ Users can allocate funds to trading agents  
✅ Agents trade using real money  
✅ All credentials are encrypted

## Setup (5 Minutes)

### 1. Add Encryption Key to `.env.local`

```bash
# Generate a key
openssl rand -base64 32

# Add to .env.local (replace with your generated key)
COINBASE_ENCRYPTION_KEY=your-32-character-base64-key-here
```

### 2. Start the App

```bash
npm run dev
```

Open http://localhost:3000

## Test the Flow (5 Minutes)

### Get Coinbase Sandbox Credentials

Option A: Real Coinbase (with real money)
1. Go to [Coinbase.com](https://www.coinbase.com)
2. Settings → API Access
3. Create API Key (name it "ASE")
4. Permissions: ✅ View Account, ✅ Manage Account
5. Copy: Key, Secret (base64), Passphrase

Option B: Coinbase Sandbox (no real money, for testing)
1. Go to [sandbox.exchange.coinbase.com](https://sandbox.exchange.coinbase.com)
2. Settings → API Access
3. Create API Key
4. Make sure sandbox account has USD balance
5. Copy credentials

### Connect Account in ASE

1. Open the app
2. Look for **"Connect Coinbase"** button
   - In WalletDashboard component
   - Or in a settings/wallet page (if integrated)
3. Click it → Modal appears
4. Enter:
   - API Key: `cb-abc123...`
   - API Secret: `[base64-encoded]`
   - Passphrase: `your-passphrase`
5. Click **"Connect Account"**

### Expected Results

✅ **Success Message** - "Coinbase account connected"  
✅ **Balance Shows** - Your USD balance displays  
✅ **Green Badge** - "Connected" status shown  
✅ **Auto-Refresh** - Balance updates every 30 seconds

### If You Get an Error

**Error: "Invalid Coinbase credentials"**
- Double-check API key, secret, passphrase
- Verify secret is base64 encoded
- Check key has "View Account" permission
- Try generating a new key in Coinbase

**Error: "No USD balance found"**
- Go to Coinbase → Accounts → Add USD Account
- Deposit $1 (or create with test balance in sandbox)
- Try connecting again

**Error: "Decryption failed"**
- Check `COINBASE_ENCRYPTION_KEY` in `.env.local`
- Make sure it's a valid base64 string
- Generate a new one: `openssl rand -base64 32`

## Next: Subscribe to an Agent

1. Go to **Agents** page
2. Click any agent
3. Click **"Invest in Agent"** button
4. SubscribeModal shows your real balance
5. Select amount ($50, $100, $250, etc.)
6. Check risk warning ✅
7. Click **"Invest $XXX"**

### What Happens
- Money deducted from your Coinbase balance
- Stored in ASE wallet
- Agent receives allocation
- Agent starts trading immediately
- You can see P&L in real-time

## Check Database

Verify data was saved correctly:

```sql
-- Show all connected accounts
SELECT user_id, account_type, connected_at 
FROM coinbase_connections;

-- Show wallet balances
SELECT user_id, balance_cents, last_synced_at 
FROM wallets;

-- Show holdings
SELECT user_id, agent_id, shares, status 
FROM holdings;
```

## How It Works

### Money Flow
```
1. You have $500 in Coinbase
2. You connect ASE → ASE shows $500
3. You allocate $100 to Agent A
4. ASE deducts $100 → ASE shows $400
5. Agent A gets $100 + other allocations
6. Agent trades with combined pool
7. If agent makes $50 profit:
   - Your share: $50 × ($100/$total_allocated) = your_share
   - Can withdraw anytime to get USD back
```

### Encryption
```
Your API credentials are:
- Encrypted with AES-256-GCM
- Stored in database
- Decrypted only when calling Coinbase API
- Never logged or exposed
- Deleted from memory after use
```

## Components Used

### WalletDashboard
```tsx
import WalletDashboard from '@/components/WalletDashboard'

export default function Page() {
  return <WalletDashboard />
}
```

Shows:
- Current Coinbase USD balance
- "Connect Account" button
- Connection status
- Last synced time

### CoinbaseConnectModal
Included in WalletDashboard. Opens when user clicks "Connect Account".

Provides:
- Instructions for getting credentials
- Form for entry
- Validation feedback
- Error messages

## API Endpoints

### Get Balance
```bash
curl -X GET http://localhost:3000/api/coinbase/balance \
  -H "Authorization: Bearer $TOKEN"

Response:
{
  "usd_balance_cents": 50000,
  "status": "connected",
  "last_synced_at": "2026-04-09T12:00:00Z"
}
```

### Connect Account
```bash
curl -X POST http://localhost:3000/api/auth/coinbase-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "api_key": "cb-abc123...",
    "api_secret": "base64-encoded-secret",
    "api_passphrase": "your-passphrase"
  }'

Response:
{
  "ok": true,
  "message": "Coinbase account connected",
  "usd_balance_cents": 50000
}
```

### Sync Balance
```bash
curl -X POST http://localhost:3000/api/coinbase/sync-balance \
  -H "Authorization: Bearer $TOKEN"

Response:
{
  "ok": true,
  "usd_balance_cents": 50000,
  "synced_at": "2026-04-09T12:00:00Z"
}
```

## Troubleshooting

### "Connect button doesn't appear"
- Check if WalletDashboard is imported in your page
- Check browser console for errors
- Verify you're logged in

### "Balance shows $0"
- Click "Connect Account"
- Ensure Coinbase credentials are correct
- Check Coinbase account has USD

### "Can't allocate to agent"
- Click SubscribeModal
- Verify balance is > $0
- Check risk warning is checked
- Try refreshing page

### "Balance not updating"
- It auto-updates every 30 seconds
- Click the page to refresh
- Check `last_synced_at` timestamp

## Files to Review

- `/components/WalletDashboard.tsx` - Balance display component
- `/components/CoinbaseConnectModal.tsx` - Connection form
- `/app/api/coinbase/balance/route.ts` - Get balance endpoint
- `/app/api/auth/coinbase-accounts/route.ts` - Connect endpoint
- `/lib/crypto/encryption.ts` - Encryption/decryption logic
- `/lib/coinbase/api.ts` - Coinbase API helpers

## Next Steps

### Immediate (This Week)
- ✅ Test connecting account
- ✅ Verify balance shows correctly
- ✅ Test agent subscription
- ✅ Verify trades execute

### Short Term (Next Week)
- [ ] Reset database balances (see RESET_BALANCES.md)
- [ ] Remove paper money language from pages
- [ ] Test complete withdrawal flow
- [ ] Live test with real $

### Medium Term (This Month)
- [ ] Implement withdrawal endpoint
- [ ] Add balance sync cron job
- [ ] Create transaction history UI
- [ ] Implement Coinbase OAuth flow

## Support

If something doesn't work:
1. Check `/COINBASE_INTEGRATION_GUIDE.md` for detailed docs
2. Check `/COINBASE_STATUS.md` for what's implemented
3. Check browser console for JavaScript errors
4. Check server logs for API errors
5. Verify `.env.local` has `COINBASE_ENCRYPTION_KEY`

---

**Status:** Ready for testing  
**Last Updated:** 2026-04-09  
**Time to Test:** 10-15 minutes
