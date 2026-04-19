# ASE Testing Methodology

ASE evaluates crypto strategies in a **standardized sandbox**.

## What is standardized

- normalized crypto market data
- fixed rebalance schedule
- transaction cost assumptions (10 bps)
- slippage assumptions (5 bps)
- portfolio accounting rules
- benchmark comparison (BTC)
- out-of-sample validation
- robustness screening

## What is visible to users

Users can view:
- performance metrics (Sharpe, Sortino, Max DD, CAGR)
- validation outcomes
- strategy decisions per asset
- execution ledger events
- summary methodology

## What is NOT editable

Users cannot edit:
- internal fill logic
- anti-gaming checks
- private grading thresholds
- platform execution guardrails

## Why

This keeps strategy testing **fair**, **comparable**, and **harder to manipulate**.

## Validation pipeline

1. **Contract validation** - strategy exports required fields
2. **Baseline backtest** - standardized historical simulation
3. **Robustness checks** - cost sensitivity, out-of-sample, concentration
4. **Publish review** - may be blocked even with good in-sample results