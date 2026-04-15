-- Migration: Add agent_reasoning table for storing agent thoughts and decisions
-- This enables the "Thinking Panel" UI showing what each agent is analyzing

CREATE TABLE IF NOT EXISTS public.agent_reasoning (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid references public.agents(id) on delete cascade,
  run_at          timestamptz not null,
  
  -- The reasoning/thought process
  thinking        text,
  signal_summary  text,
  
  -- Market state at time of decision
  prices_json     jsonb,        -- Current prices of relevant symbols
  indicators_json jsonb,        -- Technical indicators calculated
  
  -- Decision context
  portfolio_json  jsonb,        -- Current positions
  actions_json    jsonb,        -- Planned actions (before execution)
  results_json    jsonb,        -- Execution results
  
  -- Market data source
  price_source    text default 'yahoo_finance',
  
  created_at      timestamptz default now()
);

-- Index for fetching recent reasoning by agent
CREATE INDEX IF NOT EXISTS idx_agent_reasoning_agent_run
  ON public.agent_reasoning(agent_id, run_at DESC);

-- Index for filtering by signal
CREATE INDEX IF NOT EXISTS idx_agent_reasoning_signal
  ON public.agent_reasoning(agent_id, signal_summary);

-- Enable RLS
ALTER TABLE public.agent_reasoning ENABLE ROW LEVEL SECURITY;

-- Anyone can read agent reasoning (public data)
DROP POLICY IF EXISTS "Anyone can read agent_reasoning" ON public.agent_reasoning;
CREATE POLICY "Anyone can read agent_reasoning"
  ON public.agent_reasoning FOR SELECT USING (true);

-- Service role can write
DROP POLICY IF EXISTS "Service role can write agent_reasoning" ON public.agent_reasoning;
CREATE POLICY "Service role can write agent_reasoning"
  ON public.agent_reasoning FOR ALL USING (true);