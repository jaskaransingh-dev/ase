# ASE Publish Rules

A strategy is **not publishable** just because it produced positive returns in one window.

## Publish requirements

Strategies must pass:
- deterministic output validation
- cost stress test (fees/slippage degrade results but remain positive)
- out-of-sample stability (multiple windows show reasonable performance)
- concentration check (no single asset dominates)
- minimum trade count (enough data to trust)

## Blocking conditions

Strategies may be blocked from publishing if they show:
- unstable out-of-sample performance
- excessive concentration (>40% in single asset)
- poor risk-adjusted returns (Sharpe < 0.5)
- suspicious turnover (>10x annual)
- severe degradation under cost stress
- inadequate test history (<100 trades)

## Grading scale

| Grade | Sharpe | Max DD | Publishable |
|-------|-------|-------|-------------|
| A     | ≥1.5  | ≤20%  | Yes         |
| B     | ≥1.0  | ≤30%  | Yes         |
| C     | ≥0.75 | ≤35%  | No (needs robustness) |
| D     | <0.75 | >35%  | No          |

## Disclaimer

Passing a backtest is **not a promise of future returns**.
Past performance does not guarantee future results.
All strategies carry risk, including potential total loss.