-- Migration 013: Agent submission pipeline (builder program)
-- White paper: 4-gate authentication pipeline for agent onboarding

CREATE TABLE IF NOT EXISTS public.agent_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text NOT NULL,
  github_url      text,
  strategy_description text,
  strategy_type   text,
  asset_class     text DEFAULT 'crypto',
  status          text DEFAULT 'submitted'
    CHECK (status IN ('submitted','reviewing','paper_trading','approved','rejected')),
  paper_trading_start_at timestamptz,
  paper_trading_end_at   timestamptz,
  admin_notes     text,
  created_at      timestamptz DEFAULT now()
);

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_agent_submissions_status ON public.agent_submissions(status);
CREATE INDEX IF NOT EXISTS idx_agent_submissions_email ON public.agent_submissions(email);
