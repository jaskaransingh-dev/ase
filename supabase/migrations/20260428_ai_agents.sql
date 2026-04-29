-- AI-generated trading agents (Quant Lab agentic mode)
-- Each row is a NL-compiled strategy spec, optionally linked to backtest runs.

create table if not exists public.ai_agents (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  thesis          text not null,
  prompt          text not null,           -- original NL prompt
  spec            jsonb not null,          -- AgentSpec (template, alpha_type, symbols, ...)
  last_run_id     uuid,                    -- references quant_runs(id) (no FK to avoid coupling)
  last_grade      text,
  last_score      numeric,
  last_sharpe     numeric,
  last_cagr       numeric,
  last_max_dd     numeric,
  status          text not null default 'draft',  -- draft | tested | published | archived
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists ai_agents_owner_idx on public.ai_agents(owner_id, created_at desc);
create index if not exists ai_agents_status_idx on public.ai_agents(status) where status = 'published';

alter table public.ai_agents enable row level security;

drop policy if exists "ai_agents owner read" on public.ai_agents;
create policy "ai_agents owner read"
  on public.ai_agents for select
  using (auth.uid() = owner_id or status = 'published');

drop policy if exists "ai_agents owner write" on public.ai_agents;
create policy "ai_agents owner write"
  on public.ai_agents for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create or replace function public.ai_agents_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists ai_agents_touch on public.ai_agents;
create trigger ai_agents_touch
  before update on public.ai_agents
  for each row execute function public.ai_agents_touch_updated_at();
