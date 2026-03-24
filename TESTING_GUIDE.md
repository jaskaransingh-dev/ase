# ASE Trading System — Testing Guide

## Quick Start: Verify Agents Are Trading

### Method 1: Test the Cron Endpoint Directly

**Option A: Using curl**
```bash
curl -X POST http://localhost:3000/api/cron/run-agents \
  -H "x-cron-secret: your-cron-secret-here" \
  -H "Content-Type: application/json"
```

**Option B: Using your browser (GET also works)**
```
http://localhost:3000/api/cron/run-agents?x-cron-secret=your-cron-secret-here
```

**What to expect:**
- Status 200 with JSON response
- Shows execution results for each agent
- Lists any trades that were placed

---

## Full Testing Workflow

### Step 1: Set Environment Variables

Create/update `.env.local`:
```env
# Existing
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
ALPACA_KEY_ID=your-alpaca-key
ALPACA_SECRET_KEY=your-alpaca-secret
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Add this for testing
CRON_SECRET=test-secret-123
```

### Step 2: Trigger a Trade Execution

**Terminal 1: Start the dev server**
```bash
npm run dev
```

**Terminal 2: Trigger the cron job**
```bash
curl -X POST http://localhost:3000/api/cron/run-agents \
  -H "x-cron-secret: test-secret-123" \
  -H "Content-Type: application/json"
```

### Step 3: Check the Response

You'll get JSON like:
```json
{
  "ok": true,
  "results": {
    "btc-momentum": {
      "results": [
        {
          "action": "BUY",
          "symbol": "BTC/USD",
          "qty": 0.235,
          "ema20": 42500,
          "ema50": 41000,
          "order": {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "status": "filled",
            "filled_qty": "0.235",
            "filled_avg_price": "42520"
          }
        }
      ]
    },
    "eth-mean-revert": { "results": [...] },
    // ... other agents
  },
  "ran_at": "2024-03-24T14:30:00Z",
  "agents_run": 5
}
```

**Key fields to look for:**
- `"action": "BUY"` or `"action": "SELL"` — Order was placed
- `"order": {...}` — Alpaca filled the order
- `"filled_qty"` > 0 — Position was opened
- `"status": "filled"` — Order was fulfilled

---

## Step 4: Verify Trades in Database

Open your Supabase dashboard and check:

**1. agent_trades table**
```sql
SELECT * FROM agent_trades
ORDER BY filled_at DESC
LIMIT 10;
```

You should see:
- agent_id (matches agent UUID)
- symbol (BTC/USD, ETH/USD, etc.)
- side ('buy' or 'sell')
- qty (quantity filled)
- fill_price (price per unit)
- filled_at (timestamp)
- alpaca_order_id (unique order ID)

**2. agent_stats table**
```sql
SELECT * FROM agent_stats
ORDER BY snapshot_at DESC
LIMIT 5;
```

You should see:
- nav_cents (token value changing as trades P&L)
- total_return_pct (should change as positions gain/lose)
- total_trades (count incrementing)
- snapshot_at (recent timestamps)

**3. Check agent positions**
```sql
SELECT * FROM holdings
WHERE status = 'active';
```

You should see:
- shares held by users (or 0 if no investors yet)
- invested_cents (total capital)
- current_value_cents (updated value)

---

## Step 5: Update NAV & Metrics

The nav update is a separate cron job. Test it:

```bash
curl -X POST http://localhost:3000/api/cron/update-nav \
  -H "x-cron-secret: test-secret-123"
```

**Expected response:**
```json
{
  "ok": true,
  "results": {
    "btc-momentum": {
      "nav_cents": 10047,
      "total_return_pct": 0.47,
      "portfolio_value": 10047,
      "max_drawdown_pct": 0,
      "win_rate_pct": 100,
      "totalTrades": 1
    }
    // ... other agents
  },
  "updated_at": "2024-03-24T14:31:00Z"
}
```

**What this means:**
- NAV increased from 10000 to 10047 (trade was profitable!)
- total_return_pct: +0.47% gains
- win_rate_pct: 100% (1 trade, 1 win)

---

## Step 6: View on Dashboard

Now login and check the dashboard:

**Portfolio Overview:**
- NAV should show updated value
- Recent trades feed should show buy/sell orders
- Total return should reflect P&L

**Agent Deep Dive:**
- Click on agent to see:
  - Performance chart (NAV over time)
  - Metrics (Sharpe, max drawdown, win rate)
  - Trade history table
  - Live trade feed

---

## Advanced Testing: Simulate Multiple Trades

### Test Scenario: Day Trade Cycle

**1. Run strategy (opens BTC position)**
```bash
curl -X POST http://localhost:3000/api/cron/run-agents \
  -H "x-cron-secret: test-secret-123"
# Response shows BUY BTC/USD
```

**2. Wait or manually check position**
```bash
# In Supabase, run:
SELECT symbol, qty FROM agent_positions WHERE agent_id = 'btc-momentum';
# Result: BTC/USD | 0.235
```

**3. Force a reversal by checking conditions**
Edit lib/agents.ts temporarily to force a bearish signal:
```typescript
// Force BTC Momentum to sell by inverting the condition
const bullish = false; // ema20 > ema50  <-- comment this out
```

**4. Run again (should close position)**
```bash
curl -X POST http://localhost:3000/api/cron/run-agents \
  -H "x-cron-secret: test-secret-123"
# Response shows CLOSE or SELL
```

**5. Check P&L calculation**
```sql
SELECT side, qty, fill_price, pnl_cents FROM agent_trades
WHERE agent_id = 'btc-momentum'
ORDER BY filled_at DESC LIMIT 2;

-- Result:
-- side | qty   | fill_price | pnl_cents
-- buy  | 0.235 | 42520      | NULL (open)
-- sell | 0.235 | 42600      | 1880 (profit! $18.80)
```

---

## Monitoring: Watch Real-Time Trading

### Create a Monitoring Script

**monitor.sh**
```bash
#!/bin/bash

CRON_SECRET="test-secret-123"
BASE_URL="http://localhost:3000"

echo "🚀 Starting ASE Trading Monitor..."

while true; do
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⏰ $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Run trading execution
  echo "📊 Running strategies..."
  TRADE_RESULT=$(curl -s -X POST "$BASE_URL/api/cron/run-agents" \
    -H "x-cron-secret: $CRON_SECRET" \
    -H "Content-Type: application/json")

  echo "$TRADE_RESULT" | jq '.'

  # Run metrics update
  echo ""
  echo "📈 Updating NAV..."
  NAV_RESULT=$(curl -s -X POST "$BASE_URL/api/cron/update-nav" \
    -H "x-cron-secret: $CRON_SECRET")

  echo "$NAV_RESULT" | jq '.results'

  # Wait before next cycle
  echo ""
  echo "⏳ Waiting 60 seconds for next execution..."
  sleep 60
done
```

**Usage:**
```bash
chmod +x monitor.sh
./monitor.sh
```

This will:
- Run every 60 seconds (mimic real cron)
- Show trades executed
- Display updated metrics
- Display all agent performance

---

## Troubleshooting: Why Aren't Agents Trading?

### 1. No Trades at All

**Check these in order:**

```bash
# A. Verify cron secret is correct
echo $CRON_SECRET

# B. Check Alpaca credentials are valid
curl -s https://paper-api.alpaca.markets/v2/account \
  -H "APCA-API-KEY-ID: $ALPACA_KEY_ID" \
  -H "APCA-API-SECRET-KEY: $ALPACA_SECRET_KEY" | jq .

# C. Check that agents exist in DB
# In Supabase:
SELECT slug, status, total_aum_cents FROM agents;
# Should see 5 agents with status = 'active'
```

### 2. Strategies Not Generating Signals

**Check market data:**
```bash
# Test if we can fetch bars from Alpaca
curl -s "https://data.alpaca.markets/v2/stocks/BTC%2FUSD/bars?timeframe=1Day&limit=5" \
  -H "APCA-API-KEY-ID: $ALPACA_KEY_ID" \
  -H "APCA-API-SECRET-KEY: $ALPACA_SECRET_KEY" | jq .
```

If no data:
- Alpaca data access may be limited (requires subscription)
- Use `/v2/cryptocurrencies/` endpoint instead for crypto data

### 3. Orders Submitted But Not Filled

**Check order status:**
```bash
curl -s https://paper-api.alpaca.markets/v2/orders \
  -H "APCA-API-KEY-ID: $ALPACA_KEY_ID" \
  -H "APCA-API-SECRET-KEY: $ALPACA_SECRET_KEY" | jq '.[] | {id, status, symbol, filled_qty}'
```

If status = "pending":
- Market may be closed (crypto trades 24/7, so this shouldn't happen)
- Check order type (should be market orders)
- Check time_in_force (should be 'day')

### 4. Trades Logged But P&L = NULL

**Check matching:**
```sql
-- Find trades with no P&L
SELECT * FROM agent_trades WHERE pnl_cents IS NULL;

-- P&L should be null for buy orders (expected)
-- P&L should have value for sell orders (bug if NULL)

-- Count sells without P&L
SELECT COUNT(*) FROM agent_trades
WHERE side = 'sell' AND pnl_cents IS NULL;
-- Should be 0
```

---

## Production Monitoring Checklist

### Hourly
- [ ] Check agent_trades for new fills
- [ ] Verify nav_cents are updating in agent_stats
- [ ] Check win_rate_pct is reasonable (>30% is good)

### Daily
- [ ] Review all 5 agents' total_return_pct
- [ ] Check for any errors in API logs
- [ ] Verify no agents hit drawdown alerts (>40%)

### Weekly
- [ ] Review Sharpe ratios
- [ ] Check for strategy drift (Sharpe declining)
- [ ] Analyze trade distribution (too many/few trades?)

### Monthly
- [ ] Review historical NAV performance
- [ ] Analyze correlation between agents
- [ ] Rebalance capital allocations if needed

---

## Expected Results

### After 1 Day of Trading
- Each agent should have 10-30 trades
- Total return range: -5% to +15% (paper trading variance)
- Win rate: 40-60% range is normal

### After 1 Week
- Total return should stabilize
- Sharpe ratio should be > 0.5
- Clear patterns in agent performance
- Dashboard shows smooth equity curve

### After 1 Month
- Enough data for meaningful statistics
- Max drawdown established
- Can compare agents by performance
- Portfolio metrics are reliable

---

## Quick Reference: All Test Commands

```bash
# Test environment setup
export CRON_SECRET="test-secret-123"
export BASE_URL="http://localhost:3000"

# Test agent execution
curl -X POST $BASE_URL/api/cron/run-agents \
  -H "x-cron-secret: $CRON_SECRET"

# Test NAV update
curl -X POST $BASE_URL/api/cron/update-nav \
  -H "x-cron-secret: $CRON_SECRET"

# Test order matching
curl -X POST $BASE_URL/api/cron/match-orders \
  -H "x-cron-secret: $CRON_SECRET"

# View Alpaca account
curl https://paper-api.alpaca.markets/v2/account \
  -H "APCA-API-KEY-ID: $ALPACA_KEY_ID" \
  -H "APCA-API-SECRET-KEY: $ALPACA_SECRET_KEY"

# View all orders
curl https://paper-api.alpaca.markets/v2/orders \
  -H "APCA-API-KEY-ID: $ALPACA_KEY_ID" \
  -H "APCA-API-SECRET-KEY: $ALPACA_SECRET_KEY"
```

---

## Next: Dashboard Verification

Once trades are flowing:

1. **Login to platform**
   - Go to http://localhost:3000/signup
   - Create test account

2. **Check Portfolio Overview**
   - NAV should show base $100 per agent
   - Recent trades visible in feed
   - Total return metrics updating

3. **View Agent Deep Dive**
   - Click any agent
   - Performance chart should show equity curve
   - Trade history table populated
   - Metrics (Sharpe, drawdown, win rate) calculated

4. **Monitor Live**
   - Leave dashboard open
   - Run `./monitor.sh` in terminal
   - Watch metrics update every 60 seconds

---

**You're done! Agents are now trading autonomously. 🚀**
