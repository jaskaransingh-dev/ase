import type {
  StrategyModule,
  StrategyContext,
  AssetDecision,
} from '../sdk/types'

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

function getPositionWeight(asset: string, context: StrategyContext): number {
  const pos = context.portfolio.positions.find(p => p.asset === asset)
  return pos ? pos.weight : 0
}

const strategy: StrategyModule = {
  config: {
    name: 'Crypto Momentum With Position Awareness',
    version: '1.0.0',
    universe: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'ADA-USD'],
    rebalanceFreq: 'daily',
    longOnly: true,
    maxPositionPct: 0.30,
    maxNewPositionsPerRun: 2,
    minCashPct: 0.05,
  },

  evaluate(context: StrategyContext) {
    const decisions: AssetDecision[] = []

    for (const row of context.features) {
      const currentWeight = getPositionWeight(row.asset, context)

      const ret20 = row.ret_20d ?? 0
      const ret60 = row.ret_60d ?? 0
      const vol20 = row.vol_20d ?? 0.03
      const rsi = row.rsi_14 ?? 50
      const sma50 = row.sma_50 ?? row.close
      const sma200 = row.sma_200 ?? row.close

      const trendScore = 0.6 * ret20 + 0.4 * ret60
      const trendFilter = sma50 > sma200
      const volPenalty = 0.5 * vol20
      const rawScore = trendScore - volPenalty
      const conviction = clamp(Math.max(0, rawScore * 10), 0, 1)

      let decision: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
      let targetPositionPct: number | undefined = undefined
      let thesis = 'No strong edge.'
      let riskNotes = ''

      if (trendFilter && rawScore > 0.02 && rsi < 78) {
        if (currentWeight < context.portfolio.maxPositionPct * 0.9) {
          decision = 'BUY'
          targetPositionPct = clamp(0.08 + conviction * 0.18, 0.05, context.portfolio.maxPositionPct)
          thesis = 'Momentum and trend are positive, volatility is acceptable, and current exposure remains below the allowed position size.'
          riskNotes = 'Do not keep adding if volatility spikes or drawdown worsens.'
        } else {
          decision = 'HOLD'
          targetPositionPct = currentWeight
          thesis = 'Signal remains constructive, but the current position is already near the allowed allocation.'
          riskNotes = 'Hold instead of adding to avoid overconcentration.'
        }
      } else if (!trendFilter || rawScore < -0.01 || rsi > 82) {
        if (currentWeight > 0) {
          decision = 'SELL'
          targetPositionPct = 0
          thesis = 'Trend quality deteriorated or the asset appears overstretched relative to the model rules.'
          riskNotes = 'Reduce downside risk and free capital for stronger setups.'
        } else {
          decision = 'HOLD'
          thesis = 'Setup is weak, but there is no open position to exit.'
          riskNotes = 'Remain flat until signal quality improves.'
        }
      } else {
        decision = 'HOLD'
        targetPositionPct = currentWeight || 0
        thesis = 'Signal is mixed and does not justify changing the current position.'
        riskNotes = 'Avoid low-conviction trading.'
      }

      decisions.push({
        asset: row.asset,
        decision,
        conviction,
        targetPositionPct,
        thesis,
        riskNotes,
      })
    }

    return {
      timestamp: context.portfolio.timestamp,
      decisions,
      globalCommentary:
        'The strategy favors crypto assets with positive medium-term momentum and supportive trend structure while respecting current portfolio exposure and cash constraints.',
    }
  },
}

export default strategy