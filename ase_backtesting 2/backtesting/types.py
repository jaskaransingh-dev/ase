from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class Scorecard:
    performance_score: float
    risk_score: float
    robustness_score: float
    execution_score: float
    penalty_score: float
    composite_score: float
    grade: str
