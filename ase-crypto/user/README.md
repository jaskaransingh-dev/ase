# Writing an ASE Crypto Strategy

Your strategy should produce one of three decisions for each asset:
- **BUY** - request an increase in exposure
- **SELL** - request a reduction or exit
- **HOLD** - maintain current position

You may also provide:
- **conviction** - confidence score (0-1)
- **targetPositionPct** - desired position size
- **thesis** - short human-readable explanation
- **riskNotes** - what could go wrong

## Your strategy can see

- crypto feature data (prices, returns, volatility, indicators)
- current positions and weights
- portfolio cash and equity
- drawdown context

## Your strategy cannot do

- place real orders directly
- modify fills, fees, or slippage
- access the network
- alter the platform ledger
- change grading rules

## Example decision output

```json
{
  "asset": "BTC-USD",
  "decision": "BUY",
  "conviction": 0.75,
  "targetPositionPct": 0.20,
  "thesis": "Momentum positive, price above 200-day SMA",
  "riskNotes": "Reduce if drawdown worsens"
}
```