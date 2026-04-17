from __future__ import annotations

import math
import numpy as np
import pandas as pd


def _safe_std(series: pd.Series) -> float:
    return float(series.std(ddof=0)) if len(series) else 0.0


def _annualized_return(equity: pd.Series, periods_per_year: int) -> float:
    if len(equity) < 2 or equity.iloc[0] <= 0:
        return 0.0
    total_return = equity.iloc[-1] / equity.iloc[0]
    years = max((len(equity) - 1) / periods_per_year, 1 / periods_per_year)
    return float(total_return ** (1 / years) - 1)


def compute_metrics(equity_curve: pd.DataFrame, trades: pd.DataFrame, risk_free_rate: float = 0.0, periods_per_year: int = 252) -> dict:
    if equity_curve.empty:
        return {
            'total_return': 0.0,
            'cagr': 0.0,
            'annualized_volatility': 0.0,
            'max_drawdown': 0.0,
            'average_drawdown': 0.0,
            'downside_volatility': 0.0,
            'sharpe': 0.0,
            'sortino': 0.0,
            'calmar': 0.0,
            'trade_count': 0,
            'win_rate': 0.0,
            'profit_factor': 0.0,
            'avg_trade_return': 0.0,
            'avg_winner': 0.0,
            'avg_loser': 0.0,
            'exposure': 0.0,
            'turnover': 0.0,
            'positive_month_ratio': 0.0,
            'rolling_63d_sharpe_mean': 0.0,
            'rolling_63d_sharpe_std': 0.0,
        }

    eq = equity_curve.copy()
    returns = eq['returns'].fillna(0.0)
    equity = eq['equity']

    total_return = float(equity.iloc[-1] / equity.iloc[0] - 1)
    cagr = _annualized_return(equity, periods_per_year)
    annualized_volatility = _safe_std(returns) * math.sqrt(periods_per_year)

    running_peak = equity.cummax()
    drawdown = equity / running_peak - 1.0
    max_drawdown = float(drawdown.min()) if len(drawdown) else 0.0
    average_drawdown = float(drawdown[drawdown < 0].mean()) if (drawdown < 0).any() else 0.0

    downside = returns[returns < 0]
    downside_volatility = _safe_std(downside) * math.sqrt(periods_per_year)

    excess_return = returns.mean() * periods_per_year - risk_free_rate
    sharpe = float(excess_return / annualized_volatility) if annualized_volatility > 0 else 0.0
    sortino = float(excess_return / downside_volatility) if downside_volatility > 0 else 0.0
    calmar = float(cagr / abs(max_drawdown)) if max_drawdown < 0 else 0.0

    if trades.empty:
        trade_count = 0
        win_rate = 0.0
        profit_factor = 0.0
        avg_trade_return = 0.0
        avg_winner = 0.0
        avg_loser = 0.0
        turnover = 0.0
    else:
        signed = -trades['notional'] - trades['commission']
        pnl_like = signed
        winners = pnl_like[pnl_like > 0]
        losers = pnl_like[pnl_like < 0]
        trade_count = int(len(trades))
        win_rate = float((pnl_like > 0).mean())
        profit_factor = float(winners.sum() / abs(losers.sum())) if len(losers) and abs(losers.sum()) > 0 else (float('inf') if len(winners) else 0.0)
        avg_trade_return = float(pnl_like.mean())
        avg_winner = float(winners.mean()) if len(winners) else 0.0
        avg_loser = float(losers.mean()) if len(losers) else 0.0
        turnover = float(trades['notional'].abs().sum() / max(float(equity.iloc[0]), 1e-12))

    exposure = float((eq['gross_market_value'] > 0).mean()) if 'gross_market_value' in eq else 0.0

    monthly = eq.copy()
    monthly['month'] = monthly['timestamp'].dt.to_period('M')
    monthly_returns = monthly.groupby('month')['equity'].last().pct_change().dropna()
    positive_month_ratio = float((monthly_returns > 0).mean()) if len(monthly_returns) else 0.0

    rolling = returns.rolling(63)
    rolling_mean = rolling.mean() * periods_per_year - risk_free_rate
    rolling_std = rolling.std(ddof=0) * np.sqrt(periods_per_year)
    rolling_sharpe = (rolling_mean / rolling_std.replace(0, np.nan)).replace([np.inf, -np.inf], np.nan).dropna()
    rolling_63d_sharpe_mean = float(rolling_sharpe.mean()) if len(rolling_sharpe) else 0.0
    rolling_63d_sharpe_std = float(rolling_sharpe.std(ddof=0)) if len(rolling_sharpe) else 0.0

    return {
        'total_return': total_return,
        'cagr': cagr,
        'annualized_volatility': annualized_volatility,
        'max_drawdown': max_drawdown,
        'average_drawdown': average_drawdown,
        'downside_volatility': downside_volatility,
        'sharpe': sharpe,
        'sortino': sortino,
        'calmar': calmar,
        'trade_count': trade_count,
        'win_rate': win_rate,
        'profit_factor': 0.0 if profit_factor == float('inf') else profit_factor,
        'avg_trade_return': avg_trade_return,
        'avg_winner': avg_winner,
        'avg_loser': avg_loser,
        'exposure': exposure,
        'turnover': turnover,
        'positive_month_ratio': positive_month_ratio,
        'rolling_63d_sharpe_mean': rolling_63d_sharpe_mean,
        'rolling_63d_sharpe_std': rolling_63d_sharpe_std,
    }
