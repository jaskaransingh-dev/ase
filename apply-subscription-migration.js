import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function applyMigration() {
  console.log('Applying subscription migration...')
  
  const migration = `
-- ══════════════════════════════════════════════════════════════
-- 014: Subscriptions — bot subscription model
-- ══════════════════════════════════════════════════════════════

-- 1. Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id      uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  wallet_address text,
  status        text NOT NULL DEFAULT 'active',
  plan          text NOT NULL DEFAULT 'beta',
  started_at    timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_subscriptions"
  ON subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_agent_id_idx ON subscriptions(agent_id);

-- 2. Add columns to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS monthly_fee_cents   int  NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS subscriber_count    int  NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS backtest_stats      jsonb;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS primary_symbol      text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS backtest_strategy   text;

-- 3. Update subscriber_count trigger
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

DROP TRIGGER IF EXISTS trg_subscriber_count ON subscriptions;
CREATE TRIGGER trg_subscriber_count
  AFTER INSERT OR UPDATE OR DELETE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscriber_count();

-- 4. Seed primary symbols + strategies for existing agents
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'momentum_crossover'  WHERE slug = 'btc-momentum';
UPDATE agents SET primary_symbol = 'ETH-USD',  backtest_strategy = 'mean_reversion'       WHERE slug = 'eth-mean-revert';
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'momentum_crossover'   WHERE slug = 'crypto-trend';
UPDATE agents SET primary_symbol = 'SOL-USD',  backtest_strategy = 'volatility_breakout'  WHERE slug = 'sol-breakout';
UPDATE agents SET primary_symbol = 'LINK-USD', backtest_strategy = 'momentum_crossover'   WHERE slug = 'defi-basket';
UPDATE agents SET primary_symbol = 'ETH-USD',  backtest_strategy = 'mean_reversion'       WHERE slug = 'btc-eth-pairs';
UPDATE agents SET primary_symbol = 'ETH-USD',  backtest_strategy = 'rsi_trend_filter'     WHERE slug = 'vol-harvester';
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'momentum_crossover'   WHERE slug = 'momentum-carry';
UPDATE agents SET primary_symbol = 'BTC-USD',  backtest_strategy = 'rsi_trend_filter'     WHERE slug = 'cascade-detect';
UPDATE agents SET primary_symbol = 'LINK-USD', backtest_strategy = 'rsi_trend_filter'     WHERE slug = 'defi-yield';
`

  try {
    const { error } = await supabase.rpc('exec_sql', { sql: migration })
    if (error) {
      console.error('Migration failed:', error)
      process.exit(1)
    }
    console.log('Migration applied successfully!')
  } catch (err) {
    console.error('Error applying migration:', err)
    process.exit(1)
  }
}

applyMigration()
