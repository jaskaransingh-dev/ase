# Backtest Standard

This document defines how ASE backtests every submitted agent.

There is one standardized flow.
No alternate pipelines.
No strategy-specific simulator behavior.

---

## Standard backtest flow

### Step 1: Normalize data
Function:
- `normalize_ohlcv(data)`

Required columns:
- `timestamp`
- `symbol`
- `open`
- `high`
- `low`
- `close`
- `volume`

### Step 2: Split train and test
Function:
- `split_train_test(data, train_ratio=0.6)`

Purpose:
- training window for optional fitting
- test window for out-of-sample evaluation

### Step 3: Fit the agent
Function:
- `strategy.fit(train_data)`

Purpose:
- optional calibration using in-sample data only

### Step 4: Generate standardized targets
Function:
- `strategy.generate_targets(test_data)`

Required output:
- `timestamp`
- `symbol`
- `target_weight`

### Step 5: Validate target schema
Function:
- `validate_targets(targets, market_data)`

Purpose:
- confirm required columns
- confirm no missing weights
- confirm all timestamp/symbol pairs exist in market data

### Step 6: Simulate execution
Function:
- `simulate_portfolio(market_data, targets, config)`

What it does:
- clips weights to risk rules
- scales gross leverage
- applies slippage
- applies commissions
- updates cash and holdings
- produces the trade ledger
- produces portfolio positions
- produces equity curve

### Step 7: Compute metrics
Function:
- `compute_metrics(equity_curve, trades, risk_free_rate, periods_per_year)`

### Step 8: Compute diagnostics
Function:
- `compute_diagnostics(positions, trades, equity_curve, config)`

### Step 9: Score the agent
Function:
- `compute_scorecard(metrics, diagnostics, robustness)`

### Step 10: Run robustness checks
Function:
- `run_random_windows(strategy, data, config, ...)`

### Step 11: Return one standardized result bundle
Function:
- `evaluate_strategy_submission(strategy, historical_data, config)`

---

## Standard result bundle

Every backtest must return:

- `metadata`
- `config`
- `equity_curve`
- `trades`
- `positions`
- `metrics`
- `diagnostics`
- `scorecard`

---

## Standard trade ledger fields

- `timestamp`
- `symbol`
- `side`
- `quantity`
- `price`
- `notional`
- `commission`
- `slippage_cost`
- `post_trade_position`
- `cash_after`

---

## Standard metrics set

### Return
- `total_return`
- `cagr`
- `annualized_volatility`

### Risk
- `max_drawdown`
- `average_drawdown`
- `downside_volatility`

### Risk-adjusted
- `sharpe`
- `sortino`
- `calmar`

### Trade behavior
- `trade_count`
- `win_rate`
- `profit_factor`
- `avg_trade_return`
- `avg_winner`
- `avg_loser`
- `turnover`
- `exposure`

### Stability
- `positive_month_ratio`
- `rolling_63d_sharpe_mean`
- `rolling_63d_sharpe_std`

---

## Standard scoring buckets

- Performance: 30%
- Risk: 25%
- Robustness: 30%
- Execution: 15%

Composite score:

```python
composite_score = (
    0.30 * performance_score +
    0.25 * risk_score +
    0.30 * robustness_score +
    0.15 * execution_score
) - penalty_score
```

---

## Why standardization matters

This ensures:
- every agent is judged on the same simulator
- every agent produces the same outputs
- every ranking is comparable
- every result is auditable

That is the core requirement for an exchange-style marketplace like ASE.
