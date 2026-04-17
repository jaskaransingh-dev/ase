from __future__ import annotations

import pandas as pd

from backtesting.strategy import BaseStrategy


class SMACrossStrategy(BaseStrategy):
    name = 'sma_cross'
    version = '1.0'

    def generate_targets(self, test_data: pd.DataFrame) -> pd.DataFrame:
        fast = int(self.params.get('fast', 20))
        slow = int(self.params.get('slow', 50))
        long_weight = float(self.params.get('long_weight', 0.25))
        short_weight = float(self.params.get('short_weight', -0.25))

        df = test_data.copy().sort_values(['symbol', 'timestamp'])
        out_frames = []
        for symbol, grp in df.groupby('symbol', sort=False):
            g = grp.copy()
            g['sma_fast'] = g['close'].rolling(fast, min_periods=fast).mean()
            g['sma_slow'] = g['close'].rolling(slow, min_periods=slow).mean()
            g['target_weight'] = 0.0
            g.loc[g['sma_fast'] > g['sma_slow'], 'target_weight'] = long_weight
            g.loc[g['sma_fast'] < g['sma_slow'], 'target_weight'] = short_weight
            out_frames.append(g[['timestamp', 'symbol', 'target_weight']])
        return pd.concat(out_frames, ignore_index=True)
