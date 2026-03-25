# ASE Trading Engine — Deployment & Cron Setup

## Overview

Agents are now **fully automated** with the Cloudflare Worker cron trigger:

- **Every 1 minute**: Execute all 5 trading strategies via `/api/cron/run-agents`
- **Every 5 minutes**: Update NAV & metrics via `/api/cron/update-nav`
- All trades logged to Supabase `agent_trades` table
- Per-agent position tracking from DB (not Alpaca positions)
- Real Alpaca paper trading with actual fills

---

## Deployment to Cloudflare Pages + Workers

### Step 1: Deploy Next.js App to Cloudflare Pages

```bash
npm run build
wrangler pages deploy dist --project-name ase
```

Or connect your GitHub repo to Pages for automatic deployments.

Once deployed, your URL will be: `https://ase.pages.dev` (or whatever project name you use)

### Step 2: Update Worker Config

Edit `workers/trading-agents/wrangler.toml`:

```toml
[vars]
# Update to your actual Cloudflare Pages domain
NEXT_PUBLIC_APP_URL = "https://ase.pages.dev"  # ← Change this to your domain
```

### Step 3: Deploy Cron Worker

The worker automatically triggers the API endpoints on schedule:

```bash
cd workers/trading-agents
wrangler deploy
```

This deploys a **separate Cloudflare Worker** that runs on cron and calls your Pages endpoints.

### Step 4: Verify in Cloudflare Dashboard

1. Go to **Cloudflare Dashboard → Workers & Pages**
2. Find your `ase` worker
3. Click **Logs** tab
4. You should see logs like:
   ```
   ⏰ Cron triggered: * * * * *
   ✅ Agents executed: 3 trades
   ✅ NAV updated for 5 agents
   ```

---

## What Changed

### Before
- Agents checked shared Alpaca account positions ❌
- All strategies shared one position view
- Manual cron triggers needed
- No actual trading happening

### Now
- **Each agent tracks its own DB positions** ✅
- Strategies check `agent_trades` table (per-agent)
- **Automated every minute** via Cloudflare Cron ✅
- Real Alpaca orders executed
- Trades logged immediately with fill prices
- Per-agent P&L calculated with FIFO matching
- NAV updates every 5 minutes

---

## Architecture

```
┌─────────────────────────────────────┐
│  Cloudflare Workers (Cron Trigger)  │  ← Runs every 1 minute
│  (workers/trading-agents/src)       │
└──────────────┬──────────────────────┘
               │
               ├─→ POST /api/cron/run-agents (every min)
               │    ├─ Run 5 strategies
               │    ├─ Check DB positions per agent
               │    ├─ Submit Alpaca orders
               │    └─ Log trades to agent_trades
               │
               └─→ POST /api/cron/update-nav (every 5 min)
                    ├─ Calculate NAV from trades
                    ├─ Update agent_stats snapshots
                    ├─ Update holdings current_value
                    └─ Update share prices

                    ↓↓↓

┌─────────────────────────────────────┐
│  Cloudflare Pages (Next.js App)     │
│  /api/cron/* endpoints              │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  Supabase PostgreSQL                │
│  - agent_trades (per-agent)         │
│  - agent_stats (NAV snapshots)      │
│  - holdings (user positions)        │
└─────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────┐
│  Alpaca Paper Trading               │
│  - BTC/USD, ETH/USD, SOL/USD, etc.  │
│  - Shared account for all agents    │
│  - Each agent tracks own fills      │
└─────────────────────────────────────┘
```

---

## Testing Before Deployment

### 1. Test Locally

```bash
npm run dev
```

Then in another terminal:

```bash
# Trigger run-agents manually
curl -X POST http://localhost:3000/api/cron/run-agents \
  -H "x-cron-secret: ase-dev-cron-2024"

# Trigger update-nav manually
curl -X POST http://localhost:3000/api/cron/update-nav \
  -H "x-cron-secret: ase-dev-cron-2024"
```

Check Supabase dashboard → `agent_trades` and `agent_stats` tables for new entries.

### 2. Check Diagnostics

```bash
curl http://localhost:3000/api/debug-trading
```

Should show:
- ✅ Alpaca account connected
- ✅ BTC/ETH/SOL bars fetching
- ✅ Agent positions from DB
- ✅ Recent trades
- ✅ NAV snapshots

### 3. Manual Cron Trigger (After Deploy)

```bash
curl -X POST https://ase-trading-cron.YOUR-ACCOUNT.workers.dev/run \
  -H "x-cron-secret: ase-dev-cron-2024"
```

---

## Migration Checklist

- [ ] SQL migration run in Supabase: `supabase/migrations/003_trading_engine_fixes.sql`
- [ ] Next.js built and deployed to Cloudflare Pages
- [ ] `workers/trading-agents/wrangler.toml` updated with correct Pages domain
- [ ] Worker deployed: `cd workers && wrangler deploy`
- [ ] First cron run verified (check logs in Cloudflare dashboard)
- [ ] Trades appearing in `agent_trades` table
- [ ] NAV updating in `agent_stats` table
- [ ] Dashboard showing live P&L and positions

---

## Environment Variables (Cloudflare)

All stored in `workers/trading-agents/wrangler.toml`:

```
NEXT_PUBLIC_APP_URL          → Your Pages domain
ALPACA_KEY_ID                → Paper trading API key
ALPACA_SECRET_KEY            → Paper trading secret
CRON_SECRET                  → Authentication for cron endpoints
SUPABASE_URL                 → DB URL
SUPABASE_SERVICE_ROLE_KEY    → DB admin key
```

---

## Troubleshooting

### Agents not trading?

1. Check cron logs: **Cloudflare Dashboard → Workers → Logs**
2. Check API endpoint: `curl https://your-domain.com/api/debug-trading`
3. Verify Alpaca credentials in `wrangler.toml`
4. Check Supabase RLS policies allow writes (migration 003 should fix this)

### Wrong domain in worker?

Edit `wrangler.toml`:
```toml
NEXT_PUBLIC_APP_URL = "https://your-actual-pages-domain.pages.dev"
```

Then redeploy:
```bash
wrangler deploy
```

### NAV not updating?

Check column names in `update-nav` response — migration 003 renames columns.
Verify: `price_ticks` uses `tick_at`, `volume` (not `snapshot_at`, `volume_shares`)

---

## Monitoring

- **Cloudflare Workers Logs**: See cron execution, errors, trade counts
- **Supabase Dashboard**: `agent_trades`, `agent_stats`, `price_ticks` tables
- **Debug Endpoint**: `https://your-domain/api/debug-trading` shows full system status

---

## Next Steps

1. Deploy to Cloudflare Pages
2. Set up cron worker
3. Let it run for 1 week to collect trade data
4. Analyze P&L in dashboard
5. Adjust strategy parameters if needed
