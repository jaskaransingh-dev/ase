# ASE Deployment Guide

## Architecture

```
Cloudflare Worker (ase-cron)        ← runs every minute
        ↓ POST /api/cron/run-agents
Cloudflare Pages (launchase.com)    ← Next.js app
        ↓ reads/writes
Supabase                            ← database + auth
        ↑
Local dev (localhost:3000)          ← same Supabase DB
```

Both local dev and production share **one Supabase project** — all trades, holdings, and agent state are always in sync.

---

## One-time Setup

### 1. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Kraken (used for live trading on user accounts)
ALPACA_KEY_ID=       # legacy name — now holds Kraken API key
ALPACA_SECRET_KEY=   # legacy name — now holds Kraken API secret

# Cron auth (any random secret, must match Cloudflare Worker)
CRON_SECRET=9f3c2b7a1e8d4c6f0a2b9e7d1c4f8a6b
```

### 2. Deploy Next.js to Cloudflare Pages

```bash
npm run build
wrangler pages deploy .next --project-name ase
```

**Note:** The free Cloudflare Pages tier doesn't support dynamic API routes (Next.js server functions exceed the 3MB Worker limit). For full functionality with API routes, you need a paid plan ($5/mo) or deploy just the static site.

Or connect GitHub repo to Cloudflare Pages dashboard — auto-deploys on push to `main`.

### 3. Deploy the cron worker

```bash
cd workers/ase-cron
npm install

# Set secrets (only needed once)
wrangler secret put PAGES_FUNCTION_URL
# → Enter: https://launchase.com/api/cron/run-agents

wrangler secret put CRON_SECRET
# → Enter: 9f3c2b7a1e8d4c6f0a2b9e7d1c4f8a6b

# Deploy
wrangler deploy
```

The worker fires every minute. Check **Cloudflare Dashboard → Workers → ase-cron → Logs** to confirm.

---

## How Cron + Agents Work

1. Cloudflare Worker POSTs to `https://launchase.com/api/cron/run-agents` every minute
2. The route reads **all active agents** from Supabase (crypto + equity)
3. Each agent's strategy runs, generates BUY/SELL signals
4. Trades are distributed proportionally to all users with holdings in that agent
5. Agent NAV is recalculated from holdings + realized/unrealized P&L
6. `agents.share_price_cents`, `holdings.current_value_cents` updated in Supabase

**The cron only runs in Cloudflare — never locally.** Local dev reads the same Supabase, so you see live data from production trades.

---

## Local Development

```bash
npm install
npm run dev          # starts on localhost:3000
```

To trigger a cron run manually against your local server:

```bash
curl -X POST http://localhost:3000/api/cron/run-agents \
  -H "x-cron-secret: 9f3c2b7a1e8d4c6f0a2b9e7d1c4f8a6b" \
  -H "Content-Type: application/json"
```

To trigger for a specific agent:

```bash
curl -X POST http://localhost:3000/api/cron/run-agents \
  -H "x-cron-secret: 9f3c2b7a1e8d4c6f0a2b9e7d1c4f8a6b" \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "YOUR_AGENT_UUID"}'
```

---

## Seeding Agents

If no agents exist in Supabase, the cron auto-seeds them from `lib/agents.ts:AGENT_CONFIGS`. This happens on the first cron run. You can also trigger it manually with the curl command above.

Verify agents exist:

```bash
# Supabase SQL Editor
SELECT slug, status, asset_class, total_aum_cents FROM agents ORDER BY created_at;
```

---

## User Investment Flow

1. User connects Kraken API keys at `/dashboard/connect/kraken`
2. User visits `/agents/[slug]` and clicks **Allocate Funds**
3. `POST /api/subscribe` verifies Kraken keys + balance, creates holding
4. Next cron tick executes a proportional buy on user's Kraken account
5. `holdings.current_value_cents` updates every cron tick via NAV recalc

---

## Monitoring

| What | Where |
|------|-------|
| Cron logs | Cloudflare Dashboard → Workers → ase-cron → Logs |
| API logs | Cloudflare Pages → Functions → Logs |
| Agent trades | Supabase → `agent_trades` table |
| User trades | Supabase → `user_trades` table |
| Holdings | Supabase → `holdings` table |
| NAV history | Supabase → `agent_stats` table |
