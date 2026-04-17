from __future__ import annotations

import copy
import math
import random
import pandas as pd

from .data import normalize_ohlcv
from .engine import run_backtest


def run_fixed_window(strategy, data: pd.DataFrame, config, start=None, end=None, train_ratio: float = 0.4) -> dict:
    df = normalize_ohlcv(data)
    if start is not None:
        df = df[df['timestamp'] >= pd.Timestamp(start, tz='UTC')]
    if end is not None:
        df = df[df['timestamp'] <= pd.Timestamp(end, tz='UTC')]
    timestamps = sorted(df['timestamp'].unique())
    cut_idx = max(1, min(len(timestamps) - 1, int(len(timestamps) * train_ratio)))
    cut_ts = timestamps[cut_idx]
    train = df[df['timestamp'] < cut_ts].copy()
    test = df[df['timestamp'] >= cut_ts].copy()
    return run_backtest(copy.deepcopy(strategy), train, test, config)


def run_random_windows(strategy, data: pd.DataFrame, config, n_windows: int = 30, window_length_days: int = 252, train_ratio: float = 0.4) -> dict:
    df = normalize_ohlcv(data)
    timestamps = sorted(df['timestamp'].unique())
    if len(timestamps) < max(20, window_length_days):
        return {
            'window_scores': [],
            'median_score': 0.0,
            'worst_decile_score': 0.0,
            'positive_window_ratio': 0.0,
        }

    rng = random.Random(config.random_seed)
    max_start = len(timestamps) - window_length_days
    starts = [rng.randint(0, max_start) for _ in range(n_windows)]

    scores: list[float] = []
    for start_idx in starts:
        end_idx = start_idx + window_length_days
        window_ts = timestamps[start_idx:end_idx]
        window = df[df['timestamp'].isin(window_ts)].copy()
        split_idx = max(1, int(len(window_ts) * train_ratio))
        split_ts = window_ts[split_idx]
        train = window[window['timestamp'] < split_ts].copy()
        test = window[window['timestamp'] >= split_ts].copy()
        if train.empty or test.empty:
            continue
        result = run_backtest(copy.deepcopy(strategy), train, test, config, robustness=None)
        scores.append(float(result['scorecard']['composite_score']))

    if not scores:
        return {
            'window_scores': [],
            'median_score': 0.0,
            'worst_decile_score': 0.0,
            'positive_window_ratio': 0.0,
        }

    scores_sorted = sorted(scores)
    worst_decile_idx = max(0, math.floor(0.1 * (len(scores_sorted) - 1)))
    return {
        'window_scores': scores,
        'median_score': float(pd.Series(scores).median()),
        'worst_decile_score': float(scores_sorted[worst_decile_idx]),
        'positive_window_ratio': float((pd.Series(scores) >= 60.0).mean()),
    }
