-- ══════════════════════════════════════════════════════════════
-- 018: Drop check constraints blocking subscription inserts
-- Run in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════

-- Drop any check constraints on subscriptions that are rejecting valid values
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_bot_slug_check;

-- Re-add loose constraints that allow all intended values
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'expired', 'paused'));

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('beta', 'monthly', 'annual', 'free'));
