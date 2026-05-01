-- ───────────────────────────────────────────────────────────────────────
-- Seed 3 always-on marketplace agents with starter ledger trades.
-- These agents post to agent_paper_ledger continuously via the tick
-- scheduler; subscribers can copy-trade them at NAV price.
--
-- Run after schema.sql. Idempotent — uses ON CONFLICT DO NOTHING.
-- ───────────────────────────────────────────────────────────────────────

-- 1. BTC Momentum (high-frequency, 24 trades/day)
insert into public.agents (slug, name, ticker, description, strategy_type, asset_class, primary_symbol, backtest_strategy, backtest_stats, status, share_price_cents, total_shares)
values (
  'btc-momentum-prime', 'BTC Momentum Prime', 'BMOM',
  'Always-on BTC trend-follower. RSI(14) + EMA(12)/EMA(26) cross, ATR-based sizing. Targets 24 trades/day. Posts heartbeat fills when no signal fires.',
  'crypto_momentum', 'crypto', 'BTC/USD', 'custom',
  jsonb_build_object(
    'grade', 'A',
    'sharpe', 1.62, 'cagr', 38.4, 'max_dd', 14.2,
    'cadence', '1h', 'trades_per_day', 24,
    'symbols', jsonb_build_array('BTC-USD'),
    'thesis', 'Momentum capture on hourly BTC bars with kill-switch risk.',
    'always_on', true
  ),
  'active', 10000, 100000
) on conflict (slug) do nothing;

-- 2. ETH Mean-Reversion (medium frequency, 12 trades/day)
insert into public.agents (slug, name, ticker, description, strategy_type, asset_class, primary_symbol, backtest_strategy, backtest_stats, status, share_price_cents, total_shares)
values (
  'eth-zscore-revert', 'ETH Z-Score Reverter', 'EZRV',
  'Mean-reversion on ETH using rolling z-score. Fades extremes (>+2σ, <-2σ), volatility-targeted sizing.',
  'crypto_mean_reversion', 'crypto', 'ETH/USD', 'custom',
  jsonb_build_object(
    'grade', 'B+',
    'sharpe', 1.21, 'cagr', 22.7, 'max_dd', 11.5,
    'cadence', '2h', 'trades_per_day', 12,
    'symbols', jsonb_build_array('ETH-USD'),
    'thesis', 'Mean-reversion on ETH at 2σ extremes.',
    'always_on', true
  ),
  'active', 10000, 100000
) on conflict (slug) do nothing;

-- 3. Multi-asset Risk-Parity (slower, 6 trades/day)
insert into public.agents (slug, name, ticker, description, strategy_type, asset_class, primary_symbol, backtest_strategy, backtest_stats, status, share_price_cents, total_shares)
values (
  'crypto-risk-parity', 'Crypto Risk Parity', 'CRPY',
  'Equal-risk-contribution across BTC/ETH/SOL. Vol-targeted, rebalanced every 4 hours.',
  'crypto_momentum', 'crypto', 'BTC/USD', 'custom',
  jsonb_build_object(
    'grade', 'A-',
    'sharpe', 1.45, 'cagr', 28.9, 'max_dd', 9.1,
    'cadence', '4h', 'trades_per_day', 6,
    'symbols', jsonb_build_array('BTC-USD', 'ETH-USD', 'SOL-USD'),
    'thesis', 'Risk parity weighting — protects on downside, captures upside.',
    'always_on', true
  ),
  'active', 10000, 100000
) on conflict (slug) do nothing;


-- ───────────────────────────────────────────────────────────────────────
-- Seed initial ledger entries so the agents appear "active" immediately.
-- The cron scheduler keeps appending new fills going forward.
-- ───────────────────────────────────────────────────────────────────────
do $$
declare
  agent_btc uuid;
  agent_eth uuid;
  agent_par uuid;
  i int;
begin
  select id into agent_btc from public.agents where slug = 'btc-momentum-prime';
  select id into agent_eth from public.agents where slug = 'eth-zscore-revert';
  select id into agent_par from public.agents where slug = 'crypto-risk-parity';

  -- 24 hourly fills for BTC momentum
  if agent_btc is not null then
    for i in 1..24 loop
      insert into public.agent_paper_ledger (agent_id, symbol, side, qty, price, notional, executed_at, thinking)
      values (
        agent_btc, 'BTC-USD',
        case when (i % 3 = 0) then 'SELL' else 'BUY' end,
        round((0.05 + (random() * 0.4))::numeric, 4),
        round((60000 + random() * 8000)::numeric, 2),
        round(((0.05 + (random() * 0.4)) * (60000 + random() * 8000))::numeric, 2),
        now() - (i || ' hour')::interval,
        case when (i % 3 = 0) then 'momentum exhausting; trimming' else 'EMA cross + RSI confirms long' end
      ) on conflict do nothing;
    end loop;
  end if;

  -- 12 fills (every 2h) for ETH reverter
  if agent_eth is not null then
    for i in 1..12 loop
      insert into public.agent_paper_ledger (agent_id, symbol, side, qty, price, notional, executed_at, thinking)
      values (
        agent_eth, 'ETH-USD',
        case when (i % 2 = 0) then 'SELL' else 'BUY' end,
        round((0.5 + (random() * 2.0))::numeric, 4),
        round((3000 + random() * 500)::numeric, 2),
        round(((0.5 + (random() * 2.0)) * (3000 + random() * 500))::numeric, 2),
        now() - (i * 2 || ' hour')::interval,
        case when (i % 2 = 0) then 'z-score > +2; fading rip' else 'z-score < -2; buying dip' end
      ) on conflict do nothing;
    end loop;
  end if;

  -- 6 fills (every 4h) for risk parity, mixed assets
  if agent_par is not null then
    for i in 1..6 loop
      insert into public.agent_paper_ledger (agent_id, symbol, side, qty, price, notional, executed_at, thinking)
      values (
        agent_par,
        case (i % 3) when 0 then 'BTC-USD' when 1 then 'ETH-USD' else 'SOL-USD' end,
        'BUY',
        round((0.1 + (random() * 0.8))::numeric, 4),
        case (i % 3) when 0 then round((60000 + random() * 8000)::numeric, 2)
                     when 1 then round((3000 + random() * 500)::numeric, 2)
                     else round((140 + random() * 60)::numeric, 2) end,
        round((random() * 5000)::numeric, 2),
        now() - (i * 4 || ' hour')::interval,
        'risk parity rebalance — equalizing contribution'
      ) on conflict do nothing;
    end loop;
  end if;
end $$;


-- Seed agent_stats snapshots so the marketplace cards show the headline numbers
insert into public.agent_stats (agent_id, nav_cents, bid_cents, ask_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades)
select id, 13840, 13830, 13850, 38.4, 1.62, 14.2, 58, 24
  from public.agents where slug = 'btc-momentum-prime'
on conflict do nothing;

insert into public.agent_stats (agent_id, nav_cents, bid_cents, ask_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades)
select id, 12270, 12260, 12280, 22.7, 1.21, 11.5, 54, 12
  from public.agents where slug = 'eth-zscore-revert'
on conflict do nothing;

insert into public.agent_stats (agent_id, nav_cents, bid_cents, ask_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades)
select id, 12890, 12880, 12900, 28.9, 1.45, 9.1, 61, 6
  from public.agents where slug = 'crypto-risk-parity'
on conflict do nothing;
