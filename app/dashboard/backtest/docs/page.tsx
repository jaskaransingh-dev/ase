import Link from 'next/link'

export const metadata = { title: 'Backtesting API Docs · ASE' }

function Code({ children }: { children: string }) {
  return (
    <pre style={{
      background: 'rgba(148,130,255,.06)', border: '1px solid rgba(148,130,255,.14)',
      borderRadius: 12, padding: '1.1rem 1.3rem', overflowX: 'auto',
      fontFamily: 'var(--font-mono)', fontSize: '.82rem', color: '#c8d8ff',
      lineHeight: 1.65, margin: '1rem 0',
    }}>{children}</pre>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '2.5rem', marginBottom: '.75rem', color: '#e8e0ff' }}>{children}</h2>
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: '.92rem', fontWeight: 700, marginTop: '1.75rem', marginBottom: '.5rem', color: '#c8b8ff', fontFamily: 'var(--font-mono)', letterSpacing: '.04em' }}>{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: '.88rem', color: 'rgba(220,210,255,.65)', lineHeight: 1.7, marginBottom: '.75rem' }}>{children}</p>
}

function Badge({ children, color = 'purple' }: { children: string; color?: 'purple' | 'green' | 'blue' | 'orange' }) {
  const map = {
    purple: { bg: 'rgba(148,130,255,.1)', border: 'rgba(148,130,255,.25)', text: '#b8a8ff' },
    green:  { bg: 'rgba(110,231,183,.1)', border: 'rgba(110,231,183,.25)', text: '#6ee7b7' },
    blue:   { bg: 'rgba(130,200,255,.1)', border: 'rgba(130,200,255,.25)', text: '#82c8ff' },
    orange: { bg: 'rgba(253,186,116,.1)', border: 'rgba(253,186,116,.25)', text: '#fdba74' },
  }
  const c = map[color]
  return (
    <span style={{
      display: 'inline-block', padding: '.15rem .6rem', borderRadius: 6,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      fontSize: '.72rem', fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '.04em',
    }}>{children}</span>
  )
}

function Table({ rows }: { rows: string[][] }) {
  const [head, ...body] = rows
  return (
    <div style={{ overflowX: 'auto', margin: '1rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{ textAlign: 'left', padding: '.5rem .75rem', borderBottom: '1px solid rgba(148,130,255,.15)', color: 'rgba(220,210,255,.4)', fontFamily: 'var(--font-mono)', fontSize: '.72rem', letterSpacing: '.06em', fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} style={{ borderBottom: '1px solid rgba(148,130,255,.06)' }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ padding: '.5rem .75rem', color: 'rgba(220,210,255,.7)' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function BacktestDocsPage() {
  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 860, margin: '0 auto' }}>
      <style>{`
        .docs-pill {
          display: inline-flex; align-items: center; gap: .4rem; font-size: .65rem; font-family: var(--font-mono);
          letter-spacing: .1em; font-weight: 700; text-transform: uppercase; padding: .3rem .8rem; border-radius: 999px;
          background: rgba(148,130,255,.1); border: 1px solid rgba(148,130,255,.25); color: #b8a8ff; margin-bottom: .75rem;
        }
      `}</style>

      <div className="docs-pill">Developer Reference</div>
      <h1 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-.03em', marginBottom: '.5rem' }}>Backtesting API</h1>
      <p style={{ color: 'rgba(220,210,255,.5)', fontSize: '.9rem', marginBottom: '.5rem' }}>
        REST API to run strategy backtests on any ticker with historical OHLCV data from Yahoo Finance.
        Used by the <Link href="/dashboard/backtest" style={{ color: '#9482ff', textDecoration: 'underline' }}>Algo Lab</Link> UI.
      </p>

      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', margin: '1rem 0 2rem' }}>
        <Badge color="green">JSON</Badge>
        <Badge color="blue">Edge Runtime</Badge>
        <Badge color="orange">Yahoo Finance Data</Badge>
        <Badge color="purple">5 Strategies</Badge>
      </div>

      {/* ── Base URL ── */}
      <H2>Base URL</H2>
      <Code>{`https://your-domain.com/api/backtest`}</Code>

      {/* ── GET ── */}
      <H2>GET /api/backtest — List Strategies</H2>
      <P>Returns all available strategy IDs, names, descriptions, default parameters, and parameter schemas.</P>
      <H3>Example</H3>
      <Code>{`fetch('/api/backtest')
  .then(r => r.json())
  .then(d => console.log(d.strategies))`}</Code>

      <H3>Response</H3>
      <Code>{`{
  "strategies": [
    {
      "id":          "momentum_crossover",
      "name":        "Momentum Crossover",
      "description": "...",
      "defaultParams": { "fast_window": 20, "slow_window": 50 },
      "paramSchema": [
        { "key": "fast_window", "label": "Fast average", "kind": "int",
          "min": 5, "max": 60, "step": 1 },
        { "key": "slow_window", "label": "Slow average", "kind": "int",
          "min": 20, "max": 150, "step": 1 }
      ]
    },
    ...
  ]
}`}</Code>

      {/* ── POST ── */}
      <H2>POST /api/backtest — Run Backtest</H2>
      <P>Runs a complete strategy backtest over the specified time period and returns the equity curve, per-bar positions, and performance statistics.</P>

      <H3>Request Body</H3>
      <Table rows={[
        ['Field', 'Type', 'Required', 'Default', 'Description'],
        ['symbol', 'string', 'No', 'BTC-USD', 'Yahoo Finance ticker (BTC-USD, SPY, AAPL, etc.)'],
        ['strategy', 'string', 'No', 'momentum_crossover', 'Strategy ID — see strategy list below'],
        ['params', 'object', 'No', 'strategy defaults', 'Strategy parameter overrides'],
        ['period', 'string', 'No', '2y', 'Data period: 6mo · 1y · 2y · 5y · 10y'],
        ['interval', 'string', 'No', '1d', 'Bar interval: 1d · 1wk'],
        ['fee', 'number', 'No', '0.001', 'Round-trip per-trade fee fraction (0.001 = 0.1%)'],
      ]} />

      <H3>Example</H3>
      <Code>{`const res = await fetch('/api/backtest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbol:   'BTC-USD',
    strategy: 'momentum_crossover',
    params:   { fast_window: 15, slow_window: 45 },
    period:   '2y',
    fee:      0.001,
  }),
})
const data = await res.json()`}</Code>

      <H3>Response Shape</H3>
      <Code>{`{
  "symbol":   "BTC-USD",
  "period":   "2y",
  "interval": "1d",

  // Strategy metadata
  "strategy": {
    "id":           "momentum_crossover",
    "name":         "Momentum Crossover",
    "description":  "...",
    "plainEnglish": "...",
    "bestFor":      "...",
    "mainRisk":     "...",
    "defaultParams": { ... },
    "paramSchema":   [ ... ]
  },

  // Performance statistics
  "stats": {
    "totalReturnPct":       142.5,    // % return over entire period
    "annualizedReturnPct":  58.4,     // CAGR
    "sharpeRatio":          1.42,     // annualized, risk-free = 0
    "maxDrawdownPct":       31.2,     // peak-to-trough %
    "winRate":              62.5,     // % of closed trades that were profitable
    "totalTrades":          18,
    "profitableTrades":     11,
    "avgTradeDurationDays": 14,
    "bestTradePct":         48.3,
    "worstTradePct":        -12.1,
    "calmarRatio":          1.87      // annualizedReturn / maxDrawdown
  },

  // Per-bar equity curve (strategy)
  "bars": [
    { "date": "2022-04-08", "close": 43200.50, "position": 0, "equity": 100000 },
    { "date": "2022-04-09", "close": 44100.00, "position": 1, "equity": 102100 },
    ...
  ],

  // Buy-and-hold benchmark for comparison
  "buyHold": [
    { "date": "2022-04-08", "close": 43200.50, "position": 1, "equity": 100000 },
    ...
  ]
}`}</Code>

      {/* ── Strategies ── */}
      <H2>Available Strategies</H2>

      <H3>mean_reversion</H3>
      <P>Buys when price falls z_threshold standard deviations below its rolling mean. Sells when price rises above z_threshold SDs above mean. Best for choppy, range-bound markets.</P>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['window', 'int', '20', '5–60', 'Lookback window for rolling mean and std dev'],
        ['z_threshold', 'float', '2.0', '0.5–4.0', 'Z-score trigger for entry/exit'],
      ]} />

      <H3>momentum_crossover</H3>
      <P>Long when the fast moving average is above the slow moving average. Flat otherwise. Classic trend-following signal.</P>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['fast_window', 'int', '20', '5–60', 'Short-term moving average period'],
        ['slow_window', 'int', '50', '20–150', 'Long-term moving average period'],
      ]} />

      <H3>breakout_trend</H3>
      <P>Enters long when price breaks above the rolling N-day high. Exits when price drops below the rolling M-day low. Requires confirmation of genuine breakouts.</P>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['breakout_window', 'int', '50', '20–150', 'Window for rolling high (entry)'],
        ['exit_window', 'int', '20', '5–60', 'Window for rolling low (exit)'],
      ]} />

      <H3>rsi_trend_filter</H3>
      <P>Buys when price is above its trend MA AND RSI is below the oversold threshold. Exits when RSI exceeds the overbought threshold or price falls below trend MA.</P>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['rsi_window', 'int', '14', '5–30', 'RSI lookback period'],
        ['trend_window', 'int', '50', '20–150', 'Trend MA period (defines bull/bear regime)'],
        ['buy_below', 'float', '35', '10–45', 'RSI level to enter long'],
        ['exit_above', 'float', '60', '45–80', 'RSI level to exit long'],
      ]} />

      <H3>volatility_breakout</H3>
      <P>Enters on breakout above N-day high. Uses an ATR-based trailing stop that adapts to current volatility. Stop is ratcheted up but never down while in position.</P>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['breakout_window', 'int', '40', '10–120', 'Window for rolling high (entry)'],
        ['atr_window', 'int', '14', '5–40', 'ATR calculation period'],
        ['stop_atr_mult', 'float', '3.0', '1.0–6.0', 'Trailing stop distance in ATR multiples'],
      ]} />

      {/* ── File upload ── */}
      <H2>Upload Your Own OHLCV Data</H2>
      <P>
        You can POST your own OHLCV data directly to the backtest engine by bypassing the Yahoo Finance fetch step.
        Send a CSV-encoded body via a data URI or as a pre-parsed JSON array.
      </P>
      <P>
        Expected format for each bar in the <code style={{ fontFamily: 'var(--font-mono)', background: 'rgba(148,130,255,.08)', padding: '.1rem .35rem', borderRadius: 4, fontSize: '.82rem' }}>bars</code> field:
      </P>
      <Table rows={[
        ['Field', 'Type', 'Description'],
        ['date', 'string', 'ISO 8601 date string e.g. "2024-01-15"'],
        ['open', 'number', 'Opening price'],
        ['high', 'number', 'High price'],
        ['low', 'number', 'Low price'],
        ['close', 'number', 'Closing price (required)'],
        ['volume', 'number', 'Volume (optional, set 0 if unavailable)'],
      ]} />
      <H3>Custom Data Example</H3>
      <Code>{`// Client-side: parse CSV and run backtest
async function backtestCSV(csvText: string) {
  const lines = csvText.trim().split('\\n')
  const bars = lines.slice(1).map(line => {
    const [date, open, high, low, close, volume] = line.split(',')
    return {
      date,
      open:   parseFloat(open),
      high:   parseFloat(high),
      low:    parseFloat(low),
      close:  parseFloat(close),
      volume: parseFloat(volume ?? '0'),
    }
  })

  // Use the runBacktest function directly (client or server)
  import { runBacktest, runBuyAndHold } from '@/lib/backtest'

  const result = runBacktest(bars, 'momentum_crossover', {
    fast_window: 20,
    slow_window: 50,
  })

  console.log(result.stats)
  return result
}`}</Code>

      <H3>Programmatic usage (server/Node)</H3>
      <Code>{`// Import the engine directly (no HTTP call needed)
import { runBacktest, runBuyAndHold, STRATEGIES } from '@/lib/backtest'

const myBars = [
  { date: '2023-01-01', open: 100, high: 105, low: 98,  close: 103, volume: 10000 },
  { date: '2023-01-02', open: 103, high: 108, low: 101, close: 106, volume: 12000 },
  // ...
]

const result = runBacktest(myBars, 'rsi_trend_filter', {
  rsi_window: 14,
  trend_window: 50,
  buy_below: 35,
  exit_above: 60,
})

console.log(result.stats.totalReturnPct)   // e.g. 42.5
console.log(result.stats.sharpeRatio)       // e.g. 1.38
console.log(result.bars.length)             // number of bars processed`}</Code>

      {/* ── Error codes ── */}
      <H2>Error Codes</H2>
      <Table rows={[
        ['HTTP Status', 'Condition'],
        ['400', 'Unknown strategy ID'],
        ['422', 'Fewer than 60 bars returned (not enough data)'],
        ['500', 'Yahoo Finance fetch failed or internal error'],
      ]} />

      <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(148,130,255,.1)', display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '.83rem' }}>
        <Link href="/dashboard/backtest" style={{ color: '#9482ff', textDecoration: 'underline' }}>← Back to Algo Lab</Link>
        <Link href="/dashboard" style={{ color: 'rgba(220,210,255,.4)', textDecoration: 'underline' }}>Dashboard</Link>
      </div>
    </div>
  )
}
