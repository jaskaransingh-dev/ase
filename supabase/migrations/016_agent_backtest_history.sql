-- ══════════════════════════════════════════════════════════════
-- 016: Agent Backtest History — safe rerunnable migration
-- Run in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════

-- 1. Create table if missing
CREATE TABLE IF NOT EXISTS agent_backtest_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  period text NOT NULL, -- '1y', '2y', '5y', etc.
  symbol text NOT NULL,
  strategy text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),

  -- Backtest statistics (JSON)
  stats jsonb NOT NULL,

  -- Buy and hold comparison
  buy_hold_return_pct numeric NOT NULL,

  -- Downsampled equity curves for charts
  equity_curve jsonb,
  buy_hold_curve jsonb,

  -- Constraints
  UNIQUE(agent_id, period),

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE agent_backtest_history ENABLE ROW LEVEL SECURITY;

-- 3. Recreate policies safely
DROP POLICY IF EXISTS "agent_backtest_history_public_read" ON agent_backtest_history;
DROP POLICY IF EXISTS "agent_backtest_history_service_write" ON agent_backtest_history;
DROP POLICY IF EXISTS "agent_backtest_history_service_update" ON agent_backtest_history;
DROP POLICY IF EXISTS "agent_backtest_history_service_delete" ON agent_backtest_history;

-- Public read access
CREATE POLICY "agent_backtest_history_public_read"
ON agent_backtest_history
FOR SELECT
USING (true);

-- Nobody writes directly from client roles
CREATE POLICY "agent_backtest_history_service_write"
ON agent_backtest_history
FOR INSERT
WITH CHECK (false);

CREATE POLICY "agent_backtest_history_service_update"
ON agent_backtest_history
FOR UPDATE
USING (false)
WITH CHECK (false);

CREATE POLICY "agent_backtest_history_service_delete"
ON agent_backtest_history
FOR DELETE
USING (false);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS agent_backtest_history_agent_id_idx
  ON agent_backtest_history(agent_id);

CREATE INDEX IF NOT EXISTS agent_backtest_history_period_idx
  ON agent_backtest_history(period);

CREATE INDEX IF NOT EXISTS agent_backtest_history_computed_at_idx
  ON agent_backtest_history(computed_at);

CREATE INDEX IF NOT EXISTS agent_backtest_history_agent_period_idx
  ON agent_backtest_history(agent_id, period);

-- 5. Updated-at trigger function
CREATE OR REPLACE FUNCTION update_agent_backtest_history_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_agent_backtest_history_updated_at ON agent_backtest_history;

CREATE TRIGGER update_agent_backtest_history_updated_at
  BEFORE UPDATE ON agent_backtest_history
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_backtest_history_updated_at();

-- 6. Latest backtests view
CREATE OR REPLACE VIEW agent_latest_backtests AS
SELECT DISTINCT ON (agent_id, period)
  agent_id,
  period,
  symbol,
  strategy,
  computed_at,
  stats,
  buy_hold_return_pct,
  equity_curve,
  buy_hold_curve,
  created_at,
  updated_at
FROM agent_backtest_history
ORDER BY agent_id, period, computed_at DESC;

-- 7. Agent performance summary view
CREATE OR REPLACE VIEW agent_performance_summary AS
SELECT
  a.id as agent_id,
  a.name as agent_name,
  a.slug as agent_slug,
  a.strategy_type,
  a.status,
  a.subscriber_count,
  a.monthly_fee_cents,

  -- Latest 2y backtest results
  bt_2y.stats->>'totalReturnPct'       as total_return_2y_pct,
  bt_2y.stats->>'annualizedReturnPct'  as annualized_return_2y_pct,
  bt_2y.stats->>'sharpeRatio'          as sharpe_ratio_2y,
  bt_2y.stats->>'maxDrawdownPct'       as max_drawdown_2y_pct,
  bt_2y.stats->>'winRate'              as win_rate_2y_pct,
  bt_2y.stats->>'totalTrades'          as total_trades_2y,

  -- Latest 1y backtest results
  bt_1y.stats->>'totalReturnPct'       as total_return_1y_pct,
  bt_1y.stats->>'annualizedReturnPct'  as annualized_return_1y_pct,
  bt_1y.stats->>'sharpeRatio'          as sharpe_ratio_1y,
  bt_1y.stats->>'maxDrawdownPct'       as max_drawdown_1y_pct,
  bt_1y.stats->>'winRate'              as win_rate_1y_pct,
  bt_1y.stats->>'totalTrades'          as total_trades_1y,

  -- Latest 5y backtest results
  bt_5y.stats->>'totalReturnPct'       as total_return_5y_pct,
  bt_5y.stats->>'annualizedReturnPct'  as annualized_return_5y_pct,
  bt_5y.stats->>'sharpeRatio'          as sharpe_ratio_5y,
  bt_5y.stats->>'maxDrawdownPct'       as max_drawdown_5y_pct,
  bt_5y.stats->>'winRate'              as win_rate_5y_pct,
  bt_5y.stats->>'totalTrades'          as total_trades_5y,

  -- Latest computed timestamps
  bt_2y.computed_at as last_computed_2y,
  bt_1y.computed_at as last_computed_1y,
  bt_5y.computed_at as last_computed_5y

FROM agents a
LEFT JOIN LATERAL (
  SELECT stats, computed_at
  FROM agent_backtest_history
  WHERE agent_id = a.id AND period = '2y'
  ORDER BY computed_at DESC
  LIMIT 1
) bt_2y ON true
LEFT JOIN LATERAL (
  SELECT stats, computed_at
  FROM agent_backtest_history
  WHERE agent_id = a.id AND period = '1y'
  ORDER BY computed_at DESC
  LIMIT 1
) bt_1y ON true
LEFT JOIN LATERAL (
  SELECT stats, computed_at
  FROM agent_backtest_history
  WHERE agent_id = a.id AND period = '5y'
  ORDER BY computed_at DESC
  LIMIT 1
) bt_5y ON true
WHERE a.status = 'active';