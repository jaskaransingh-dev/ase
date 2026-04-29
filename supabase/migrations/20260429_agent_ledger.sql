-- Agent paper-trade ledger + cadence tick tracking.
-- Every published agent posts trades here on its cadence interval.
-- The exchange UI reads this to let users copy/follow trades.

alter table public.ai_agents add column if not exists last_tick_at timestamptz;
create index if not exists ai_agents_pub_tick_idx on public.ai_agents(status, last_tick_at) where status = 'published';

create table if not exists public.agent_paper_ledger (
  id           bigserial primary key,
  agent_id     uuid not null references public.ai_agents(id) on delete cascade,
  owner_id     uuid not null references auth.users(id) on delete cascade,
  symbol       text not null,
  side         text not null check (side in ('BUY','SELL')),
  qty          numeric not null,
  price        numeric not null,
  notional     numeric not null,
  mode         text not null default 'paper' check (mode in ('paper','live')),
  executed_at  timestamptz not null default now()
);

create index if not exists agent_paper_ledger_agent_idx on public.agent_paper_ledger(agent_id, executed_at desc);
create index if not exists agent_paper_ledger_owner_idx on public.agent_paper_ledger(owner_id, executed_at desc);
create index if not exists agent_paper_ledger_recent_idx on public.agent_paper_ledger(executed_at desc);

alter table public.agent_paper_ledger enable row level security;

drop policy if exists "ledger public read" on public.agent_paper_ledger;
create policy "ledger public read" on public.agent_paper_ledger for select using (true);

drop policy if exists "ledger owner write" on public.agent_paper_ledger;
create policy "ledger owner write" on public.agent_paper_ledger for insert
  with check (auth.uid() = owner_id);
