-- ============================================================
-- ASE Trading Engine Fixes
-- Run this in Supabase SQL Editor after existing migrations
-- ============================================================

-- ── FIX agent_stats: add missing columns ──────────────────────────────────

-- Remove the generated always bid/ask columns (they conflict with inserts)
-- We'll compute bid/ask in application code instead
ALTER TABLE agent_stats DROP COLUMN IF EXISTS bid_cents;
ALTER TABLE agent_stats DROP COLUMN IF EXISTS ask_cents;

-- Add the plain bid/ask columns
ALTER TABLE agent_stats ADD COLUMN IF NOT EXISTS bid_cents bigint;
ALTER TABLE agent_stats ADD COLUMN IF NOT EXISTS ask_cents bigint;

-- Add daily_return_pct if missing
ALTER TABLE agent_stats ADD COLUMN IF NOT EXISTS daily_return_pct numeric DEFAULT 0;

-- Add portfolio_value_cents if missing
ALTER TABLE agent_stats ADD COLUMN IF NOT EXISTS portfolio_value_cents bigint DEFAULT 0;

-- Rename totalTrades → total_trades (it's already snake_case in schema.sql but make sure)
-- (already total_trades in schema — no action needed)

-- Add volume_shares if not exists (some versions may have it)
ALTER TABLE agent_stats ADD COLUMN IF NOT EXISTS volume_shares numeric DEFAULT 0;

-- ── FIX agents table: add updated_at ─────────────────────────────────────
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ── FIX price_ticks: ensure correct column names ─────────────────────────
-- The 001 migration created: tick_at, price_cents, bid_cents, ask_cents, volume
-- Make sure volume column exists (not volume_shares)
ALTER TABLE price_ticks ADD COLUMN IF NOT EXISTS volume numeric DEFAULT 0;

-- ── FIX agent_trades: add index for fast position lookups ────────────────
CREATE INDEX IF NOT EXISTS agent_trades_agent_symbol
  ON agent_trades(agent_id, symbol, side, filled_at DESC);

CREATE INDEX IF NOT EXISTS agent_trades_agent_pnl
  ON agent_trades(agent_id, pnl_cents)
  WHERE pnl_cents IS NOT NULL;

-- ── Ensure agents have correct initial share price ───────────────────────
UPDATE agents
SET share_price_cents = 10000
WHERE share_price_cents IS NULL OR share_price_cents = 0;

-- ── Seed fresh agent_stats rows for today if missing ─────────────────────
INSERT INTO agent_stats (
  agent_id, snapshot_at, nav_cents, bid_cents, ask_cents,
  total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct,
  total_trades, daily_return_pct, portfolio_value_cents, volume_shares
)
SELECT
  id,
  now(),
  10000,    -- $100.00 starting NAV
  9985,     -- bid
  10015,    -- ask
  0, 0, 0, 0, 0, 0,
  1000000,  -- $10,000 initial portfolio
  0
FROM agents
WHERE status = 'active'
  AND id NOT IN (
    SELECT DISTINCT agent_id FROM agent_stats
    WHERE snapshot_at > now() - interval '1 hour'
  )
ON CONFLICT DO NOTHING;

-- ── Allow service role to insert into agent_stats ────────────────────────
-- (service role bypasses RLS, but add explicit policy for safety)
DROP POLICY IF EXISTS "Service role can write agent_stats" ON agent_stats;
CREATE POLICY "Service role can write agent_stats"
  ON agent_stats FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can write agent_trades" ON agent_trades;
CREATE POLICY "Service role can write agent_trades"
  ON agent_trades FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can write price_ticks" ON price_ticks;
CREATE POLICY "price_ticks public write"
  ON price_ticks FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update agents" ON agents;
CREATE POLICY "agents full access"
  ON agents FOR ALL
  USING (true)
  WITH CHECK (true);
