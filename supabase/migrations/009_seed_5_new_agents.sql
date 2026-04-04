-- ============================================================
-- Migration 009: Add last_error column and seed 5 new agents
-- ============================================================
-- This migration adds support for agent error tracking and seeds
-- 5 new sophisticated trading strategies (for a total of 10).
--
-- New agents:
--   - btc-eth-pairs: Correlation arbitrage between BTC and ETH
--   - vol-harvester: Volatility premium selling strategy
--   - momentum-carry: Multi-asset momentum with carry overlay
--   - cascade-detect: Liquidation cascade detection strategy
--   - defi-yield: DeFi token momentum divergence detector
-- ============================================================

-- ── ADD LAST_ERROR COLUMN FOR ERROR TRACKING ────────────────
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS last_error text;

-- ── SEED 5 NEW SOPHISTICATED TRADING AGENTS ─────────────────
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

-- ── INDEX: Fast error lookup ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agents_last_error
  ON public.agents(last_error)
  WHERE last_error IS NOT NULL;
