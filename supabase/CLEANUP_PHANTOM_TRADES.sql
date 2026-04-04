-- ============================================================
-- ASE — PHANTOM TRADE CLEANUP
-- Run this in Supabase SQL Editor to reconcile the DB with
-- what Alpaca actually holds.
--
-- BACKGROUND:
-- A bug in executeBuy/executeSell was logging trades to DB even
-- when Alpaca orders didn't fill (timeout, insufficient buying power,
-- rejected orders). This created phantom positions in the DB that
-- Alpaca never actually executed.
--
-- This script clears ALL agent_trades history and resets agent state
-- so the DB positions are clean. After running this:
--   1. Re-run the RESET_AND_FIX.sql to reseed agent stats
--   2. Let the cron run — only real Alpaca fills will be recorded going forward
-- ============================================================

BEGIN;

-- ── STEP 1: CLEAR ALL AGENT TRADE HISTORY ───────────────────
-- This removes all phantom AND real trades. The cron will rebuild
-- the DB from real Alpaca fills going forward (fill-check is now enforced).
DELETE FROM public.agent_trades;

-- ── STEP 2: CLEAR STALE AGENT STATS (will be rebuilt by cron) ─
DELETE FROM public.agent_stats;

-- ── STEP 3: RESET AGENT LIVE STATE ──────────────────────────
UPDATE public.agents
SET
  signal_summary  = 'SCANNING',
  portfolio_json  = NULL,
  last_run_at     = NULL,
  total_aum_cents = 0,
  updated_at      = now()
WHERE status = 'active';

-- ── STEP 4: CLEAR PRICE TICKS (stale data) ──────────────────
DELETE FROM public.price_ticks;

-- ── STEP 5: RESEED AGENT_STATS WITH CLEAN $10k BASELINE ─────
INSERT INTO public.agent_stats (
  agent_id, snapshot_at, nav_cents, bid_cents, ask_cents,
  total_return_pct, sharpe_ratio, sortino_ratio,
  max_drawdown_pct, win_rate_pct, total_trades,
  daily_return_pct, portfolio_value_cents, volume_shares
)
SELECT
  id,
  now(),
  10000,     -- $100.00/share NAV
  9985,
  10015,
  0, 0, 0, 0, 0, 0, 0,
  1000000,   -- $10,000 portfolio
  0
FROM public.agents
WHERE status = 'active';

-- ── STEP 6: SEED FRESH PRICE TICK BASELINE ──────────────────
INSERT INTO public.price_ticks (agent_id, tick_at, price_cents, bid_cents, ask_cents, volume)
SELECT id, now(), 10000, 9985, 10015, 0
FROM public.agents
WHERE status = 'active'
ON CONFLICT (agent_id, tick_at) DO NOTHING;

COMMIT;

-- ── VERIFY ───────────────────────────────────────────────────
SELECT 'agent_trades' AS table_name, COUNT(*) AS rows FROM public.agent_trades
UNION ALL
SELECT 'agent_stats',                COUNT(*) FROM public.agent_stats
UNION ALL
SELECT 'price_ticks',                COUNT(*) FROM public.price_ticks;

-- Expected: agent_trades = 0, agent_stats = 5, price_ticks = 5
