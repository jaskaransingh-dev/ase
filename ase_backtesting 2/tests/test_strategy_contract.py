import pandas as pd

from backtesting.examples.sma_cross import SMACrossStrategy


def test_strategy_contract_columns():
    strategy = SMACrossStrategy({'fast': 2, 'slow': 3})
    data = pd.DataFrame({
        'timestamp': pd.to_datetime(['2025-01-01', '2025-01-02', '2025-01-03'], utc=True),
        'symbol': ['AAA', 'AAA', 'AAA'],
        'open': [1, 2, 3],
        'high': [1, 2, 3],
        'low': [1, 2, 3],
        'close': [1, 2, 3],
        'volume': [1, 1, 1],
    })
    out = strategy.generate_targets(data)
    assert {'timestamp', 'symbol', 'target_weight'}.issubset(out.columns)
