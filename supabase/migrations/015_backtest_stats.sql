-- ══════════════════════════════════════════════════════════════
-- 015: Backtest stats storage
-- Run in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════

-- 1. Add backtest_stats JSONB to agents (stores full cached backtest result)
--    Already added in 014 as backtest_stats jsonb — this ensures it exists
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS backtest_stats jsonb;

-- 2. Add is_simulation flag to agent_stats so we can distinguish
--    backtest-derived snapshots from live NAV snapshots
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS is_simulation boolean DEFAULT false;

-- 3. Index for fast "latest real snapshot" queries
CREATE INDEX IF NOT EXISTS agent_stats_agent_snapshot_idx
  ON public.agent_stats(agent_id, snapshot_at DESC);

-- 4. Ensure all existing agents have backtest_stats set to NULL (harmless default)
-- (no-op, new column is NULL by default)
