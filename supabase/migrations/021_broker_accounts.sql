-- Broker API Tables for ASE Embedded Brokerage
-- Using fully-disclosed account model with Alpaca Broker API

-- === BROKER ACCOUNTS ===

CREATE TABLE IF NOT EXISTS broker_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    alpaca_account_id VARCHAR NOT NULL,
    account_number VARCHAR,
    status VARCHAR NOT NULL DEFAULT 'ONBOARDING',
    account_type VARCHAR DEFAULT 'INDIVIDUAL',
    trading_enabled BOOLEAN DEFAULT false,
    currency VARCHAR DEFAULT 'USD',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_broker_accounts_user ON broker_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_broker_accounts_alpaca ON broker_accounts(alpaca_account_id);

-- === BANK LINKS (ACH Relationships) ===

CREATE TABLE IF NOT EXISTS bank_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    alpaca_relationship_id VARCHAR NOT NULL,
    bank_name VARCHAR,
    bank_account_type VARCHAR,  -- CHECKING, SAVINGS
    account_last4 VARCHAR,
    account_owner_name VARCHAR,
    status VARCHAR DEFAULT 'QUEUED',
    is_primary BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_links_user ON bank_links(user_id);

-- === BROKER TRANSFERS ===

CREATE TABLE IF NOT EXISTS broker_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    alpaca_transfer_id VARCHAR,
    bank_link_id UUID REFERENCES bank_links(id),
    type VARCHAR NOT NULL,  -- deposit, withdrawal
    direction VARCHAR NOT NULL,  -- INCOMING, OUTGOING
    amount_cents BIGINT NOT NULL,
    status VARCHAR DEFAULT 'PENDING',  -- PENDING, EXECUTED, COMPLETE, REJECTED, FAILED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_broker_transfers_user ON broker_transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_broker_transfers_status ON broker_transfers(status);

-- === AGENT SLEEVES (Allocations) ===

CREATE TABLE IF NOT EXISTS agent_sleeves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
    allocated_cents BIGINT NOT NULL DEFAULT 0,
    target_weight_pct INTEGER DEFAULT 0,  -- 0-100
    status VARCHAR DEFAULT 'active',  -- active, exited
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_sleeves_user ON agent_sleeves(user_id);

-- === LEDGER ENTRIES ===

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type VARCHAR NOT NULL,  -- deposit, withdrawal, allocation, trade, fee, pnl, rebalance
    amount_cents BIGINT NOT NULL,
    reference_type VARCHAR,  -- transfer, sleeve, order
    reference_id VARCHAR,
    running_balance_cents BIGINT NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_user ON ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_created ON ledger_entries(created_at DESC);

-- === ENABLE RLS ===

ALTER TABLE broker_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sleeves ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- Policies for broker_accounts
DROP POLICY IF EXISTS "Users can read own broker account" ON broker_accounts;
CREATE POLICY "Users can read own broker account" ON broker_accounts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own broker account" ON broker_accounts;
CREATE POLICY "Users can insert own broker account" ON broker_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own broker account" ON broker_accounts;
CREATE POLICY "Users can update own broker account" ON broker_accounts FOR UPDATE USING (auth.uid() = user_id);

-- Policies for bank_links
DROP POLICY IF EXISTS "Users can read own bank links" ON bank_links;
CREATE POLICY "Users can read own bank links" ON bank_links FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own bank links" ON bank_links;
CREATE POLICY "Users can insert own bank links" ON bank_links FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own bank links" ON bank_links;
CREATE POLICY "Users can delete own bank links" ON bank_links FOR DELETE USING (auth.uid() = user_id);

-- Policies for broker_transfers
DROP POLICY IF EXISTS "Users can read own transfers" ON broker_transfers;
CREATE POLICY "Users can read own transfers" ON broker_transfers FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own transfers" ON broker_transfers;
CREATE POLICY "Users can insert own transfers" ON broker_transfers FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policies for agent_sleeves
DROP POLICY IF EXISTS "Users can read own sleeves" ON agent_sleeves;
CREATE POLICY "Users can read own sleeves" ON agent_sleeves FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own sleeves" ON agent_sleeves;
CREATE POLICY "Users can insert own sleeves" ON agent_sleeves FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own sleeves" ON agent_sleeves;
CREATE POLICY "Users can update own sleeves" ON agent_sleeves FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own sleeves" ON agent_sleeves;
CREATE POLICY "Users can delete own sleeves" ON agent_sleeves FOR DELETE USING (auth.uid() = user_id);

-- Policies for ledger_entries
DROP POLICY IF EXISTS "Users can read own ledger" ON ledger_entries;
CREATE POLICY "Users can read own ledger" ON ledger_entries FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own ledger" ON ledger_entries;
CREATE POLICY "Users can insert own ledger" ON ledger_entries FOR INSERT WITH CHECK (auth.uid() = user_id);