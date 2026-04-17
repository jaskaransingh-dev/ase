-- ============================================================
-- ASE — Agent Security Exchange
-- Supabase SQL Schema (Crypto Agents MVP)
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── PROFILES ────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz default now()
);

-- ── WALLETS ─────────────────────────────────────────────────
create table if not exists public.wallets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references public.profiles(id) on delete cascade,
  balance_cents   bigint default 0,
  updated_at      timestamptz default now()
);

-- ── TRANSACTIONS ─────────────────────────────────────────────
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete cascade,
  type            text not null check (type in ('deposit', 'withdrawal', 'invest', 'divest', 'return')),
  amount_cents    bigint not null,
  reference_id    text,
  note            text,
  created_at      timestamptz default now()
);

-- ── AGENTS ──────────────────────────────────────────────────
create table if not exists public.agents (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  ticker            text,
  description       text,
  strategy_type     text not null check (strategy_type in ('momentum', 'mean_reversion', 'trend_following', 'crypto_momentum', 'crypto_mean_reversion')),
  asset_class       text default 'crypto',
  status            text default 'active' check (status in ('active', 'paused', 'pending_review')),
  alpaca_account    text,
  total_aum_cents   bigint default 0,
  share_price_cents bigint default 10000,
  total_shares      bigint default 100000,
  created_at        timestamptz default now()
);

-- ── AGENT STATS ──────────────────────────────────────────────
create table if not exists public.agent_stats (
  id                uuid primary key default gen_random_uuid(),
  agent_id          uuid references public.agents(id) on delete cascade,
  snapshot_at       timestamptz default now(),
  nav_cents         bigint default 10000,
  bid_cents         bigint,
  ask_cents         bigint,
  total_return_pct  numeric default 0,
  sharpe_ratio      numeric default 0,
  max_drawdown_pct  numeric default 0,
  win_rate_pct      numeric default 0,
  total_trades      integer default 0
);

-- ── HOLDINGS ─────────────────────────────────────────────────
create table if not exists public.holdings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references public.profiles(id) on delete cascade,
  agent_id              uuid references public.agents(id) on delete cascade,
  shares                numeric not null,
  entry_nav_cents       bigint not null,
  status                text default 'active' check (status in ('active', 'pending_sell', 'sold')),
  invested_cents        bigint not null,
  current_value_cents   bigint,
  created_at            timestamptz default now(),
  sold_at               timestamptz
);

-- ── AGENT TRADES ─────────────────────────────────────────────
create table if not exists public.agent_trades (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid references public.agents(id) on delete cascade,
  alpaca_order_id text,
  symbol          text not null,
  side            text not null check (side in ('buy', 'sell')),
  qty             numeric,
  fill_price      numeric,
  filled_at       timestamptz,
  pnl_cents       bigint,
  created_at      timestamptz default now()
);

-- ── AGENT SUBMISSIONS ────────────────────────────────────────
create table if not exists public.agent_submissions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  strategy    text not null,
  github      text,
  status      text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at  timestamptz default now()
);

-- Saved/favorite agents (bookmarks)
create table if not exists public.saved_agents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  agent_id    uuid references public.agents(id) on delete cascade,
  created_at  timestamptz default now(),
  unique(user_id, agent_id)
);

-- ── WAITLIST ─────────────────────────────────────────────────
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  created_at  timestamptz default now()
);

-- ── RPC HELPERS ──────────────────────────────────────────────
create or replace function public.increment_agent_aum(p_agent_id uuid, p_amount bigint)
returns void as $$
begin
  update public.agents
  set total_aum_cents = total_aum_cents + p_amount
  where id = p_agent_id;
end;
$$ language plpgsql security definer;

-- Auto-create profile + wallet on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );

  insert into public.wallets (user_id, balance_cents)
  values (new.id, 10000);

  insert into public.transactions (user_id, type, amount_cents, note)
  values (new.id, 'deposit', 10000, 'Welcome bonus — $100 paper credits');

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── SEED 5 CRYPTO AGENTS ────────────────────────────────────
insert into public.agents (slug, name, ticker, description, strategy_type, asset_class, status, share_price_cents, total_shares)
values
  (
    'btc-momentum',
    'BTC Momentum',
    'BTCM',
    'Rides Bitcoin momentum using 20/50 EMA crossovers on BTC/USD. Goes long when short-term trend is bullish, exits on bearish cross.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000
  ),
  (
    'eth-mean-revert',
    'ETH Mean Revert',
    'ETHR',
    'Buys ETH when RSI drops below 35 and sells when RSI exceeds 60. Targets oversold bounces on Ethereum.',
    'crypto_mean_reversion',
    'crypto',
    'active',
    10000,
    100000
  ),
  (
    'crypto-trend',
    'Crypto Trend',
    'CRTR',
    'Systematic trend follower across BTC, ETH, and SOL. Uses 10/30 EMA on 1D bars with equal-weight allocation.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000
  ),
  (
    'sol-breakout',
    'SOL Breakout',
    'SOLB',
    'Detects SOL/USD breakouts using Bollinger Band expansion. Enters on upper band breaks with tight stop-loss at middle band.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000
  ),
  (
    'defi-basket',
    'DeFi Basket',
    'DEFI',
    'Rotates between top DeFi tokens (LINK, UNI, AAVE, AVAX) based on 14-day momentum. Weekly rebalance into top 2.',
    'crypto_momentum',
    'crypto',
    'active',
    10000,
    100000
  )
on conflict (slug) do nothing;

-- ── REMOVED: 60-day simulated data seed ──────────────────────────────
-- REASON: Now using real statistics calculated from agent_trades
-- Stats are calculated by /api/cron/update-nav every 5 minutes
-- based on actual trading P&L and positions
--
-- Previous seeding code (left as reference):
-- Agents were seeded with 60 days of simulated returns using random drift+volatility
-- This has been replaced with real calculations from agent_trades table

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.holdings enable row level security;
alter table public.agents enable row level security;
alter table public.agent_stats enable row level security;
alter table public.agent_trades enable row level security;
alter table public.agent_submissions enable row level security;
alter table public.waitlist enable row level security;

-- Drop old policies
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can read own wallet" on public.wallets;
drop policy if exists "Users can read own transactions" on public.transactions;
drop policy if exists "Users can read own holdings" on public.holdings;
drop policy if exists "Anyone can read agents" on public.agents;
drop policy if exists "Anyone can read agent stats" on public.agent_stats;
drop policy if exists "Anyone can read agent trades" on public.agent_trades;
drop policy if exists "Anyone can join waitlist" on public.waitlist;
drop policy if exists "Anyone can submit agent" on public.agent_submissions;

-- Profiles
create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Wallets
create policy "Users can read own wallet" on public.wallets for select using (auth.uid() = user_id);

-- Transactions
create policy "Users can read own transactions" on public.transactions for select using (auth.uid() = user_id);

-- Holdings
create policy "Users can read own holdings" on public.holdings for select using (auth.uid() = user_id);

-- Agents (public)
create policy "Anyone can read agents" on public.agents for select using (true);

-- Agent stats (public)
create policy "Anyone can read agent stats" on public.agent_stats for select using (true);

-- Agent trades (public)
create policy "Anyone can read agent trades" on public.agent_trades for select using (true);

-- Waitlist
create policy "Anyone can join waitlist" on public.waitlist for insert with check (true);

-- Agent submissions
create policy "Anyone can submit agent" on public.agent_submissions for insert with check (true);

-- Saved agents
alter table public.saved_agents enable row level security;
create policy "Users can manage own saved agents" on public.saved_agents for all using (auth.uid() = user_id);
