# Fix Agent Trading: Complete Implementation Guide

## Problem Statement
- Agents run but don't actually trade with user-allocated funds
- Subscription/investment workflow is confusing (2 separate steps)
- Coinbase sandbox not configured
- Agents show live trading stats instead of backtest stats before subscription

## Solution Overview
1. **Configure Coinbase Sandbox** → agents trade real orders (paper money)
2. **Unified Subscribe Endpoint** → one-click subscribe + allocate + trade
3. **Simple Modal** → beautiful, clear allocation interface
4. **Show Backtest Stats** → users see verified performance before subscribing
5. **Immediate Trading** → agent trades immediately after allocation

---

## Implementation Checklist

### Phase 1: Environment Setup

- [ ] Create Coinbase Sandbox account (see COINBASE_SETUP.md)
- [ ] Generate sandbox API credentials
- [ ] Add to `.env.local`:
  ```
  COINBASE_TRADE_KEY=your_key
  COINBASE_TRADE_SECRET=your_secret_base64
  COINBASE_TRADE_PASSPHRASE=your_passphrase
  COINBASE_TRADE_SANDBOX=true
  ```
- [ ] Restart dev server
- [ ] Verify: `curl http://localhost:3000/api/health` → should show Coinbase connected

### Phase 2: Update Agent Detail Page

File: `/app/agents/[slug]/AgentDetailClient.tsx`

**Changes:**
1. Import the new `SubscribeModal`:
   ```typescript
   import SubscribeModal from '@/components/SubscribeModal'
   ```

2. Replace current InvestModal with simpler state:
   ```typescript
   const [showSubscribeModal, setShowSubscribeModal] = useState(false)
   ```

3. Update right sidebar to show backtest stats:
   ```typescript
   // Show cached backtest stats prominently
   if (cachedBacktestStats?.stats) {
     const s = cachedBacktestStats.stats
     // Display: return, sharpe, max drawdown, win rate
   }
   ```

4. Replace button:
   - From: "Subscribe" + "Invest" (two buttons)
   - To: Single "Subscribe & Trade" button (if not subscribed)
   - If subscribed: "Add More" + "Deallocate" buttons

5. Use new modal:
   ```typescript
   {showSubscribeModal && (
     <SubscribeModal
       agentId={agent.id}
       agentName={agent.name}
       onClose={() => setShowSubscribeModal(false)}
       onSuccess={() => setShowSubscribeModal(false)}
     />
   )}
   ```

### Phase 3: Landing Page Stats

File: `/components/landing/LandingPage.tsx`

**Update agent cards to show backtest stats:**
```typescript
// Instead of live stats, show:
// Return: +124% (5Y backtest)
// Sharpe: 1.23
// Status: LIVE (actively trading)
```

### Phase 4: Test the Flow

1. **Create test subscription:**
   ```bash
   curl -X POST http://localhost:3000/api/subscribe \
     -H "Content-Type: application/json" \
     -d '{"agent_id": "btc-momentum", "amount_cents": 5000}'
   ```

2. **Check database:**
   ```sql
   -- Verify subscription created
   SELECT * FROM subscriptions WHERE user_id = 'test_user';
   
   -- Verify holding created
   SELECT * FROM holdings WHERE user_id = 'test_user';
   
   -- Check agent AUM increased
   SELECT total_aum_cents FROM agents WHERE slug = 'btc-momentum';
   ```

3. **Watch agent trade:**
   - Check logs: `[run-agents] btc-momentum: capital $10,250...`
   - Go to Coinbase sandbox → Portfolio → should see BTC position
   - Check database: `SELECT * FROM agent_trades WHERE agent_id = 'btc-momentum' ORDER BY filled_at DESC LIMIT 1;`

4. **Verify P&L tracking:**
   - Agent trades, records to `agent_trades`
   - NAV updates based on P&L
   - User holding value changes

### Phase 5: Fix Specific Pages

#### `/app/agents` (agent list)
- Show backtest return instead of live stats
- Show subscriber count
- Show "LIVE" badge

#### `/app/agents/[slug]` (agent detail)
- Left: Agent description, strategy, tabs (trades, backtest, etc.)
- Right: Backtest stats + "Subscribe & Trade" button
- If subscribed: show current holding, P&L, "Add More" / "Deallocate"

#### `/dashboard` (user dashboard)
- Show subscribed agents
- Show current value + P&L
- Show backtest Sharpe for reference
- Link to individual agent pages

---

## File Changes Summary

### New Files Created
- `/app/api/subscribe/route.ts` — unified subscribe endpoint
- `/components/SubscribeModal.tsx` — clean subscribe modal
- `COINBASE_SETUP.md` — Coinbase sandbox setup guide
- `SUBSCRIPTION_WORKFLOW.md` — workflow documentation
- `FIX_AGENT_TRADING.md` — this file

### Files to Update
- `/app/agents/[slug]/AgentDetailClient.tsx` — use new modal, show backtest stats
- `/components/landing/LandingPage.tsx` — show backtest stats on agent cards
- `/app/agents/page.tsx` — show backtest stats instead of live stats

### No Changes Needed
- `/lib/agents.ts` — already executes trades correctly
- `/app/api/cron/run-agents/route.ts` — already runs agents with capital
- Database schema — all tables already exist

---

## Key Concepts

### Trading Capital Formula
```
Trading Capital = PLATFORM_SEED ($10,000) + User AUM
```

**Example:**
- User 1 invests $50
- User 2 invests $75
- Total AUM = $125
- **Agent trading capital = $10,125**
- Agent can trade $5,706 worth of BTC (45% of capital)

### Position Sizing
Agents scale position size based on capital:
- More AUM = bigger positions = bigger absolute returns
- Returns are proportional to allocation (if capital doubles, return doubles)

### Fund Flow
1. User subscribes + allocates $50
2. System deducts $50 from user's wallet
3. Creates holding with 0.5 shares (at $100 NAV)
4. Agent's `total_aum_cents` increases by $5000
5. Next cron: agent trades with $10,050 capital
6. If BTC gains +2%, agent P&L = +$201 absolute
7. User's holding value increases to $50 + proportional gains

### Backtest Stats vs. Live Stats
- **Backtest**: Historical performance (5Y daily OHLCV data)
- **Live**: Actual trading performance since agent went live
- **Show to users**: Backtest stats (verified, tested)
- **Internal use**: Live stats for trending/dashboards

---

## Testing Scenarios

### Scenario 1: Basic Subscribe & Trade
1. Create account, get $100 paper credits
2. View BTC Momentum agent (show +124% 5Y backtest return)
3. Click "Subscribe & Trade"
4. Allocate $25
5. Check: Holding created, subscription created, agent capital increased
6. Wait 1 minute for cron: Agent should execute BTC trade on Coinbase sandbox

### Scenario 2: Multiple Subscribers
1. User A subscribes + allocates $50 to BTC Momentum
2. User B subscribes + allocates $75 to same agent
3. Agent capital = $10,000 + $125 = $10,125
4. Next trade should be bigger (3.5x compared to User A alone)

### Scenario 3: Add More Funds
1. User A allocated $50, now has 0.5 shares
2. User A clicks "Add More", allocates $25
3. System merges: 0.5 + 0.25 = 0.75 shares
4. Agent capital increases to $10,150
5. Next trade is bigger

### Scenario 4: Deallocate
1. User A has 0.75 shares worth $100 (NAV = $100 each)
2. P&L = +$25 (overall up 25%)
3. User A deallocates 50% (0.375 shares)
4. Gets back $50 + proportional gains = ~$62.50
5. Holding now: 0.375 shares worth $37.50

---

## Troubleshooting

### "Agent not trading after subscription"
- [ ] Check `.env.local` has Coinbase credentials
- [ ] Restart dev server
- [ ] Check `/api/health` endpoint
- [ ] Check server logs for `[run-agents]` output
- [ ] Verify agent's `total_aum_cents` increased in DB

### "Coinbase error: 'Insufficient funds'"
- [ ] Go to Coinbase sandbox, request more test USD
- [ ] Deposits appear instantly in sandbox
- [ ] Try subscribing again

### "User doesn't see updated holding"
- [ ] Call `/api/user/holding?agent_id=xxx`
- [ ] Should return updated shares + value
- [ ] If not, check `holdings` table directly

### "Multiple subscribe buttons appear"
- [ ] Check that conditional logic is correct:
  ```typescript
  {!isSubscribed ? (
    <button>Subscribe & Trade</button>
  ) : (
    <>
      <button>Add More</button>
      <button>Deallocate</button>
    </>
  )}
  ```

---

## Success Criteria

When complete, you should be able to:

- [ ] Create account, get $100 paper credits
- [ ] Browse agents, see **5Y backtest returns** (e.g., +124%)
- [ ] Click "Subscribe & Trade" on any agent
- [ ] Allocate $25-$50 in one modal
- [ ] See subscription + holding created in DB
- [ ] Watch agent trade on Coinbase sandbox within 1 minute
- [ ] See trade in `agent_trades` table
- [ ] See position in Coinbase sandbox portfolio
- [ ] Monitor P&L in real-time
- [ ] Deallocate funds, get credits back
- [ ] Subscribe to multiple agents, see capital pooling

---

## References

- Coinbase Sandbox: https://public.sandbox.exchange.coinbase.com
- Coinbase API Docs: https://docs.cdp.coinbase.com/exchange/docs/welcome
- Agent Config: `lib/agents.ts` (lines 29-120)
- Agent Execution: `app/api/cron/run-agents/route.ts`
- Subscription DB: `subscriptions`, `holdings`, `wallets` tables
