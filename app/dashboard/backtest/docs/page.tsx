import Link from 'next/link'

export const metadata = { title: 'API Docs · ASE' }

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

function Badge({ children, color = 'ivory' }: { children: string; color?: 'ivory' | 'mint' | 'blue' | 'gold' }) {
  const map = {
    ivory:  { bg: 'var(--ivory-dim)', border: 'var(--ivory-glow)', text: 'var(--ivory)' },
    mint:   { bg: 'var(--mint-dim)', border: 'var(--mint-border)', text: 'var(--mint)' },
    blue:   { bg: 'rgba(79,124,255,.1)', border: 'rgba(79,124,255,.25)', text: '#4f7cff' },
    gold:   { bg: 'var(--orange-dim)', border: 'var(--orange-glow)', text: 'var(--orange)' },
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

export default function BacktestDocsPage() {
  return (
    <div style={{ padding: '1.5rem', maxWidth: 800, margin: '0 auto' }}>
      <style>{`
        .docs-pill {
          display: inline-flex; align-items: center; gap: .4rem; font-size: .62rem; font-family: var(--font-mono);
          letter-spacing: .1em; font-weight: 700; text-transform: uppercase; padding: .3rem .75rem; border-radius: 999px;
          background: var(--ivory-dim); border: 1px solid var(--ivory-glow); color: var(--ivory); margin-bottom: .75rem;
        }
      `}</style>

      <div className="docs-pill">Developer Reference</div>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-.02em', marginBottom: '.5rem' }}>Backtesting API</h1>
      <p style={{ color: 'var(--muted)', fontSize: '.85rem', marginBottom: '.5rem' }}>
        REST API for running strategy backtests on historical data.
        Used by the <Link href="/dashboard/backtest" style={{ color: 'var(--ivory)', textDecoration: 'underline' }}>Algo Lab</Link>.
      </p>

      <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', margin: '1rem 0 1.5rem' }}>
        <Badge color="mint">JSON</Badge>
        <Badge color="blue">Edge</Badge>
        <Badge color="gold">Yahoo Finance</Badge>
        <Badge color="ivory">5 Strategies</Badge>
      </div>

      <H2>Base URL</H2>
      <Code>{`https://ase.com/api/backtest`}</Code>

      <H2>GET /api/backtest — List Strategies</H2>
      <P>Returns all available strategy IDs, names, and parameter schemas.</P>
      <H3>Example</H3>
      <Code>{`fetch('/api/backtest')
  .then(r => r.json())
  .then(d => console.log(d.strategies))`}</Code>

      <H2>POST /api/backtest — Run Backtest</H2>
      <P>Runs a complete strategy backtest and returns the equity curve and performance statistics.</P>

      <H3>Request Body</H3>
      <Table rows={[
        ['Field', 'Type', 'Required', 'Default', 'Description'],
        ['symbol', 'string', 'No', 'BTC-USD', 'Yahoo Finance ticker'],
        ['strategy', 'string', 'No', 'momentum_crossover', 'Strategy ID'],
        ['params', 'object', 'No', 'defaults', 'Parameter overrides'],
        ['period', 'string', 'No', '2y', '6mo, 1y, 2y, 5y'],
        ['fee', 'number', 'No', '0.001', 'Round-trip fee (0.001 = 0.1%)'],
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
  }),
})
const data = await res.json()`}</Code>

      <H3>Response</H3>
      <Code>{`{
  "symbol":   "BTC-USD",
  "period":   "2y",
  "strategy": { "name": "Momentum Crossover", ... },
  "stats": {
    "totalReturnPct":       142.5,
    "annualizedReturnPct":  58.4,
    "sharpeRatio":          1.42,
    "maxDrawdownPct":       31.2,
    "winRate":              62.5,
    "totalTrades":          18,
    "calmarRatio":          1.87
  },
  "bars": [
    { "date": "2022-04-08", "position": 0, "equity": 100000 },
    { "date": "2022-04-09", "position": 1, "equity": 102100 },
    ...
  ],
  "buyHold": [...]
}`}</Code>

      <H2>Available Strategies</H2>

      <H3>momentum_crossover</H3>
      <P>Long when fast MA crosses above slow MA. Classic trend-following.</P>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['fast_window', 'int', '20', '5–60', 'Short MA period'],
        ['slow_window', 'int', '50', '20–150', 'Long MA period'],
      ]} />

      <H3>mean_reversion</H3>
      <P>Buy when price falls below z-threshold SDs from mean.</P>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['window', 'int', '20', '5–60', 'Lookback window'],
        ['z_threshold', 'float', '2.0', '0.5–4.0', 'Z-score trigger'],
      ]} />

      <H3>breakout_trend</H3>
      <P>Enter on N-day high breakout, exit on M-day low.</P>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['breakout_window', 'int', '50', '20–150', 'Entry window'],
        ['exit_window', 'int', '20', '5–60', 'Exit window'],
      ]} />

      <H3>rsi_trend_filter</H3>
      <P>Buy when price above trend MA AND RSI oversold.</P>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['rsi_window', 'int', '14', '5–30', 'RSI period'],
        ['trend_window', 'int', '50', '20–150', 'Trend MA period'],
        ['buy_below', 'float', '35', '10–45', 'RSI entry level'],
        ['exit_above', 'float', '60', '45–80', 'RSI exit level'],
      ]} />

      <H3>volatility_breakout</H3>
      <P>ATR-based trailing stop breakout system.</P>
      <Table rows={[
        ['Parameter', 'Type', 'Default', 'Range', 'Description'],
        ['breakout_window', 'int', '40', '10–120', 'High window'],
        ['atr_window', 'int', '14', '5–40', 'ATR period'],
        ['stop_atr_mult', 'float', '3.0', '1.0–6.0', 'Stop distance'],
      ]} />

      <H2>Error Codes</H2>
      <Table rows={[
        ['Status', 'Condition'],
        ['400', 'Unknown strategy ID'],
        ['422', 'Insufficient data (< 60 bars)'],
        ['500', 'Data fetch failed'],
      ]} />

      <div style={{ marginTop: '2.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/dashboard/backtest" style={{ color: 'var(--ivory)', textDecoration: 'underline' }}>← Back to Algo Lab</Link>
        <Link href="/dashboard" style={{ color: 'var(--muted)', textDecoration: 'underline' }}>Dashboard</Link>
      </div>
    </div>
  )
}