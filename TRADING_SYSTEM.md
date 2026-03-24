# ASE Trading System — Complete Flow

## Overview
Agents on the ASE platform execute real trading strategies against Alpaca paper trading markets. Each agent has a fixed $10,000 base capital allocation that scales with user investments (AUM). Trades are fully logged, P&L is calculated, and performance data is collected continuously.

---

## Architecture

### 1. Agent Capital Model

**Base Allocation:** $10,000 per agent (stored as 1,000,000 cents internally)

**Scaling:** If total AUM > $10K, capital scales proportionally
```
Capital = max($10K, Total AUM)
Example: If agent has $50K in user investments, it trades with $50K
```

**Distribution by Agent:**
- **BTC Momentum:** 30% of capital → BTC/USD trades
- **ETH Mean Revert:** 25% of capital → ETH/USD trades
- **Crypto Trend:** 30% split equally → BTC/USD, ETH/USD, SOL/USD (10% each)
- **SOL Breakout:** 20% of capital → SOL/USD trades
- **DeFi Basket:** 30% split → Top 2 DeFi performers (15% each)

---

## Execution Flow

### Step 1: Cron Triggers Strategy Execution
**Endpoint:** `POST /api/cron/run-agents`
**Frequency:** Every minute (via external cron service)
**Auth:** Requires `x-cron-secret` header

```
1. Verify cron secret
2. Fetch all active agents from database
3. For each agent:
   a. Calculate capital allocation (base $10K + AUM scaling)
   b. Fetch latest market data (bars/prices)
   c. Run strategy algorithm
   d. Execute trades via Alpaca API
4. Fetch filled orders from Alpaca
5. Log trades to database
6. Return results
```

### Step 2: Strategy Evaluation
Each strategy analyzes recent market data and generates trading signals:

#### BTC Momentum
- Fetches 60 days of daily BTC/USD bars
- Calculates 20-day and 50-day EMAs
- **Signal:** Buy if EMA20 > EMA50 (bullish), sell otherwise
- **Allocation:** 30% of capital

#### ETH Mean Revert
- Fetches 20 days of daily ETH/USD bars
- Calculates RSI (14-period)
- **Signal:** Buy if RSI < 35 (oversold), sell if RSI > 60 (overbought)
- **Allocation:** 25% of capital
- **Constraint:** Max 2 concurrent positions

#### Crypto Trend
- Fetches 40 days of daily bars for BTC, ETH, SOL
- Calculates 10-day and 30-day EMAs for each
- **Signal:** Hold if EMA10 > EMA30 (trending up)
- **Allocation:** 10% per asset (30% total)

#### SOL Breakout
- Fetches 25 days of daily SOL/USD bars
- Calculates Bollinger Bands (20 SMA ± 2 std dev)
- **Signal:** Buy on upper band breakout with momentum, exit at middle band
- **Allocation:** 20% of capital

#### DeFi Basket
- Fetches 15 days of daily bars for LINK, UNI, AAVE, AVAX
- Calculates 14-day momentum for each
- **Signal:** Hold top 2 performers, rebalance weekly
- **Allocation:** 15% per position (30% total)

### Step 3: Order Submission
When signal triggers:
```typescript
1. Calculate position size = (allocation / current_price)
2. Submit market order to Alpaca
3. Order executes immediately in paper trading environment
4. Alpaca fills order with current market price
```

### Step 4: Trade Logging
After orders fill, route fetches order history and logs to database:

```sql
INSERT INTO agent_trades (
  agent_id,
  alpaca_order_id,
  symbol,
  side,           -- 'buy' or 'sell'
  qty,
  fill_price,
  filled_at,
  pnl_cents       -- Calculated for closed positions
)
```

**P&L Calculation for Closed Positions:**
```
When sell order fills:
  - Find matching buy order
  - P&L = (sell_price - buy_price) × quantity × 100 (in cents)
  - Record realized P&L
```

---

## Performance Metrics (Updated Continuously)

**Endpoint:** `POST /api/cron/update-nav`
**Frequency:** Every minute

### NAV (Net Asset Value)
Starting value: $100 per share
```
NAV = $100 × (Current Portfolio Value / Total Invested)
```

### Total Return %
```
Total Return = ((Portfolio Value - Invested) / Invested) × 100%
```

### Win Rate %
```
Win Rate = (Winning Trades / Total Closed Trades) × 100%
```

### Max Drawdown %
```
Max Drawdown = ((Peak NAV - Current NAV) / Peak NAV) × 100%
```

### Sharpe Ratio (Simplified)
```
Sharpe = Total Return % / 15 (capped at 5.0)
```

### Data Storage
Each snapshot stored in `agent_stats` table:
- `nav_cents` — Current token value
- `bid_cents` — Buy price (NAV × 0.9985)
- `ask_cents` — Sell price (NAV × 1.0015)
- `total_return_pct` — % gain/loss
- `sharpe_ratio` — Risk-adjusted return
- `max_drawdown_pct` — Peak-to-trough decline
- `win_rate_pct` — % profitable trades
- `total_trades` — Trade count
- `snapshot_at` — Timestamp

---

## Data Flow to Dashboard

### Real-Time Updates
Users see live data in the dashboard:
- Portfolio NAV updates every minute
- Trade feed shows recent fills
- P&L recalculates continuously
- Metrics update in agent_stats snapshots

### Query Path
```
Dashboard Page
    ↓
Supabase Query
    ↓
wallet (balance)
    + holdings (user positions)
    + agent_stats (latest metrics)
    + agent_trades (trade history)
    ↓
Display to User
```

---

## Example Execution Sequence

**Time: 2:00 PM UTC**

```
1. Cron job triggers /api/cron/run-agents

2. For BTC Momentum agent:
   - Capital allocation: $10,000 (base, no user investment yet)
   - Fetch BTC/USD 60D bars
   - EMA20 = $42,500, EMA50 = $41,000
   - Bullish signal (20 > 50)
   - Check positions: None held
   - Submit BUY order:
     * Symbol: BTC/USD
     * Qty: 0.235 BTC (10,000 × 30% / 42,500)
     * Side: buy
     * Type: market

3. Alpaca fills order:
   - Order ID: 550e8400-e29b-41d4-a716-446655440000
   - Filled at: $42,520
   - Filled qty: 0.235 BTC
   - Status: filled

4. Log trade to agent_trades:
   - agent_id: 'btc-momentum'
   - alpaca_order_id: '550e8400-...'
   - symbol: 'BTC/USD'
   - side: 'buy'
   - qty: 0.235
   - fill_price: 42520
   - filled_at: 2024-03-24T14:00:00Z
   - pnl_cents: null

5. Cron job /api/cron/update-nav triggers:
   - Fetch account portfolio_value from Alpaca
   - Calculate NAV for agent
   - Record agent_stats snapshot
   - Update all user holdings current_value_cents

6. Dashboard refreshes:
   - Shows new buy trade in feed
   - Updates agent NAV and P&L
   - Recalculates portfolio metrics
```

---

## Capital Allocation Examples

### Scenario 1: No User Investments (MVP)
- Total AUM: $0
- Capital used: $10,000 (base)
- Each agent trades independently with $10K pool

### Scenario 2: $50K User Investment in BTC Momentum
- Total AUM: $50,000
- Capital used: $50,000 (scales base $10K by 5x)
- BTC Momentum trades $15,000 (30% of $50K)
- Other agents continue with $10K base

### Scenario 3: Mixed Portfolio
- User holds: BTC Momentum ($20K), ETH Mean Revert ($15K)
- BTC Momentum AUM: $20,000 → Capital: $20,000
- ETH Mean Revert AUM: $15,000 → Capital: $15,000
- Other agents: Capital: $10,000 (base)

---

## Trade Lifecycle

```
1. PENDING
   └─ Strategy calculates signal
   └─ Order queued for submission

2. SUBMITTED
   └─ Order sent to Alpaca API
   └─ Awaiting fill

3. FILLED
   └─ Order matches at market price
   └─ Logged to agent_trades
   └─ Position tracked in holdings

4. CLOSED (Sell Order)
   └─ Matched with buy order
   └─ P&L calculated
   └─ Realized gain/loss recorded
```

---

## Database Tables

### agent_trades
Audit log of every trade execution
```sql
- agent_id (FK agents)
- alpaca_order_id (unique, Alpaca order ID)
- symbol (BTC/USD, ETH/USD, etc.)
- side (buy | sell)
- qty (decimal quantity)
- fill_price (filled average price)
- filled_at (timestamp)
- pnl_cents (NULL until position closed)
- created_at (auto)
```

### agent_stats
Performance snapshots (one per minute)
```sql
- agent_id (FK agents)
- nav_cents (current token value)
- bid_cents (buy price with spread)
- ask_cents (sell price with spread)
- total_return_pct (cumulative %)
- sharpe_ratio (risk-adjusted return)
- max_drawdown_pct (peak-to-trough %)
- win_rate_pct (% profitable trades)
- total_trades (count)
- snapshot_at (timestamp)
- created_at (auto)
```

### holdings
User positions in agents
```sql
- user_id (FK profiles)
- agent_id (FK agents)
- shares (decimal, fractional shares)
- invested_cents (entry cost)
- current_value_cents (shares × NAV)
- status (active | pending_sell | sold)
- created_at
- sold_at (when divested)
```

---

## Monitoring & Alerts

**Risk Tiers:**
- 🟡 **Yellow Alert:** -15% max drawdown
- 🟠 **Orange Alert:** -25% max drawdown
- 🔴 **Red Alert:** -40% max drawdown (hard delisting)

**Monitoring Dashboard:**
```
POST /api/cron/run-agents        ← Executes trades
    ↓
POST /api/cron/update-nav        ← Updates metrics
    ↓
POST /api/cron/match-orders      ← Processes orders
    ↓
Dashboard Displays               ← User sees live data
```

---

## Security & Auditing

**All trades are immutable records:**
- Every order execution logged with timestamp
- P&L calculated transparently
- User balance updated atomically
- RLS (Row-Level Security) on all tables

**Audit Trail:**
```
Agent executes → Alpaca confirms → We log to DB → User sees on dashboard
              ↓
        cryptographic proof of every step
```

---

## Troubleshooting

### Issue: No trades executing
**Check:**
1. Cron job is running (verify `x-cron-secret` header)
2. Alpaca credentials are valid
3. Strategy signals are generating (check logs)
4. Agent has sufficient capital allocation

### Issue: P&L not calculating
**Check:**
1. Both buy and sell orders are logged
2. Fill prices are correctly recorded
3. agent_trades table has proper data
4. MATCH logic correctly paired positions

### Issue: Dashboard shows stale data
**Check:**
1. update-nav cron is running
2. agent_stats table has recent snapshots
3. User cache not preventing refreshes

---

## Next Steps

1. **Monitor performance** — Check if agents are trending profitably
2. **Adjust allocations** — Scale capital as user base grows
3. **Add new strategies** — Implement additional agent types
4. **Optimize execution** — Fine-tune order timing and slippage handling
5. **Risk management** — Implement drawdown circuit breakers
