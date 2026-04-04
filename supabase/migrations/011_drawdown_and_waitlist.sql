-- Migration 011: Drawdown tracking, waitlist extensions, agent_stats seeding
-- Safe to run multiple times (all IF NOT EXISTS / idempotent)

-- ── 1. Drawdown tracking columns on agents ────────────────────
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS peak_nav_cents    bigint DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS drawdown_pct      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alert_level       text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_active_at    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS max_aum_cents     bigint DEFAULT 100000000;

-- Initialize peak NAV from current share price
UPDATE public.agents SET peak_nav_cents = GREATEST(share_price_cents, 10000) WHERE peak_nav_cents = 10000 AND share_price_cents IS NOT NULL;

-- ── 2. Waitlist extended columns ──────────────────────────────
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS github_url text,
  ADD COLUMN IF NOT EXISTS strategy_description text,
  ADD COLUMN IF NOT EXISTS waitlist_type text DEFAULT 'investor';

-- ── 3. Seed agent_stats for agents that have no rows ──────────
INSERT INTO public.agent_stats (agent_id, nav_cents, total_return_pct, sharpe_ratio,
  max_drawdown_pct, win_rate_pct, total_trades, snapshot_at)
SELECT id, 10000, 0, 0, 0, 0, 0, now()
FROM public.agents
WHERE status = 'active'
  AND id NOT IN (SELECT DISTINCT agent_id FROM public.agent_stats WHERE agent_id IS NOT NULL);

-- ── 4. Add is_simulation flag to agent_stats ──────────────────
ALTER TABLE public.agent_stats
  ADD COLUMN IF NOT EXISTS is_simulation boolean DEFAULT false;

-- Verify
SELECT slug, status, peak_nav_cents, alert_level, max_aum_cents FROM public.agents WHERE status = 'active';
