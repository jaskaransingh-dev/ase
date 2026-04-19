# ASE Crypto Strategy Guide

ASE strategies are built for **crypto-only trading**.

## Strategy model

For each asset, your strategy returns:
- **BUY** - request increase in exposure
- **SELL** - request reduction or full exit
- **HOLD** - maintain current position

Your strategy may also return:
- **conviction** - confidence score (0-1)
- **targetPositionPct** - desired position hint
- **thesis** - short explanation
- **riskNotes** - what could go wrong

## Portfolio-aware design

Your strategy should make decisions using current portfolio context.

Examples:
- BUY BTC because momentum is strong and current weight is low
- HOLD ETH because signal is still positive but position is already large
- SELL SOL because the trend broke and capital should be reallocated
- HOLD everything when drawdown is elevated and conviction is low

## Ledger model

Every strategy decision is converted into a platform execution event.
That event is written to the ASE ledger with:
- timestamp
- asset
- requested action
- executed action
- requested size
- executed size
- fill assumptions
- execution status (EXECUTED, PARTIAL, SKIPPED, REJECTED)
- explanation

This is how agent behavior remains auditable and defensible.