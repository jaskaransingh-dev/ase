-- ============================================================
-- ASE — FULL USER RESET
-- Clears all user balances, holdings, and transactions.
-- Resets agents to clean $10k baseline.
-- Run this in Supabase SQL Editor.
-- ============================================================

BEGIN;

-- ── 1. CLEAR ALL USER DATA ───────────────────────────────────
DELETE FROM public.order_fills;
DELETE FROM public.limit_orders;
DELETE FROM public.holdings;
DELETE FROM public.transactions;

-- ── 2. RESET ALL WALLET BALANCES TO $10,000 ─────────────────
UPDATE public.wallets
SET
  balance_cents = 1000000,   -- $10,000.00
  updated_at    = now();

-- ── 3. ADD FRESH $10k WELCOME TRANSACTION FOR ALL USERS ─────
INSERT INTO public.transactions (user_id, type, amount_cents, note)
SELECT
  user_id,
  'deposit',
  1000000,
  'Balance reset — $10,000 paper trading credits'
FROM public.wallets;

-- ── 4. CLEAR ALL AGENT TRADING DATA ─────────────────────────
DELETE FROM public.agent_trades;
DELETE FROM public.agent_stats;
DELETE FROM public.price_ticks;

-- ── 5. RESET AGENT STATE ─────────────────────────────────────
UPDATE public.agents
SET
  total_aum_cents   = 0,
  share_price_cents = 10000,   -- $100/share starting NAV
  total_shares      = 0,
  signal_summary    = 'SCANNING',
  portfolio_json    = NULL,
  last_run_at       = NULL,
  updated_at        = now()
WHERE status = 'active';

-- ── 6. RESEED AGENT_STATS — CLEAN $10k BASELINE ──────────────
INSERT INTO public.agent_stats (
  agent_id, snapshot_at,
  nav_cents, bid_cents, ask_cents,
  total_return_pct, sharpe_ratio, sortino_ratio,
  max_drawdown_pct, win_rate_pct, total_trades,
  daily_return_pct, portfolio_value_cents, volume_shares
)
SELECT
  id, now(),
  10000, 9985, 10015,
  0, 0, 0, 0, 0, 0, 0,
  1000000,   -- $10,000 platform seed portfolio
  0
FROM public.agents
WHERE status = 'active';

-- ── 7. SEED BASELINE PRICE TICK ──────────────────────────────
INSERT INTO public.price_ticks (agent_id, tick_at, price_cents, bid_cents, ask_cents, volume)
SELECT id, now(), 10000, 9985, 10015, 0
FROM public.agents
WHERE status = 'active'
ON CONFLICT (agent_id, tick_at) DO NOTHING;

-- ── 8. FIX handle_new_user TRIGGER (future signups = $10k) ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  INSERT INTO public.wallets (user_id, balance_cents)
  VALUES (new.id, 1000000);
  INSERT INTO public.transactions (user_id, type, amount_cents, note)
  VALUES (new.id, 'deposit', 1000000, 'Welcome bonus — $10,000 paper trading credits');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

COMMIT;

-- ── VERIFY ───────────────────────────────────────────────────
SELECT 'wallets'       AS tbl, COUNT(*) AS rows, SUM(balance_cents)/100 AS total_usd FROM public.wallets
UNION ALL
SELECT 'holdings',      COUNT(*), 0 FROM public.holdings
UNION ALL
SELECT 'transactions',  COUNT(*), SUM(amount_cents)/100 FROM public.transactions
UNION ALL
SELECT 'agent_trades',  COUNT(*), 0 FROM public.agent_trades
UNION ALL
SELECT 'agent_stats',   COUNT(*), 0 FROM public.agent_stats;

-- Expected:
--   wallets       → N rows, each with $10,000 balance
--   holdings      → 0 rows
--   transactions  → N rows (1 per user)
--   agent_trades  → 0 rows
--   agent_stats   → 5 rows (one per active agent)
