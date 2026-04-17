import pandas as pd

from backtesting.metrics import compute_metrics


def test_metrics_basic():
    eq = pd.DataFrame({
        'timestamp': pd.to_datetime(['2025-01-01', '2025-01-02', '2025-01-03'], utc=True),
        'cash': [0, 0, 0],
        'gross_market_value': [100, 101, 102],
        'equity': [100, 101, 102],
        'returns': [0.0, 0.01, 0.0099],
    })
    trades = pd.DataFrame(columns=['notional', 'commission'])
    metrics = compute_metrics(eq, trades)
    assert metrics['total_return'] > 0
