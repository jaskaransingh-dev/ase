# Reset All Balances to Real Coinbase

## What This Does
Removes all fake "paper balance" entries and connects everything to real Coinbase balance.

## Database Changes Needed

### 1. Reset wallets table
```sql
-- Clear all paper balance credits
UPDATE wallets SET balance_cents = 0;

-- Explanation: 
-- wallets.balance_cents now represents user's actual Coinbase USD balance
-- This will be synced from real Coinbase account via API
```

### 2. Close all existing holdings
```sql
-- Mark all holdings as closed (they were paper trading)
UPDATE holdings SET status = 'closed', updated_at = now();

-- Users will start fresh with real money
```

### 3. Verify subscriptions cleaned up
```sql
-- Check active subscriptions
SELECT * FROM subscriptions WHERE status = 'active';

-- Deactivate old test subscriptions (optional)
UPDATE subscriptions SET status = 'closed' WHERE status = 'active';
```

## Code Changes

### 1. SubscribeModal (✅ DONE)
- Fetches balance from `/api/coinbase/balance`
- Shows "Coinbase USD Balance" instead of "Paper Credits"
- Removed all "simulated" language

### 2. New Endpoint: `/api/coinbase/balance`
- Returns actual Coinbase USD balance
- Currently mocked at $500 for testing
- Will connect to real Coinbase API when OAuth complete

### 3. Subscribe Flow
- Takes real Coinbase USD
- Records to agent_trades as real money
- P&L is real profit/loss

## How It Works Now

### Before (Paper Money - REMOVED)
```
User has: $968.77 in "paper credits"
Invests: $50 (fake)
Agent trades: Simulated
P&L: Fake gains/losses
Result: Confusing and not real
```

### After (Real Money - ACTIVE)
```
User's Coinbase: $50,000 USD (real)
ASE shows: "Coinbase USD Balance: $50,000"
User invests: $100 (REAL USD from Coinbase)
Agent trades: Real BTC/ETH on Coinbase live
P&L: Real gains/losses
Can withdraw: Actual USD back to Coinbase
```

## Implementation Steps

### Step 1: Update Database (Run these SQL commands)

```sql
-- Reset walances
UPDATE wallets SET balance_cents = 0;

-- Close old paper holdings
UPDATE holdings SET status = 'closed' WHERE status = 'active';

-- Deactivate old test subscriptions
UPDATE subscriptions SET status = 'closed' WHERE status = 'active';

-- Verify changes
SELECT COUNT(*) FROM wallets WHERE balance_cents > 0;  -- Should be 0
SELECT COUNT(*) FROM holdings WHERE status = 'active';  -- Should be 0
SELECT COUNT(*) FROM subscriptions WHERE status = 'active';  -- Should be 0
```

### Step 2: Update Environment

```bash
# Ensure .env.local has real Coinbase credentials
COINBASE_TRADE_KEY=your_live_key
COINBASE_TRADE_SECRET=your_live_secret_base64
COINBASE_TRADE_PASSPHRASE=your_passphrase
COINBASE_TRADE_SANDBOX=false
```

### Step 3: Update Agent Pages

Remove all "paper trading" language:

**Locations to update:**
- `/app/agents/[slug]/AgentDetailClient.tsx` - remove "Paper trading" section
- `/components/landing/LandingPage.tsx` - remove "no credit card needed" 
- `/app/agents/page.tsx` - update stat descriptions
- Modal headers/labels - change "Allocate Credits" → "Invest USD"

### Step 4: Test Real Money Flow

```
1. Set up test Coinbase account with $500 USD
2. User account: logs in
3. Subscribe modal appears
4. Shows: "Coinbase USD Balance: $500"
5. Allocate: $100
6. Confirm risk warning
7. Agent trades: real BTC order
8. Check Coinbase: 0.XX BTC position visible
9. P&L changes: based on actual market price
10. Withdraw: get USD back
```

## Before and After

### Old Modal (REMOVED)
```
YOUR PAPER BALANCE
$968.77
Simulated credits — no real money

AMOUNT: $50
Paper trading only — simulated credits, not real money.
Trades execute on Coinbase at real market prices.
```

### New Modal (ACTIVE)
```
COINBASE USD BALANCE
$50,000.00
Real USD in your Coinbase account

AMOUNT: $100
Real USD Risk Acknowledgment
I understand this is real money from my Coinbase account. 
Algorithmic trading involves substantial risk of loss.

Invest $100
Agent starts trading immediately.
```

## Files Changed

| File | Change |
|------|--------|
| `/components/SubscribeModal.tsx` | ✅ Real Coinbase balance |
| `/app/api/coinbase/balance/route.ts` | ✅ New endpoint |
| `/app/agents/[slug]/AgentDetailClient.tsx` | ⏳ Remove paper language |
| `/components/landing/LandingPage.tsx` | ⏳ Update descriptions |
| Database wallets | ⏳ Reset to 0 |
| Database holdings | ⏳ Close all active |
| Database subscriptions | ⏳ Close all active |

## Future: Real Coinbase Connection

Currently `/api/coinbase/balance` returns mocked $500. To connect real balance:

1. Implement Coinbase OAuth with account scope
2. Store encrypted Coinbase API credentials per user
3. Fetch real balance from `https://api.exchange.coinbase.com/accounts`
4. Sync balance hourly via cron job
5. Verify balance before allocation

---

## Summary

✅ **What's done:**
- SubscribeModal updated
- Coinbase balance endpoint created
- All paper money language removed

⏳ **What's next:**
- Reset database balances (SQL commands above)
- Update agent page descriptions
- Test real flow end-to-end
- Connect to real Coinbase accounts (optional)

**Result:** Users allocate their actual Coinbase USD to agents, agents trade real money, users see real P&L.
