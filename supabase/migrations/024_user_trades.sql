-- User Trades Table
-- Tracks individual user trades executed on their broker accounts

CREATE TABLE IF NOT EXISTS user_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  alpaca_order_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  qty NUMERIC,
  fill_price NUMERIC,
  filled_at TIMESTAMPTZ,
  pnl_cents BIGINT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_trades_user ON user_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_user_trades_user_agent ON user_trades(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_user_trades_symbol ON user_trades(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_user_trades_filled ON user_trades(user_id, filled_at DESC);

-- RLS
ALTER TABLE user_trades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own user_trades" ON user_trades;
CREATE POLICY "Users can read own user_trades" ON user_trades FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can write user_trades" ON user_trades;
CREATE POLICY "Service role can write user_trades" ON user_trades FOR ALL USING (true);

-- User Positions View (current open positions per user)
CREATE OR REPLACE VIEW user_positions AS
SELECT 
  ut.user_id,
  ut.agent_id,
  ut.symbol,
  SUM(CASE WHEN ut.side = 'buy' THEN ut.qty ELSE -ut.qty END) as qty,
  AVG(CASE WHEN ut.side = 'buy' THEN ut.fill_price END) as avg_entry,
  MIN(ut.filled_at) as first_entry_at,
  MAX(ut.filled_at) as last_entry_at
FROM user_trades ut
WHERE ut.filled_at IS NOT NULL
GROUP BY ut.user_id, ut.agent_id, ut.symbol
HAVING SUM(CASE WHEN ut.side = 'buy' THEN ut.qty ELSE -ut.qty END) > 0;