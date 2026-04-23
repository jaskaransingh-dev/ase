-- ============================================================
-- ASE — Connected Accounts System Migration
-- Replaces Coinbase with Alpaca for account connections
-- ============================================================

-- ── CONNECTED ACCOUNTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS connected_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES profiles(id) ON DELETE CASCADE,
  provider          text NOT NULL CHECK (provider IN ('alpaca', 'binance', 'kraken')),
  
  -- Encrypted credentials (for OAuth: access token)
  access_token      text,
  refresh_token    text,
  
  -- Direct API key auth
  api_key         text,
  api_secret     text,  -- encrypted
  
  -- Account info
  account_id       text,                      -- Alpaca account ID
  account_number  text,
  
  -- Status
  status          text DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),
  last_synced_at  timestamptz,
  
  created_at      timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  
  UNIQUE(user_id, provider)
);

-- ── ACCOUNT BALANCES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_balances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES profiles(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('alpaca', 'binance', 'kraken')),
  
  -- Balances
  equity_cents      bigint DEFAULT 0,
  cash_cents       bigint DEFAULT 0,
  buying_power_cents bigint DEFAULT 0,
  portfolio_value_cents bigint DEFAULT 0,
  
  -- Currency
  currency        text DEFAULT 'USD',
  
  -- Metadata
  updated_at     timestamptz DEFAULT now(),
  
  UNIQUE(user_id, provider)
);

-- ── ALLOCATIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allocations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES profiles(id) ON DELETE CASCADE,
  agent_id          uuid REFERENCES agents(id) ON DELETE CASCADE,
  
  capital_allocated_cents bigint NOT NULL DEFAULT 0,
  
  status            text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  
  created_at        timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  
  UNIQUE(user_id, agent_id)
);

-- ── RENAME OLD COINBASE TABLES (for cleanup later) ─────────────────
ALTER TABLE IF EXISTS coinbase_connections RENAME TO coinbase_connections_legacy;

-- ── INDEXES ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS connected_accounts_user ON connected_accounts(user_id);
CREATE INDEX IF NOT EXISTS connected_accounts_provider ON connected_accounts(provider);
CREATE INDEX IF NOT EXISTS account_balances_user ON account_balances(user_id);
CREATE INDEX IF NOT EXISTS allocations_user ON allocations(user_id);
CREATE INDEX IF NOT EXISTS allocations_agent ON allocations(agent_id);

-- ── ENABLE REALTIME ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'connected_accounts'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE connected_accounts; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'account_balances'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE account_balances; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'allocations'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE allocations; END IF;
END $$;

-- ── ROW LEVEL SECURITY ────────────────────────────────────────────
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE allocations ENABLE ROW LEVEL SECURITY;

-- Policies for connected accounts
DROP POLICY IF EXISTS "Users can read own connected accounts" ON connected_accounts;
DROP POLICY IF EXISTS "Users can insert own connected accounts" ON connected_accounts;
DROP POLICY IF EXISTS "Users can update own connected accounts" ON connected_accounts;
DROP POLICY IF EXISTS "Users can delete own connected accounts" ON connected_accounts;
CREATE POLICY "Users can read own connected accounts"
  ON connected_accounts FOR select USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connected accounts"
  ON connected_accounts FOR insert WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connected accounts"
  ON connected_accounts FOR update USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connected accounts"
  ON connected_accounts FOR delete USING (auth.uid() = user_id);

-- Policies for account balances
DROP POLICY IF EXISTS "Users can read own account balances" ON account_balances;
DROP POLICY IF EXISTS "Users can update own account balances" ON account_balances;
CREATE POLICY "Users can read own account balances"
  ON account_balances FOR select USING (auth.uid() = user_id);

CREATE POLICY "Users can update own account balances"
  ON account_balances FOR update USING (auth.uid() = user_id);

-- Policies for allocations
DROP POLICY IF EXISTS "Users can read own allocations" ON allocations;
DROP POLICY IF EXISTS "Users can insert own allocations" ON allocations;
DROP POLICY IF EXISTS "Users can update own allocations" ON allocations;
DROP POLICY IF EXISTS "Users can delete own allocations" ON allocations;
CREATE POLICY "Users can read own allocations"
  ON allocations FOR select USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own allocations"
  ON allocations FOR insert WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own allocations"
  ON allocations FOR update USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own allocations"
  ON allocations FOR delete USING (auth.uid() = user_id);

-- ── DROP OLD COINBASE POLICIES (if exist) ───────────────────────
DROP POLICY IF EXISTS "Users can read own coinbase connections" ON connected_accounts;
DROP POLICY IF EXISTS "Users can insert own coinbase connections" ON connected_accounts;
DROP POLICY IF EXISTS "Users can update own coinbase connections" ON connected_accounts;
DROP POLICY IF EXISTS "Users can delete own coinbase connections" ON connected_accounts;