-- ══════════════════════════════════════════════════════════════
-- 017: Fix subscriptions table — bot_slug nullable + backfill
-- Run in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════

-- Make bot_slug nullable (it is redundant with the agent_id FK)
-- and backfill any existing rows from the agents table
ALTER TABLE subscriptions ALTER COLUMN bot_slug DROP NOT NULL;

UPDATE subscriptions s
SET bot_slug = a.slug
FROM agents a
WHERE s.agent_id = a.id
  AND (s.bot_slug IS NULL OR s.bot_slug = '');
