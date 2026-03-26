-- Migration 005: Add live state columns to agents table
-- These store the latest signal decision and portfolio snapshot per agent
-- so the dashboard can show what each agent is currently doing.

alter table public.agents
  add column if not exists signal_summary  text,
  add column if not exists portfolio_json  text,
  add column if not exists last_run_at     timestamptz;

-- Index for quick lookup of recently-run agents
create index if not exists idx_agents_last_run_at on public.agents(last_run_at desc);
