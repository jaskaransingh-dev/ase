# Simplified Subscription & Trading Workflow

## Current Flow (BROKEN)
User → Browse Agents (show live stats?) → Subscribe → Invest → Agent trades (maybe?)

**Problems:**
1. Unclear distinction between subscription & investment
2. Agents not actually trading with allocated funds
3. Shows live trading stats instead of backtest stats
4. Multiple steps confuse users

## NEW SIMPLIFIED FLOW

### Step 1: Browse Agents (Landing + /agents page)
- Show **BACKTEST STATS** (5Y performance)
- Sharpe ratio, max drawdown, win rate
- Number of current subscribers
- Badge: "FREE BETA" or "LIVE"

### Step 2: View Agent Detail (/agents/[slug])
- **Left column**: Agent description, strategy details, backtest stats
- **Right column (sticky)**:
  - Agent name and symbol
  - Backtest return (+124% over 5Y)
  - Sharpe ratio
  - Max drawdown
  - Win rate
  - **Single Button: "Subscribe & Allocate"**

### Step 3: One-Step Subscribe + Invest Modal
When user clicks "Subscribe & Allocate":
1. Opens modal with slider: "Allocate credits ($0-$100)"
2. Shows recommended: "Allocate $25-$50 to start"
3. One checkbox: "I understand this is paper trading"
4. Click "Activate Agent"

**What happens:**
1. Creates subscription (user follows this agent)
2. Deducts credits from wallet
3. Marks holding as "active"
4. **Triggers immediate agent run** (starts trading immediately)

### Step 4: Track Performance (Dashboard)
- Show all subscribed agents
- Current value, P&L, Sharpe, return
- Links to individual agent pages for detailed trades

### Step 5: Deallocate / Add More
On agent detail page:
- If holding exists: show "Current allocation: $X" + "P&L: $Y"
- Button: "Add More Credits" (repeats Step 3 with min $10)
- Button: "Deallocate" (sell position, get credits back)

---

## Key Changes to Code

### 1. Agent Page - Show Backtest Stats Prominently

**Before:**
```
Right sidebar shows:
- Subscribe button
- (Maybe live stats if trading)
```

**After:**
```
Right sidebar shows:
- Agent name / symbol
- Backtest Return: +124% (5Y)
- Sharpe: 1.23
- Max Drawdown: -18%
- Win Rate: 58%
- "Subscribe & Allocate" button
```

### 2. API Endpoints

**`POST /api/subscribe` (NEW - combines subscribe + invest)**
```json
{
  "agent_id": "btc-momentum",
  "amount_cents": 5000
}
```
Returns:
```json
{
  "ok": true,
  "subscription_id": "sub_123",
  "holding_id": "hold_456",
  "shares": 0.5,
  "amount_allocated": "$50",
  "trading_capital": "$10500"  // $10k seed + $500 user AUM
}
```

### 3. Database Schema - What Changes

Already have:
- `subscriptions` table (user_id, agent_id, status)
- `holdings` table (user_id, agent_id, shares, invested_cents)
- `wallets` table (user_id, balance_cents)

No changes needed! Just use existing schema correctly.

### 4. When Agent Trades

**Cron job runs every minute:**
1. Fetches all active agents
2. For each agent, gets `total_aum_cents` (sum of all user investments)
3. Calculates `trading_capital = PLATFORM_SEED + total_aum_cents`
4. Agent executes BUY/SELL on Coinbase sandbox with that capital
5. Logs trades to `agent_trades` table
6. Computes NAV based on P&L

**Example:**
- Agent has $5 subscribers, each invested $50 = $250 AUM
- Trading capital = $10,000 + $250 = $10,250
- Agent buys $4,608 of BTC (45% position size)
- If BTC goes +2%, position P&L = +$92
- NAV per share updates based on P&L

---

## What Needs to Happen

### Immediate (Next session):
1. Ensure Coinbase sandbox credentials configured (.env.local)
2. Verify healthCheckCoinbase() passes
3. Create `/api/subscribe` endpoint (combines subscribe + invest)
4. Update agent detail page right sidebar (show backtest stats, one button)
5. Simplify InvestModal → make it part of subscribe flow

### Testing:
1. Create test account
2. Subscribe + allocate $25 to BTC Momentum agent
3. Watch logs: `[run-agents] btc-momentum: capital $10,250...`
4. Check Coinbase sandbox: should see live BTC position
5. Wait for next cron tick: check `agent_trades` table for fills

### Validation:
```sql
-- Check user subscription
SELECT * FROM subscriptions WHERE user_id = 'test_user';

-- Check user holding
SELECT * FROM holdings WHERE user_id = 'test_user';

-- Check agent trading capital
SELECT total_aum_cents FROM agents WHERE slug = 'btc-momentum';

-- Check trades
SELECT symbol, side, qty, fill_price, filled_at FROM agent_trades 
WHERE agent_id = 'btc-momentum' 
ORDER BY filled_at DESC LIMIT 5;
```

---

## Summary

**Before**: Confusing multi-step process, agents not actually trading
**After**: One-click "Subscribe & Allocate", agents actively trade on Coinbase sandbox

Key insight: **Subscription + Investment are the same action for users**. One click, one modal, agent starts trading immediately.
