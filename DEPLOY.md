# ASE Deployment Guide

## Architecture

```
Vercel (launchase.com)       <- Next.js app + API routes
        <- POST /api/cron/run-agents
Supabase                     <- database + auth
        <-
Cloudflare Worker (ase-cron) <- runs every minute
```

---

## One-time Setup

### 1. Environment variables

Create `.env.local` with your values:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Kraken API (for live trading)
KRAKEN_CLIENT_ID=your-kraken-client-id
KRAKEN_CLIENT_SECRET=your-kraken-client-secret

# Cron auth
CRON_SECRET=your-secure-random-string

# AI
GEMINI_API_KEY=your-gemini-key
```

### 2. Deploy to Vercel

```bash
# Connect GitHub repo in Vercel dashboard
# or deploy from CLI:
npm i -g vercel
vercel --prod
```

Environment variables set in Vercel Dashboard -> Settings -> Environment Variables.

### 3. Deploy the cron worker (Cloudflare)

```bash
cd workers/ase-cron
npm install

# Set secrets (only needed once)
wrangler secret put PAGES_FUNCTION_URL
# -> Enter: https://launchase.com/api/cron/run-agents

wrangler secret put CRON_SECRET
# -> Enter: your-secure-random-string

# Deploy
wrangler deploy
```

The worker fires every minute. Check Cloudflare Dashboard -> Workers -> ase-cron -> Logs.

---

## How Cron + Agents Work

1. Cloudflare Worker POSTs to `https://launchase.com/api/cron/run-agents` every minute
2. Route reads all active agents from Supabase
3. Each agent strategy runs, generates BUY/SELL signals
4. Trades are distributed to user Kraken accounts proportionally
5. NAV is recalculated and stored in Supabase

---

## Local Development

```bash
npm install
npm run dev          # starts localhost:3000
```

To trigger cron manually:

```bash
curl -X POST http://localhost:3000/api/cron/run-agents \
  -H "x-cron-secret: your-secure-random-string" \
  -H "Content-Type: application/json"
```

---

## User Investment Flow

1. User connects Kraken API keys at `/dashboard/connect/kraken`
2. User visits `/agents/[slug]` and clicks Allocate Funds
3. POST /api/subscribe verifies Kraken keys, creates holding
4. Cron executes proportional buy on user's Kraken account
5. Holdings update every cron tick via NAV recalc

---

## Monitoring

| What | Where |
|------|-------|
| Cron logs | Cloudflare -> Workers -> ase-cron -> Logs |
| Vercel logs | Vercel Dashboard -> Deployment -> Functions |
| Agent trades | Supabase -> agent_trades |
| User trades | Supabase -> user_trades |
| Holdings | Supabase -> holdings |