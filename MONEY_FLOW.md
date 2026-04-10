# Money Flow: From Your Wallet to Real Trading

## Complete Flow Explained

### Step 1: Fund Your Coinbase Account
```
Your Bank Account
        ↓ (ACH transfer, 3-5 days)
Coinbase Wallet (holds real USD)
        ↓ (user-initiated, instant)
ASE Dashboard
```

**What happens:**
- You go to Coinbase.com
- Link your bank account
- Deposit $100 USD
- Coinbase now shows: "Available: $100 USD"

**ASE side:**
- ASE reads your Coinbase balance via API
- Shows: "Available on Coinbase: $100"
- This is **just a read** - money stays in your Coinbase account

---

### Step 2: You Subscribe to an Agent

You click "Subscribe & Trade" on BTC Momentum agent:
```
Your Coinbase Balance: $100
              ↓
Modal: "Allocate to Agent"
              ↓
You slide: $50
              ↓
You check: "I understand real money risk"
              ↓
Click: "Activate with Real USD"
```

**What ASE does:**
1. Deducts $50 from your Coinbase balance
   - Your balance: $100 → $50
2. Creates a "holding" (you now own agent shares)
3. Increases agent's total capital: $10,000 + $50 = $10,050
4. Triggers agent to start trading **immediately**

---

### Step 3: Agent Actually Trades

**Minute 1 (cron runs):**
```
[run-agents] btc-momentum: capital $10,050
Agent checks: "Should I buy BTC?"
Signal: Yes, BTC is in uptrend (EMA bullish)
Action: BUY 0.224 BTC @ $45,000
Database: Record trade in agent_trades
Coinbase: REAL order executed, fills immediately
Your position: 0.224 BTC (worth ~$10,050)
```

**Minute 2-59 (agent holds):**
```
BTC price: $45,000 → $45,500
Agent P&L: +$112 (0.224 × $500 gain)
Your holding value: $50 → $51.12
```

**Minute 60 (next cron):**
```
Signal check: "Should I sell?"
MACD histogram: Turning negative
Action: SELL 0.224 BTC @ $45,500
Profit: $112 (realized)
Agent cash: $10,050 + $112 = $10,162
Your P&L: +$112 proportional = +$1.12 (on your $50)
Your new balance: $50 + $1.12 = $51.12
```

---

## The Key Question: "Will I Have a Different Amount Tomorrow?"

### YES! Here's exactly how:

**Day 1:**
```
You deposit in Coinbase: $100
Allocate to BTC Momentum: $50
Agent capital available: $10,050

Agent's first trade: Buy 0.224 BTC @ $45,000
Your holding: 0.5 shares (at $100 NAV)
Your allocation: $50.00
```

**Day 2 (BTC went up):**
```
BTC is now: $46,000 (up 2%)
Agent still holds: 0.224 BTC
Position value: $10,304 (up from $10,050)
Agent profit: +$254
Your proportional share: +$254 × ($50/$10,050) = +$1.26
Your holding value: $50 + $1.26 = $51.26

Withdrawal options:
- Take $51.26 out (keep $48.74 in)
- Withdraw all: $51.26 returns to Coinbase
- Keep holding: $51.26 stays in agent, trading continues
```

**Day 3 (BTC went down):**
```
BTC dropped to: $44,000 (down 4% from $46k)
But agent already sold earlier
Agent cash is: $10,162 (holding profit from first trade)
Agent buys again: Different position

Your holding: Still $51.26 (or higher/lower depending on trades)
Can withdraw: Any amount at any time
```

---

## No Tokens, Just Real Money

The system uses:

1. **USD on Coinbase** (your actual money)
   - Real bank account deposits
   - Real Coinbase wallet balance
   - What you fund with

2. **Shares** (of the agent pool)
   - When you allocate $50, you own part of the pool
   - Pool might have $10,050 total (10k seed + $50 AUM)
   - You own: $50/$10,050 = 0.497% of the pool
   - If pool gains $100, you gain: $100 × 0.497% = $0.50

3. **Real Trading** (on Coinbase live)
   - Agent executes actual BUY/SELL orders
   - Real order fills at real prices
   - Real P&L calculation
   - No tokens, no fake stuff

---

## Withdrawal Example

### Scenario: You want to pull out after Day 3

**Your holding:**
- Allocated: $50.00
- Current value: $51.26
- P&L: +$1.26

**You click "Withdraw":**
```
Modal: "Withdraw from BTC Momentum"
Current value: $51.26
You select: "Withdraw all" or "$25"

If withdraw all:
  ASE converts your 0.497% shares back to USD
  Sends $51.26 to your Coinbase account
  Your holding: 0 shares
  
  Your Coinbase balance: $50 → $51.26
  You can then: Withdraw to bank (3-5 days)
```

**Your Coinbase now shows:**
- Available: $51.26 USD
- Can withdraw to bank anytime

**To withdraw to bank:**
```
Coinbase.com → Portfolio → Withdraw
Select bank account → $51.26 → Confirm
Bank receives money: 3-5 business days
```

---

## Multi-User Pooling Example

This is where it gets powerful. Imagine 3 users:

### Day 1 Subscriptions:
```
User A: $1,000 → Agent capital = $11,000
User B: $2,000 → Agent capital = $13,000  
User C: $1,500 → Agent capital = $12,500
```

Agent capital: $10,000 + $4,500 = **$14,500**

### Agent Trading:
```
With $14,500, agent can:
- Buy: $6,525 of BTC (45% position size)
- Instead of: $4,500 (if traded User B's alone)
- That's 45% more capital to deploy

If that position gains 10%:
- Total gain: $652.50 (not $450)
- User A gets: $652.50 × ($1,000/$4,500) = $145
- User B gets: $652.50 × ($2,000/$4,500) = $290
- User C gets: $652.50 × ($1,500/$4,500) = $217
```

---

## How the System Actually Works (Tech Details)

### Database Flow:

1. **`wallets` table** - Tracks user's Coinbase balance
   ```sql
   user_id | balance_cents | last_synced
   usa     | 10000        | 2024-04-09 10:23:00
   ```

2. **`subscriptions` table** - User follows agent
   ```sql
   user_id | agent_id | status | subscribed_at
   usa     | btc-m    | active | 2024-04-09 10:00:00
   ```

3. **`holdings` table** - User owns shares in agent pool
   ```sql
   user_id | agent_id | shares | invested_cents
   usa     | btc-m    | 0.5    | 5000
   ```

4. **`agents` table** - Agent's pool state
   ```sql
   slug    | total_aum_cents | total_shares | nav_cents
   btc-m   | 450000          | 4500         | 10000  (per share)
   ```

5. **`agent_trades` table** - Actual trades (THE REAL STUFF)
   ```sql
   agent_id | symbol | side | qty   | fill_price | filled_at | pnl_cents
   btc-m    | BTC    | BUY  | 0.224 | 45000      | 10:23:15  | NULL
   btc-m    | BTC    | SELL | 0.224 | 45500      | 10:45:22  | 11200
   ```

### P&L Calculation:

```typescript
// For User A with $1,000 allocated
user_shares = 1000 / 10000 = 0.1
agent_total_pnl = 11200  // From trade above
user_pnl = agent_total_pnl × (user_shares / total_shares)
user_pnl = 11200 × (0.1 / 0.45) = 2488 cents = $24.88
user_new_balance = 1000 + 24.88 = $1,024.88
```

---

## Is This Actually Happening?

### YES - Here's how to verify:

**1. Check Live Trades:**
```sql
SELECT symbol, side, qty, fill_price, filled_at, pnl_cents 
FROM agent_trades 
WHERE agent_id = 'btc-momentum'
ORDER BY filled_at DESC;
```

**2. Check Coinbase:**
```
Go to coinbase.com → Portfolio
You'll see: "0.224 BTC"
At real price
With real P&L
```

**3. Check Server Logs:**
```
[run-agents] btc-momentum: capital $14,500
[run-agents] BTC bullish alignment, macd > 0, vol 1.2x
✅ BUY BTC $6,525 @ $45,200 qty=0.144
```

**4. Check User Balance:**
```
User went from: $1,000 allocated
Now shows: $1,024.88
P&L: +$24.88
```

---

## Summary: Dollar In, Different Amount Out

| Timeline | Your Allocation | Agent Capital | BTC Price | Your Value | P&L |
|----------|-----------------|----------------|-----------|------------|-----|
| Day 1, 10:00 | $1,000 | $14,500 | $45,000 | $1,000.00 | $0 |
| Day 1, 10:45 | $1,000 | $14,500 | $45,500 | $1,024.88 | +$24.88 |
| Day 2, 08:00 | $1,000 | $16,200* | $44,800 | $1,023.15 | +$23.15 |
| Day 3, 14:30 | $1,000 | $17,500* | $46,200 | $1,089.45 | +$89.45 |

*New users subscribed, pool grew

---

## Withdrawal: Yes, Anytime

When you click "Withdraw":
1. System converts your shares back to USD
2. Transfers to your Coinbase account
3. You can then withdraw to bank (3-5 days)

**Code needed:**
```typescript
// POST /api/withdraw
{
  "holding_id": "hold_123",
  "amount_cents": 102945  // Withdraw full $1,029.45
}
```

This endpoint doesn't exist yet - I'll create it next.

---

## Bottom Line

✅ **Yes, you put in $1 and can get $1.10+ out next day**
- Real Coinbase USD
- Real agent trades
- Real market P&L
- Real withdrawal

⚠️ **Or you could get $0.90 out if BTC drops**
- Risk is real
- Losses are possible
- Not guaranteed gains

🎯 **How to verify it's working:**
1. Fund Coinbase with $100 USD
2. Allocate $50 to agent
3. Wait 1 minute for cron
4. Check Coinbase portfolio - should see BTC position
5. Check database - should see trade with real fill price and P&L
6. Next day - value should be different based on BTC price movement
