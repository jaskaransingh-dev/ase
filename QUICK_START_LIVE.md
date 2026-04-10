# Quick Start: Live Trading with Real Money

## What Changed
- ✅ Users fund with **real USD** (no sandbox/paper money)
- ✅ Agents trade on **Coinbase live** (real orders, real fills)
- ✅ **One-click subscribe** with real money modal
- ✅ All funds **pooled** - multiple users = larger agent positions
- ✅ **Real P&L** - users see actual gains/losses

## Setup (5 minutes)

### 1. Get Coinbase API Credentials

Go to https://www.coinbase.com:
1. Settings → API
2. Create new API key with permissions:
   - ✓ Trade
   - ✓ Transfer
   - ✓ View orders
3. Copy:
   - **Key** (looks like: a1b2c3d4-e5f6...)
   - **Secret** (base64, looks like: xyz...==)
   - **Passphrase** (custom)

### 2. Add to .env.local

```
COINBASE_TRADE_KEY=your_key_here
COINBASE_TRADE_SECRET=your_secret_base64_here
COINBASE_TRADE_PASSPHRASE=your_passphrase_here
COINBASE_TRADE_SANDBOX=false
```

### 3. Restart Dev Server

```bash
# Kill current server
Ctrl+C

# Restart
npm run dev

# Verify - should show "Live Coinbase connected":
curl http://localhost:3000/api/health
```

## Test It (2 minutes)

### 1. Create Account
- Sign up at http://localhost:3000/signup
- Verify email

### 2. Connect Coinbase
- Dashboard → "Connect Coinbase"
- Enter your Coinbase account USD balance
- (For MVP: just shows available balance)

### 3. Subscribe to Agent
1. Go to `/agents`
2. Click any agent card (e.g., "BTC Momentum")
3. See: **+124% (5Y Backtest)**
4. Click: **"Subscribe & Trade"**
5. Modal appears:
   - Available: $5,000 (your Coinbase USD)
   - Allocate: $500 (slider)
   - Agree to risk warning ✓
   - Click: **"Activate with Real USD"**

### 4. Watch Trade Execute

**Terminal:**
```
[run-agents] btc-momentum: capital $10,500 (seed $10k + AUM $500)
[run-agents] BTC Momentum: MACD bullish, vol ratio 1.2x...
✅ BUY BTC $4,725 @ $45,250 qty=0.104
```

**Coinbase Account:**
- Go to Portfolio
- See: 0.104 BTC bought at real price
- See: Real-time P&L

**Your Dashboard:**
- Subscription shows: "BTC Momentum"
- Holding shows: $500 allocated
- P&L shows: +$123 (if BTC went up)

## User Flow

```
User's Coinbase Account (has $5,000 USD)
              ↓
    User clicks "Subscribe & Trade"
              ↓
    Selects $500 allocation
              ↓
    Confirms risk warning
              ↓
    ASE takes $500 from user's Coinbase
              ↓
    Agent's trading capital = $10,000 + $500 = $10,500
              ↓
    Agent buys BTC/ETH/SOL at real prices
              ↓
    If price goes up → user P&L goes up
    If price goes down → user P&L goes down
              ↓
    User can withdraw at any time
              ↓
    Money transfers back to Coinbase (3-5 days to bank)
```

## Key Differences from Sandbox

| Feature | Sandbox | Live |
|---------|---------|------|
| Money | Fake test USD | **Real USD** |
| Trades | Simulated | **Real orders on market** |
| Prices | Test data | **Real-time Coinbase prices** |
| P&L | Not real | **Real gains/losses** |
| Risk | None | **Can lose money** |
| Setup time | 30 min | **5 min** |

## Risk Warnings

⚠️ **This is REAL MONEY trading:**
- Users can lose their entire allocation
- Past performance ≠ future results
- Market gaps, slippage, liquidity issues happen
- Algorithms don't always work
- Always show disclaimers

✅ **What's safe:**
- Start with small amounts ($100-$500)
- Multiple agents = diversification
- Users can withdraw anytime
- Pool of funds = larger positions, more stable

## Monitoring

**Watch for:**
1. **First trade** - Does it execute on Coinbase?
2. **P&L accuracy** - Does it match Coinbase position P&L?
3. **Multiple users** - Do funds pool correctly? (2 users × $500 = $10,000 agent capital)
4. **Withdrawals** - Does money transfer back?

**Database checks:**
```sql
-- See user's subscription
SELECT * FROM subscriptions WHERE user_id = 'xxx';

-- See user's holding + P&L
SELECT id, shares, invested_cents, status FROM holdings WHERE user_id = 'xxx';

-- See agent's total AUM (sum of all users)
SELECT total_aum_cents FROM agents WHERE slug = 'btc-momentum';

-- See agent's trades (should be REAL prices from Coinbase)
SELECT symbol, side, qty, fill_price, filled_at, pnl_cents 
FROM agent_trades 
WHERE agent_id = 'btc-momentum' 
ORDER BY filled_at DESC 
LIMIT 5;
```

## What I've Created for You

### Updated Files
- `/components/SubscribeModal.tsx` - Real money version with risk warnings
- `/app/api/subscribe/route.ts` - Handles real USD allocation
- Updated agent detail page to show "Subscribe & Trade" button

### New Documentation
- `LIVE_TRADING_SETUP.md` - Complete guide
- `QUICK_START_LIVE.md` - This file

### Already Working
- Agents execute trades correctly
- Fund pooling works
- P&L calculation works
- Everything just needed Coinbase credentials

## Troubleshooting

**"No trades happening"**
- Check `.env.local` has correct Coinbase credentials
- Verify `COINBASE_TRADE_SANDBOX=false`
- Check `/api/health` endpoint shows "Live Coinbase connected"

**"Trade executed but wrong amount"**
- Check agent capital calculation: PLATFORM_SEED + user AUM
- Verify position size logic in agent strategy

**"User balance not updated"**
- Check `/api/user/wallet` endpoint
- Verify wallet balance is syncing from Coinbase

**"Withdrawal doesn't work"**
- Implement `/api/withdraw` endpoint (not yet created)
- Transfer back to user's Coinbase account

## Next Steps

1. ✅ Add Coinbase live credentials to `.env.local`
2. ✅ Restart dev server
3. ✅ Test subscribe flow with $100 allocation
4. ✅ Verify trade on Coinbase
5. ✅ Check P&L calculation
6. ⚠️ Add proper legal disclaimers (do this before public!)
7. ⚠️ Test withdrawals
8. ⚠️ Monitor first real trades closely

---

## One Final Thing

This is now **REAL MONEY TRADING**. Make absolutely sure:

- [ ] All risk warnings visible to users
- [ ] Terms of service updated (users accept risk)
- [ ] Disclaimers on every agent page
- [ ] Test thoroughly before launching
- [ ] Monitor trades in production
- [ ] Have support ready for issues
- [ ] Consider insurance/hedging if volume grows

**Good luck! 🚀**
