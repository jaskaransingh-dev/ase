-- ============================================================
-- Migration 006: Capital Tracking & Simulation Support
-- ============================================================
-- Run this in Supabase SQL Editor to enable:
--   1. increment_agent_aum RPC (used by invest route)
--   2. Proper indexes for simulation queries
--   3. agent_trades indexes for performance
--   4. sortino_ratio + daily_return_pct columns on agent_stats
-- ============================================================

-- ── RPC: Increment agent AUM atomically ─────────────────────
CREATE OR REPLACE FUNCTION public.increment_agent_aum(p_agent_id uuid, p_amount bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.agents
  SET total_aum_cents = COALESCE(total_aum_cents, 0) + p_amount
  WHERE id = p_agent_id;
END;
$$;

-- ── RPC: Decrement agent AUM atomically ─────────────────────
CREATE OR REPLACE FUNCTION public.decrement_agent_aum(p_agent_id uuid, p_amount bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.agents
  SET total_aum_cents = GREATEST(0, COALESCE(total_aum_cents, 0) - p_amount)
  WHERE id = p_agent_id;
END;
$$;

-- ── Add columns to agent_stats if missing ───────────────────
ALTER TABLE public.agent_stats
  ADD COLUMN IF NOT EXISTS sortino_ratio numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_return_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS portfolio_value_cents bigint DEFAULT 0;

-- ── Indexes for simulation performance ──────────────────────
-- Fast lookup of agent's trades by symbol
CREATE INDEX IF NOT EXISTS idx_agent_trades_agent_symbol
  ON public.agent_trades(agent_id, symbol, filled_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_trades_agent_side
  ON public.agent_trades(agent_id, side);

-- Fast lookup of latest stats
CREATE INDEX IF NOT EXISTS idx_agent_stats_agent_time
  ON public.agent_stats(agent_id, snapshot_at DESC);

-- Fast lookup of active holdings per agent
CREATE INDEX IF NOT EXISTS idx_holdings_agent_status
  ON public.holdings(agent_id, status);

-- Fast lookup of user holdings
CREATE INDEX IF NOT EXISTS idx_holdings_user_status
  ON public.holdings(user_id, status);

-- Price ticks by agent and time
CREATE INDEX IF NOT EXISTS idx_price_ticks_agent_time
  ON public.price_ticks(agent_id, tick_at DESC);

-- ── Ensure agents table has all needed columns ──────────────
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS signal_summary text,
  ADD COLUMN IF NOT EXISTS portfolio_json text,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz;

-- ── Helper view: latest NAV per agent ───────────────────────
CREATE OR REPLACE VIEW public.agent_latest_stats AS
SELECT DISTINCT ON (agent_id)
  agent_id,
  nav_cents,
  total_return_pct,
  sharpe_ratio,
  max_drawdown_pct,
  win_rate_pct,
  total_trades,
  daily_return_pct,
  snapshot_at
FROM public.agent_stats
ORDER BY agent_id, snapshot_at DESC;

-- Grant access to the view
GRANT SELECT ON public.agent_latest_stats TO anon, authenticated, service_role;

-- ── RLS: Allow simulation engine to write agent_trades ──────
ALTER TABLE public.agent_trades ENABLE ROW LEVEL SECURITY;

-- Anyone can read agent trades (public market data)
DROP POLICY IF EXISTS "Anyone can read agent trades" ON public.agent_trades;
CREATE POLICY "Anyone can read agent trades"
  ON public.agent_trades
  FOR SELECT
  USING (true);

-- Optional: explicit insert policy
-- Note: service_role already bypasses RLS, so this is not strictly required
DROP POLICY IF EXISTS "Service role can write agent trades" ON public.agent_trades;
CREATE POLICY "Service role can write agent trades"
  ON public.agent_trades
  FOR INSERT
  WITH CHECK (true);