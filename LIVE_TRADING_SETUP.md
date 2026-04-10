# Live Trading Setup - Real Coinbase

## Overview
Agents trade with real user funds directly on Coinbase live (no sandbox, no paper money).

## Step 1: User Connects Coinbase Account

Users need to authorize ASE to trade on their behalf via OAuth.

**In production:**
- User clicks "Connect Coinbase" on dashboard
- ASE opens Coinbase OAuth
- User grants `wallet:transactions:execute` permission
- ASE gets API key/secret for user's account
- Stores encrypted in database

**For now (MVP):**
- Users provide their own API credentials
- Or: Use a single master Coinbase account (all users trade from same account, tracked separately)

## Step 2: User Funds the Account

Users add real USD to Coinbase:
1. Go to Coinbase
2. Link bank account
3. Deposit USD (takes 3-5 days)
4. Returns to ASE dashboard with available balance

## Step 3: Subscribe to Agent with Real Money

**Flow:**
1. User sees agent (backtest stats: +124% 5Y)
2. Clicks "Subscribe & Trade"
3. Modal shows: "Invest Real USD"
4. Shows: Available balance in Coinbase
5. Slider: $100-$10,000 USD
6. User confirms: "I understand this uses real money"
7. System:
   - Transfers USD from user's Coinbase to agent's trading account
   - Creates subscription + holding
   - Agent starts trading immediately

## Step 4: Agent Trades

**Trading:**
- Agent has X USD allocated
- Buys/sells BTC, ETH, SOL on Coinbase
- Real market prices
- Real P&L
- Logs to `agent_trades` with actual fills

**Capital:**
```
Agent Trading Capital = User USD allocations pooled
```

Example:
- User A: $1,000
- User B: $1,500
- User C: $500
- Total capital: $3,000 (no platform seed)

## Step 5: P&L & Withdrawals

**Tracking:**
- User P&L calculated from agent's trades
- Proportional to allocation
- Real money, real gains/losses

**Withdrawal:**
1. User sees P&L
2. Clicks "Withdraw"
3. System transfers profits back to user's Coinbase wallet
4. User can withdraw to bank (3-5 days)

---

## Environment Setup

### Option A: Single Master Account (Simpler for MVP)

All users' money goes to one Coinbase account. ASE tracks individual user allocations in database.

```
.env.local:
COINBASE_TRADE_KEY=master_account_key
COINBASE_TRADE_SECRET=master_account_secret_base64
COINBASE_TRADE_PASSPHRASE=master_account_passphrase
COINBASE_TRADE_SANDBOX=false
```

### Option B: Individual User Accounts (Recommended)

Each user connects their own Coinbase account. Requires OAuth implementation.

```
Database: Store encrypted user Coinbase credentials
When user subscribes: Use their API key to execute trades
```

---

## API Changes

### New: `/api/subscribe` (Updated for real money)

```typescript
POST /api/subscribe
{
  "agent_id": "btc-momentum",
  "amount_cents": 50000  // $500 real USD
}
```

Returns:
```json
{
  "ok": true,
  "subscription_id": "sub_123",
  "holding_id": "hold_456",
  "amount_allocated_cents": 50000,
  "agent_balance_cents": 250000,  // Total capital agent is now trading
  "estimated_position_usd": 112500  // 45% of capital
}
```

### New: `/api/withdraw`

```typescript
POST /api/withdraw
{
  "holding_id": "hold_456",
  "amount_cents": 55000  // If P&L is positive, can withdraw
}
```

---

## Database Changes

### `wallets` table
Change from "paper credits" to "Coinbase balance":

```sql
-- Before:
balance_cents INT  -- Paper credits

-- After:
balance_cents INT  -- Real USD balance
coinbase_account_id VARCHAR
last_synced_at TIMESTAMP
```

### New: `coinbase_connections` table

```sql
CREATE TABLE coinbase_connections (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users,
  account_type VARCHAR,  -- 'master' or 'individual'
  encrypted_key VARCHAR,
  encrypted_secret VARCHAR,
  encrypted_passphrase VARCHAR,
  connected_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## Risk Management

### Safeguards

1. **Minimum allocation:** $100 USD (prevents accidents)
2. **Maximum per agent:** $100,000 USD (limits exposure)
3. **Daily loss limit:** If agent loses >15%, pause trading
4. **Liquidity check:** Only allocate up to 90% of user balance
5. **Confirmation:** User must confirm twice ("I understand real money is at risk")

### Monitoring

- Alert user if daily loss >5%
- Hard stop agent if daily loss >15%
- Weekly performance email
- Option to pause agent anytime

---

## User Experience

### Dashboard

```
Connected Account: Coinbase
Available Balance: $5,234.50

Subscriptions:
┌─────────────────────────────────┐
│ BTC Momentum Alpha              │
│ Allocated: $500.00              │
│ Current Value: $512.45          │
│ P&L: +$12.45 (+2.5%)            │
│ Actions: [Add More] [Withdraw]  │
└─────────────────────────────────┘
```

### Subscribe Modal

```
Subscribe & Trade Real USD

Available Balance: $5,234.50
Select allocation: [$500] [$1000] [$2000]

⚠️ WARNING
This uses real money on Coinbase. 
Agent trades immediately.
Past performance ≠ future results.
Algorithmic trading involves risk of loss.

[x] I confirm and accept the risk
[Activate Agent with Real USD]
```

---

## Implementation Steps

### Phase 1: Environment & API (This Week)
- [ ] Get Coinbase live API credentials
- [ ] Update `.env.local` with COINBASE_TRADE_SANDBOX=false
- [ ] Test `/api/health` → should show "Live Coinbase"
- [ ] Update `/api/subscribe` to handle real USD

### Phase 2: UI Changes (This Week)
- [ ] Update SubscribeModal:
  - Show "Real USD" instead of "Paper Credits"
  - Show actual Coinbase balance
  - Add risk warnings
  - Change button to "Activate with Real USD"
- [ ] Update dashboard to show real P&L
- [ ] Add "Withdraw" functionality

### Phase 3: Testing (This Week)
- [ ] Small test: Subscribe with $100 real USD
- [ ] Verify trade executes on Coinbase
- [ ] Verify P&L tracking works
- [ ] Test withdrawal

### Phase 4: Launch (When ready)
- [ ] Add legal disclaimers
- [ ] Update terms of service
- [ ] Add risk warnings everywhere
- [ ] Monitor first trades closely

---

## Legal / Compliance

⚠️ **IMPORTANT**: Real money trading has legal implications:

1. **Terms of Service** - Must clearly state:
   - "Real money is at risk"
   - "Past performance ≠ future results"
   - "Algorithmic trading can lose capital"
   - "User assumes all risk"

2. **Disclaimer Page** - Add to /legal/trading-risk
   - Detailed explanation of risks
   - How ASE is not liable for losses
   - Acknowledgment that this is speculative

3. **Age Verification** - Ensure users are 18+

4. **Accredited Investor (Optional)** - Depending on jurisdiction, may need limits

---

## Testing Checklist

- [ ] Coinbase live credentials working
- [ ] `/api/health` shows live Coinbase
- [ ] Subscribe endpoint accepts real USD
- [ ] Trade executes on Coinbase immediately
- [ ] `agent_trades` table logs real fills with real prices
- [ ] P&L calculation matches Coinbase position P&L
- [ ] User sees correct balance after trade
- [ ] Withdrawal works (test with small amount)
- [ ] Multiple users can subscribe (capital pools)
- [ ] Agent position size scales with total AUM

---

## Timeline

**Today:**
- Update env to use Coinbase live
- Deploy new `/api/subscribe` and modal
- Test with small allocation ($100)

**This Week:**
- Verify all trades executing correctly
- Check P&L calculations match Coinbase
- Test withdrawals
- Monitor first real trades

**Next Week:**
- Add better risk warnings
- Update legal pages
- Launch to more users

---

## FAQ

**Q: What if the agent loses money?**
A: User loses their allocation. The agent's strategy is backtested but real trading has different conditions (slippage, liquidity, market gaps). Past performance ≠ future results.

**Q: Can users withdraw anytime?**
A: Yes. They can withdraw their current balance (allocation + P&L) back to Coinbase at any time. Takes 3-5 days to reach their bank.

**Q: What if Coinbase API is down?**
A: Agent can't trade. Logs error. Retries next minute. No harm to users.

**Q: Can you guarantee returns?**
A: No. Absolutely not. This is speculative trading. Users should only allocate money they can afford to lose.

**Q: What's the minimum allocation?**
A: $100 USD (prevents accidental tiny allocations, matches minimum Coinbase order size).

---

## Success Criteria

When done:
- [ ] User connects real Coinbase account
- [ ] User allocates real USD to agent
- [ ] Agent executes real trades on Coinbase
- [ ] User sees real P&L on dashboard
- [ ] User can withdraw profits
- [ ] Multiple users' money pools together for larger agent positions
- [ ] All disclaimers and risk warnings visible
- [ ] Legal requirements met
