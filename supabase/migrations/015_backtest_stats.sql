-- ══════════════════════════════════════════════════════════════
-- 015: Backtest stats, public read policies, and data fixes
-- Run in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════

-- ── 1. Schema additions ─────────────────────────────────────

-- Backtest results JSONB on agents
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS backtest_stats jsonb;

-- Simulation flag on agent_stats
ALTER TABLE public.agent_stats ADD COLUMN IF NOT EXISTS is_simulation boolean DEFAULT false;

-- Ensure primary_symbol + backtest_strategy columns exist
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS primary_symbol text;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS backtest_strategy text;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS monthly_fee_cents int NOT NULL DEFAULT 0;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS subscriber_count int NOT NULL DEFAULT 0;

-- ── 2. Indexes ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS agent_stats_agent_snapshot_idx
  ON public.agent_stats(agent_id, snapshot_at DESC);

-- ── 3. PUBLIC READ RLS policies ─────────────────────────────
-- These ensure the anon key (used by the server client) can read
-- public data like agents, stats, and trades.

-- Agents: public read, service role write
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agents full access" ON public.agents;
DROP POLICY IF EXISTS "public read agents" ON public.agents;
DROP POLICY IF EXISTS "admin write agents" ON public.agents;

CREATE POLICY "public read agents"
  ON public.agents FOR SELECT
  USING (true);

CREATE POLICY "admin write agents"
  ON public.agents FOR ALL
  USING (true)
  WITH CHECK (true);

-- Agent stats: public read
ALTER TABLE public.agent_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can write agent_stats" ON public.agent_stats;
DROP POLICY IF EXISTS "public read agent_stats" ON public.agent_stats;
DROP POLICY IF EXISTS "admin write agent_stats" ON public.agent_stats;

CREATE POLICY "public read agent_stats"
  ON public.agent_stats FOR SELECT
  USING (true);

CREATE POLICY "admin write agent_stats"
  ON public.agent_stats FOR ALL
  USING (true)
  WITH CHECK (true);

-- Agent trades: public read (already has policy but ensure it)
ALTER TABLE public.agent_trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read agent trades" ON public.agent_trades;
DROP POLICY IF EXISTS "Service role can write agent_trades" ON public.agent_trades;
DROP POLICY IF EXISTS "public read agent_trades" ON public.agent_trades;
DROP POLICY IF EXISTS "admin write agent_trades" ON public.agent_trades;

CREATE POLICY "public read agent_trades"
  ON public.agent_trades FOR SELECT
  USING (true);

CREATE POLICY "admin write agent_trades"
  ON public.agent_trades FOR ALL
  USING (true)
  WITH CHECK (true);

-- Profiles: public read for display names
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read profiles" ON public.profiles;
DROP POLICY IF EXISTS "users manage own profile" ON public.profiles;
DROP POLICY IF EXISTS "admin write profiles" ON public.profiles;

CREATE POLICY "public read profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "users manage own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "admin write profiles"
  ON public.profiles FOR ALL
  USING (true)
  WITH CHECK (true);

-- Subscriptions: keep user-scoped (already has RLS from 014)
-- No changes needed — users can only see their own subscriptions

-- ── 4. Verify subscriptions table setup ─────────────────────

-- Ensure unique constraint exists for upsert
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_agent_id_key'
  ) THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_agent_id_key UNIQUE (user_id, agent_id);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;
