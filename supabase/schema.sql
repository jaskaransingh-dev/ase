-- ============================================================
-- ASE — Agent Security Exchange
-- Supabase SQL Schema
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
  description       text,
  strategy_type     text not null check (strategy_type in ('momentum', 'mean_reversion', 'trend_following')),
  status            text default 'active' check (status in ('active', 'paused', 'pending_review')),
  alpaca_account    text,
  total_aum_cents   bigint default 0,
  created_at        timestamptz default now()
);

-- ── AGENT STATS ──────────────────────────────────────────────
create table if not exists public.agent_stats (
  id                uuid primary key default gen_random_uuid(),
  agent_id          uuid references public.agents(id) on delete cascade,
  snapshot_at       timestamptz default now(),
  nav_cents         bigint default 10000,
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
  alpaca_order_id text unique,
  symbol          text not null,
  side            text not null check (side in ('buy', 'sell')),
  qty             numeric,
  fill_price      numeric,
  filled_at       timestamptz,
  pnl_cents       bigint
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

-- ── WAITLIST ─────────────────────────────────────────────────
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text unique not null,
  created_at  timestamptz default now()
);

-- ── RPC HELPER ──────────────────────────────────────────────
create or replace function public.increment_agent_aum(p_agent_id uuid, p_amount bigint)
returns void as $$
begin
  update public.agents
  set total_aum_cents = total_aum_cents + p_amount
  where id = p_agent_id;
end;
$$ language plpgsql security definer;

-- Auto-create profile on signup
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

-- ── SEED AGENTS ─────────────────────────────────────────────
insert into public.agents (slug, name, description, strategy_type, status)
values
  (
    'momentum-alpha',
    'Momentum Alpha',
    'Targets the top 5 momentum stocks from a liquid 50-stock watchlist. Rebalances weekly based on 3-month price returns with 20% position caps.',
    'momentum',
    'active'
  ),
  (
    'mean-reversion-pro',
    'Mean Reversion Pro',
    'Buys oversold blue chips when RSI drops below 30. Exits at RSI > 55 or +8% gain. Max 3 concurrent positions.',
    'mean_reversion',
    'active'
  ),
  (
    'trend-follower',
    'Trend Follower',
    'Classic 50/200 EMA crossover on SPY, QQQ, and IWM. Long when trend is up, flat when trend is down.',
    'trend_following',
    'active'
  )
on conflict (slug) do nothing;

-- ── SEED INITIAL STATS ───────────────────────────────────────
do $$
declare
  agent_id_momentum uuid;
  agent_id_reversion uuid;
  agent_id_trend uuid;
  i integer;
  base_date timestamptz := now() - interval '60 days';
begin
  select id into agent_id_momentum from public.agents where slug = 'momentum-alpha';
  select id into agent_id_reversion from public.agents where slug = 'mean-reversion-pro';
  select id into agent_id_trend from public.agents where slug = 'trend-follower';

  for i in 0..60 loop
    insert into public.agent_stats (
      agent_id, snapshot_at, nav_cents, total_return_pct,
      sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades
    )
    values (
      agent_id_momentum,
      base_date + (i || ' days')::interval,
      round((10000 * (1 + (i::numeric * 0.004) + (random() * 0.008 - 0.004)))::numeric)::bigint,
      round(((i::numeric * 0.4) + (random() * 0.8 - 0.4))::numeric, 2),
      round((2.5 + random() * 0.8)::numeric, 2),
      round((2 + random() * 4)::numeric, 2),
      round((58 + random() * 10)::numeric, 1),
      i * 2
    );

    insert into public.agent_stats (
      agent_id, snapshot_at, nav_cents, total_return_pct,
      sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades
    )
    values (
      agent_id_reversion,
      base_date + (i || ' days')::interval,
      round((10000 * (1 + (i::numeric * 0.002) + (random() * 0.006 - 0.003)))::numeric)::bigint,
      round(((i::numeric * 0.2) + (random() * 0.4 - 0.2))::numeric, 2),
      round((1.8 + random() * 0.6)::numeric, 2),
      round((3 + random() * 5)::numeric, 2),
      round((62 + random() * 8)::numeric, 1),
      i * 5
    );

    insert into public.agent_stats (
      agent_id, snapshot_at, nav_cents, total_return_pct,
      sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades
    )
    values (
      agent_id_trend,
      base_date + (i || ' days')::interval,
      round((10000 * (1 + (i::numeric * 0.003) + (random() * 0.007 - 0.003)))::numeric)::bigint,
      round(((i::numeric * 0.3) + (random() * 0.6 - 0.3))::numeric, 2),
      round((2.2 + random() * 0.7)::numeric, 2),
      round((4 + random() * 6)::numeric, 2),
      round((55 + random() * 12)::numeric, 1),
      i * 1
    );
  end loop;
end $$;

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

-- Optional: drop old policies first so reruns do not fail
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
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Wallets
create policy "Users can read own wallet"
  on public.wallets for select using (auth.uid() = user_id);

-- Transactions
create policy "Users can read own transactions"
  on public.transactions for select using (auth.uid() = user_id);

-- Holdings
create policy "Users can read own holdings"
  on public.holdings for select using (auth.uid() = user_id);

-- Agents
create policy "Anyone can read agents"
  on public.agents for select using (true);

-- Agent stats
create policy "Anyone can read agent stats"
  on public.agent_stats for select using (true);

-- Agent trades
create policy "Anyone can read agent trades"
  on public.agent_trades for select using (true);

-- Waitlist
create policy "Anyone can join waitlist"
  on public.waitlist for insert with check (true);

-- Agent submissions
create policy "Anyone can submit agent"
  on public.agent_submissions for insert with check (true);