/**
 * lib/llm-blocks.ts
 *
 * Drag-and-drop snippet library for the Quant Lab.
 * Each block ships with:
 *   - id, name, category, icon
 *   - desc      → short tooltip
 *   - filename  → which file the snippet should be appended to
 *   - code      → the actual TS / Python to insert
 *
 * The build page renders these in the right-side "Add" panel.
 * On drop into the editor, the snippet is appended (with a header
 * comment) to `filename`, opened, and a toast posted to the terminal.
 */

export type BlockCategory = 'data' | 'ml' | 'llm' | 'risk' | 'execution' | 'feature'

export interface CodeBlock {
  id:        string
  name:      string
  category:  BlockCategory
  icon:      string
  desc:      string
  filename:  'strategy.ts' | 'data_loaders.py' | 'config.json' | 'llm_signals.ts'
  code:      string
}

// ── DATA BLOCKS ─────────────────────────────────────────────────────────

export const DATA_BLOCKS: CodeBlock[] = [
  {
    id: 'data-binance',
    name: 'Binance OHLCV',
    category: 'data',
    icon: '📊',
    desc: 'Pull OHLCV bars from Binance — no auth, 1200/hr',
    filename: 'data_loaders.py',
    code: `
# ── Binance OHLCV ─────────────────────────────────────────────────
def load_binance_ohlcv(symbol='BTCUSDT', interval='1h', limit=500):
    import requests, pandas as pd
    r = requests.get('https://api.binance.com/api/v3/klines',
        params={'symbol': symbol, 'interval': interval, 'limit': limit}).json()
    df = pd.DataFrame(r, columns=['ts','open','high','low','close','volume',
                                   'close_ts','q_vol','n_trades','tb_base','tb_quote','_'])
    for c in ['open','high','low','close','volume']:
        df[c] = df[c].astype(float)
    df['ts'] = pd.to_datetime(df['ts'], unit='ms')
    return df.set_index('ts')[['open','high','low','close','volume']]
`,
  },
  {
    id: 'data-kraken',
    name: 'Kraken OHLC',
    category: 'data',
    icon: '🐙',
    desc: 'Native Kraken klines — used by ASE for live execution',
    filename: 'data_loaders.py',
    code: `
# ── Kraken OHLC ───────────────────────────────────────────────────
def load_kraken_ohlc(pair='XBTUSD', interval=60):
    """interval in minutes: 1, 5, 15, 30, 60, 240, 1440 (daily)"""
    import requests, pandas as pd
    r = requests.get('https://api.kraken.com/0/public/OHLC',
        params={'pair': pair, 'interval': interval}).json()
    bars = list(r['result'].values())[0]
    df = pd.DataFrame(bars, columns=['ts','open','high','low','close','vwap','volume','count'])
    for c in ['open','high','low','close','volume']:
        df[c] = df[c].astype(float)
    df['ts'] = pd.to_datetime(df['ts'].astype(int), unit='s')
    return df.set_index('ts')[['open','high','low','close','volume']]
`,
  },
  {
    id: 'data-fng',
    name: 'Fear & Greed',
    category: 'data',
    icon: '😱',
    desc: 'Crypto sentiment index — daily, 365-day history',
    filename: 'data_loaders.py',
    code: `
# ── Fear & Greed Index ────────────────────────────────────────────
def load_fear_greed(limit=365):
    import requests, pandas as pd
    r = requests.get('https://api.alternative.me/fng/', params={'limit': limit}).json()
    df = pd.DataFrame(r['data'])
    df['date'] = pd.to_datetime(df['timestamp'].astype(int), unit='s')
    df['fg'] = df['value'].astype(int)
    return df[['date','fg']].set_index('date').sort_index()
`,
  },
  {
    id: 'data-defillama',
    name: 'DeFiLlama TVL',
    category: 'data',
    icon: '🦙',
    desc: 'TVL time series across 3000+ DeFi protocols',
    filename: 'data_loaders.py',
    code: `
# ── DeFiLlama TVL ─────────────────────────────────────────────────
def load_tvl(protocol='uniswap'):
    import requests, pandas as pd
    r = requests.get(f'https://api.llama.fi/protocol/{protocol}').json()
    df = pd.DataFrame(r['tvl'])
    df['date'] = pd.to_datetime(df['date'], unit='s')
    df['tvl'] = df['totalLiquidityUSD'].astype(float)
    return df.set_index('date')[['tvl']]
`,
  },
  {
    id: 'data-funding',
    name: 'Funding Rate',
    category: 'data',
    icon: '📈',
    desc: 'Binance perp funding rate — leverage indicator',
    filename: 'data_loaders.py',
    code: `
# ── Binance Perp Funding Rate ─────────────────────────────────────
def load_funding(symbol='BTCUSDT', limit=500):
    import requests, pandas as pd
    r = requests.get('https://fapi.binance.com/fapi/v1/fundingRate',
        params={'symbol': symbol, 'limit': limit}).json()
    df = pd.DataFrame(r)
    df['fundingTime'] = pd.to_datetime(df['fundingTime'], unit='ms')
    df['fundingRate'] = df['fundingRate'].astype(float)
    return df.set_index('fundingTime')[['fundingRate']]
`,
  },
]

// ── ML BLOCKS ───────────────────────────────────────────────────────────

export const ML_BLOCKS: CodeBlock[] = [
  {
    id: 'ml-xgb',
    name: 'XGBoost Signal',
    category: 'ml',
    icon: '⚡',
    desc: 'Gradient-boosted tree — trains on returns, predicts next-day direction',
    filename: 'strategy.ts',
    code: `
// ── ML Signal Hook (XGBoost via Python sidecar) ───────────────────
// Append to your generateSignals() — calls the configured ML model.
// The ASE engine wires this to a hosted XGBoost predictor.
async function mlSignal(features: FeatureRow[]): Promise<Record<string, number>> {
  const res = await fetch('/api/ml/predict', {
    method: 'POST',
    body: JSON.stringify({ model: 'xgb_momentum_v2', features }),
  })
  const { predictions } = await res.json()
  return predictions  // { "BTC-USD": 0.42, "ETH-USD": 0.18, ... }
}
`,
  },
  {
    id: 'ml-lstm',
    name: 'LSTM Predictor',
    category: 'ml',
    icon: '🔥',
    desc: 'Sequence model for multi-day return forecasting',
    filename: 'strategy.ts',
    code: `
// ── LSTM Predictor ───────────────────────────────────────────────
async function lstmForecast(symbol: string, horizon = 5): Promise<number> {
  const res = await fetch('/api/ml/predict', {
    method: 'POST',
    body: JSON.stringify({ model: 'lstm_pricerig_v1', symbol, horizon }),
  })
  const { mu } = await res.json()
  return mu  // expected log-return over horizon days
}
`,
  },
  {
    id: 'ml-hrp',
    name: 'HRP Allocator',
    category: 'ml',
    icon: '⚖️',
    desc: 'Hierarchical Risk Parity weights — robust to estimation noise',
    filename: 'strategy.ts',
    code: `
// ── HRP weight allocator ─────────────────────────────────────────
// Use AFTER you compute conviction signals. Returns risk-adjusted weights.
function hrpWeights(signals: Record<string, number>, vol: Record<string, number>): Record<string, number> {
  const w: Record<string, number> = {}
  let total = 0
  for (const [s, sig] of Object.entries(signals)) {
    const v = vol[s] ?? 1.0
    if (sig > 0) { w[s] = sig / v; total += w[s] }
  }
  for (const k of Object.keys(w)) w[k] = total > 0 ? w[k] / total : 0
  return w
}
`,
  },
]

// ── LLM BLOCKS ──────────────────────────────────────────────────────────

export const LLM_BLOCKS: CodeBlock[] = [
  {
    id: 'llm-news-sentiment',
    name: 'News Sentiment (Claude)',
    category: 'llm',
    icon: '📰',
    desc: 'Score recent crypto news for sentiment + market impact',
    filename: 'llm_signals.ts',
    code: `// ── News Sentiment via Claude ────────────────────────────────────
// Returns {symbol: score} where score ∈ [-1, 1].
// -1 = strongly bearish, 0 = neutral, +1 = strongly bullish.
export async function newsSentiment(symbols: string[]): Promise<Record<string, number>> {
  const res = await fetch('/api/llm/news-sentiment', {
    method: 'POST',
    body: JSON.stringify({ symbols, lookback_hours: 24 }),
  })
  const { scores } = await res.json()
  return scores
}
`,
  },
  {
    id: 'llm-regime',
    name: 'Market Regime Classifier',
    category: 'llm',
    icon: '🌐',
    desc: 'Classify current macro/crypto regime: risk-on / risk-off / uncertain',
    filename: 'llm_signals.ts',
    code: `// ── Market Regime Classifier (LLM) ───────────────────────────────
// Pulls the day's headlines + macro prints + on-chain summary,
// asks Claude to label the regime.
export async function classifyRegime(): Promise<'risk_on' | 'risk_off' | 'uncertain'> {
  const res = await fetch('/api/llm/regime', { method: 'POST' })
  const { regime } = await res.json()
  return regime
}

// Apply as a global signal multiplier:
//   const regime = await classifyRegime()
//   const mult = regime === 'risk_on' ? 1.2 : regime === 'risk_off' ? 0.4 : 0.8
//   for (const k of Object.keys(signals)) signals[k] *= mult
`,
  },
  {
    id: 'llm-narrative',
    name: 'Narrative Detector',
    category: 'llm',
    icon: '💬',
    desc: 'Find which themes (DeFi, AI, L2, memes) are trending in news + social',
    filename: 'llm_signals.ts',
    code: `// ── Trending Narrative Detector ──────────────────────────────────
// Returns top themes with strength score and example tickers.
export async function trendingNarratives(): Promise<Array<{ theme: string; strength: number; tickers: string[] }>> {
  const res = await fetch('/api/llm/narratives', { method: 'POST' })
  const { themes } = await res.json()
  return themes  // [{theme: 'AI', strength: 0.8, tickers: ['FET-USD', 'RNDR-USD']}, ...]
}
`,
  },
  {
    id: 'llm-trade-rationale',
    name: 'Trade Rationale Logger',
    category: 'llm',
    icon: '📝',
    desc: 'Have Claude explain each trade — show in agent reasoning panel',
    filename: 'llm_signals.ts',
    code: `// ── Trade Rationale (LLM-explained) ──────────────────────────────
// Pass your computed signals + features. Returns a 2-sentence
// human-readable explanation that gets stored in agent_reasoning.
export async function explainTrade(symbol: string, action: 'BUY'|'SELL'|'HOLD', context: Record<string, unknown>): Promise<string> {
  const res = await fetch('/api/llm/explain', {
    method: 'POST',
    body: JSON.stringify({ symbol, action, context }),
  })
  const { rationale } = await res.json()
  return rationale
}
`,
  },
]

// ── RISK + EXECUTION BLOCKS ─────────────────────────────────────────────

export const RISK_BLOCKS: CodeBlock[] = [
  {
    id: 'risk-vol-target',
    name: 'Volatility Targeting',
    category: 'risk',
    icon: '🛡️',
    desc: 'Scale position sizes to target portfolio vol of 15% annualized',
    filename: 'strategy.ts',
    code: `
// ── Volatility Targeting ─────────────────────────────────────────
// Scale weights so realized portfolio vol ≈ target.
function volTarget(weights: Record<string, number>, vols: Record<string, number>, targetAnnVol = 0.15): Record<string, number> {
  let portVol = 0
  for (const [k, w] of Object.entries(weights)) portVol += (vols[k] ?? 0.5) ** 2 * w * w
  portVol = Math.sqrt(portVol)
  const scale = portVol > 0 ? targetAnnVol / portVol : 1
  const out: Record<string, number> = {}
  for (const [k, w] of Object.entries(weights)) out[k] = Math.min(w * scale, 1)
  return out
}
`,
  },
  {
    id: 'risk-stop-loss',
    name: 'ATR Trailing Stop',
    category: 'risk',
    icon: '🚨',
    desc: 'Exit positions when price falls more than 2× ATR from peak',
    filename: 'strategy.ts',
    code: `
// ── ATR Trailing Stop ────────────────────────────────────────────
// Exit when (peak - current) > atr_mult × ATR.
function atrTrailingStopHit(currentPrice: number, peakPrice: number, atr: number, mult = 2.0): boolean {
  return (peakPrice - currentPrice) > mult * atr
}
`,
  },
  {
    id: 'risk-killswitch',
    name: 'Drawdown Kill Switch',
    category: 'risk',
    icon: '⛔',
    desc: 'Halt all trading if portfolio drawdown exceeds threshold',
    filename: 'strategy.ts',
    code: `
// ── Drawdown Kill Switch ─────────────────────────────────────────
// Returns true if we should halt trading entirely.
function killSwitchTriggered(equity: number, peakEquity: number, ddLimit = 0.25): boolean {
  if (peakEquity <= 0) return false
  return (peakEquity - equity) / peakEquity > ddLimit
}
`,
  },
]

export const ALL_BLOCKS: CodeBlock[] = [...DATA_BLOCKS, ...ML_BLOCKS, ...LLM_BLOCKS, ...RISK_BLOCKS]

export const BLOCKS_BY_CATEGORY: Record<BlockCategory, CodeBlock[]> = {
  data:      DATA_BLOCKS,
  ml:        ML_BLOCKS,
  llm:       LLM_BLOCKS,
  risk:      RISK_BLOCKS,
  execution: [],
  feature:   [],
}

export const CATEGORY_META: Record<BlockCategory, { label: string; icon: string; color: string }> = {
  data:      { label: 'Data',      icon: '📊', color: '#4F8CFF' },
  ml:        { label: 'ML',        icon: '🤖', color: '#8B5CF6' },
  llm:       { label: 'LLM',       icon: '🧠', color: '#16C784' },
  risk:      { label: 'Risk',      icon: '🛡️', color: '#F5B942' },
  execution: { label: 'Execution', icon: '⚡', color: '#6BA3FF' },
  feature:   { label: 'Features',  icon: '🔬', color: '#6DD3FF' },
}
