-- ============================================================
-- Migration 007: Add exit_reason to agent_trades
-- ============================================================
-- Stores the reason a position was closed (stop loss, take profit,
-- trailing stop, circuit breaker, time stop, etc.)
-- ============================================================

ALTER TABLE public.agent_trades
  ADD COLUMN IF NOT EXISTS exit_reason text;

-- Index for filtering closed trades by exit type
CREATE INDEX IF NOT EXISTS idx_agent_trades_exit_reason
  ON public.agent_trades(agent_id, exit_reason)
  WHERE exit_reason IS NOT NULL;
