from backtesting.scoring import compute_scorecard


def test_scorecard_has_grade():
    metrics = {
        'cagr': 0.12,
        'sharpe': 1.2,
        'sortino': 1.5,
        'profit_factor': 1.4,
        'max_drawdown': -0.10,
        'calmar': 1.2,
        'downside_volatility': 0.12,
        'positive_month_ratio': 0.65,
    }
    diagnostics = {
        'trade_count': 30,
        'turnover': 3.0,
        'concentration_ratio': 0.3,
        'enough_trades': True,
        'enough_rows': True,
        'no_nan_equity': True,
    }
    scorecard = compute_scorecard(metrics, diagnostics)
    assert scorecard.grade in {'A', 'B', 'C', 'D', 'F'}
