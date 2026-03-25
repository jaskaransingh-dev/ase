# Trading Diagnostics — Why Agents Aren't Trading

Follow this checklist to find the issue.

---

## 🔴 Issue: Cron Worker Not Running at All

### Check 1: Cloudflare Worker Logs

1. Go to **Cloudflare Dashboard**
2. **Workers & Pages** → Find your `ase` worker
3. Click **Logs** tab
4. Look for entries like:
   ```
   ⏰ Cron triggered: * * * * *
   ✅ Agents executed
   ```

**If NO logs appear:**
- Worker isn't being triggered
- Check deployment status: `wrangler deployments list`
- Verify cron schedule in `wrangler.toml`: `crons = ["* * * * *"]`
- Redeploy: `cd workers/trading-agents && wrangler deploy`

---

## 🟡 Issue: Cron Running But API Endpoints Failing

### Check 2: Manually Trigger API Endpoints

```bash
# Replace with your actual domain
DOMAIN=https://ase.pages.dev
SECRET=9f3c2b7a1e8d4c6f0a2b9e7d1c4f8a6b

# Test run-agents
curl -X POST $DOMAIN/api/cron/run-agents \
  -H "x-cron-secret: $SECRET" \
  -H "Content-Type: application/json"

# Should return JSON with results or error
```

**If you get 401 Unauthorized:**
- Secret mismatch between worker and Pages app
- Check both have same CRON_SECRET value
- In worker: `wrangler.toml` `CRON_SECRET = "..."`
- In Pages: `.env.local` `CRON_SECRET=...`

**If you get 500 error:**
- See Check 4 below (Alpaca/Supabase connectivity)

---

## 🔵 Issue: API Endpoints Work Locally, Fail on Cloudflare Pages

### Check 3: Environment Variables on Pages

Cloudflare Pages doesn't automatically read `.env.local`. You need to configure secrets:

1. **Go to Cloudflare Dashboard**
2. **Pages** → Your project → **Settings** → **Environment variables**
3. Add these secrets:
   ```
   ALPACA_KEY_ID = PKILN4ZAIIMEYCZ2DLUZNCXG5R
   ALPACA_SECRET_KEY = EPEnyGvBJtrkZ3vpiQARwrsjhCjvB14AcN1VFusTNwiQ
   SUPABASE_SERVICE_ROLE_KEY = (your key)
   CRON_SECRET = 9f3c2b7a1e8d4c6f0a2b9e7d1c4f8a6b
   ```

4. **Redeploy**: `wrangler pages deploy dist --project-name ase`

---

## 🟠 Issue: Alpaca Orders Not Being Submitted

### Check 4: Is Alpaca Reachable?

```bash
# Test Alpaca account endpoint
curl -s -X GET https://paper-api.alpaca.markets/v2/account \
  -H "APCA-API-KEY-ID: PKILN4ZAIIMEYCZ2DLUZNCXG5R" \
  -H "APCA-API-SECRET-KEY: EPEnyGvBJtrkZ3vpiQARwrsjhCjvB14AcN1VFusTNwiQ" \
  | jq .

# Should return: { "equity": "100000.00", "cash": "100000.00", ... }
```

**If error or timeout:**
- Alpaca API is unreachable from your deployment location
- Check credentials are correct
- Try from local machine to verify credentials work

### Check 5: Are Bar Data Calls Working?

```bash
# Test crypto bars (BTC/USD)
curl -s https://data.alpaca.markets/v1beta3/crypto/us/bars \
  '?symbols=BTC%2FUSD&timeframe=1Day&limit=5' \
  -H "APCA-API-KEY-ID: PKILN4ZAIIMEYCZ2DLUZNCXG5R" \
  -H "APCA-API-SECRET-KEY: EPEnyGvBJtrkZ3vpiQARwrsjhCjvB14AcN1VFusTNwiQ" \
  | jq .

# Should return bars data
```

**If empty or error:**
- Crypto data endpoint not accessible
- Check symbol format (BTC/USD, not BTCUSD)

---

## 🟢 Issue: Orders Submitted But Not Filling

### Check 6: Are Orders in Alpaca?

```bash
# Get all orders
curl -s https://paper-api.alpaca.markets/v2/orders \
  -H "APCA-API-KEY-ID: PKILN4ZAIIMEYCZ2DLUZNCXG5R" \
  -H "APCA-API-SECRET-KEY: EPEnyGvBJtrkZ3vpiQARwrsjhCjvB14AcN1VFusTNwiQ" \
  | jq '.[0:5]'  # Show first 5

# Check status - should see "filled" orders
```

**If no recent orders:**
- Orders aren't being submitted by agents

**If orders show "pending_new" or "new":**
- Orders aren't filling
- Check order qty and price are reasonable
- Verify trading hours (crypto is 24/7, but there may be liquidity issues)

---

## 💜 Issue: Supabase Not Recording Trades

### Check 7: Are Trades in the Database?

```bash
# Query Supabase agent_trades table
curl -s https://frlgckqtrloqunkhbhtp.supabase.co/rest/v1/agent_trades \
  -H "apikey: $(grep NEXT_PUBLIC_SUPABASE_ANON_KEY /sessions/amazing-zealous-goodall/mnt/ase/.env.local | cut -d= -f2)" \
  -H "Authorization: Bearer $(grep NEXT_PUBLIC_SUPABASE_ANON_KEY /sessions/amazing-zealous-goodall/mnt/ase/.env.local | cut -d= -f2)" \
  | jq '.[0:5]'
```

**If no trades:**
- Orders aren't being logged
- Check if orders are submitting (Check 6)

**If RLS error:**
- Row-Level Security blocking inserts
- Run migration: `supabase/migrations/003_trading_engine_fixes.sql`

---

## 📊 Step-by-Step Verification

### 1. Local Test (Fastest)

```bash
cd /sessions/amazing-zealous-goodall/mnt/ase
npm run dev
```

In another terminal:
```bash
# This should work locally
curl -X POST http://localhost:3000/api/cron/run-agents \
  -H "x-cron-secret: 9f3c2b7a1e8d4c6f0a2b9e7d1c4f8a6b"

# Watch terminal — you should see logs like:
# ✅ BUY BTC/USD $3000 @ 42500.00
# ✅ SELL SOL/USD 0.05 @ 140.25
```

If this works locally, problem is in **Pages deployment** (Check 3).

### 2. Check Cloudflare Pages Env Vars (If Not Working on Pages)

Even if `.env.local` exists, Pages doesn't read it. You must set secrets in Cloudflare Dashboard.

1. **Dashboard** → **Pages** → **your-project** → **Settings** → **Environment variables**
2. Add all secrets from your `.env.local`
3. **Redeploy**

### 3. Check Worker Cron Schedule

```bash
cd workers/trading-agents
wrangler deployments list
```

Look at the current deployment. Click the deployment and check **Triggers** section shows cron is configured.

If not, edit `wrangler.toml`:
```toml
[triggers]
crons = ["* * * * *"]
```

Then redeploy: `wrangler deploy`

### 4. Check Actual Logs

```bash
# Watch live logs from the worker
wrangler tail workers/trading-agents

# This shows real-time execution
```

---

## 🔧 Common Fixes

### Fix 1: Missing Environment Variables on Pages

```bash
# Add to Cloudflare Pages secrets:
wrangler secret put ALPACA_KEY_ID
wrangler secret put ALPACA_SECRET_KEY
wrangler secret put CRON_SECRET
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### Fix 2: Wrong Cron Schedule

File: `workers/trading-agents/wrangler.toml`
```toml
[triggers]
crons = ["* * * * *"]  # Every minute
```

### Fix 3: RLS Blocking Inserts

Run this in Supabase SQL Editor:
```sql
-- Allow service role to insert
ALTER TABLE agent_trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role writes" ON agent_trades;
CREATE POLICY "Service role writes" ON agent_trades FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE agent_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role writes" ON agent_stats;
CREATE POLICY "Service role writes" ON agent_stats FOR ALL USING (true) WITH CHECK (true);
```

### Fix 4: Alpaca Credentials Wrong

Test your credentials:
```bash
curl -s https://paper-api.alpaca.markets/v2/account \
  -H "APCA-API-KEY-ID: YOUR_KEY" \
  -H "APCA-API-SECRET-KEY: YOUR_SECRET"

# Should return account object with equity/cash
```

If error, credentials are wrong. Get fresh ones from [Alpaca Dashboard](https://app.alpaca.markets/paper/api-keys).

---

## ✅ Healthy System Looks Like:

1. **Cloudflare Worker Logs** show:
   ```
   ⏰ Cron triggered: * * * * *
   ✅ Agents executed: 3 trades
   ✅ NAV updated
   ```

2. **Supabase agent_trades** has rows like:
   ```
   agent_id | symbol | side | qty  | fill_price | filled_at
   --------|--------|------|------|-----------|----------
   uuid1   | BTC/USD| buy  | 0.05 | 42500.00  | 2026-03-24...
   uuid2   | ETH/USD| sell | 0.1  | 2200.00   | 2026-03-24...
   ```

3. **Supabase agent_stats** has snapshots showing NAV > 10000 (gains)

4. **Dashboard** shows live P&L and positions

---

## 🆘 Still Stuck?

1. Paste output of:
   ```bash
   curl https://YOUR_DOMAIN/api/debug-trading
   ```

2. Share error from:
   ```bash
   wrangler tail workers/trading-agents
   ```

3. Check Supabase **Logs** for insert errors:
   - **Dashboard** → **Logs** → search `agent_trades`

These will show exactly what's failing.
