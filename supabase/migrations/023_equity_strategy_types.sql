-- Add equity strategy types to the agents table check constraint
-- Previous constraint only allowed: momentum, mean_reversion, trend_following, crypto_momentum, crypto_mean_reversion

alter table public.agents drop constraint if exists agents_strategy_type_check;

alter table public.agents add constraint agents_strategy_type_check
  check (strategy_type in (
    'momentum',
    'mean_reversion',
    'trend_following',
    'crypto_momentum',
    'crypto_mean_reversion',
    'equity_momentum',
    'equity_rotation',
    'equity_mean_reversion'
  ));
