from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any
import pandas as pd


class BaseStrategy(ABC):
    name: str = 'base'
    version: str = '1.0'

    def __init__(self, params: dict[str, Any] | None = None):
        self.params = params or {}

    def fit(self, train_data: pd.DataFrame) -> None:
        return None

    @abstractmethod
    def generate_targets(self, test_data: pd.DataFrame) -> pd.DataFrame:
        """Return columns: timestamp, symbol, target_weight."""
        raise NotImplementedError

    def metadata(self) -> dict[str, Any]:
        return {
            'strategy_name': self.name,
            'strategy_version': self.version,
            'params': self.params,
        }
