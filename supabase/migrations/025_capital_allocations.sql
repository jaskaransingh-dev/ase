-- Capital Allocations Table
-- Tracks reserved capital allocations for agent investments
-- Ensures capital stays locked in Alpaca accounts until positions are closed

CREATE TABLE IF NOT EXISTS capital_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  amount_cents BIGINT NOT NULL,
  alpaca_account_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'deployed', 'released', 'cancelled')),
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_capital_allocations_user ON capital_allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_capital_allocations_agent ON capital_allocations(agent_id);
CREATE INDEX IF NOT EXISTS idx_capital_allocations_user_agent ON capital_allocations(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_capital_allocations_status ON capital_allocations(status);

-- RLS
ALTER TABLE capital_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own capital allocations" ON capital_allocations;
CREATE POLICY "Users can read own capital allocations" ON capital_allocations FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can write capital allocations" ON capital_allocations;
CREATE POLICY "Service role can write capital allocations" ON capital_allocations FOR ALL USING (true);

-- Add column to holdings table if it doesn't exist
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS capital_allocation_id UUID REFERENCES capital_allocations(id);
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS pnl_cents BIGINT;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Create index for capital allocation lookup
CREATE INDEX IF NOT EXISTS idx_holdings_capital_allocation ON holdings(capital_allocation_id);
