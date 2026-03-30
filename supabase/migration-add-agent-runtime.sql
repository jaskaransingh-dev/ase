-- ============================================================
-- ASE — Migration: Add agent runtime columns + price_ticks
--
-- Run this in Supabase SQL Editor BEFORE deploying.
-- It is idempotent (safe to run multiple times).
-- ============================================================

-- ── 1. AGENTS — runtime state written by cron ───────────────
alter table public.agents
  add column if not exists signal_summary     text default 'SCANNING',
  add column if not exists portfolio_json     text,
  add column if not exists last_run_at        timestamptz;

-- ── 2. AGENT_STATS — extra financial metrics ─────────────────
alter table public.agent_stats
  add column if not exists sortino_ratio          numeric  default 0,
  add column if not exists volume_shares          numeric  default 0,
  add column if not exists daily_return_pct       numeric  default 0,
  add column if not exists portfolio_value_cents  bigint   default 0;

-- ── 3. PRICE_TICKS — per-minute NAV tick for charts ──────────
create table if not exists public.price_ticks (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid references public.agents(id) on delete cascade,
  tick_at     timestamptz not null default now(),
  price_cents bigint      not null,
  bid_cents   bigint,
  ask_cents   bigint,
  volume      numeric     default 0,
  unique (agent_id, tick_at)
);

-- Index for fast time-series queries
create index if not exists price_ticks_agent_time
  on public.price_ticks (agent_id, tick_at desc);

-- RLS: public read
alter table public.price_ticks enable row level security;

drop policy if exists "Anyone can read price ticks" on public.price_ticks;
create policy "Anyone can read price ticks"
  on public.price_ticks for select using (true);

-- ── 4. Reset all agents to $100 NAV (100 cents = $1, 10000 = $100) ─
-- Only sets agents that still have the default — doesn't overwrite
-- agents that have already had real trades.
update public.agents
  set share_price_cents = 10000
  where share_price_cents is null or share_price_cents = 0;
