-- ============================================================
-- ASE — FULL RESET & FIX SCRIPT
-- Run this in Supabase SQL Editor to:
--   1. Clear all agent trading data
--   2. Fix user wallets to start at $10,000 (not $100)
--   3. Re-seed agents with correct $10k starting portfolio
--   4. Fix handle_new_user() trigger for future signups
-- ============================================================

BEGIN;

-- ── STEP 1: CLEAR ALL TRADING / STATS DATA ─────────────────
-- Order matters due to foreign key constraints

DELETE FROM public.order_fills;
DELETE FROM public.limit_orders;
DELETE FROM public.price_ticks;
DELETE FROM public.agent_stats;
DELETE FROM public.agent_trades;

-- Clear holdings and transactions too (stale data)
DELETE FROM public.holdings;
DELETE FROM public.transactions;

-- ── STEP 2: FIX ALL EXISTING USER WALLETS TO $10,000 ───────
-- 10,000 cents = $100 (WRONG) → 1,000,000 cents = $10,000 (CORRECT)

UPDATE public.wallets
SET
  balance_cents = 1000000,   -- $10,000.00
  updated_at    = now();

-- ── STEP 3: ADD CORRECTED WELCOME TRANSACTION FOR ALL USERS ─
-- Insert fresh $10k welcome credit for each wallet owner

INSERT INTO public.transactions (user_id, type, amount_cents, note)
SELECT
  user_id,
  'deposit',
  1000000,   -- $10,000.00
  'Welcome bonus — $10,000 paper trading credits'
FROM public.wallets;

-- ── STEP 4: RESET AGENT STATE COLUMNS ───────────────────────

UPDATE public.agents
SET
  total_aum_cents   = 0,
  signal_summary    = 'SCANNING',
  portfolio_json    = NULL,
  last_run_at       = NULL,
  updated_at        = now(),
  share_price_cents = 10000   -- $100.00 per share (correct)
WHERE status = 'active';

-- ── STEP 5: SEED FRESH AGENT_STATS ($10k portfolio each) ────
-- nav_cents = 10000 means $100/share (per-share NAV)
-- portfolio_value_cents = 1000000 means $10,000 total capital

INSERT INTO public.agent_stats (
  agent_id,
  snapshot_at,
  nav_cents,
  bid_cents,
  ask_cents,
  total_return_pct,
  sharpe_ratio,
  sortino_ratio,
  max_drawdown_pct,
  win_rate_pct,
  total_trades,
  daily_return_pct,
  portfolio_value_cents,
  volume_shares
)
SELECT
  id,
  now(),
  10000,     -- $100.00 per share (starting NAV)
  9985,      -- bid  = NAV × 0.9985
  10015,     -- ask  = NAV × 1.0015
  0,         -- total_return_pct
  0,         -- sharpe_ratio
  0,         -- sortino_ratio
  0,         -- max_drawdown_pct
  0,         -- win_rate_pct
  0,         -- total_trades
  0,         -- daily_return_pct
  1000000,   -- $10,000 starting portfolio
  0          -- volume_shares
FROM public.agents
WHERE status = 'active';

-- ── STEP 6: SEED INITIAL PRICE TICK FOR EACH AGENT ──────────
-- Gives the chart a baseline starting point

INSERT INTO public.price_ticks (agent_id, tick_at, price_cents, bid_cents, ask_cents, volume)
SELECT
  id,
  now(),
  10000,   -- $100.00
  9985,
  10015,
  0
FROM public.agents
WHERE status = 'active'
ON CONFLICT (agent_id, tick_at) DO NOTHING;

-- ── STEP 7: FIX handle_new_user() TRIGGER ───────────────────
-- Future signups will now get $10,000 instead of $100

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  INSERT INTO public.wallets (user_id, balance_cents)
  VALUES (new.id, 1000000);   -- $10,000.00 starting balance

  INSERT INTO public.transactions (user_id, type, amount_cents, note)
  VALUES (new.id, 'deposit', 1000000, 'Welcome bonus — $10,000 paper trading credits');

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger (in case it was dropped)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── STEP 8: REFRESH THE LATEST STATS VIEW ───────────────────
-- Drop first to avoid schema conflicts, then recreate with all columns

DROP VIEW IF EXISTS public.agent_latest_stats CASCADE;

CREATE VIEW public.agent_latest_stats AS
SELECT DISTINCT ON (agent_id)
  agent_id,
  nav_cents,
  bid_cents,
  ask_cents,
  total_return_pct,
  sharpe_ratio,
  sortino_ratio,
  max_drawdown_pct,
  win_rate_pct,
  total_trades,
  daily_return_pct,
  portfolio_value_cents,
  volume_shares,
  snapshot_at
FROM public.agent_stats
ORDER BY agent_id, snapshot_at DESC;

-- Ensure view access
GRANT SELECT ON public.agent_latest_stats TO anon, authenticated, service_role;

COMMIT;

-- ── VERIFY: Run these after the block above to confirm ───────

-- Should show 1000000 (= $10,000) for all users
SELECT user_id, balance_cents, updated_at FROM public.wallets;

-- Should show nav_cents=10000 and portfolio_value_cents=1000000 for all active agents
SELECT a.slug, s.nav_cents, s.portfolio_value_cents, s.snapshot_at
FROM public.agent_stats s
JOIN public.agents a ON a.id = s.agent_id
ORDER BY s.snapshot_at DESC;

-- Should show 5 agents all active
SELECT slug, name, share_price_cents, total_aum_cents, status FROM public.agents;
