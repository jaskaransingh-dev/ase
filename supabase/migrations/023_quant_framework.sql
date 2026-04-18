-- ============================================================
-- Migration 023 — Full Quant Framework
-- Run this in Supabase SQL Editor (standalone, safe to re-run)
-- Depends on: schema.sql (profiles), 022+ migrations
-- ============================================================

-- ── QUANT STRATEGIES ─────────────────────────────────────────
-- Full strategy packages: every module is a separate JSONB config
-- so the platform controls execution while users define logic.

create table if not exists public.quant_strategies (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid references public.profiles(id) on delete cascade,
  name                text not null,
  slug                text unique not null,
  description         text,
  version             integer default 1,
  code_hash           text,

  -- Module configs (user-defined, validated by platform)
  universe_config     jsonb default '{}',    -- see universe_config schema below
  feature_config      jsonb default '{}',    -- feature list + params
  alpha_config        jsonb default '{}',    -- alpha model type + weights
  risk_config         jsonb default '{}',    -- limits, factor model params
  execution_config    jsonb default '{}',    -- order type, slippage model
  optimizer_config    jsonb default '{}',    -- risk aversion, max weight, etc.
  rebalance_config    jsonb default '{}',    -- schedule, lookback

  -- Inline user code hooks (platform calls these)
  universe_code       text,   -- build_universe(date, data) -> list[str]
  feature_code        text,   -- compute_features(data) -> DataFrame
  alpha_code          text,   -- predict(features) -> Series
  risk_limits_code    text,   -- risk_limits() -> dict
  execution_code      text,   -- execution_preferences() -> dict

  -- Status
  status              text default 'draft'
    check (status in ('draft','validating','validated','rejected','listed')),
  validation_errors   jsonb default '[]',

  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- ── QUANT BACKTEST RUNS ───────────────────────────────────────
-- A full quant run goes through all 9 layers and stores
-- structured artifacts at each step.

create table if not exists public.quant_runs (
  id                  uuid primary key default gen_random_uuid(),
  strategy_id         uuid references public.quant_strategies(id) on delete cascade,
  owner_id            uuid references public.profiles(id) on delete cascade,

  -- Run config snapshot
  symbols             text[]  not null,
  start_date          date    not null,
  end_date            date    not null,
  rebalance_freq      text    default 'daily'
    check (rebalance_freq in ('daily','weekly','monthly')),
  initial_capital     numeric default 1000000,
  fee_bps             numeric default 10,     -- round-trip transaction cost bps

  -- Artifacts stored per layer
  universe_snapshots  jsonb default '[]',     -- [{date, symbols[]}]
  feature_snapshots   jsonb default '[]',     -- [{date, top10_features}] (sampled)
  signal_snapshots    jsonb default '[]',     -- [{date, signals{symbol:score}}]
  allocation_history  jsonb default '[]',     -- [{date, weights{symbol:w}}]
  order_log           jsonb default '[]',     -- [{date, symbol, side, qty, price, slippage}]
  fill_log            jsonb default '[]',     -- [{date, symbol, filled_qty, avg_price, cost}]
  factor_exposures    jsonb default '[]',     -- [{date, market_beta, sector_hhi, ...}]

  -- Equity & PnL
  equity_curve        jsonb default '[]',     -- [{date, equity, cash, invested}]
  drawdown_curve      jsonb default '[]',     -- [{date, drawdown_pct}]
  pnl_attribution     jsonb default '{}',     -- {alpha_pnl, cost_pnl, factor_pnl}

  -- Performance metrics (full tear sheet)
  metrics             jsonb default '{}',

  -- IC series
  ic_series           jsonb default '[]',     -- [{date, ic, rank_ic}]

  -- Walk-forward
  walkforward_windows jsonb default '[]',

  -- State
  status              text default 'pending'
    check (status in ('pending','running','completed','failed')),
  error               text,
  runtime_ms          integer,
  created_at          timestamptz default now()
);

-- ── SIGNAL LIBRARY ────────────────────────────────────────────
-- Reusable signal definitions that can be composed into strategies

create table if not exists public.quant_signals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references public.profiles(id) on delete cascade,
  name          text not null,
  category      text not null
    check (category in (
      'momentum','mean_reversion','volatility','volume',
      'fundamental','microstructure','regime','ml','alternative'
    )),
  description   text,
  code          text not null,       -- compute_signal(data) -> Series
  params        jsonb default '{}',
  -- Evaluation stats (filled after backtest)
  mean_ic       numeric,
  ic_ir         numeric,             -- IC / std(IC)
  decay_halflife integer,            -- days until IC halves
  is_public     boolean default false,
  created_at    timestamptz default now()
);

-- ── FACTOR MODEL LIBRARY ──────────────────────────────────────
-- Named factor models (market, sector, style) that risk models can use

create table if not exists public.factor_models (
  id              uuid primary key default gen_random_uuid(),
  name            text unique not null,
  description     text,
  factors         jsonb not null,    -- [{name, type, compute_fn_key}]
  is_platform     boolean default false,  -- true = built-in platform model
  created_at      timestamptz default now()
);

-- Insert platform built-in factor model
insert into public.factor_models (name, description, factors, is_platform)
values (
  'market_sector_style',
  'Market beta + 11 GICS sectors + 5 style factors (momentum, value, size, low_vol, quality)',
  '[
    {"name":"market","type":"market","compute":"market_beta"},
    {"name":"momentum","type":"style","compute":"ret_252d_lag21"},
    {"name":"value","type":"style","compute":"earnings_yield"},
    {"name":"size","type":"style","compute":"log_market_cap"},
    {"name":"low_vol","type":"style","compute":"neg_vol_252d"},
    {"name":"quality","type":"style","compute":"roe_stability"}
  ]'::jsonb,
  true
)
on conflict (name) do nothing;

-- ── UNIVERSE REGISTRY ─────────────────────────────────────────
-- Reusable universe definitions (crypto top-20, US liquid equities, etc.)

create table if not exists public.quant_universes (
  id              uuid primary key default gen_random_uuid(),
  name            text unique not null,
  description     text,
  asset_class     text default 'crypto'
    check (asset_class in ('crypto','equity','futures','fx')),
  symbols         text[] not null,
  min_adv_usd     numeric default 0,         -- minimum avg daily volume ($)
  min_price_usd   numeric default 0,
  is_platform     boolean default false,
  created_at      timestamptz default now()
);

-- Insert platform universes
insert into public.quant_universes (name, description, asset_class, symbols, min_adv_usd, is_platform)
values
  (
    'crypto_top10',
    'Top 10 liquid crypto assets by market cap',
    'crypto',
    ARRAY['BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','ADA-USD','AVAX-USD','DOT-USD','LINK-USD','UNI-USD'],
    1000000,
    true
  ),
  (
    'crypto_defi',
    'DeFi protocol tokens',
    'crypto',
    ARRAY['UNI-USD','AAVE-USD','LINK-USD','MKR-USD','CRV-USD','SNX-USD','COMP-USD','YFI-USD'],
    500000,
    true
  ),
  (
    'crypto_l1',
    'Layer-1 smart contract platforms',
    'crypto',
    ARRAY['ETH-USD','SOL-USD','ADA-USD','AVAX-USD','DOT-USD','NEAR-USD','ATOM-USD','FTM-USD'],
    500000,
    true
  )
on conflict (name) do nothing;

-- ── REGIME LABELS ─────────────────────────────────────────────
-- Market regime classification (bull, bear, high-vol, low-vol, etc.)

create table if not exists public.regime_labels (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  symbol      text not null,          -- 'BTC-USD' or 'MARKET' for index
  regime      text not null
    check (regime in ('bull_low_vol','bull_high_vol','bear_low_vol','bear_high_vol','sideways')),
  trend       text check (trend in ('up','down','flat')),
  vol_regime  text check (vol_regime in ('low','medium','high','extreme')),
  computed_at timestamptz default now(),
  unique(date, symbol)
);

-- ── IC BENCHMARK ──────────────────────────────────────────────
-- Platform-level IC benchmarks for ranking user signals

create table if not exists public.ic_benchmarks (
  id            uuid primary key default gen_random_uuid(),
  signal_name   text not null,
  asset_class   text not null,
  universe_name text not null,
  mean_ic       numeric not null,
  ic_ir         numeric not null,
  sample_start  date,
  sample_end    date,
  computed_at   timestamptz default now(),
  unique(signal_name, asset_class, universe_name)
);

-- ── STRATEGY PERFORMANCE LEADERBOARD ─────────────────────────
-- Denormalized table for fast leaderboard queries
-- Recomputed nightly from quant_runs

create table if not exists public.quant_leaderboard (
  id              uuid primary key default gen_random_uuid(),
  strategy_id     uuid unique references public.quant_strategies(id) on delete cascade,
  owner_id        uuid references public.profiles(id) on delete cascade,
  run_id          uuid references public.quant_runs(id),

  -- Performance
  cagr            numeric,
  sharpe          numeric,
  sortino         numeric,
  calmar          numeric,
  max_drawdown    numeric,
  win_rate        numeric,
  profit_factor   numeric,

  -- Risk
  avg_gross_exp   numeric,    -- average gross exposure
  avg_turnover    numeric,    -- average daily turnover
  avg_holding     numeric,    -- average holding period (days)

  -- IC quality
  mean_ic         numeric,
  ic_ir           numeric,

  -- Composite rank score
  rank_score      numeric,
  rank_position   integer,

  updated_at      timestamptz default now()
);

-- ── RPC: compute leaderboard rank score ───────────────────────
create or replace function public.compute_quant_rank_score(
  p_sharpe      numeric,
  p_drawdown    numeric,   -- absolute %, e.g. 25.0
  p_ic_ir       numeric,   -- IC IR (higher better)
  p_turnover    numeric,   -- avg daily turnover (lower better for cost)
  p_calmar      numeric
) returns numeric as $$
begin
  return round(
    coalesce(p_sharpe,  0)  * 0.30
    + coalesce(p_calmar, 0) * 0.20
    + coalesce(p_ic_ir,  0) * 0.20
    - (coalesce(p_drawdown, 100) / 100.0) * 0.20
    - least(coalesce(p_turnover, 1), 2.0) * 0.05
    , 4
  );
end;
$$ language plpgsql immutable;

-- ── RPC: upsert leaderboard row ───────────────────────────────
create or replace function public.upsert_quant_leaderboard(
  p_strategy_id uuid,
  p_run_id      uuid,
  p_metrics     jsonb
) returns void as $$
declare
  v_owner uuid;
  v_score numeric;
begin
  select owner_id into v_owner from public.quant_strategies where id = p_strategy_id;

  v_score := public.compute_quant_rank_score(
    (p_metrics->>'sharpe')::numeric,
    (p_metrics->>'maxDrawdownPct')::numeric,
    (p_metrics->>'ic_ir')::numeric,
    (p_metrics->>'avgTurnover')::numeric,
    (p_metrics->>'calmarRatio')::numeric
  );

  insert into public.quant_leaderboard (
    strategy_id, owner_id, run_id,
    cagr, sharpe, sortino, calmar, max_drawdown, win_rate, profit_factor,
    avg_gross_exp, avg_turnover, avg_holding, mean_ic, ic_ir, rank_score
  )
  values (
    p_strategy_id, v_owner, p_run_id,
    (p_metrics->>'cagr')::numeric,
    (p_metrics->>'sharpe')::numeric,
    (p_metrics->>'sortino')::numeric,
    (p_metrics->>'calmarRatio')::numeric,
    (p_metrics->>'maxDrawdownPct')::numeric,
    (p_metrics->>'winRate')::numeric,
    (p_metrics->>'profitFactor')::numeric,
    (p_metrics->>'avgGrossExposure')::numeric,
    (p_metrics->>'avgTurnover')::numeric,
    (p_metrics->>'avgHoldingDays')::numeric,
    (p_metrics->>'meanIC')::numeric,
    (p_metrics->>'ic_ir')::numeric,
    v_score
  )
  on conflict (strategy_id) do update set
    run_id        = excluded.run_id,
    cagr          = excluded.cagr,
    sharpe        = excluded.sharpe,
    sortino       = excluded.sortino,
    calmar        = excluded.calmar,
    max_drawdown  = excluded.max_drawdown,
    win_rate      = excluded.win_rate,
    profit_factor = excluded.profit_factor,
    avg_gross_exp = excluded.avg_gross_exp,
    avg_turnover  = excluded.avg_turnover,
    avg_holding   = excluded.avg_holding,
    mean_ic       = excluded.mean_ic,
    ic_ir         = excluded.ic_ir,
    rank_score    = excluded.rank_score,
    updated_at    = now();

  -- Recompute rank_position for all entries
  with ranked as (
    select id, row_number() over (order by rank_score desc) as rn
    from public.quant_leaderboard
  )
  update public.quant_leaderboard l
  set rank_position = r.rn
  from ranked r
  where l.id = r.id;
end;
$$ language plpgsql security definer;

-- ── INDEXES ───────────────────────────────────────────────────
create index if not exists idx_quant_strategies_owner  on public.quant_strategies(owner_id);
create index if not exists idx_quant_runs_strategy     on public.quant_runs(strategy_id);
create index if not exists idx_quant_runs_owner        on public.quant_runs(owner_id);
create index if not exists idx_quant_signals_category  on public.quant_signals(category);
create index if not exists idx_regime_labels_date      on public.regime_labels(date, symbol);
create index if not exists idx_quant_leaderboard_rank  on public.quant_leaderboard(rank_score desc);

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
alter table public.quant_strategies   enable row level security;
alter table public.quant_runs         enable row level security;
alter table public.quant_signals      enable row level security;
alter table public.factor_models      enable row level security;
alter table public.quant_universes    enable row level security;
alter table public.regime_labels      enable row level security;
alter table public.quant_leaderboard  enable row level security;
alter table public.ic_benchmarks      enable row level security;

-- Quant strategies: owners manage, listed ones are public
drop policy if exists "Owners manage own quant strategies"    on public.quant_strategies;
drop policy if exists "Anyone reads listed quant strategies"  on public.quant_strategies;
create policy "Owners manage own quant strategies"   on public.quant_strategies
  for all  using (auth.uid() = owner_id);
create policy "Anyone reads listed quant strategies" on public.quant_strategies
  for select using (status = 'listed');

-- Quant runs: owner only
drop policy if exists "Owners manage own quant runs" on public.quant_runs;
create policy "Owners manage own quant runs" on public.quant_runs
  for all using (auth.uid() = owner_id);

-- Signals: owner or public
drop policy if exists "Owners manage own signals"  on public.quant_signals;
drop policy if exists "Anyone reads public signals" on public.quant_signals;
create policy "Owners manage own signals"   on public.quant_signals for all   using (auth.uid() = owner_id);
create policy "Anyone reads public signals" on public.quant_signals for select using (is_public = true);

-- Platform tables: anyone can read
drop policy if exists "Anyone reads factor models"   on public.factor_models;
drop policy if exists "Anyone reads universes"       on public.quant_universes;
drop policy if exists "Anyone reads regime labels"   on public.regime_labels;
drop policy if exists "Anyone reads leaderboard"     on public.quant_leaderboard;
drop policy if exists "Anyone reads ic benchmarks"   on public.ic_benchmarks;
create policy "Anyone reads factor models"  on public.factor_models  for select using (true);
create policy "Anyone reads universes"      on public.quant_universes for select using (true);
create policy "Anyone reads regime labels"  on public.regime_labels   for select using (true);
create policy "Anyone reads leaderboard"    on public.quant_leaderboard for select using (true);
create policy "Anyone reads ic benchmarks"  on public.ic_benchmarks   for select using (true);

-- ============================================================
-- JSON SCHEMA REFERENCE (not enforced in DB, validated in app)
-- ============================================================
--
-- universe_config: {
--   universe_name: string,         // ref to quant_universes.name
--   symbols: string[],             // override or use universe
--   min_adv_usd: number,
--   min_price_usd: number,
--   max_assets: number,
--   rebalance_freq: "daily"|"weekly"|"monthly"
-- }
--
-- feature_config: {
--   features: [
--     { name: string, type: "price"|"volume"|"cross_sectional"|"regime",
--       params: { window: number, ... } }
--   ]
-- }
--
-- alpha_config: {
--   type: "momentum"|"mean_reversion"|"ml"|"composite",
--   weights: { momentum: 0.5, mean_reversion: 0.3, ... },
--   forecast_horizon: number,      // days
--   signal_scale: number           // bps per unit of normalized signal
-- }
--
-- risk_config: {
--   factor_model: string,          // ref to factor_models.name
--   max_gross_exposure: number,    // e.g. 1.5 = 150%
--   max_net_exposure: number,      // e.g. 0.1 = ±10%
--   max_position_weight: number,   // e.g. 0.05 = 5% per name
--   max_sector_exposure: number,
--   max_drawdown_trigger: number,  // halt at X% drawdown
--   var_confidence: number,        // e.g. 0.95
--   var_limit_pct: number,         // VaR limit as % of portfolio
--   max_daily_turnover: number     // e.g. 0.20 = 20%
-- }
--
-- execution_config: {
--   order_type: "market"|"limit"|"twap"|"vwap",
--   slippage_model: "fixed"|"volatility"|"market_impact",
--   slippage_bps: number,
--   participation_rate: number,    // e.g. 0.1 = 10% of ADV
--   min_trade_size_usd: number,
--   round_lots: boolean
-- }
--
-- optimizer_config: {
--   method: "mean_variance"|"equal_weight"|"risk_parity"|"min_variance",
--   risk_aversion: number,         // lambda in mean-variance
--   turnover_penalty: number,      // gamma
--   max_weight: number,
--   min_weight: number,            // can be negative for shorts
--   leverage: number,              // target gross exposure
--   sector_neutral: boolean
-- }
-- ============================================================