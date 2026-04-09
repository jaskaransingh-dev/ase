-- Fixed agent_backtest_history table migration
-- Run this in Supabase SQL Editor

-- Create agent_backtest_history table for storing multi-period backtest results
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

-- Enable RLS
ALTER TABLE agent_backtest_history ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist, then create them
DROP POLICY IF EXISTS "agent_backtest_history_public_read" ON agent_backtest_history;
DROP POLICY IF EXISTS "agent_backtest_history_service_write" ON agent_backtest_history;
DROP POLICY IF EXISTS "agent_backtest_history_service_update" ON agent_backtest_history;
DROP POLICY IF EXISTS "agent_backtest_history_service_delete" ON agent_backtest_history;

-- Create policy - public read access for agent performance data
CREATE POLICY "agent_backtest_history_public_read" ON agent_backtest_history
  FOR SELECT USING (true);

-- Create policy - only service role can write
CREATE POLICY "agent_backtest_history_service_write" ON agent_backtest_history
  FOR INSERT WITH CHECK (false);
  
CREATE POLICY "agent_backtest_history_service_update" ON agent_backtest_history
  FOR UPDATE WITH CHECK (false);
  
CREATE POLICY "agent_backtest_history_service_delete" ON agent_backtest_history
  FOR DELETE WITH CHECK (false);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS agent_backtest_history_agent_id_idx ON agent_backtest_history(agent_id);
CREATE INDEX IF NOT EXISTS agent_backtest_history_period_idx ON agent_backtest_history(period);
CREATE INDEX IF NOT EXISTS agent_backtest_history_computed_at_idx ON agent_backtest_history(computed_at);
CREATE INDEX IF NOT EXISTS agent_backtest_history_agent_period_idx ON agent_backtest_history(agent_id, period);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_agent_backtest_history_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_agent_backtest_history_updated_at ON agent_backtest_history;
CREATE TRIGGER update_agent_backtest_history_updated_at
  BEFORE UPDATE ON agent_backtest_history
  FOR EACH ROW EXECUTE FUNCTION update_agent_backtest_history_updated_at();

-- Create view for easy access to latest backtest results
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
