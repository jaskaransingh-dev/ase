-- ============================================================
-- Migration 008: Waitlist tables for ase-landing
-- Run this in the Supabase SQL editor for project frlgckqtrloqunkhbhtp
-- ============================================================

-- ── Investor waitlist ───────────────────────────────────────
create table if not exists waitlist_investors (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  name             text not null,
  email            text not null,
  investment_range text,           -- e.g. '$1k–$5k'
  source           text            -- how they heard about ASE
);

-- Prevent duplicate email signups
create unique index if not exists waitlist_investors_email_idx
  on waitlist_investors (lower(email));

-- RLS: allow anonymous inserts from the landing page, but only admins can read
alter table waitlist_investors enable row level security;

create policy "anon can insert investor waitlist"
  on waitlist_investors for insert
  to anon
  with check (true);

create policy "service role full access investors"
  on waitlist_investors for all
  to service_role
  using (true);

-- ── Builder / quant waitlist ────────────────────────────────
create table if not exists waitlist_builders (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  name                 text not null,
  email                text not null,
  github_url           text,
  strategy_type        text,        -- e.g. 'momentum', 'mean-revert', 'ml'
  strategy_description text,
  backtesting_platform text,        -- e.g. 'QuantConnect', 'Backtrader'
  live_track_record    boolean default false
);

-- Prevent duplicate email signups
create unique index if not exists waitlist_builders_email_idx
  on waitlist_builders (lower(email));

-- RLS
alter table waitlist_builders enable row level security;

create policy "anon can insert builder waitlist"
  on waitlist_builders for insert
  to anon
  with check (true);

create policy "service role full access builders"
  on waitlist_builders for all
  to service_role
  using (true);
