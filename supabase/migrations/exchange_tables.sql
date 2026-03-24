-- ============================================================
-- ASE — Exchange Features Migration
-- Adds bid/ask spread, limit orders, and real-time pricing
-- ============================================================

-- ============================================================
-- ASE PRD v1.0 Exchange Tables (Phase 1)
-- agent_listings, user_agent_positions, exchange_trades, agent_nav_history
-- ============================================================

-- ── AGENT LISTINGS (IPO/Share Supply) ────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE UNIQUE,
  total_shares bigint DEFAULT 1000000 NOT NULL,
  treasury_shares bigint DEFAULT 200000 NOT NULL, -- 20% reserve
  public_float bigint GENERATED ALWAYS AS (total_shares - treasury_shares) STORED,
  ipo_price_cents numeric(10,4) DEFAULT 1000 NOT NULL, -- $10.00
  listed_at timestamptz DEFAULT now(),
  status text DEFAULT 'active' CHECK (status IN ('active','halted','delisted','ipo_pending')),
  delisted_at timestamptz
);

-- ── USER AGENT POSITIONS (w/ FIFO Cost Basis) ───────────────────────
CREATE TABLE IF NOT EXISTS user_agent_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  shares numeric DEFAULT 0 NOT NULL,
  lots jsonb DEFAULT '[]'::jsonb, -- Array of {shares, cost_cents, bought_at} for FIFO

  -- Stored as regular columns, maintained by trigger
  avg_cost_cents numeric DEFAULT 0 NOT NULL,
  total_cost_basis numeric DEFAULT 0 NOT NULL,

  status text DEFAULT 'active' CHECK (status IN ('active','liquidating')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, agent_id)
);

-- ── FUNCTION: Recalculate FIFO cost basis ───────────────────────────
CREATE OR REPLACE FUNCTION recalc_user_agent_position_costs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_shares_in_lots numeric := 0;
  total_cost numeric := 0;
BEGIN
  SELECT
    COALESCE(SUM((l->>'shares')::numeric), 0),
    COALESCE(SUM((l->>'shares')::numeric * (l->>'cost_cents')::numeric), 0)
  INTO total_shares_in_lots, total_cost
  FROM jsonb_array_elements(COALESCE(NEW.lots, '[]'::jsonb)) AS l;

  NEW.total_cost_basis := total_cost;
  NEW.avg_cost_cents := CASE
    WHEN total_shares_in_lots = 0 THEN 0
    ELSE total_cost / total_shares_in_lots
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_user_agent_position_costs ON user_agent_positions;

CREATE TRIGGER trg_recalc_user_agent_position_costs
BEFORE INSERT OR UPDATE OF lots ON user_agent_positions
FOR EACH ROW
EXECUTE FUNCTION recalc_user_agent_position_costs();

-- ── EXCHANGE TRADES (Immutable Fill Ledger) ─────────────────────────
CREATE TABLE IF NOT EXISTS exchange_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buy_order_id uuid REFERENCES limit_orders(id) ON DELETE SET NULL,
  sell_order_id uuid REFERENCES limit_orders(id) ON DELETE SET NULL,
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  buyer_id uuid REFERENCES profiles(id),
  seller_id uuid REFERENCES profiles(id),
  price_cents numeric(10,4) NOT NULL,
  shares bigint NOT NULL,
  total_cents bigint GENERATED ALWAYS AS ((shares * price_cents)::bigint) STORED,
  fee_cents bigint DEFAULT 0, -- Platform revenue
  spread_cents bigint DEFAULT 0,
  traded_at timestamptz DEFAULT now()
);

-- ── AGENT NAV HISTORY (Daily Snapshots) ─────────────────────────────
CREATE TABLE IF NOT EXISTS agent_nav_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
  nav_cents numeric(12,2) NOT NULL,
  nav_per_share numeric(10,4) NOT NULL,
  total_aum_cents bigint,
  mid_price_cents numeric(10,4),
  best_bid_cents numeric(10,4),
  best_ask_cents numeric(10,4),
  volume_shares_today bigint DEFAULT 0,
  snapshot_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, snapshot_date)
);

-- ── INDEXES ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_agent_listings_status ON agent_listings(status);
CREATE INDEX IF NOT EXISTS idx_user_positions_active ON user_agent_positions(user_id, agent_id, status);
CREATE INDEX IF NOT EXISTS idx_exchange_trades_agent_time ON exchange_trades(agent_id, traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_nav_history_agent_date ON agent_nav_history(agent_id, snapshot_date DESC);

-- ── REALTIME PUBLICATION ───────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE agent_listings, user_agent_positions, exchange_trades, agent_nav_history;

-- ── RLS POLICIES ───────────────────────────────────────────────────
ALTER TABLE agent_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_agent_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_nav_history ENABLE ROW LEVEL SECURITY;

-- Agent listings: public read
DROP POLICY IF EXISTS "Public read agent listings" ON agent_listings;
CREATE POLICY "Public read agent listings"
ON agent_listings
FOR SELECT
USING (true);

-- User positions: own read/insert/update
DROP POLICY IF EXISTS "Users manage own positions" ON user_agent_positions;
CREATE POLICY "Users manage own positions"
ON user_agent_positions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Exchange trades: public read (market data)
DROP POLICY IF EXISTS "Public read exchange trades" ON exchange_trades;
CREATE POLICY "Public read exchange trades"
ON exchange_trades
FOR SELECT
USING (true);

-- NAV history: public read
DROP POLICY IF EXISTS "Public read nav history" ON agent_nav_history;
CREATE POLICY "Public read nav history"
ON agent_nav_history
FOR SELECT
USING (true);

-- ── SEED LISTINGS FOR EXISTING AGENTS ──────────────────────────────
INSERT INTO agent_listings (agent_id, total_shares, treasury_shares, ipo_price_cents)
SELECT id, 1000000, 200000, 1000
FROM agents
WHERE id NOT IN (SELECT agent_id FROM agent_listings)
ON CONFLICT DO NOTHING;

-- ── BACKFILL EXISTING POSITION COSTS ───────────────────────────────
UPDATE user_agent_positions
SET lots = COALESCE(lots, '[]'::jsonb);

-- ── VIEW: Portfolio Value (Cash + Positions) ───────────────────────
CREATE OR REPLACE VIEW portfolio_summary AS
SELECT
  p.id AS user_id,
  COALESCE(w.balance_cents, 0) AS cash_cents,
  COALESCE(
    SUM(uap.shares * COALESCE(ash.nav_cents, 10000) / 10000.0),
    0
  ) AS positions_value_cents,
  COALESCE(w.balance_cents, 0) +
  COALESCE(
    SUM(uap.shares * COALESCE(ash.nav_cents, 10000) / 10000.0),
    0
  ) AS total_value_cents,
  (
    (
      COALESCE(w.balance_cents, 0) +
      COALESCE(
        SUM(uap.shares * COALESCE(ash.nav_cents, 10000) / 10000.0),
        0
      )
    ) - 5000000
  ) / 5000000.0 * 100 AS total_return_pct
FROM profiles p
LEFT JOIN wallets w
  ON p.id = w.user_id
LEFT JOIN user_agent_positions uap
  ON p.id = uap.user_id
 AND uap.status = 'active'
LEFT JOIN agent_stats ash
  ON uap.agent_id = ash.agent_id
 AND ash.snapshot_at = (
   SELECT MAX(s.snapshot_at)
   FROM agent_stats s
   WHERE s.agent_id = uap.agent_id
 )
GROUP BY p.id, w.balance_cents;