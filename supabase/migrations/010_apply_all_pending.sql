-- ============================================================
-- Migration 010: Apply all pending migrations (safe to re-run)
-- ============================================================
-- Run this in Supabase SQL Editor (dashboard.supabase.com)
-- Project: frlgckqtrloqunkhbhtp
--
-- This consolidates migrations 005-009 and is safe to run
-- even if some were partially applied — uses IF NOT EXISTS everywhere.
-- ============================================================


-- ── MIGRATION 005: Agent state columns ──────────────────────
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS signal_summary  text,
  ADD COLUMN IF NOT EXISTS portfolio_json  text,
  ADD COLUMN IF NOT EXISTS last_run_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_agents_last_run_at
  ON public.agents(last_run_at DESC);


-- ── MIGRATION 006: Capital tracking & RPC functions ─────────
CREATE OR REPLACE FUNCTION public.increment_agent_aum(p_agent_id uuid, p_amount bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.agents
  SET total_aum_cents = COALESCE(total_aum_cents, 0) + p_amount
  WHERE id = p_agent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_agent_aum(p_agent_id uuid, p_amount bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.agents
  SET total_aum_cents = GREATEST(0, COALESCE(total_aum_cents, 0) - p_amount)
  WHERE id = p_agent_id;
END;
$$;

ALTER TABLE public.agent_stats
  ADD COLUMN IF NOT EXISTS sortino_ratio         numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_return_pct      numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS portfolio_value_cents bigint  DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_agent_trades_agent_symbol
  ON public.agent_trades(agent_id, symbol, filled_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_trades_agent_side
  ON public.agent_trades(agent_id, side);

CREATE INDEX IF NOT EXISTS idx_agent_stats_agent_time
  ON public.agent_stats(agent_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_holdings_agent_status
  ON public.holdings(agent_id, status);

CREATE INDEX IF NOT EXISTS idx_holdings_user_status
  ON public.holdings(user_id, status);


-- ── MIGRATION 007: exit_reason on agent_trades ──────────────
ALTER TABLE public.agent_trades
  ADD COLUMN IF NOT EXISTS exit_reason text;

CREATE INDEX IF NOT EXISTS idx_agent_trades_exit_reason
  ON public.agent_trades(agent_id, exit_reason)
  WHERE exit_reason IS NOT NULL;


-- ── MIGRATION 008: Waitlist tables ──────────────────────────
CREATE TABLE IF NOT EXISTS public.waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist(email);


-- ── MIGRATION 009: last_error column + seed 5 new agents ────
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_agents_last_error
  ON public.agents(last_error)
  WHERE last_error IS NOT NULL;

-- Seed 5 new trading agents (skip if they already exist)
INSERT INTO public.agents (slug, name, ticker, description, strategy_type, asset_class, status, share_price_cents, total_shares, total_aum_cents)
VALUES
  (
    'btc-eth-pairs',
    'BTC/ETH Pair Trading',
    'BEPV',
    'Correlation arbitrage using 60-day rolling correlation and z-score of BTC/ETH spread ratio. Exploits mean reversion in pair dynamics.',
    'crypto_momentum', 'crypto', 'active', 10000, 100000, 0
  ),
  (
    'vol-harvester',
    'Crypto Volatility Harvester',
    'VOLH',
    'Sells volatility premium by buying high-volatility selloffs and selling into volatility crushes. Uses 20-period realized vs implied vol.',
    'crypto_momentum', 'crypto', 'active', 10000, 100000, 0
  ),
  (
    'momentum-carry',
    'Crypto Momentum Carry',
    'MCAR',
    'Multi-asset momentum with inverse-volatility weighting across BTC, ETH, SOL, and top DeFi tokens. Adds funding rate carry overlay.',
    'crypto_momentum', 'crypto', 'active', 10000, 100000, 0
  ),
  (
    'cascade-detect',
    'Liquidation Cascade Detector',
    'LCAS',
    'Buy-the-dip strategy detecting liquidation cascades through volume spike detection (>4% drop in 4 hours with volume >3x mean).',
    'crypto_momentum', 'crypto', 'active', 10000, 100000, 0
  ),
  (
    'defi-yield',
    'DeFi Yield Momentum',
    'DYLD',
    'Detects momentum divergence in DeFi tokens outperforming BTC. Rotates into top 5 DeFi performers with weekly rebalance.',
    'crypto_momentum', 'crypto', 'active', 10000, 100000, 0
  )
ON CONFLICT (slug) DO NOTHING;


-- ── VERIFY: Count active agents (should be 10) ──────────────
SELECT slug, name, ticker, status FROM public.agents WHERE status = 'active' ORDER BY created_at;
