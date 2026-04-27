-- ─────────────────────────────────────────────────────────────────────
-- 028_user_kraken_keys.sql
-- Per-user Kraken API credentials (encrypted at rest).
-- Used by run-agents to execute live trades on behalf of subscribers.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.user_kraken_keys (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users(id) on delete cascade,

  -- AES-256-GCM ciphertext (base64)
  encrypted_key     text          not null,
  encrypted_secret  text          not null,

  -- Display-only — last 4 chars of public key, for UI confirmation
  key_label         text,

  -- 'active' | 'revoked' | 'invalid'
  status            text          not null default 'active',

  -- Cached snapshot from last verification
  verified_at       timestamptz,
  last_balance_usd  numeric(20,2),

  -- Trading scopes user granted on Kraken (informational)
  scopes            text[]        default '{}'::text[],

  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now(),

  unique (user_id)
);

create index if not exists idx_user_kraken_keys_user on public.user_kraken_keys (user_id);
create index if not exists idx_user_kraken_keys_status on public.user_kraken_keys (status) where status = 'active';

-- ── RLS ──────────────────────────────────────────────────────────────
alter table public.user_kraken_keys enable row level security;

-- Users can read their own row (no plaintext exposed; ciphertext only,
-- decryption happens server-side with service role).
drop policy if exists "kraken_keys_select_own" on public.user_kraken_keys;
create policy "kraken_keys_select_own"
  on public.user_kraken_keys
  for select
  using (auth.uid() = user_id);

-- Users insert/update via API only — service role bypasses RLS.
drop policy if exists "kraken_keys_modify_own" on public.user_kraken_keys;
create policy "kraken_keys_modify_own"
  on public.user_kraken_keys
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Auto-update updated_at ───────────────────────────────────────────
create or replace function public.touch_user_kraken_keys() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_touch_user_kraken_keys on public.user_kraken_keys;
create trigger trg_touch_user_kraken_keys
  before update on public.user_kraken_keys
  for each row execute function public.touch_user_kraken_keys();

-- ── Trade ledger: link to Kraken txid ────────────────────────────────
-- Add columns to existing user_trades / agent_trades to track
-- the Kraken order/trade id when execution went through Kraken.
alter table public.user_trades
  add column if not exists kraken_txid       text,
  add column if not exists kraken_ordertxid  text,
  add column if not exists broker            text default 'kraken';

alter table public.agent_trades
  add column if not exists broker            text default 'kraken';

create index if not exists idx_user_trades_kraken_txid on public.user_trades (kraken_txid) where kraken_txid is not null;

comment on table public.user_kraken_keys is
  'Encrypted Kraken API credentials. Decryption happens only in server-side code via lib/kraken-client.ts.';
comment on column public.user_trades.broker is
  'Which broker filled this trade: alpaca | kraken | simulated';
