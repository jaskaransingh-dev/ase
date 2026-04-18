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
  primary_symbol    text,
  backtest_strategy text,
  backtest_stats    jsonb,
  status            text default 'pending_review' check (status in ('active', 'paused', 'pending_review')),
  alpaca_account    text,
  total_aum_cents   bigint default 0,
  share_price_cents bigint default 10000,
  total_shares      bigint default 100000,
  owner_id          uuid references public.profiles(id),
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

-- ══════════════════════════════════════════════════════════════
-- QUANT STRATEGY PLATFORM — Phase 2 Tables
-- ══════════════════════════════════════════════════════════════

-- ── STRATEGIES ───────────────────────────────────────────────
-- User-authored strategies (standardized interface)
create table if not exists public.strategies (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid references public.profiles(id) on delete cascade,
  slug            text unique not null,
  name            text not null,
  description     text,
  language        text default 'python' check (language in ('python', 'typescript')),
  code            text not null,
  code_hash       text not null,             -- sha256 of code for reproducibility
  params          jsonb default '{}',        -- default parameter config
  symbol          text default 'BTC-USD',
  interval        text default '1d',
  status          text default 'draft' check (status in ('draft', 'validating', 'validated', 'rejected', 'listed')),
  validation_error text,
  submission_count_today integer default 0,
  last_submission_at  timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── STRATEGY VERSIONS ────────────────────────────────────────
-- Full version history tied to (code hash + params + dataset version)
create table if not exists public.strategy_versions (
  id              uuid primary key default gen_random_uuid(),
  strategy_id     uuid references public.strategies(id) on delete cascade,
  version         integer not null,
  code            text not null,
  code_hash       text not null,
  params          jsonb default '{}',
  dataset_version text not null default 'v1',  -- bump when data source changes
  change_note     text,
  created_at      timestamptz default now(),
  unique(strategy_id, version)
);

-- ── BACKTEST RUNS ─────────────────────────────────────────────
-- Formal backtests with train/validation/test split enforcement
create table if not exists public.backtest_runs (
  id                  uuid primary key default gen_random_uuid(),
  strategy_id         uuid references public.strategies(id) on delete cascade,
  version_id          uuid references public.strategy_versions(id),
  owner_id            uuid references public.profiles(id) on delete cascade,
  -- run config
  symbol              text not null,
  interval            text not null,
  period              text not null,
  params              jsonb default '{}',
  fee                 numeric default 0.001,
  -- split config
  split_train_pct     numeric default 0.6,
  split_val_pct       numeric default 0.2,
  -- test pct is implied (1 - train - val)
  -- run type
  run_type            text default 'standard' check (run_type in ('standard', 'walk_forward', 'monte_carlo')),
  -- results (stored as JSONB for flexibility)
  train_stats         jsonb,
  val_stats           jsonb,
  test_stats          jsonb,             -- hidden; only revealed after listing
  full_stats          jsonb,
  bars                jsonb,             -- equity curve (sampled to 500 pts)
  trade_log           jsonb,
  walk_forward_result jsonb,
  monte_carlo_result  jsonb,
  -- scoring
  composite_score     numeric,
  sharpe              numeric,
  max_drawdown        numeric,
  stability_score     numeric,           -- rolling Sharpe std dev (lower = better)
  -- state
  status              text default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  error               text,
  duration_ms         integer,
  created_at          timestamptz default now()
);

-- ── EXPERIMENTS ───────────────────────────────────────────────
-- Parameter sweep / multi-run comparisons
create table if not exists public.experiments (
  id              uuid primary key default gen_random_uuid(),
  strategy_id     uuid references public.strategies(id) on delete cascade,
  owner_id        uuid references public.profiles(id) on delete cascade,
  name            text not null,
  description     text,
  -- param sweep config: { "fast_period": [5,10,20], "slow_period": [50,100,200] }
  param_grid      jsonb not null default '{}',
  symbol          text not null,
  interval        text not null,
  period          text not null,
  fee             numeric default 0.001,
  -- state
  status          text default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  total_runs      integer default 0,
  completed_runs  integer default 0,
  best_run_id     uuid references public.backtest_runs(id),
  created_at      timestamptz default now(),
  completed_at    timestamptz
);

-- ── EXPERIMENT RUNS ───────────────────────────────────────────
-- Each individual run within an experiment (one per param combo)
create table if not exists public.experiment_runs (
  id              uuid primary key default gen_random_uuid(),
  experiment_id   uuid references public.experiments(id) on delete cascade,
  backtest_run_id uuid references public.backtest_runs(id) on delete cascade,
  params          jsonb not null,        -- the specific param combo for this run
  sharpe          numeric,
  total_return    numeric,
  max_drawdown    numeric,
  win_rate        numeric,
  rank            integer,               -- rank within experiment (1 = best)
  created_at      timestamptz default now()
);

-- ── MARKETPLACE LISTINGS ──────────────────────────────────────
create table if not exists public.marketplace_listings (
  id                  uuid primary key default gen_random_uuid(),
  strategy_id         uuid unique references public.strategies(id) on delete cascade,
  owner_id            uuid references public.profiles(id) on delete cascade,
  backtest_run_id     uuid references public.backtest_runs(id),   -- the qualifying run
  -- display
  tagline             text,
  tags                text[] default '{}',
  -- pricing
  price_cents         integer default 999,   -- monthly subscription price
  is_free             boolean default false,
  -- ranking score (recomputed nightly)
  rank_score          numeric default 0,
  -- stats snapshot (denormalised for fast listing queries)
  sharpe              numeric,
  max_drawdown        numeric,
  total_return        numeric,
  win_rate            numeric,
  backtest_period     text,
  -- counts
  subscriber_count    integer default 0,
  view_count          integer default 0,
  -- state
  status              text default 'pending_review' check (status in ('pending_review', 'active', 'delisted')),
  listed_at           timestamptz,
  created_at          timestamptz default now()
);

-- ── SUBSCRIPTIONS ─────────────────────────────────────────────
create table if not exists public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete cascade,
  listing_id      uuid references public.marketplace_listings(id) on delete cascade,
  strategy_id     uuid references public.strategies(id) on delete cascade,
  status          text default 'active' check (status in ('active', 'cancelled', 'expired')),
  price_cents     integer not null,
  started_at      timestamptz default now(),
  expires_at      timestamptz,
  cancelled_at    timestamptz,
  unique(user_id, listing_id)
);

-- ── INDEXES ───────────────────────────────────────────────────
create index if not exists idx_strategies_owner        on public.strategies(owner_id);
create index if not exists idx_strategy_versions_sid   on public.strategy_versions(strategy_id);
create index if not exists idx_backtest_runs_strategy  on public.backtest_runs(strategy_id);
create index if not exists idx_backtest_runs_owner     on public.backtest_runs(owner_id);
create index if not exists idx_experiments_strategy    on public.experiments(strategy_id);
create index if not exists idx_experiment_runs_exp     on public.experiment_runs(experiment_id);
create index if not exists idx_marketplace_rank        on public.marketplace_listings(rank_score desc);
create index if not exists idx_subscriptions_user      on public.subscriptions(user_id);

-- ── RANKING FUNCTION ──────────────────────────────────────────
-- Weighted score: Sharpe (40%) - drawdown penalty (30%) + stability (30%)
create or replace function public.compute_rank_score(
  p_sharpe numeric,
  p_drawdown numeric,   -- absolute %, e.g. 25.0
  p_stability numeric   -- rolling Sharpe std dev, lower = better
) returns numeric as $$
begin
  return (
    coalesce(p_sharpe, 0) * 0.40
    - (coalesce(p_drawdown, 100) / 100.0) * 0.30
    - coalesce(p_stability, 1) * 0.30
  );
end;
$$ language plpgsql immutable;

-- Auto-increment strategy version on code change
create or replace function public.create_strategy_version()
returns trigger as $$
declare
  v_next integer;
begin
  if TG_OP = 'INSERT' or OLD.code_hash is distinct from NEW.code_hash then
    select coalesce(max(version), 0) + 1
      into v_next
      from public.strategy_versions
     where strategy_id = NEW.id;

    insert into public.strategy_versions
      (strategy_id, version, code, code_hash, params, dataset_version)
    values
      (NEW.id, v_next, NEW.code, NEW.code_hash, NEW.params, 'v1');
  end if;
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_strategy_upsert on public.strategies;
create trigger on_strategy_upsert
  after insert or update on public.strategies
  for each row execute procedure public.create_strategy_version();

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

-- Strategies
alter table public.strategies enable row level security;
create policy "Users can manage own strategies"   on public.strategies for all using (auth.uid() = owner_id);
create policy "Anyone can read listed strategies" on public.strategies for select using (status = 'listed');

-- Strategy versions
alter table public.strategy_versions enable row level security;
create policy "Owners can read own versions" on public.strategy_versions for select
  using (exists (select 1 from public.strategies s where s.id = strategy_id and s.owner_id = auth.uid()));

-- Backtest runs
alter table public.backtest_runs enable row level security;
create policy "Owners can manage own backtest runs" on public.backtest_runs for all using (auth.uid() = owner_id);

-- Experiments
alter table public.experiments enable row level security;
create policy "Owners can manage own experiments" on public.experiments for all using (auth.uid() = owner_id);

-- Experiment runs
alter table public.experiment_runs enable row level security;
create policy "Owners can read own experiment runs" on public.experiment_runs for select
  using (exists (select 1 from public.experiments e where e.id = experiment_id and e.owner_id = auth.uid()));

-- Marketplace listings (public read)
alter table public.marketplace_listings enable row level security;
create policy "Anyone can read active listings"    on public.marketplace_listings for select using (status = 'active');
create policy "Owners can manage own listings"     on public.marketplace_listings for all   using (auth.uid() = owner_id);

-- Subscriptions
alter table public.subscriptions enable row level security;
create policy "Users can manage own subscriptions" on public.subscriptions for all using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- SUPABASE STORAGE BUCKETS
-- ══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-assets',
  'site-assets',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf', 'text/csv']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf', 'text/csv'];

-- RLS policies for site-assets bucket
create policy "Anyone can view site assets" on storage.objects
  for select using (bucket_id = 'site-assets');

create policy "Authenticated users can upload site assets" on storage.objects
  for insert with check (bucket_id = 'site-assets' and auth.role() = 'authenticated');

create policy "Users can delete own site assets" on storage.objects
  for delete using (bucket_id = 'site-assets' and auth.uid()::text = (metadata->>'owner_id'));

create policy "Users can update own site assets" on storage.objects
  for update using (bucket_id = 'site-assets' and auth.uid()::text = (metadata->>'owner_id'));
