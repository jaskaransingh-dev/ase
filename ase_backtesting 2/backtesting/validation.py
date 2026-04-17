from __future__ import annotations

import pandas as pd

TARGET_COLUMNS = ['timestamp', 'symbol', 'target_weight']


def validate_targets(targets: pd.DataFrame, market_data: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in TARGET_COLUMNS if c not in targets.columns]
    if missing:
        raise ValueError(f'Missing target columns: {missing}')

    df = targets.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
    df = df[TARGET_COLUMNS].sort_values(['timestamp', 'symbol']).reset_index(drop=True)

    if df['target_weight'].isna().any():
        raise ValueError('Target weights contain null values.')

    market_index = set(zip(market_data['timestamp'], market_data['symbol']))
    target_index = set(zip(df['timestamp'], df['symbol']))
    if not target_index.issubset(market_index):
        raise ValueError('Targets contain timestamp/symbol pairs not present in market data.')

    return df


def compute_diagnostics(
    positions: pd.DataFrame,
    trades: pd.DataFrame,
    equity_curve: pd.DataFrame,
    config,
) -> dict:
    turnover = float(trades['notional'].abs().sum() / max(config.initial_capital, 1e-12)) if not trades.empty else 0.0
    trade_count = int(len(trades))
    concentration = 0.0
    leverage_usage = 0.0
    if not positions.empty:
        pos = positions.copy()
        pos['abs_weight'] = pos['market_value'].abs() / pos['equity'].replace(0, pd.NA)
        concentration = float(pos.groupby('timestamp')['abs_weight'].max().fillna(0).mean())
        leverage_usage = float(pos.groupby('timestamp')['abs_weight'].sum().fillna(0).mean())

    enough_trades = trade_count >= config.min_trade_count
    enough_rows = len(equity_curve) >= config.min_history_rows
    no_nan_equity = not equity_curve['equity'].isna().any()

    monthly = equity_curve.copy()
    monthly['month'] = monthly['timestamp'].dt.to_period('M')
    month_end = monthly.groupby('month')['equity'].last().pct_change().dropna()
    best_month_contribution = float(month_end.max()) if not month_end.empty else 0.0
    worst_month_contribution = float(month_end.min()) if not month_end.empty else 0.0

    return {
        'trade_count': trade_count,
        'turnover': turnover,
        'concentration_ratio': concentration,
        'leverage_usage': leverage_usage,
        'enough_trades': enough_trades,
        'enough_rows': enough_rows,
        'no_nan_equity': no_nan_equity,
        'best_month_contribution': best_month_contribution,
        'worst_month_contribution': worst_month_contribution,
    }
