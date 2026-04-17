from __future__ import annotations


def summarize_result(result: dict) -> dict:
    return {
        'strategy_name': result['metadata']['strategy_name'],
        'strategy_version': result['metadata']['strategy_version'],
        'composite_score': result['scorecard']['composite_score'],
        'grade': result['scorecard']['grade'],
        'cagr': result['metrics']['cagr'],
        'sharpe': result['metrics']['sharpe'],
        'max_drawdown': result['metrics']['max_drawdown'],
        'trade_count': result['diagnostics']['trade_count'],
        'turnover': result['diagnostics']['turnover'],
    }
