-- ============================================================
-- ASE — Exchange Features Migration
-- Adds bid/ask spread, limit orders, and real-time pricing
-- ============================================================

-- ── ADD BID/ASK TO AGENT_STATS ─────────────────────────────────────
ALTER TABLE agent_stats 
ADD COLUMN IF NOT EXISTS bid_cents bigint GENERATED ALWAYS AS (ROUND(nav_cents * 0.9985)) STORED,
ADD COLUMN IF NOT EXISTS ask_cents bigint GENERATED ALWAYS AS (ROUND(nav_cents * 1.0015)) STORED,
ADD COLUMN IF NOT EXISTS volume_shares numeric DEFAULT 0;

-- ── LIMIT ORDERS TABLE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS limit_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id            uuid REFERENCES agents(id) ON DELETE CASCADE,
  side                text NOT NULL CHECK (side IN ('buy','sell')),
  order_type          text NOT NULL CHECK (order_type IN ('market','limit','stop_loss','recurring')),
  
  -- Amount (one of these)
  notional_cents      bigint,          -- dollar-denominated order
  shares              numeric,         -- share-denominated order
  
  -- Limit/stop specifics
  limit_price_cents   bigint,          -- limit: execute at this price or better
  stop_price_cents    bigint,          -- stop: trigger when price hits this
  
  -- Recurring
  recurring_interval  text,            -- 'weekly' | 'monthly'
  next_execute_at   timestamptz,     -- next scheduled execution
  
  -- Status
  status              text DEFAULT 'open' 
                      CHECK (status IN ('open','filled','cancelled','expired','failed')),
  filled_price_cents  bigint,
  filled_shares       numeric,
  filled_at           timestamptz,
  
  -- Expiry (null = GTC, set = GTD)
  expires_at          timestamptz,
  created_at          timestamptz DEFAULT now()
);

-- ── PRICE TICKS TABLE (1-min granularity) ────────────────────────────
CREATE TABLE IF NOT EXISTS price_ticks (
  agent_id      uuid REFERENCES agents(id) ON DELETE CASCADE,
  tick_at       timestamptz DEFAULT now(),
  price_cents   bigint NOT NULL,  -- NAV at this moment
  bid_cents     bigint,
  ask_cents     bigint,
  volume        numeric DEFAULT 0,
  PRIMARY KEY (agent_id, tick_at)
);

-- ── ORDER FILLS (immutable ledger) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_fills (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  limit_order_id    uuid REFERENCES limit_orders(id),
  user_id           uuid REFERENCES profiles(id),
  agent_id          uuid REFERENCES agents(id),
  side              text NOT NULL,
  shares            numeric NOT NULL,
  fill_price_cents  bigint NOT NULL,
  total_cents       bigint NOT NULL,  -- shares × fill_price
  spread_earned_cents bigint,         -- platform revenue
  filled_at         timestamptz DEFAULT now()
);

-- ── INDEXES ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS price_ticks_agent_time ON price_ticks(agent_id, tick_at DESC);
CREATE INDEX IF NOT EXISTS limit_orders_status ON limit_orders(status, created_at);
CREATE INDEX IF NOT EXISTS order_fills_agent_time ON order_fills(agent_id, filled_at DESC);

-- ── ENABLE REALTIME ───────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE limit_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_fills;
ALTER PUBLICATION supabase_realtime ADD TABLE price_ticks;

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────
ALTER TABLE limit_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_fills ENABLE ROW LEVEL SECURITY;

-- Policies for limit orders
CREATE POLICY "Users can read own limit orders"
  ON limit_orders FOR select USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own limit orders"
  ON limit_orders FOR insert WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own limit orders"
  ON limit_orders FOR update USING (auth.uid() = user_id);

-- Policies for order fills
CREATE POLICY "Users can read own order fills"
  ON order_fills FOR select USING (auth.uid() = user_id);

-- Anyone can read price ticks (public market data)
CREATE POLICY "Anyone can read price ticks"
  ON price_ticks FOR select USING (true);
