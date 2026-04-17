from __future__ import annotations

import pandas as pd

from backtesting.strategy import BaseStrategy


class AgentTemplate(BaseStrategy):
    """
    Canonical ASE agent template.

    All submitted agents should copy this file structure and only edit the
    strategy-specific feature and target-weight logic.
    """

    name = 'agent_template'
    version = '1.0'

    def __init__(self, params: dict | None = None):
        super().__init__(params)
        self.lookback = int(self.params.get('lookback', 20))
        self.long_weight = float(self.params.get('long_weight', 0.25))
        self.short_weight = float(self.params.get('short_weight', -0.25))

    def fit(self, train_data: pd.DataFrame) -> None:
        """Optional training step using only in-sample data."""
        return None

    def generate_targets(self, test_data: pd.DataFrame) -> pd.DataFrame:
        """
        Required named function for ASE backtests.

        Must return columns:
        - timestamp
        - symbol
        - target_weight
        """
        df = test_data.copy().sort_values(['symbol', 'timestamp'])
        df['signal_value'] = df.groupby('symbol')['close'].transform(
            lambda s: s.pct_change(self.lookback)
        )
        df['target_weight'] = 0.0
        df.loc[df['signal_value'] > 0, 'target_weight'] = self.long_weight
        df.loc[df['signal_value'] < 0, 'target_weight'] = self.short_weight
        return df[['timestamp', 'symbol', 'target_weight']]
