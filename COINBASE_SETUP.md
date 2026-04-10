# Coinbase Sandbox Paper Trading Setup

## Goal
Enable agents to actually trade with user-allocated funds on Coinbase sandbox (paper money).

## Step 1: Create Coinbase Sandbox Account

1. Go to **https://public.sandbox.exchange.coinbase.com**
2. Create a new account (separate from production)
3. Verify your email
4. **Request test funds:**
   - Click "Deposit" (left sidebar)
   - Select "Fiat Wallet"
   - Request deposit (you'll get $10k test balance immediately)

## Step 2: Generate API Credentials

1. Click **Settings** → **API** (top right)
2. Click **"+ New API Key"**
3. Select permissions:
   - ✓ Trade
   - ✓ View orders
   - ✓ View fills
4. **Click "Create"** — save the popup information:
   - **Key** (access key)
   - **Secret** (signing secret, base64-encoded)
   - **Passphrase** (custom passphrase you set)

## Step 3: Configure .env.local

Add to `/Users/jaz/Documents/ASE-Startup/ase/.env.local`:

```
COINBASE_TRADE_KEY=your_key_here
COINBASE_TRADE_SECRET=your_secret_base64_here
COINBASE_TRADE_PASSPHRASE=your_passphrase_here
COINBASE_TRADE_SANDBOX=true
```

**Example** (replace with real values):
```
COINBASE_TRADE_KEY=a1b2c3d4-e5f6-7890-abcd-ef1234567890
COINBASE_TRADE_SECRET=m1N2O3P4Q5R6S7T8U9V0W1X2Y3Z4A5B6C7D8E9F0=
COINBASE_TRADE_PASSPHRASE=my_secure_passphrase_123
COINBASE_TRADE_SANDBOX=true
```

## Step 4: Restart the Dev Server

```bash
# Kill the dev server (Ctrl+C)
# Restart:
npm run dev
```

Check console for: `[coinbase-health] Connected to sandbox`

## Step 5: How Trading Works

### User Subscription Flow:
1. User browses agents, sees **backtest stats** (5Y performance)
2. User clicks **"Subscribe"** on an agent
3. System shows $100 paper credit allocation UI
4. User **confirms investment** (deducts from wallet)
5. Agent's `total_aum_cents` increases
6. Next cron run: agent **actually trades** on Coinbase sandbox with that capital

### Capital Calculation:
```
Agent Trading Capital = PLATFORM_SEED_CAPITAL ($10,000) + User AUM
```

If $5 users invest $100 each:
- User AUM = $500
- Agent Capital = $10,000 + $500 = $10,500
- Larger positions = larger returns (proportionally distributed)

### Live Execution:
Every minute (cron):
1. Agent fetches latest bars from Yahoo Finance
2. Calculates signals (EMA, RSI, MACD, etc.)
3. **Executes BUY/SELL on Coinbase sandbox**
4. Logs trade to `agent_trades` table
5. Updates NAV based on P&L

## Step 6: Monitor Trading

### Check Coinbase Sandbox:
1. Go to **https://public.sandbox.exchange.coinbase.com**
2. Click **"Portfolio"** → see BTC/ETH/SOL holdings
3. Click **"Orders"** → see all agent trades in real-time

### Check Database:
```sql
-- See all trades for an agent:
SELECT * FROM agent_trades 
WHERE agent_id = 'btc-momentum' 
ORDER BY filled_at DESC;

-- See current holdings:
SELECT * FROM holdings 
WHERE user_id = 'your_user_id' 
AND amount_cents > 0;
```

### Check Logs:
```bash
# Watch agent execution:
tail -f logs/production.log | grep "run-agents"
```

## Troubleshooting

### "Insufficient funds" error
- Sandbox account may have run out of test balance
- Go to Coinbase → "Deposit" → request more test funds

### "Invalid signature" error
- Check .env.local has correct KEY/SECRET/PASSPHRASE
- Secret must be base64-encoded
- Restart dev server after changes

### Agents not trading
- Check `/api/health` — should show Coinbase connected
- Verify agent has AUM (user invested capital)
- Check logs for strategy errors

### Deposits don't appear
- Sandbox deposits take a few seconds
- Refresh the page
- Check "Transaction History"

## Production (Real Trading)

Once testing is complete:

1. Create **production** Coinbase account
2. Fund with real USD (e.g., $1,000)
3. Generate production API keys
4. Set in .env.local:
   ```
   COINBASE_TRADE_KEY=prod_key
   COINBASE_TRADE_SECRET=prod_secret_base64
   COINBASE_TRADE_PASSPHRASE=prod_passphrase
   COINBASE_TRADE_SANDBOX=false
   ```
5. Deploy to production

⚠️ **WARNING**: Real trading uses real money. Start small and test thoroughly.

## What's Different Between Modes

| Feature | Sandbox (Paper) | Production (Real) |
|---------|-----------------|-------------------|
| URL | api-public.sandbox.exchange.coinbase.com | api.exchange.coinbase.com |
| Capital | Test funds | Real USD |
| Execution | Instant (test network) | Real blockchain |
| Risk | None | Real capital at risk |

---

**Questions?** Check `/app/api/cron/run-agents/route.ts` for the main trading loop.
