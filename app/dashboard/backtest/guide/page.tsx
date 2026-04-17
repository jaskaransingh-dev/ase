import Link from 'next/link'

export const metadata = { title: 'Agent Builder Guide · ASE' }

function Code({ children }: { children: string }) {
  return (
    <pre style={{
      background: 'var(--bg)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '1rem 1.2rem', overflowX: 'auto',
      fontFamily: 'var(--font-mono)', fontSize: '.78rem', color: 'var(--white)',
      lineHeight: 1.65, margin: '1rem 0',
    }}>{children}</pre>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 700, marginTop: '2rem', marginBottom: '.75rem', color: 'var(--white)' }}>{children}</h2>
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: '.85rem', fontWeight: 600, marginTop: '1.5rem', marginBottom: '.5rem', color: 'var(--ivory)', fontFamily: 'var(--font-mono)', letterSpacing: '.04em' }}>{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.7, marginBottom: '.75rem' }}>{children}</p>
}

function Badge({ children, color = 'ivory' }: { children: string; color?: 'ivory' | 'mint' | 'blue' | 'gold' | 'red' }) {
  const map = {
    ivory:  { bg: 'var(--ivory-dim)', border: 'var(--ivory-glow)', text: 'var(--ivory)' },
    mint:   { bg: 'var(--mint-dim)', border: 'var(--mint-border)', text: 'var(--mint)' },
    blue:   { bg: 'rgba(79,124,255,.1)', border: 'rgba(79,124,255,.25)', text: '#4f7cff' },
    gold:   { bg: 'var(--orange-dim)', border: 'var(--orange-glow)', text: 'var(--orange)' },
    red:    { bg: 'rgba(251,113,133,.1)', border: 'rgba(251,113,133,.25)', text: '#FB7185' },
  }
  const c = map[color]
  return (
    <span style={{
      display: 'inline-block', padding: '.15rem .55rem', borderRadius: 6,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      fontSize: '.68rem', fontWeight: 600, fontFamily: 'var(--font-mono)', letterSpacing: '.04em',
    }}>{children}</span>
  )
}

function Table({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows
  return (
    <div style={{ overflowX: 'auto', margin: '1rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '.5rem .75rem', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '.68rem', letterSpacing: '.06em', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '.5rem .75rem', color: ci === 0 ? 'var(--white)' : 'var(--muted)' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(110,231,183,.15)', border: '1px solid rgba(110,231,183,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '.75rem', fontWeight: 700, color: 'var(--mint)', flexShrink: 0 }}>{number}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 700, color: 'var(--white)', marginBottom: '.35rem' }}>{title}</div>
        <div style={{ color: 'var(--muted)', fontSize: '.82rem', lineHeight: 1.65 }}>{children}</div>
      </div>
    </div>
  )
}

export default function AgentBuilderGuide() {
  return (
    <div style={{ padding: '1.5rem', maxWidth: 800, margin: '0 auto' }}>
      <style>{`
        .docs-pill {
          display: inline-flex; align-items: center; gap: .4rem; font-size: .62rem; font-family: var(--font-mono);
          letter-spacing: .1em; font-weight: 700; text-transform: uppercase; padding: .3rem .75rem; border-radius: 999px;
          background: var(--mint-dim); border: 1px solid var(--mint-border); color: var(--mint); margin-bottom: .75rem;
        }
      `}</style>

      <div className="docs-pill">Agent Builder Guide</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-.02em', marginBottom: '.5rem' }}>ASE Standardized Backtesting</h1>
      <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: '1.5rem', lineHeight: 1.7 }}>
        Complete guide to creating agents using ASE's standardized backtesting system. All agents must pass our quantitative screening before listing.
      </p>

      <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', margin: '1rem 0 2rem' }}>
        <Badge color="mint">Standardized</Badge>
        <Badge color="blue">Scorecard</Badge>
        <Badge color="gold">Walk-Forward</Badge>
        <Badge color="ivory">Monte Carlo</Badge>
      </div>

      <div></div>
      <H2>Quick Start</H2>
      <P>Create and backtest an agent in 4 simple steps:</P>
      
      <Step number={1} title="Choose Strategy Template">
        Select from our standardized strategies: <strong>Momentum Crossover</strong>, <strong>Mean Reversion</strong>, <strong>RSI Trend Filter</strong>, <strong>Volatility Breakout</strong>, or <strong>Dual Momentum</strong>.
      </Step>
      
      <Step number={2} title="Configure Parameters">
        Adjust strategy-specific parameters like lookback windows, threshold values, and exit rules. Each strategy has sensible defaults.
      </Step>
      
      <Step number={3} title="Run Backtest">
        Execute the backtest with configurable period (30d to 10y), fees, and slippage. View equity curve, drawdown, and performance metrics.
      </Step>
      
      <Step number={4} title="Pass Scorecard">
        Your agent must achieve a composite score ≥ 60 (grade D or better) across Performance, Risk, Robustness, and Execution dimensions.
      </Step>

      {/* Strategy Templates */}
      <H2>Strategy Templates</H2>
      <P>ASE provides 10 standardized strategy templates. All strategies follow the same interface and return format.</P>

      <Table rows={[
        ['Strategy ID', 'Name', 'Description', 'Best For'],
        ['momentum_crossover', 'Momentum Crossover', 'Long when fast MA crosses above slow MA', 'Trending markets'],
        ['mean_reversion', 'Mean Reversion', 'Buy when price deviates > z-score from mean', 'Range-bound markets'],
        ['rsi_trend_filter', 'RSI Trend Filter', 'Buy oversold RSI only in uptrend', 'Pullback entries'],
        ['volatility_breakout', 'Volatility Breakout', 'ATR-based trailing stop breakout', 'High volatility assets'],
        ['dual_momentum', 'Dual Momentum', 'Both absolute + relative momentum positive', 'Trend confirmation'],
        ['breakout_trend', 'Breakout Trend', 'N-day high breakout, M-day low exit', 'Momentum bursts'],
        ['pairs_mean_reversion', 'Pairs Mean Rev', 'Z-score of short/long MA ratio', 'Oscillating markets'],
        ['factor_rotation', 'Factor Rotation', 'Risk-adjusted momentum threshold', 'Rotating strategies'],
        ['rsi_mean_reversion', 'RSI Mean Rev', 'Classic RSI overbought/oversold', 'Reversal trading'],
        ['macd_trend', 'MACD Trend', 'MACD line crosses signal line', 'Trend shifts'],
      ]} />

      <H2>Strategy Parameters</H2>
      <P>Each strategy has configurable parameters with sensible defaults and ranges.</P>

      <H3>momentum_crossover</H3>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['fast_window', 'int', '20', '5–60', 'Short moving average period'],
        ['slow_window', 'int', '50', '20–150', 'Long moving average period'],
      ]} />

      <H3>mean_reversion</H3>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['window', 'int', '20', '5–60', 'Lookback window for mean/std'],
        ['z_threshold', 'float', '2.0', '0.5–4.0', 'Z-score trigger for entry'],
      ]} />

      <H3>rsi_trend_filter</H3>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['rsi_window', 'int', '14', '5–30', 'RSI period'],
        ['trend_window', 'int', '50', '20–150', 'Trend MA period'],
        ['buy_below', 'float', '35', '10–45', 'RSI level for entry'],
        ['exit_above', 'float', '60', '45–80', 'RSI level for exit'],
      ]} />

      <H3>volatility_breakout</H3>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['breakout_window', 'int', '40', '10–120', 'High window for breakout'],
        ['atr_window', 'int', '14', '5–40', 'ATR period for stops'],
        ['stop_atr_mult', 'float', '3.0', '1.0–6.0', 'ATR multiple for stop distance'],
      ]} />

      <H3>dual_momentum</H3>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['lookback', 'int', '60', '20–252', 'Momentum lookback (days)'],
        ['ma_window', 'int', '200', '50–300', 'Long-term MA period'],
      ]} />

      <H2>ASE Standardized Metrics</H2>
      <P>All backtests return these standardized metrics from the ASE backtesting engine:</P>

      <Table rows={[
        ['Metric', 'Category', 'Description'],
        ['totalReturnPct', 'Performance', 'Total return percentage'],
        ['annualizedReturnPct', 'Performance', 'CAGR - compound annual growth rate'],
        ['sharpeRatio', 'Performance', 'Annualized Sharpe ratio (risk-free = 0)'],
        ['sortinoRatio', 'Performance', 'Annualized Sortino (downside deviation)'],
        ['maxDrawdownPct', 'Risk', 'Maximum peak-to-trough drawdown'],
        ['averageDrawdownPct', 'Risk', 'Average drawdown when in drawdown'],
        ['downsideVolatility', 'Risk', 'Annualized downside volatility'],
        ['calmarRatio', 'Risk', 'CAGR / max drawdown'],
        ['winRate', 'Execution', 'Percentage of profitable trades'],
        ['profitFactor', 'Execution', 'Gross profit / gross loss'],
        ['totalTrades', 'Execution', 'Number of completed trades'],
        ['exposureTime', 'Execution', '% of time in market'],
        ['turnover', 'Execution', 'Portfolio turnover rate'],
        ['positiveMonthRatio', 'Robustness', '% of positive months'],
        ['rolling63dSharpeMean', 'Robustness', 'Mean of 63-day rolling Sharpe'],
        ['rolling63dSharpeStd', 'Robustness', 'Std dev of 63-day rolling Sharpe'],
      ]} />

      <H2>Scorecard System</H2>
      <P>ASE uses a composite scoring system to evaluate strategies. Each agent receives scores in 4 dimensions and an overall grade.</P>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', margin: '1rem 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.06em', marginBottom: '.5rem' }}>PERFORMANCE (30%)</div>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              • CAGR (30%)<br/>
              • Sharpe Ratio (30%)<br/>
              • Sortino Ratio (20%)<br/>
              • Profit Factor (20%)
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.06em', marginBottom: '.5rem' }}>RISK (25%)</div>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              • Max Drawdown (45%)<br/>
              • Calmar Ratio (35%)<br/>
              • Downside Volatility (20%)
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.06em', marginBottom: '.5rem' }}>ROBUSTNESS (30%)</div>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              • Rolling Sharpe Mean (40%)<br/>
              • Positive Month Ratio (30%)<br/>
              • Rolling Sharpe Stability (30%)
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.06em', marginBottom: '.5rem' }}>EXECUTION (15%)</div>
            <div style={{ fontSize: '.75rem', color: 'var(--muted)', lineHeight: 1.6 }}>
              • Trade Count (35%)<br/>
              • Turnover (30%)<br/>
              • Position Concentration (35%)
            </div>
          </div>
        </div>
      </div>

      <H3>Grading Scale</H3>
      <Table rows={[
        ['Grade', 'Score Range', 'Interpretation'],
        ['A', '90–100', 'Excellent - recommended for deployment'],
        ['B', '80–89', 'Good - solid performance'],
        ['C', '70–79', 'Acceptable - monitor closely'],
        ['D', '60–69', 'Marginal - requires improvement'],
        ['F', '0–59', 'Failed - does not meet standards'],
      ]} />

      <H3>Penalties</H3>
      <P>Additional penalties applied to composite score:</P>
      <ul style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.8, paddingLeft: '1.25rem' }}>
        <li>Missing data (NaN equity) → +25 points penalty</li>
        <li>Insufficient trades (less than 10) → +10 points penalty</li>
        <li>Max drawdown greater than 35% → +10 points penalty</li>
        <li>Excessive turnover (greater than 25x) → +8 points penalty</li>
      </ul>

      <H2>Listing Requirements</H2>
      <P>Agents must meet these minimum thresholds to be listed on ASE:</P>

      <Table rows={[
        ['Metric', 'Minimum', 'Description'],
        ['Composite Score', '≥ 60', 'Overall scorecard score'],
        ['Sharpe Ratio', '≥ 0.5', 'Risk-adjusted return'],
        ['Max Drawdown', '< 50%', 'Capital preservation'],
        ['Win Rate', '≥ 40%', 'Trade success rate'],
        ['Total Trades', '≥ 20', 'Statistical significance'],
        ['Positive Months', '≥ 40%', 'Consistency check'],
      ]} />

      <div></div>
      <H2>Advanced Analysis</H2>
      <P>ASE provides additional analysis tools beyond basic backtesting:</P>

      <H3>Monte Carlo Simulation</H3>
      <P>Runs the strategy on N random time windows to assess robustness. Returns:</P>
      <ul style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.8, paddingLeft: '1.25rem' }}>
        <li>Median return across all trials</li>
        <li>10th/90th percentile outcomes</li>
        <li>Probability of loss</li>
        <li>Median Sharpe and max drawdown</li>
      </ul>

      <H3>Walk-Forward Analysis</H3>
      <P>Splits data into rolling train/test windows (default: 252d train, 63d test). Returns:</P>
      <ul style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.8, paddingLeft: '1.25rem' }}>
        <li>Average return across windows</li>
        <li>Average Sharpe ratio</li>
        <li>Consistency ratio (% positive windows)</li>
        <li>Outperformance vs buy-and-hold</li>
      </ul>

      <H3>Drawdown Analysis</H3>
      <P>Visualize the drawdown series to understand:</P>
      <ul style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.8, paddingLeft: '1.25rem' }}>
        <li>Maximum drawdown depth</li>
        <li>Drawdown duration</li>
        <li>Recovery patterns</li>
        <li>Correlation with market stress periods</li>
      </ul>

      <H3>Monthly Returns Heatmap</H3>
      <P>Color-coded monthly returns showing:</P>
      <ul style={{ fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.8, paddingLeft: '1.25rem' }}>
        <li>Month-by-month performance</li>
        <li>Seasonal patterns</li>
        <li>Win rate by month</li>
        <li>Consistency visualization</li>
      </ul>

      <div></div>
      <H2>API Usage</H2>
      <P>Run backtests programmatically via the REST API:</P>

      <H3>Run Backtest</H3>
      <Code>{`const res = await fetch('/api/backtest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbol: 'BTC-USD',
    strategy: 'momentum_crossover',
    params: { fast_window: 20, slow_window: 50 },
    period: '2y',
    fee: 0.001,
  })
})
const data = await res.json()`}</Code>

      <H3>Run Monte Carlo</H3>
      <Code>{`const res = await fetch('/api/backtest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbol: 'BTC-USD',
    strategy: 'momentum_crossover',
    period: '2y',
    monteCarlo: true,
    nTrials: 100,
    windowDays: 30,
  })
})`}</Code>

      <H3>Run Walk-Forward</H3>
      <Code>{`const res = await fetch('/api/backtest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbol: 'BTC-USD',
    strategy: 'momentum_crossover',
    period: '5y',
    walkForward: true,
    trainDays: 252,
    testDays: 63,
  })
})`}</Code>

      <div></div>
      <H2>Response Format</H2>
      <P>All backtest endpoints return a standardized response:</P>
      <Code>{`{
  "symbol": "BTC-USD",
  "period": "2y",
  "strategy": { "id": "momentum_crossover", "name": "Momentum Crossover" },
  "stats": {
    "totalReturnPct": 142.5,
    "annualizedReturnPct": 58.4,
    "cagr": 0.584,
    "sharpeRatio": 1.42,
    "sortinoRatio": 1.89,
    "maxDrawdownPct": 31.2,
    "averageDrawdownPct": 12.5,
    "downsideVolatility": 0.28,
    "calmarRatio": 1.87,
    "winRate": 62.5,
    "profitFactor": 2.34,
    "totalTrades": 18,
    "exposureTime": 68.5,
    "turnover": 4.2,
    "positiveMonthRatio": 72.0,
    "rolling63dSharpeMean": 1.35,
    "rolling63dSharpeStd": 0.42
  },
  "bars": [
    { "date": "2022-04-08", "position": 0, "equity": 100000 },
    { "date": "2022-04-09", "position": 1, "equity": 102100 },
    ...
  ]
}`}</Code>

      <div></div>
      <H2>Best Practices</H2>
      
      <Step number={1} title="Use Sufficient Data">
        Run backtests on at least 1 year of data. For walk-forward validation, use 3+ years. More data = more confidence.
      </Step>
      
      <Step number={2} title="Include Transaction Costs">
        Set realistic fee (0.1% = 0.001) and slippage (0.05% = 0.0005) to avoid inflated returns.
      </Step>
      
      <Step number={3} title="Check Robustness">
        Run Monte Carlo simulation to see how strategy performs across different market regimes.
      </Step>
      
      <Step number={4} title="Validate Walk-Forward">
        Use walk-forward analysis to ensure strategy isn't overfit to historical data.
      </Step>
      
      <Step number={5} title="Review Drawdowns">
        Ensure max drawdown is acceptable for your risk tolerance. Consider the emotional impact of drawdowns.
      </Step>
      
      <Step number={6} title="Test Multiple Periods">
        Run backtests across different time periods (1y, 2y, 5y) to ensure consistency.
      </Step>

      <div></div>
      <H2>Next Steps</H2>
      <P>Ready to create your agent?</P>
      
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <Link href="/dashboard/backtest" style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.75rem 1.25rem', background: 'var(--mint)', color: 'var(--bg)', borderRadius: 10, fontWeight: 700, fontSize: '.85rem', textDecoration: 'none' }}>
          Open Algo Lab →
        </Link>
        <Link href="/api/backtest" style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.75rem 1.25rem', background: 'transparent', border: '1px solid var(--border)', color: 'var(--ivory)', borderRadius: 10, fontWeight: 600, fontSize: '.85rem', textDecoration: 'none' }}>
          API Reference
        </Link>
      </div>

      <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/dashboard/backtest" style={{ color: 'var(--ivory)', textDecoration: 'underline' }}>← Back to Algo Lab</Link>
        <Link href="/dashboard" style={{ color: 'var(--muted)', textDecoration: 'underline' }}>Dashboard</Link>
      </div>
    </div>
  )
}