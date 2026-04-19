# ASE Strategy SDK

You write only the strategy logic.

## What your strategy receives

- **features**: market data for crypto assets in your universe
- **portfolio**: current portfolio state (positions, cash, equity, drawdown)

## What your strategy returns

- **BUY**, **SELL**, or **HOLD** per asset
- optional **target position size**
- short **human-readable thesis**
- optional **risk notes**

## Important

ASE owns the private execution, ledgering, risk controls, grading, and validation systems.

Your strategy does not directly place orders and cannot modify platform backtesting rules.

All strategy decisions are written to a public ledger with:
- requested action
- executed action
- fill assumptions
- status (EXECUTED, PARTIAL, SKIPPED, REJECTED)
- reason for any deviation from requested action