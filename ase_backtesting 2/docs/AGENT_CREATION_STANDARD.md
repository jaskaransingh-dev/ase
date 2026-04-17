# Agent Creation Standard

This is the **one required template** for agent submissions in ASE.

Every agent must follow the same class shape, method names, and output schema.
No custom interfaces. No alternate function names. No direct broker code.

---

## Required class template

Every agent must subclass `BaseStrategy` and implement exactly these named methods:

- `__init__(self, params: dict | None = None)`
- `fit(self, train_data: pd.DataFrame) -> None`
- `generate_targets(self, test_data: pd.DataFrame) -> pd.DataFrame`
- `metadata(self) -> dict[str, Any]` (inherited unless overridden)

The only required custom method is:
- `generate_targets(...)`

---

## Canonical agent template

```python
from __future__ import annotations

import pandas as pd
from backtesting.strategy import BaseStrategy


class MyAgent(BaseStrategy):
    name = "my_agent"
    version = "1.0"

    def __init__(self, params: dict | None = None):
        super().__init__(params)
        self.lookback = int(self.params.get("lookback", 20))
        self.long_weight = float(self.params.get("long_weight", 0.25))
        self.short_weight = float(self.params.get("short_weight", -0.25))

    def fit(self, train_data: pd.DataFrame) -> None:
        # Optional. Use only training data.
        return None

    def generate_targets(self, test_data: pd.DataFrame) -> pd.DataFrame:
        df = test_data.copy().sort_values(["symbol", "timestamp"])

        # Build features only from current/past data.
        df["signal_value"] = (
            df.groupby("symbol")["close"]
              .transform(lambda s: s.pct_change(self.lookback))
        )

        df["target_weight"] = 0.0
        df.loc[df["signal_value"] > 0, "target_weight"] = self.long_weight
        df.loc[df["signal_value"] < 0, "target_weight"] = self.short_weight

        return df[["timestamp", "symbol", "target_weight"]]
```

---

## Required output schema

`generate_targets(...)` must return a DataFrame with exactly these columns:

- `timestamp`
- `symbol`
- `target_weight`

Example:

```text
timestamp                  symbol   target_weight
2025-01-01 00:00:00+00:00  BTCUSD   0.25
2025-01-01 00:00:00+00:00  ETHUSD   0.00
2025-01-02 00:00:00+00:00  BTCUSD  -0.25
```

---

## Rules all agents must follow

### 1. No lookahead
Agents may only use information available at or before each timestamp.

### 2. No custom execution logic
Agents do not place orders directly.
They only output target portfolio weights.
The simulator handles fills, slippage, fees, and positions.

### 3. No direct mutation of source data
Always copy incoming DataFrames before adding columns.

### 4. One standardized portfolio language
The only portfolio instruction allowed in v1 is `target_weight`.

### 5. Keep the agent stateless during inference
`generate_targets(...)` should be deterministic for the same inputs.

---

## Allowed design pattern

Agents should do this:
1. read normalized OHLCV input
2. create lagged features
3. map features to target weights
4. return `timestamp, symbol, target_weight`

Agents should not do this:
- call APIs
- trade live accounts
- assume partial fills
- override fee logic
- change leverage rules internally

---

## Standard submission checklist

Before an agent is accepted, it must:
- subclass `BaseStrategy`
- implement `generate_targets(...)`
- return the exact output schema
- run through `evaluate_strategy_submission(...)`
- pass validation checks
- produce a scorecard

---

## Public named functions the platform uses

Every standardized backtest runs through these named functions:

- `normalize_ohlcv(...)`
- `validate_targets(...)`
- `run_backtest(...)`
- `simulate_portfolio(...)`
- `compute_metrics(...)`
- `compute_diagnostics(...)`
- `compute_scorecard(...)`
- `run_random_windows(...)`
- `evaluate_strategy_submission(...)`

These are the only functions agent authors need to understand.
