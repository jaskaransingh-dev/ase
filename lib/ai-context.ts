export const AI_CONTEXT = {
  platform: 'ASE (Algorithmic Strategy Exchange)',
  version: '1.0.0',
  description: 'An all-in-one platform for developing, backtesting, deploying, and subscribing to autonomous trading agents. Built with Next.js, Supabase, and Alpaca.',
  
  coreFeatures: [
    'Crypto & equity backtesting with 10+ strategies',
    'Monte Carlo simulation and walk-forward analysis',
    'Institutional 9-layer quant engine',
    '18 pre-built trading agents',
    'Live paper trading via Alpaca',
    'Agent marketplace with subscription model',
    'Geospatial data explorer',
    'Strategy comparison and robustness testing',
  ],

  backtestStrategies: [
    { id: 'mean_reversion', name: 'Mean Reversion', type: 'statistical', bestFor: 'Range-bound markets' },
    { id: 'momentum_crossover', name: 'Momentum Crossover', type: 'trend', bestFor: 'Trending markets' },
    { id: 'breakout_trend', name: 'Breakout Trend', type: 'trend', bestFor: 'Strong momentum moves' },
    { id: 'rsi_trend_filter', name: 'RSI Trend Filter', type: 'hybrid', bestFor: 'Filtered trend entries' },
    { id: 'volatility_breakout', name: 'Volatility Breakout', type: 'volatility', bestFor: 'Compression breakout moves' },
    { id: 'dual_momentum', name: 'Dual Momentum', type: 'momentum', bestFor: 'Long-term asset allocation' },
    { id: 'pairs_mean_reversion', name: 'Pairs Mean Reversion', type: 'statistical', bestFor: 'Spread trading' },
    { id: 'factor_rotation', name: 'Factor Rotation', type: 'rotation', bestFor: 'Multi-asset portfolios' },
    { id: 'rsi_mean_reversion', name: 'RSI Mean Reversion', type: 'statistical', bestFor: 'Oversold/overbought extremes' },
    { id: 'macd_trend', name: 'MACD Trend', type: 'trend', bestFor: 'Momentum shift detection' },
  ],

  agentTypes: ['crypto_momentum', 'crypto_mean_reversion', 'equity_momentum', 'equity_mean_reversion', 'equity_rotation', 'trend_following'],

  riskControls: {
    maxDrawdown: 'Configurable stop-loss at portfolio level',
    killSwitch: 'Halt all trading if drawdown exceeds threshold',
    positionSizing: 'ATR-based volatility weighting',
    diversification: 'Max weight per asset constraint',
  },

  fees: 'Maker: 0.10%, Taker: 0.10%, Slippage: volatility-adjusted (~3bps baseline), Funding: accounted in live agents only',

  quantResearchNotes: `
Key considerations for quant researchers:
- All strategies account for transaction costs (fees + slippage) in backtests
- Walk-forward analysis splits data into train/test to avoid overfitting
- Monte Carlo simulation tests robustness across random time windows
- The 9-layer quant pipeline: Data → Features → Alpha → Forecast → Risk Model → Portfolio Optimization → Risk Manager → Execution → Metrics
- Alpha signals can use: momentum, mean-reversion, volatility, on-chain (NUPL, SOPR, MVRV), sentiment (Fear & Greed)
- Risk models use Ledoit-Wolf covariance shrinkage for stability
- Execution simulates market impact proportional to order size / daily volume
- IC (Information Coefficient) tracks alpha quality over time
- Scorecard grades: Performance (30%), Risk (25%), Robustness (30%), Execution (15%)
`,

  securityNotes: `
Backtesting security:
- Strategy source code is never exposed to clients
- Only performance metrics and grade summaries are public
- Agent trading logic is server-side only
- API keys are never logged or stored client-side
- Walk-forward results include consistency ratio to prevent curve-fitting claims
- Monte Carlo beat-rate must exceed 55% to receive B+ grade or above
`,

  fileDescriptions: {
    'lib/backtest.ts': 'Core backtesting engine with 10 strategies, stats computation, Monte Carlo, walk-forward',
    'lib/backtest-config.ts': 'UI configuration, strategy templates, data APIs, ML tools catalog',
    'lib/multi-asset-backtest.ts': 'Multi-asset portfolio backtester with feature computation',
    'lib/quant/backtester.ts': '9-layer institutional quant pipeline',
    'lib/quant/types.ts': 'TypeScript types for the quant framework',
    'lib/quant/strategy.ts': 'Strategy template definitions and package builder',
    'lib/quant/features.ts': 'Feature engineering engine (returns, volatility, RSI, SMA, EMA, MACD, ATR, BB, ADX)',
    'lib/quant/alpha.ts': 'Alpha model computation and IC calculation',
    'lib/quant/risk.ts': 'Ledoit-Wolf covariance shrinkage, portfolio risk',
    'lib/quant/portfolio.ts': 'Mean-variance optimization',
    'lib/quant/execution.ts': 'Execution model with market impact',
    'lib/quant/metrics.ts': 'Tear sheet computation, grading, walk-forward',
    'lib/agents.ts': '18 agent configurations with detailed strategy descriptions',
    'lib/agent-cycle.ts': 'Agent trading cycle (cron-based execution)',
    'lib/nav-config.ts': 'Sidebar navigation configuration',
    'components/dashboard/DashboardShell.tsx': 'Main dashboard layout with sidebar and header',
    'app/dashboard/backtest/page.tsx': 'Backtest Studio page with comparison, robustness, and agent selection',
    'app/dashboard/geo/page.tsx': 'Geospatial data explorer with CSV/JSON upload and drill-down',
    'app/dashboard/quant/page.tsx': 'Quant Lab IDE with file editor, terminal, backtest runner',
    'app/dashboard/marketplace/page.tsx': 'Agent exchange/marketplace',
    'app/api/backtest/route.ts': 'Main backtest API endpoint',
    'app/api/quant/run/route.ts': 'Institutional quant engine endpoint',
  },
}

export function getContextForPrompt(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase()
  const parts: string[] = []
  
  parts.push(`Platform: ${AI_CONTEXT.platform}`)
  parts.push(`Description: ${AI_CONTEXT.description}`)
  
  if (lowerMessage.includes('backtest') || lowerMessage.includes('strategy') || lowerMessage.includes('algo')) {
    parts.push('\nBacktest Strategies:')
    AI_CONTEXT.backtestStrategies.forEach(s => {
      parts.push(`  - ${s.name} (${s.id}): ${s.type} — ${s.bestFor}`)
    })
    parts.push(AI_CONTEXT.fees)
  }
  
  if (lowerMessage.includes('risk') || lowerMessage.includes('drawdown') || lowerMessage.includes('stop')) {
    parts.push('\nRisk Controls:')
    Object.entries(AI_CONTEXT.riskControls).forEach(([k, v]) => {
      parts.push(`  - ${k}: ${v}`)
    })
  }
  
  if (lowerMessage.includes('quant') || lowerMessage.includes('alpha') || lowerMessage.includes('research')) {
    parts.push(AI_CONTEXT.quantResearchNotes)
  }
  
  if (lowerMessage.includes('security') || lowerMessage.includes('gamif') || lowerMessage.includes('reveal') || lowerMessage.includes('expose')) {
    parts.push(AI_CONTEXT.securityNotes)
  }
  
  if (lowerMessage.includes('agent') || lowerMessage.includes('trade') || lowerMessage.includes('live')) {
    parts.push('\nAgent Types:')
    AI_CONTEXT.agentTypes.forEach(t => parts.push(`  - ${t}`))
  }
  
  return parts.join('\n')
}