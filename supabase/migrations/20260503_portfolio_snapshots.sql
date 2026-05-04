-- User portfolio value snapshots — one row per user per day.
-- Written by the run-agents cron after each tick so the dashboard
-- can render a portfolio-over-time chart without re-computing history.

create table if not exists public.user_portfolio_snapshots (
  id           bigserial primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  snapshot_at  timestamptz not null default now(),
  total_value_cents   integer not null default 0,
  invested_cents      integer not null default 0,
  cash_cents          integer not null default 0,
  pnl_cents           integer not null default 0
);

create index if not exists user_portfolio_snapshots_user_idx
  on public.user_portfolio_snapshots(user_id, snapshot_at desc);

-- One snapshot per hour per user to avoid bloat
create unique index if not exists user_portfolio_snapshots_hour_uniq
  on public.user_portfolio_snapshots(user_id, date_trunc('hour', snapshot_at));

alter table public.user_portfolio_snapshots enable row level security;

create policy "Users read own snapshots"
  on public.user_portfolio_snapshots for select
  using (auth.uid() = user_id);

create policy "Service role write snapshots"
  on public.user_portfolio_snapshots for insert
  with check (true);
