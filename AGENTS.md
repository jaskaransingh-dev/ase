<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# ASE Platform — Agent Instructions

## Architecture Overview

ASE (Algorithmic Strategy Exchange) is an all-in-one platform for developing, backtesting, deploying, and subscribing to autonomous trading agents.

**Stack:** Next.js App Router, TypeScript, Supabase (auth + DB), Kraken (broker), Recharts, Tailwind.

## Key Files

| File | Purpose |
|------|---------|
| `lib/backtest.ts` | Core backtesting engine (10 strategies, Monte Carlo, walk-forward, scorecard) |
| `lib/backtest-config.ts` | UI config, strategy templates, data API catalog, default files |
| `lib/multi-asset-backtest.ts` | Multi-asset portfolio backtester |
| `lib/agents.ts` | 18 agent configs + live trading strategies |
| `lib/nav-config.ts` | Sidebar navigation (live — edit this to change sidebar) |
| `lib/ai-context.ts` | AI assistant context system |
| `lib/quant/backtester.ts` | 9-layer institutional quant pipeline |
| `components/dashboard/DashboardShell.tsx` | Main layout with sidebar/header/status bar |
| `components/dashboard/ChangeHighlight.tsx` | Apply Changes UI + change tracking |
| `app/dashboard/backtest/page.tsx` | Backtest Studio (4 tabs: Overview, Compare, Robustness, Agents) |
| `app/dashboard/geo/page.tsx` | Geospatial explorer (layers, drill-down, upload) |
| `app/dashboard/quant/page.tsx` | Quant Lab IDE |

## Navigation Config

Sidebar is defined in `lib/nav-config.ts`. Edit `NAV_CONFIG` to add/remove/reorder sections. The `DashboardShell` reads this config dynamically.

## AI Context System

`lib/ai-context.ts` provides `AI_CONTEXT` and `getContextForPrompt()`. This gives the AI assistant knowledge of:
- Platform description and features
- All backtest strategies and their types
- Risk controls and fee structures
- Quant research methodology notes
- Security notes about what not to reveal
- File descriptions for the entire codebase

When building AI features, import `getContextForPrompt(userMessage)` to get relevant context.

## Backtesting Security

**Never expose:** strategy source code, internal signal calculations, scorecard formula weights, agent position sizes, or live trading logic to the client side.

**Safe to expose:** performance metrics (Sharpe, return, drawdown), grade letters (A+ through F), strategy descriptions, and comparison data.

## Agent Trading

Agents run via Cloudflare Workers cron (~every minute). Each agent has its own paper trading capital tracked in `agent_trades` table. Over 6 months, conservative agents should produce ~200 trades (roughly 1 trade per day average), while more active agents may produce more.

## Change Tracking / Apply Changes

Use `components/dashboard/ChangeHighlight.tsx`:
- `ApplyChangesBar` — Fixed bottom bar showing pending changes with "Apply All" / "Reject All"
- `ChangeHighlight` — Side-by-side diff view with syntax highlighting
- `useChangeTracker()` — Hook for managing change state

## Code Style

- **No comments** unless explicitly asked
- Inline styles (not Tailwind classes) for dashboard components
- Use `var(--font-mono)` for monospace, `var(--mint)`, `var(--blue)`, `var(--border)` etc. for theme colors
- All prices in cents (integer math), display in dollars
- Use `createClient()` from `@/lib/supabase/client` for client-side, `createClient()` from `@/lib/supabase/server` for server-side

## Agent Cron Setup

### Cloudflare Workers Cron Job

Agents run automatically every minute via a Cloudflare Worker.

### Setup

1. **Deploy the worker:**
```bash
cd workers/ase-cron
npm install
wrangler deploy
```

2. **Configure secrets:**
```bash
wrangler secret put PAGES_FUNCTION_URL
# Enter: https://your-pages-site.com/api/cron/run-agents

wrangler secret put CRON_SECRET
# Enter: 9f3c2b7a1e8d4c6f0a2b9e7d1c4f8a6b
```

3. **Verify it's working:**
Check Cloudflare Dashboard > Workers > ase-cron > Logs

### Files

- `workers/ase-cron/wrangler.toml` - Worker config with cron schedule
- `workers/ase-cron/src/index.ts` - Cron handler
