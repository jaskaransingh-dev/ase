from dataclasses import dataclass


@dataclass(slots=True)
class BacktestConfig:
    initial_capital: float = 100_000.0
    commission_bps: float = 5.0
    slippage_bps: float = 10.0
    max_gross_leverage: float = 1.0
    max_position_weight: float = 0.25
    min_trade_notional: float = 10.0
    risk_free_rate: float = 0.0
    trading_days_per_year: int = 252
    benchmark_symbol: str | None = None
    long_only: bool = False
    allow_fractional_shares: bool = True
    min_history_rows: int = 60
    min_trade_count: int = 10
    random_seed: int = 42
