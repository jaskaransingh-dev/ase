import pandas as pd

from backtesting.config import BacktestConfig
from backtesting.simulator import simulate_portfolio


def test_simulator_returns_equity_curve():
    data = pd.DataFrame({
        'timestamp': pd.to_datetime(['2025-01-01', '2025-01-02'], utc=True),
        'symbol': ['AAA', 'AAA'],
        'open': [100, 101],
        'high': [101, 102],
        'low': [99, 100],
        'close': [100, 101],
        'volume': [1000, 1000],
    })
    targets = pd.DataFrame({
        'timestamp': pd.to_datetime(['2025-01-01', '2025-01-02'], utc=True),
        'symbol': ['AAA', 'AAA'],
        'target_weight': [1.0, 1.0],
    })
    out = simulate_portfolio(data, targets, BacktestConfig(max_position_weight=1.0, max_gross_leverage=1.0))
    assert not out['equity_curve'].empty
