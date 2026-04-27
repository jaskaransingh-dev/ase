# ASE Agent Publishing & Trading Guide

## Overview

ASE (Algorithmic Strategy Exchange) allows users to create, publish, and invest in autonomous trading agents. This document covers how to publish agents and how they trade.

## Publishing an Agent

### Via the Submit Page

1. Navigate to `/agents/submit`
2. Fill in the agent details:
   - **Name**: Agent name (e.g., "BTC Momentum Alpha")
   - **Slug**: URL-friendly identifier (auto-generated from name)
   - **Ticker**: Trading symbol (auto-generated, e.g., "BTCM")
   - **Description**: What the agent does
   - **Strategy Type**: e.g., "crypto_momentum", "crypto_mean_reversion"
   - **Primary Symbol**: Trading pair (e.g., "BTC-USD")
   - **Backtest Strategy**: Strategy logic to use
   - **Asset Class**: "crypto" or "equity"
   - **Publish**: Check to publish immediately (auto-approved)

3. Click "Create Agent"

### Via API

```bash
POST /api/agents
{
  "name": "My Trading Agent",
  "description": "Momentum strategy on BTC",
  "strategy_type": "crypto_momentum",
  "primary_symbol": "BTC-USD",
  "asset_class": "crypto",
  "publish": true
}
```

**Response:**
```json
{
  "ok": true,
  "agent": { "id": "...", "slug": "my-trading-agent", "status": "active" },
  "published": true
}
```

### Auto-Approval

All agents are automatically approved and set to `status = 'active'` when published. No backtest validation is required (for now).

## Agent Trading

### How Trading Works

Agents run automatically via a cron job (`/api/cron/run-agents`):

1. **Cron Job**: Runs every minute via Cloudflare Workers
2. **Strategy Execution**: Each agent runs its strategy logic
3. **Trade Distribution**: Trades are distributed to user accounts proportionally

### Built-in Strategies

The following strategies are built-in for seeded agents:
- `btc-momentum` - BTC Momentum Alpha
- `eth-mean-revert` - ETH Statistical Arbitrage
- `crypto-trend` - Multi-Asset Trend System
- `sol-breakout` - SOL Volatility Breakout
- `defi-basket` - DeFi Smart Beta Rotation
- `btc-eth-pairs` - BTC/ETH Pair Trading
- `vol-harvester` - Crypto Volatility Harvester
- `momentum-carry` - Crypto Momentum Carry

### Custom Agents

For agents not in the built-in list, a **generic crypto momentum** strategy is used as fallback:
- Uses 8/21/50 EMA crossover
- RSI confirmation (30-70 range)
- ATR-based stop loss
- 25% max position size
- 2% risk per trade

### Trading Capital

Each agent trades with:
- **Seed Capital**: $10,000 (platform-funded)
- **Investor Capital**: User investments add to trading capacity
- **Total** = Seed + Investor AUM

### Trade Distribution

When an agent executes a trade (BUY/SELL):
1. Trade is logged to `agent_trades`
2. For each user with holdings in that agent, the trade is proportionally distributed
3. User's Kraken account receives the corresponding position

## Investing in Agents

### Prerequisites

1. Connect Kraken account at `/dashboard/connect/kraken`
2. Fund Kraken account with USD

### Subscribe via UI

1. Go to `/agents` - browse available agents
2. Click an agent to view details
3. Click "Invest" and enter amount
4. Minimum: $10

### Subscribe via API

```bash
POST /api/subscribe
{
  "agent_id": "agent-uuid",
  "amount_cents": 10000  # $100
}
```

### Selling/Holding

- View holdings at `/dashboard/activity`
- Agent NAV updates daily based on trading P&L
- Sell through `/api/holdings/sell`

## Cron Setup

### Cloudflare Workers (Recommended)

1. Deploy the cron worker:
```bash
cd workers/ase-cron
npm install
wrangler deploy
```

2. Configure secrets:
```bash
wrangler secret put PAGES_FUNCTION_URL
# Enter: https://your-site.com/api/cron/run-agents

wrangler secret put CRON_SECRET
# Enter: your-secret-value
```

3. The worker runs every minute by default (configurable in `wrangler.toml`)

### Manual Trigger

```bash
curl -X POST https://your-site.com/api/cron/run-agents \
  -H "x-cron-secret: your-secret"
```

## Agent Status Values

| Status | Meaning |
|--------|---------|
| `active` | Trading, available on exchange |
| `paused` | Paused by owner, not trading |
| `pending_review` | Awaiting approval (future use) |

## Key Tables

- `agents` - Agent definitions and configuration
- `agent_trades` - All trades executed by agents
- `agent_stats` - Daily NAV and performance stats
- `holdings` - User investments in agents
- `subscriptions` - User subscriptions to agents

## Troubleshooting

### Agent not trading?
1. Check status is `active`: `SELECT status FROM agents WHERE slug = 'your-agent'`
2. Check last run: `SELECT last_run_at, last_error FROM agents WHERE slug = 'your-agent'`
3. Check cron is running: Review Cloudflare Worker logs
4. Check strategy mapping: Built-in agents need exact slug match

### Can't invest?
1. Ensure Kraken account is connected
2. Ensure Kraken account has sufficient balance
3. Check agent isn't at max AUM capacity

### Agent appears on exchange but no trades?
- Custom agents use generic momentum which only trades on EMA crossover signals
- May need to wait for signal conditions to align