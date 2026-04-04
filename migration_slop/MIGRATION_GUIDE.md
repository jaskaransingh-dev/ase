# Migration 009: Apply New Agents & Error Tracking

This guide walks you through applying Migration 009, which:
- ✅ Adds `last_error` column to the agents table (for error tracking)
- ✅ Seeds 5 new sophisticated trading agents (bringing total from 5 to 10)
- ✅ Creates an index for fast error lookup

## Option 1: Automatic (Recommended)

### Step 1: Start your app
```bash
cd ase
npm run dev
```

The app should be running at `http://localhost:3000`

### Step 2: Run the migration script
```bash
# From the project root directory
bash apply-migration.sh
```

That's it! The script will:
1. Check that your app is running
2. Call the `/api/admin/apply-migration` endpoint
3. Apply the migration to your Supabase database
4. Confirm all 10 agents are now active

**Expected output:**
```
✅ Migration 009 applied successfully!

Changes made:
  - Added 'last_error' column to agents table
  - Seeded 5 new trading agents

All 10 agents are now active:
  1. btc-momentum (BTC Momentum Alpha)
  2. eth-mean-revert (ETH Statistical Arbitrage)
  ...
  10. defi-yield (DeFi Yield Momentum)

🚀 Cron job is already configured to run every minute.
   Your agents should start showing as ONLINE within 1-2 minutes!
```

---

## Option 2: Manual (Supabase SQL Editor)

If you prefer to apply the migration manually:

### Step 1: Open Supabase SQL Editor
1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project "ASE Startup"
3. Click **SQL Editor** (left sidebar)

### Step 2: Create a new query
1. Click **New Query**
2. Clear any default text

### Step 3: Paste the SQL
Copy and paste the entire SQL from `ase/supabase/migrations/009_seed_5_new_agents.sql`:

```sql
-- ============================================================
-- Migration 009: Add last_error column and seed 5 new agents
-- ============================================================

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS last_error text;

INSERT INTO public.agents (slug, name, ticker, description, strategy_type, asset_class, status, share_price_cents, total_shares, total_aum_cents)
VALUES
  (
    'btc-eth-pairs',
    'BTC/ETH Pair Trading',
    'BEPV',
    'Correlation arbitrage using 60-day rolling correlation and z-score of BTC/ETH spread ratio. Exploits mean reversion in pair dynamics.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000,
    0
  ),
  (
    'vol-harvester',
    'Crypto Volatility Harvester',
    'VOLH',
    'Sells volatility premium by buying high-volatility selloffs and selling into volatility crushes. Uses 20-period realized vs implied vol.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000,
    0
  ),
  (
    'momentum-carry',
    'Crypto Momentum Carry',
    'MCAR',
    'Multi-asset momentum with inverse-volatility weighting across BTC, ETH, SOL, and top DeFi tokens. Adds funding rate carry overlay.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000,
    0
  ),
  (
    'cascade-detect',
    'Liquidation Cascade Detector',
    'LCAS',
    'Buy-the-dip strategy detecting liquidation cascades through volume spike detection (>4% drop in 4 hours with volume >3x mean).',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000,
    0
  ),
  (
    'defi-yield',
    'DeFi Yield Momentum',
    'DYLD',
    'Detects momentum divergence in DeFi tokens outperforming BTC. Rotates into top 5 DeFi performers with weekly rebalance.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000,
    0
  )
ON CONFLICT (slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_agents_last_error
  ON public.agents(last_error)
  WHERE last_error IS NOT NULL;
```

### Step 4: Execute the query
1. Click **Run** (or press Ctrl+Enter)
2. You should see "Successfully executed" at the bottom

### Step 5: Verify
Run this query to confirm all 10 agents were created:

```sql
SELECT slug, name, ticker, status, share_price_cents
FROM public.agents
ORDER BY created_at;
```

You should see 10 rows (5 original + 5 new).

---

## What Happens Next?

Once the migration is applied:

1. **Cron is already configured** to run every minute via Cloudflare Workers
2. **Agents will start running** and executing trades automatically
3. **Dashboard will update** - agents will show as "ONLINE" when `last_run_at` is recent (within 25 minutes)
4. **Prices will update** as agents trade and positions change

### Monitor Agent Status

Check your dashboard at `http://localhost:3000/dashboard`:
- Navigate to the "Agents" section
- You should see all 10 agents with real-time status
- After 1-2 minutes, they should switch from "OFFLINE" to "ONLINE"
- "LIVE" badge indicates the agent is currently running

---

## The 10 Agents

### Original 5 (Already Seeded)

1. **BTC Momentum** (`btc-momentum`, BTCM)
   - Rides Bitcoin momentum using 20/50 EMA crossovers

2. **ETH Mean Revert** (`eth-mean-revert`, ETHR)
   - Buys ETH when RSI drops below 35, sells when RSI exceeds 60

3. **Crypto Trend** (`crypto-trend`, CRTR)
   - Systematic trend follower across BTC, ETH, and SOL

4. **SOL Breakout** (`sol-breakout`, SOLB)
   - Detects SOL/USD breakouts using Bollinger Band expansion

5. **DeFi Basket** (`defi-basket`, DEFI)
   - Rotates between top DeFi tokens based on 14-day momentum

### New 5 (Seeded by This Migration)

6. **BTC/ETH Pair Trading** (`btc-eth-pairs`, BEPV)
   - Correlation arbitrage using 60-day rolling correlation
   - Exploits mean reversion in BTC/ETH pair dynamics

7. **Crypto Volatility Harvester** (`vol-harvester`, VOLH)
   - Sells volatility premium by buying high-vol selloffs
   - Sells into volatility crushes using realized vs implied vol

8. **Crypto Momentum Carry** (`momentum-carry`, MCAR)
   - Multi-asset momentum with inverse-volatility weighting
   - Includes funding rate carry overlay across 4+ assets

9. **Liquidation Cascade Detector** (`cascade-detect`, LCAS)
   - Buy-the-dip strategy detecting liquidation cascades
   - Triggers on >4% drop in 4 hours with volume >3x mean

10. **DeFi Yield Momentum** (`defi-yield`, DYLD)
    - Detects momentum divergence in DeFi tokens
    - Rotates into top 5 DeFi performers weekly

---

## Troubleshooting

### "App is not running" error
```bash
cd ase
npm run dev
```

Then run the migration script again.

### "Unauthorized" error when calling the API
Make sure `ADMIN_TOKEN=apply-migration-admin-token` is in your `.env.local`

### Agents still showing "OFFLINE" after 5 minutes
1. Check the Cloudflare Worker is deployed (should be automatic)
2. Verify `CRON_SECRET` is set correctly in `.env.local`
3. Check the browser console for errors
4. Look at the server logs for API errors

### Manual SQL failed
1. Make sure you're in the correct Supabase project
2. Check that you have sufficient permissions
3. Try copying the exact SQL from the migration file (not this doc, as markdown may alter it)

---

## Files Created/Modified

- ✅ `ase/supabase/migrations/009_seed_5_new_agents.sql` - Migration file
- ✅ `ase/app/api/admin/apply-migration/route.ts` - API endpoint to apply migration
- ✅ `apply-migration.sh` - Bash script to run the migration
- ✅ `ase/.env.local` - Updated with `ADMIN_TOKEN`
- ℹ️ `MIGRATION_GUIDE.md` - This file

---

**Questions?** Check the server logs in your terminal running `npm run dev`
