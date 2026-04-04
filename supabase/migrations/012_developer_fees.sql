-- Migration 012: Developer performance fee tracking
-- White paper Section 4.1: developers earn 15-20% of NAV growth

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS developer_fee_pct    numeric DEFAULT 20.0,
  ADD COLUMN IF NOT EXISTS developer_email       text,
  ADD COLUMN IF NOT EXISTS developer_name        text,
  ADD COLUMN IF NOT EXISTS high_water_mark_cents bigint DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS accrued_fee_cents     bigint DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.developer_fee_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        uuid REFERENCES public.agents(id),
  period_end      timestamptz DEFAULT now(),
  nav_start_cents bigint,
  nav_end_cents   bigint,
  fee_pct         numeric,
  fee_amount_cents bigint,
  status          text DEFAULT 'pending' CHECK (status IN ('pending','paid','waived')),
  created_at      timestamptz DEFAULT now()
);

-- Initialize HWM from current share price for existing agents
UPDATE public.agents SET high_water_mark_cents = GREATEST(share_price_cents, 10000) WHERE high_water_mark_cents = 10000 AND share_price_cents IS NOT NULL;

SELECT slug, developer_fee_pct, high_water_mark_cents, accrued_fee_cents FROM public.agents WHERE status = 'active';
