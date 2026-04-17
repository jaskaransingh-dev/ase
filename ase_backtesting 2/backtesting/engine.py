from __future__ import annotations

import dataclasses
import pandas as pd

from .data import normalize_ohlcv
from .metrics import compute_metrics
from .scoring import compute_scorecard
from .simulator import simulate_portfolio
from .validation import validate_targets, compute_diagnostics


def run_backtest(strategy, train_data: pd.DataFrame, test_data: pd.DataFrame, config, robustness: dict | None = None) -> dict:
    train = normalize_ohlcv(train_data)
    test = normalize_ohlcv(test_data)

    strategy.fit(train)
    raw_targets = strategy.generate_targets(test)
    targets = validate_targets(raw_targets, test)

    sim = simulate_portfolio(test, targets, config)
    metrics = compute_metrics(sim['equity_curve'], sim['trades'], config.risk_free_rate, config.trading_days_per_year)
    diagnostics = compute_diagnostics(sim['positions'], sim['trades'], sim['equity_curve'], config)
    scorecard = compute_scorecard(metrics, diagnostics, robustness)

    return {
        'metadata': strategy.metadata(),
        'config': dataclasses.asdict(config),
        'equity_curve': sim['equity_curve'],
        'trades': sim['trades'],
        'positions': sim['positions'],
        'metrics': metrics,
        'diagnostics': diagnostics,
        'scorecard': dataclasses.asdict(scorecard),
    }


def evaluate_strategy_submission(strategy, historical_data: pd.DataFrame, config, train_ratio: float = 0.6) -> dict:
    from .experiments import run_random_windows

    data = normalize_ohlcv(historical_data)
    timestamps = sorted(data['timestamp'].unique())
    cut_idx = max(1, min(len(timestamps) - 1, int(len(timestamps) * train_ratio)))
    cut_ts = timestamps[cut_idx]
    train = data[data['timestamp'] < cut_ts].copy()
    test = data[data['timestamp'] >= cut_ts].copy()

    robustness = run_random_windows(strategy, data, config)
    return run_backtest(strategy, train, test, config, robustness=robustness)
