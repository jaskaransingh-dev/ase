from __future__ import annotations

from .types import Scorecard


def clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def normalize_higher_better(x: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return clamp01((x - low) / (high - low))


def normalize_lower_better(x: float, low: float, high: float) -> float:
    if high <= low:
        return 0.0
    return 1.0 - clamp01((x - low) / (high - low))


def _grade(score: float) -> str:
    if score >= 90:
        return 'A'
    if score >= 80:
        return 'B'
    if score >= 70:
        return 'C'
    if score >= 60:
        return 'D'
    return 'F'


def compute_scorecard(metrics: dict, diagnostics: dict, robustness: dict | None = None) -> Scorecard:
    robustness = robustness or {}

    performance_score = 100.0 * (
        0.30 * normalize_higher_better(metrics.get('cagr', 0.0), 0.00, 0.30) +
        0.30 * normalize_higher_better(metrics.get('sharpe', 0.0), 0.0, 2.5) +
        0.20 * normalize_higher_better(metrics.get('sortino', 0.0), 0.0, 3.5) +
        0.20 * normalize_higher_better(metrics.get('profit_factor', 0.0), 1.0, 2.5)
    )

    risk_score = 100.0 * (
        0.45 * normalize_lower_better(abs(metrics.get('max_drawdown', 0.0)), 0.05, 0.40) +
        0.35 * normalize_higher_better(metrics.get('calmar', 0.0), 0.0, 2.5) +
        0.20 * normalize_lower_better(metrics.get('downside_volatility', 0.0), 0.05, 0.35)
    )

    robustness_score = 100.0 * (
        0.40 * normalize_higher_better(robustness.get('median_score', performance_score), 40.0, 90.0) +
        0.30 * normalize_higher_better(robustness.get('worst_decile_score', performance_score), 20.0, 75.0) +
        0.30 * normalize_higher_better(robustness.get('positive_window_ratio', metrics.get('positive_month_ratio', 0.0)), 0.4, 0.9)
    )

    execution_score = 100.0 * (
        0.35 * normalize_higher_better(diagnostics.get('trade_count', 0), 10, 100) +
        0.30 * normalize_lower_better(diagnostics.get('turnover', 0.0), 1.0, 20.0) +
        0.35 * normalize_lower_better(diagnostics.get('concentration_ratio', 0.0), 0.15, 0.65)
    )

    penalty_score = 0.0
    if not diagnostics.get('enough_trades', True):
        penalty_score += 10.0
    if not diagnostics.get('enough_rows', True):
        penalty_score += 10.0
    if not diagnostics.get('no_nan_equity', True):
        penalty_score += 25.0
    if abs(metrics.get('max_drawdown', 0.0)) > 0.35:
        penalty_score += 10.0
    if diagnostics.get('concentration_ratio', 0.0) > 0.60:
        penalty_score += 8.0
    if diagnostics.get('turnover', 0.0) > 25.0:
        penalty_score += 8.0

    composite_score = (
        0.30 * performance_score +
        0.25 * risk_score +
        0.30 * robustness_score +
        0.15 * execution_score
    ) - penalty_score
    composite_score = max(0.0, min(100.0, composite_score))

    return Scorecard(
        performance_score=performance_score,
        risk_score=risk_score,
        robustness_score=robustness_score,
        execution_score=execution_score,
        penalty_score=penalty_score,
        composite_score=composite_score,
        grade=_grade(composite_score),
    )
