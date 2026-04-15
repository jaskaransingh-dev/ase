-- ══════════════════════════════════════════════════════════════
-- 022: Saved backtests for user history
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.saved_backtests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  symbol      text NOT NULL,
  strategy    text NOT NULL,
  params      jsonb DEFAULT '{}',
  period      text NOT NULL DEFAULT '1y',
  results     jsonb NOT NULL DEFAULT '{}',
  share_token text UNIQUE DEFAULT gen_random_uuid()::text,
  is_public   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.saved_backtests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_backtests_public_read" ON public.saved_backtests;
DROP POLICY IF EXISTS "saved_backtests_user_read"   ON public.saved_backtests;
DROP POLICY IF EXISTS "saved_backtests_user_write"  ON public.saved_backtests;

-- Public read for shared reports
CREATE POLICY "saved_backtests_public_read"
  ON public.saved_backtests FOR SELECT
  USING (is_public = true OR auth.uid() = user_id);

-- Users can read their own
CREATE POLICY "saved_backtests_user_read"
  ON public.saved_backtests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert/update/delete their own
CREATE POLICY "saved_backtests_user_write"
  ON public.saved_backtests FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS saved_backtests_user_id_idx
  ON public.saved_backtests(user_id);

CREATE INDEX IF NOT EXISTS saved_backtests_share_token_idx
  ON public.saved_backtests(share_token);

CREATE OR REPLACE FUNCTION update_saved_backtests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_saved_backtests_updated_at ON public.saved_backtests;
CREATE TRIGGER update_saved_backtests_updated_at
  BEFORE UPDATE ON public.saved_backtests
  FOR EACH ROW EXECUTE FUNCTION update_saved_backtests_updated_at();
