-- ══════════════════════════════════════════════════════════════
-- 014: Subscriptions — bot subscription model (safe migration)
-- Run in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════

-- 0. Make sure agents table exists first
-- This migration assumes:
--   agents.id is uuid primary key
--   auth.users(id) exists (Supabase auth)

-- 1. Create subscriptions table if it does not exist
CREATE TABLE IF NOT EXISTS subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address text,
  status         text NOT NULL DEFAULT 'active',   -- active | cancelled | expired
  plan           text NOT NULL DEFAULT 'beta',     -- beta | monthly | annual
  started_at     timestamptz NOT NULL DEFAULT now(),
  ends_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 2. Add missing columns for older existing tables
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS agent_id uuid;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS wallet_address text;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'beta';

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- 3. Add FK only if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_agent_id_fkey'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. If you already have old rows with null agent_id, fix or remove them before making NOT NULL
-- You can inspect them first:
-- SELECT * FROM subscriptions WHERE agent_id IS NULL;

-- If there should be no old rows, you can delete them:
-- DELETE FROM subscriptions WHERE agent_id IS NULL;

-- Only run this once nulls are resolved:
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'subscriptions'
      AND column_name = 'agent_id'
      AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM subscriptions WHERE agent_id IS NULL
  ) THEN
    ALTER TABLE subscriptions
      ALTER COLUMN agent_id SET NOT NULL;
  END IF;
END $$;

-- 5. Unique constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_user_id_agent_id_key'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_user_id_agent_id_key
      UNIQUE (user_id, agent_id);
  END IF;
END $$;

-- 6. Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- 7. Recreate policy safely
DROP POLICY IF EXISTS "users_own_subscriptions" ON subscriptions;

CREATE POLICY "users_own_subscriptions"
  ON subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. Indexes
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON subscriptions(user_id);

CREATE INDEX IF NOT EXISTS subscriptions_agent_id_idx
  ON subscriptions(agent_id);

-- 9. Add columns to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS monthly_fee_cents int NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS subscriber_count int NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS backtest_stats jsonb;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS primary_symbol text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS backtest_strategy text;

-- 10. Subscriber count trigger function
CREATE OR REPLACE FUNCTION update_subscriber_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_agent_id uuid;
BEGIN
  target_agent_id := COALESCE(NEW.agent_id, OLD.agent_id);

  UPDATE agents
  SET subscriber_count = (
    SELECT COUNT(*)
    FROM subscriptions
    WHERE agent_id = target_agent_id
      AND status = 'active'
  )
  WHERE id = target_agent_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriber_count ON subscriptions;

CREATE TRIGGER trg_subscriber_count
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriber_count();

-- 11. Seed primary symbols + strategies for existing agents
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'momentum_crossover' WHERE slug = 'btc-momentum';
UPDATE agents SET primary_symbol = 'ETH-USD',  backtest_strategy = 'mean_reversion'      WHERE slug = 'eth-mean-revert';
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'momentum_crossover'  WHERE slug = 'crypto-trend';
UPDATE agents SET primary_symbol = 'SOL-USD',  backtest_strategy = 'volatility_breakout' WHERE slug = 'sol-breakout';
UPDATE agents SET primary_symbol = 'LINK-USD', backtest_strategy = 'momentum_crossover'  WHERE slug = 'defi-basket';
UPDATE agents SET primary_symbol = 'ETH-USD',  backtest_strategy = 'mean_reversion'      WHERE slug = 'btc-eth-pairs';
UPDATE agents SET primary_symbol = 'ETH-USD',  backtest_strategy = 'rsi_trend_filter'    WHERE slug = 'vol-harvester';
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'momentum_crossover'  WHERE slug = 'momentum-carry';
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'rsi_trend_filter'    WHERE slug = 'cascade-detect';
UPDATE agents SET primary_symbol = 'LINK-USD', backtest_strategy = 'rsi_trend_filter'    WHERE slug = 'defi-yield';