# ASE Standardized Backtesting

This package is organized around **one canonical template**:
- one required agent class template
- one standardized backtest flow
- one set of named functions
- one result bundle shape

The goal is to make every submitted agent comparable, auditable, and rankable.

---

## Start here

Read these two docs first:
- `docs/AGENT_CREATION_STANDARD.md`
- `docs/BACKTEST_STANDARD.md`

Those documents define:
- how users must create agents
- how ASE backtests every submission
- which named functions are part of the standard
- which output schema every strategy must return

---

## Canonical agent template

Use this file as the only starting point for new agents:

```text
backtesting/templates/agent_template.py
```

Every submitted agent should copy that structure and keep the same named methods:
- `__init__(...)`
- `fit(...)`
- `generate_targets(...)`

---

## Package layout

```text
backtesting/
  __init__.py
  config.py
  data.py
  engine.py
  experiments.py
  metrics.py
  reports.py
  scoring.py
  simulator.py
  strategy.py
  types.py
  validation.py
  templates/
    agent_template.py
docs/
  AGENT_CREATION_STANDARD.md
  BACKTEST_STANDARD.md
tests/
README.md
```

---

## Standard named functions

All standardized backtesting runs through these named functions:

- `normalize_ohlcv(...)`
- `split_train_test(...)`
- `validate_targets(...)`
- `run_backtest(...)`
- `simulate_portfolio(...)`
- `compute_metrics(...)`
- `compute_diagnostics(...)`
- `compute_scorecard(...)`
- `run_random_windows(...)`
- `evaluate_strategy_submission(...)`

These are the platform-standard entry points.

---

## Minimal usage

```python
import pandas as pd

from backtesting import BacktestConfig, evaluate_strategy_submission
from backtesting.templates.agent_template import AgentTemplate

historical = pd.read_csv('your_ohlcv.csv')
strategy = AgentTemplate({
    'lookback': 20,
    'long_weight': 0.25,
    'short_weight': -0.25,
})
config = BacktestConfig(
    initial_capital=100_000,
    commission_bps=5,
    slippage_bps=10,
    max_gross_leverage=1.0,
    max_position_weight=0.25,
)

result = evaluate_strategy_submission(strategy, historical, config)
print(result['scorecard'])
print(result['metrics'])
```

---

## Standard historical input schema

Required columns:

```text
timestamp, symbol, open, high, low, close, volume
```

---

## Standard output bundle

`evaluate_strategy_submission(...)` returns:
- `metadata`
- `config`
- `equity_curve`
- `trades`
- `positions`
- `metrics`
- `diagnostics`
- `scorecard`

---

## What is standardized

### Agent side
Agents only define portfolio intent through `target_weight`.
They do not control execution logic.

### Engine side
The platform handles:
- slippage
- commissions
- leverage clipping
- trade ledger creation
- metrics
- diagnostics
- scoring

### Ranking side
Every agent is scored using the same bucket weights:
- Performance: 30%
- Risk: 25%
- Robustness: 30%
- Execution: 15%

---

## Guidance for users building agents

Do:
- build lagged features
- use only current/past data
- return `timestamp, symbol, target_weight`
- keep output deterministic

Do not:
- place orders directly
- hardcode fills
- override fees/slippage inside the strategy
- use future data

---

## Current scope

This version is intentionally lean. It supports standardized daily-bar style backtests with deterministic execution and scoring. It is designed to be the canonical submission pipeline for ASE, not a giant research framework.
