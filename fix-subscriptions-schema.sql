-- Fix subscriptions table schema - add missing agent_id column
-- Run this in Supabase SQL editor

-- Check if subscriptions table exists and add missing columns
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE CASCADE;

-- Ensure other required columns exist
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS wallet_address text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'beta';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Add unique constraint if it doesn't exist
ALTER TABLE subscriptions ADD CONSTRAINT IF NOT EXISTS subscriptions_user_id_agent_id_unique UNIQUE(user_id, agent_id);

-- Enable RLS if not already enabled
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Create/update policies
CREATE POLICY IF NOT EXISTS "users_own_subscriptions"
  ON subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_agent_id_idx ON subscriptions(agent_id);

-- Update agents table with missing columns if needed
ALTER TABLE agents ADD COLUMN IF NOT EXISTS monthly_fee_cents int NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS subscriber_count int NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS backtest_stats jsonb;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS primary_symbol text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS backtest_strategy text;

-- Create trigger function to update subscriber count
CREATE OR REPLACE FUNCTION update_subscriber_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'active') THEN
    UPDATE agents SET subscriber_count = (
      SELECT COUNT(*) FROM subscriptions WHERE agent_id = NEW.agent_id AND status = 'active'
    ) WHERE id = NEW.agent_id;
  ELSIF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status != 'active') THEN
    UPDATE agents SET subscriber_count = (
      SELECT COUNT(*) FROM subscriptions WHERE agent_id = COALESCE(NEW.agent_id, OLD.agent_id) AND status = 'active'
    ) WHERE id = COALESCE(NEW.agent_id, OLD.agent_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_subscriber_count ON subscriptions;
CREATE TRIGGER trg_subscriber_count
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscriber_count();

-- Update existing agents with primary symbols and strategies
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'momentum_crossover'  WHERE slug = 'btc-momentum' AND (primary_symbol IS NULL OR backtest_strategy IS NULL);
UPDATE agents SET primary_symbol = 'ETH-USD',  backtest_strategy = 'mean_reversion'       WHERE slug = 'eth-mean-revert' AND (primary_symbol IS NULL OR backtest_strategy IS NULL);
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'momentum_crossover'   WHERE slug = 'crypto-trend' AND (primary_symbol IS NULL OR backtest_strategy IS NULL);
UPDATE agents SET primary_symbol = 'SOL-USD',  backtest_strategy = 'volatility_breakout'  WHERE slug = 'sol-breakout' AND (primary_symbol IS NULL OR backtest_strategy IS NULL);
UPDATE agents SET primary_symbol = 'LINK-USD', backtest_strategy = 'momentum_crossover'   WHERE slug = 'defi-basket' AND (primary_symbol IS NULL OR backtest_strategy IS NULL);
UPDATE agents SET primary_symbol = 'ETH-USD',  backtest_strategy = 'mean_reversion'       WHERE slug = 'btc-eth-pairs' AND (primary_symbol IS NULL OR backtest_strategy IS NULL);
UPDATE agents SET primary_symbol = 'ETH-USD',  backtest_strategy = 'rsi_trend_filter'     WHERE slug = 'vol-harvester' AND (primary_symbol IS NULL OR backtest_strategy IS NULL);
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'momentum_crossover'   WHERE slug = 'momentum-carry' AND (primary_symbol IS NULL OR backtest_strategy IS NULL);
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'rsi_trend_filter'     WHERE slug = 'cascade-detect' AND (primary_symbol IS NULL OR backtest_strategy IS NULL);
UPDATE agents SET primary_symbol = 'LINK-USD', backtest_strategy = 'rsi_trend_filter'     WHERE slug = 'defi-yield' AND (primary_symbol IS NULL OR backtest_strategy IS NULL);
