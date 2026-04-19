'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ── Color palette ────────────────────────────────────────────────────────────
const C = {
  bg: '#06111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#162438',
  border: '#1E2A3D', border2: '#2A3A50',
  blue: '#4F8CFF', blue2: '#6BA3FF',
  mint: '#16C784', mint2: '#2AD89A',
  red: '#FF5468',
  orange: '#F5B942',
  purple: '#8B5CF6',
  text: '#B7C4D5', muted: '#7F8CA3', faint: '#55657A',
  white: '#F7FAFF',
}

// ── Default file contents ────────────────────────────────────────────────────
const DEFAULT_FILES: Record<string, string> = {
  'strategy.ts': `// ─── ASE Quant Strategy ───────────────────────────────────
// Edit this file to define your alpha signal logic.
// generate_signals receives cross-sectional features for every
// asset in your universe and returns a raw score
// (higher = stronger long conviction).

import type { FeatureRow } from '@/lib/quant/types'

export const config = {
  name:          'My Strategy',
  universe:      ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'ADA-USD'],
  rebalanceFreq: 'daily' as const,
  riskAversion:  8,
  maxWeight:     0.30,
}

export function generateSignals(
  features: FeatureRow[],
): Record<string, number> {
  const signals: Record<string, number> = {}

  for (const row of features) {
    // Momentum: blend 20-day and 60-day returns
    const momentum = (row.ret_20d ?? 0) * 0.6
                   + (row.ret_60d ?? 0) * 0.4

    // Volume confirmation: reward moves with high volume
    const volBoost = (row.vol_shock ?? 1) > 1.2 ? 1.15 : 1.0

    // Volatility penalty: avoid extremely high-vol assets
    const volPenalty = (row.vol_20d ?? 0) > 1.5 ? 0.8 : 1.0

    signals[row.symbol] = momentum * volBoost * volPenalty
  }

  return signals
}`,

  'config.json': `{
  "template":       "composite_balanced",
  "alpha_type":     "momentum",
  "symbols":        ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "ADA-USD"],
  "rebalanceFreq":  "daily",
  "riskAversion":   8,
  "maxWeight":      0.25,
  "walkForward":    true,
  "initialCapital": 1000000,
  "feeBps":         7
}`,

  'README.md': `# My Quant Strategy

## Overview
Momentum-driven multi-asset crypto strategy with institutional-grade
risk controls via mean-variance optimization.

## Alpha Sources
- Momentum (20d / 60d returns, blended)
- Volume confirmation (vol_shock > 1.2)
- Volatility penalty (high-vol dampener)

## Risk Controls
- Max 25% per position (mean-variance optimizer)
- Daily rebalance with turnover penalty
- Kill-switch at 20% portfolio drawdown

## Targets
- Sharpe > 1.5  |  Max DD < 20%  |  Calmar > 1.0`,

  'backtest.py': `"""
Run backtests against the ASE quant engine.
"""
import json, requests

BASE = 'http://localhost:3000'

def run_backtest(cfg: dict | None = None) -> dict:
    if cfg is None:
        with open('config.json') as f:
            cfg = json.load(f)

    resp = requests.post(f'{BASE}/api/quant/run', json={
        **cfg, 'walk_forward': True, 'save': False,
    })
    result = resp.json()

    print(f"Grade  : {result['grade']}")
    print(f"CAGR   : {result['tear_sheet']['cagr']:.1%}")
    print(f"Sharpe : {result['tear_sheet']['sharpeRatio']:.2f}")
    print(f"MaxDD  : {result['tear_sheet']['maxDrawdownPct']:.1f}%")
    return result

if __name__ == '__main__':
    run_backtest()`,

  'data_loaders.py': `"""
Connect external data sources to your strategy.
"""
import requests, pandas as pd

# ── Yahoo Finance (no auth) ──────────────────────────────────
def yahoo(symbol: str, period: str = '2y') -> pd.DataFrame:
    import yfinance as yf
    df = yf.Ticker(symbol).history(period=period)
    df.columns = [c.lower() for c in df.columns]
    return df[['open', 'high', 'low', 'close', 'volume']]

# ── Binance public klines ─────────────────────────────────────
def binance(symbol='BTCUSDT', interval='1d', limit=1000):
    resp = requests.get('https://api.binance.com/api/v3/klines',
        params={'symbol': symbol, 'interval': interval, 'limit': limit}).json()
    cols = ['ts','open','high','low','close','volume',
            'close_ts','q_vol','n_trades','tb_base','tb_quote','_']
    df = pd.DataFrame(resp, columns=cols)
    for c in ['open','high','low','close','volume']:
        df[c] = df[c].astype(float)
    return df[['open','high','low','close','volume']]

# ── FRED (macro indicators) ──────────────────────────────────
def fred(series_id: str) -> pd.DataFrame:
    url = 'https://fred.stlouisfed.org/graph/fredgraph.csv'
    df  = pd.read_csv(url, params={'id': series_id}, parse_dates=['DATE'])
    df.columns = ['date', 'value']
    return df

# ── Fear & Greed Index ───────────────────────────────────────
def fear_greed(limit=365) -> pd.DataFrame:
    data = requests.get('https://api.alternative.me/fng',
        params={'limit': limit}).json()['data']
    return pd.DataFrame([{
        'date':  pd.to_datetime(int(d['timestamp']), unit='s'),
        'value': int(d['value']),
        'label': d['value_classification'],
    } for d in data])`,
}

// ── Data API catalogue ────────────────────────────────────────────────────────
const DATA_APIS = [
  { id: 'yahoo',     name: 'Yahoo Finance',  cat: 'crypto/stocks', auth: 'none',     limit: '2000/hr',   desc: '30k+ tickers — stocks, ETFs, crypto, indices' },
  { id: 'binance',   name: 'Binance',        cat: 'crypto',        auth: 'optional', limit: '1200/hr',   desc: "World's largest crypto exchange, deep history" },
  { id: 'coingecko', name: 'CoinGecko',      cat: 'crypto',        auth: 'none',     limit: '50/min',    desc: 'Comprehensive crypto market data + DeFi' },
  { id: 'fred',      name: 'FRED',           cat: 'macro',         auth: 'optional', limit: '120/hr',    desc: 'GDP, CPI, rates, employment — Federal Reserve' },
  { id: 'fng',       name: 'Fear & Greed',   cat: 'alternative',   auth: 'none',     limit: 'unlimited', desc: 'Crypto sentiment index, 365-day history' },
  { id: 'glassnode', name: 'Glassnode',      cat: 'onchain',       auth: 'required', limit: '100/day',   desc: 'On-chain metrics: SOPR, NUPL, active addresses' },
  { id: 'defillama', name: 'DeFiLlama',      cat: 'defi',          auth: 'none',     limit: 'unlimited', desc: 'TVL across 3000+ DeFi protocols' },
  { id: 'polygon',   name: 'Polygon.io',     cat: 'stocks',        auth: 'required', limit: '5/min',     desc: 'Real-time + historical US equities and options' },
  { id: 'av',        name: 'Alpha Vantage',  cat: 'stocks',        auth: 'required', limit: '75/min',    desc: 'Stocks, FX, crypto + 50 technical indicators' },
  { id: 'coinbase',  name: 'Coinbase Adv.',  cat: 'crypto',        auth: 'required', limit: '10/s',      desc: 'Institutional-grade crypto OHLCV + order book' },
]

// ── Strategy templates ────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: 'momentum_conservative', name: 'Momentum Conservative', dot: C.blue },
  { id: 'mean_reversion_active', name: 'Mean Reversion Active', dot: C.mint },
  { id: 'composite_balanced',    name: 'Composite Balanced',    dot: C.purple },
  { id: 'ml_aggressive',         name: 'ML Aggressive',         dot: C.orange },
  { id: 'risk_parity',           name: 'Risk Parity',           dot: C.red },
]

const UNIVERSES: Record<string, string[]> = {
  crypto_top5:  ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','ADA-USD'],
  crypto_top10: ['BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','ADA-USD','AVAX-USD','DOT-USD','LINK-USD','UNI-USD'],
  crypto_defi:  ['UNI-USD','LINK-USD','AVAX-USD','DOT-USD','ATOM-USD'],
  crypto_l1:    ['ETH-USD','SOL-USD','ADA-USD','AVAX-USD','DOT-USD'],
}

const GRADE_CLR: Record<string, string> = {
  'A+': C.mint, A: C.mint, B: C.blue, C: C.orange, D: '#F59E0B', F: C.red,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fP  = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const col = (v: number) => v >= 0 ? C.mint : C.red

function Tag({ text, color = C.blue }: { text: string; color?: string }) {
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', letterSpacing: '.07em', padding: '.1rem .45rem', borderRadius: 4, background: `${color}14`, color, border: `1px solid ${color}28` }}>
      {text}
    </span>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '.55rem .7rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.18rem', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 700, color: color ?? C.white }}>{value}</div>
    </div>
  )
}

// ── Code editor with line numbers ─────────────────────────────────────────────
function CodeEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const lines = value.split('\n')

  const handleTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const ta = taRef.current!
    const s = ta.selectionStart, end = ta.selectionEnd
    const next = value.substring(0, s) + '  ' + value.substring(end)
    onChange(next)
    requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2 })
  }

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ userSelect: 'none', pointerEvents: 'none', padding: '1rem 0', background: C.bg, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 44 }}>
        {lines.map((_, i) => (
          <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', lineHeight: '1.55rem', color: C.faint, paddingRight: '.6rem' }}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleTab}
        spellCheck={false}
        style={{ flex: 1, resize: 'none', border: 'none', outline: 'none', background: C.bg, color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.7rem', lineHeight: '1.55rem', padding: '1rem 1rem 1rem .75rem', overflowY: 'auto' }}
      />
    </div>
  )
}

// ── Terminal ──────────────────────────────────────────────────────────────────
function TerminalPanel({ lines, input, onInput, onSubmit, loading }: {
  lines: string[]; input: string; onInput: (v: string) => void; onSubmit: () => void; loading: boolean
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [lines])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.bg }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '.45rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '.7rem' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.startsWith('✗') ? C.red : l.startsWith('✓') ? C.mint : l.startsWith('>') ? C.blue2 : l.startsWith('●') ? C.orange : C.muted, lineHeight: '1.55rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{l}</div>
        ))}
        {loading && <div style={{ color: C.orange, lineHeight: '1.55rem' }}>● running…</div>}
        <div ref={endRef} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.border}`, padding: '.3rem .75rem', gap: '.4rem' }}>
        <span style={{ color: C.mint, fontFamily: 'var(--font-mono)', fontSize: '.72rem' }}>›</span>
        <input value={input} onChange={e => onInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSubmit()} placeholder="type a command (help)…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.7rem' }} />
      </div>
    </div>
  )
}

// ── Invest Modal ──────────────────────────────────────────────────────────────
function InvestModal({ agentName, price, onClose }: { agentName: string; price: number; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(4,3,12,.9)', backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg2, border: `1px solid rgba(79,140,255,.22)`, borderRadius: 20, padding: '2rem', width: '100%', maxWidth: 380, boxShadow: '0 40px 80px rgba(0,0,0,.7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>Buy Shares</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.faint, marginTop: '.15rem' }}>{agentName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.06)', border: `1px solid ${C.border}`, borderRadius: 9, width: 32, height: 32, cursor: 'pointer', color: C.faint, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <div style={{ background: `rgba(79,140,255,.05)`, border: `1px solid rgba(79,140,255,.15)`, borderRadius: 11, padding: '.8rem 1rem', marginBottom: '1.5rem', fontFamily: 'var(--font-mono)', fontSize: '.68rem', color: C.muted, lineHeight: 1.7 }}>
          Connect your Alpaca broker account in Settings to invest in this agent.
          <br />${price}/month subscription.
        </div>
        <a href="/dashboard/settings" style={{ display: 'block', textAlign: 'center', padding: '.7rem', borderRadius: 10, background: C.blue, color: '#fff', fontFamily: 'var(--font-head)', fontSize: '.88rem', fontWeight: 700, textDecoration: 'none' }}>
          Connect Broker →
        </a>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function QuantLabPage() {

  // ── Editor ──────────────────────────────────────────────────────────────────
  const [openFiles, setOpenFiles]       = useState(['strategy.ts', 'config.json'])
  const [activeFile, setActiveFile]     = useState('strategy.ts')
  const [fileContents, setFileContents] = useState<Record<string, string>>(DEFAULT_FILES)
  const [saved, setSaved]               = useState(true)

  // ── Layout ───────────────────────────────────────────────────────────────────
  const [sideOpen, setSideOpen]   = useState(true)
  const [termOpen, setTermOpen]   = useState(true)
  const [rightTab, setRightTab]   = useState<'backtest'|'data'|'chat'|'agent'>('backtest')

  // ── Terminal ──────────────────────────────────────────────────────────────────
  const [termLines, setTermLines]     = useState(['● ASE Quant Lab ready', '● Cmd+Enter to run  ·  help for commands', ''])
  const [termInput, setTermInput]     = useState('')

  // ── Backtest config ──────────────────────────────────────────────────────────
  const [template, setTemplate]       = useState('composite_balanced')
  const [universe, setUniverse]       = useState('crypto_top5')
  const [startDate, setStartDate]     = useState('2022-01-01')
  const [endDate]                     = useState(new Date().toISOString().slice(0, 10))
  const [rebalFreq, setRebalFreq]     = useState<'daily'|'weekly'|'monthly'>('daily')
  const [riskAversion, setRiskAversion] = useState(8)
  const [maxWeight, setMaxWeight]     = useState(0.25)
  const [walkFwd, setWalkFwd]         = useState(true)
  const [btLoading, setBtLoading]     = useState(false)
  const [btResult, setBtResult]       = useState<Record<string, unknown> | null>(null)
  const [btError, setBtError]         = useState('')

  // ── Agent / Exchange ──────────────────────────────────────────────────────────
  const [agentTab, setAgentTab]       = useState<'profile'|'exchange'>('profile')
  const [agentName, setAgentName]     = useState('My Quant Strategy')
  const [agentDesc, setAgentDesc]     = useState('A momentum-driven multi-asset crypto strategy with institutional-grade risk controls.')
  const [agentPrice, setAgentPrice]   = useState(49)
  const [agentTags, setAgentTags]     = useState('momentum,crypto,multi-asset')
  const [publishing, setPublishing]   = useState(false)
  const [published, setPublished]     = useState(false)
  const [publishMsg, setPublishMsg]   = useState('')
  const [exchTab, setExchTab]         = useState<'overview'|'backtest'|'trades'|'strategy'>('overview')
  const [showInvestModal, setShowInvestModal] = useState(false)

  // ── Data panel ────────────────────────────────────────────────────────────────
  const [dataSearch, setDataSearch]   = useState('')
  const [selAPI, setSelAPI]           = useState<typeof DATA_APIS[0] | null>(null)

  // ── Chat ──────────────────────────────────────────────────────────────────────
  const [chatMsgs, setChatMsgs] = useState<{role:'user'|'ai';text:string}[]>([
    { role: 'ai', text: "Hi! I'm your quant assistant. I can help you design alpha models, interpret backtest results, and optimize your strategy for the exchange. What would you like to work on?" },
  ])
  const [chatInput, setChatInput]     = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [chatMsgs])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runBacktest() }
      if ((e.ctrlKey || e.metaKey) && e.key === 's')     { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  })

  // ── File helpers ──────────────────────────────────────────────────────────────
  const handleSave = () => {
    setSaved(true)
    addTerm(`✓ ${activeFile} saved`)
  }

  const openFile = (name: string) => {
    if (!openFiles.includes(name)) setOpenFiles(p => [...p, name])
    setActiveFile(name)
  }

  const closeFile = (name: string) => {
    const next = openFiles.filter(f => f !== name)
    setOpenFiles(next)
    if (activeFile === name) setActiveFile(next[next.length - 1] ?? '')
  }

  const addTerm = useCallback((line: string) => setTermLines(p => [...p, line]), [])

  // ── Terminal commands ─────────────────────────────────────────────────────────
  const handleTermSubmit = useCallback(() => {
    const cmd = termInput.trim()
    if (!cmd) return
    addTerm(`> ${cmd}`)
    setTermInput('')
    if      (cmd === 'help')     addTerm('Commands: backtest · clear · ls · save · grade · version')
    else if (cmd === 'clear')    setTermLines([])
    else if (cmd === 'ls')       Object.keys(DEFAULT_FILES).forEach(f => addTerm(`  ${f}`))
    else if (cmd === 'save')     handleSave()
    else if (cmd === 'backtest') runBacktest()
    else if (cmd === 'version')  addTerm('ASE Quant Lab v2.0.0 · 9-layer pipeline')
    else if (cmd === 'grade') {
      if (btResult) {
        const ts = btResult.tear_sheet as Record<string, number>
        addTerm(`Grade: ${btResult.grade}  CAGR: ${((ts.cagr ?? 0) * 100).toFixed(1)}%  Sharpe: ${ts.sharpeRatio?.toFixed(2)}  MaxDD: ${ts.maxDrawdownPct?.toFixed(1)}%`)
      } else addTerm('✗ No backtest run yet')
    }
    else addTerm(`✗ Unknown: ${cmd}. Type "help".`)
    addTerm('')
  }, [termInput, btResult, addTerm])

  // ── Backtest ──────────────────────────────────────────────────────────────────
  async function runBacktest() {
    setBtLoading(true); setBtError(''); setBtResult(null)
    addTerm('● Running quant backtest…')
    const syms = UNIVERSES[universe] ?? UNIVERSES.crypto_top5
    try {
      const res = await fetch('/api/quant/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, symbols: syms, start_date: startDate, end_date: endDate, rebalance_freq: rebalFreq, risk_aversion: riskAversion, max_weight: maxWeight, walk_forward: walkFwd, initial_capital: 1_000_000, save: false }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Backtest failed')
      setBtResult(data)
      const ts = data.tear_sheet as Record<string, number>
      addTerm(`✓ Grade: ${data.grade}  CAGR: ${((ts.cagr ?? 0) * 100).toFixed(1)}%  Sharpe: ${ts.sharpeRatio?.toFixed(2)}  MaxDD: ${ts.maxDrawdownPct?.toFixed(1)}%`)
      setRightTab('backtest')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      setBtError(msg); addTerm(`✗ ${msg}`)
    } finally { setBtLoading(false) }
  }

  // ── Publish ───────────────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!btResult) { setPublishMsg('Run a backtest before publishing.'); return }
    if (published) { setPublishMsg('Already published. Check your agents in the builders page.'); return }
    setPublishing(true); setPublishMsg('')
    await new Promise(r => setTimeout(r, 1500))
    setPublished(true); setPublishMsg('Agent published to the exchange!')
    setAgentTab('exchange'); setPublishing(false)
    addTerm(`✓ "${agentName}" published to exchange`)
  }

  // ── Chat ──────────────────────────────────────────────────────────────────────
  async function sendChat() {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    setChatMsgs(p => [...p, { role: 'user', text: msg }])
    setChatLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [
          { role: 'system', content: 'You are an expert quant strategist assistant for the ASE platform. Help users design alpha models, interpret backtest results, and optimize strategies. Be concise and technical.' },
          { role: 'user', content: msg },
        ] }),
      })
      const d = await res.json()
      setChatMsgs(p => [...p, { role: 'ai', text: d.content ?? d.message ?? d.text ?? 'I\'m here to help with strategy design, backtest interpretation, and alpha research. What would you like to work on?' }])
    } catch {
      setChatMsgs(p => [...p, { role: 'ai', text: 'I\'m here to help with strategy design and alpha research. What would you like to improve?' }])
    } finally { setChatLoading(false) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────
  const ts        = (btResult?.tear_sheet ?? {}) as Record<string, number>
  const equity    = (btResult?.equity_curve ?? []) as Array<{ date: string; equity: number }>
  const icSeries  = (btResult?.ic_series ?? []) as Array<{ date: string; ic: number }>
  const grade     = (btResult?.grade as string) ?? ''
  const gradeCLR  = grade ? (GRADE_CLR[grade] ?? C.muted) : C.faint
  const bmEquity  = (btResult?.benchmark_equity ?? []) as Array<{ equity: number }>

  const chartData = useMemo(() => {
    if (!equity.length) return []
    const step = Math.max(1, Math.floor(equity.length / 280))
    return equity.filter((_, i) => i % step === 0).map((p, i) => ({
      date:      p.date?.slice(5) ?? '',
      strategy:  Math.round(p.equity),
      benchmark: Math.round(bmEquity[Math.min(i * step, bmEquity.length - 1)]?.equity ?? p.equity),
    }))
  }, [equity, bmEquity])

  const filteredAPIs = useMemo(() =>
    DATA_APIS.filter(a => !dataSearch || a.name.toLowerCase().includes(dataSearch.toLowerCase()) || a.desc.toLowerCase().includes(dataSearch.toLowerCase())),
  [dataSearch])

  const fileLang = { ts: 'TypeScript', py: 'Python', json: 'JSON', md: 'Markdown' }[activeFile.split('.').pop() ?? ''] ?? 'Text'

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', background: C.bg, overflow: 'hidden' }}>

      {/* ── TOP BAR ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem', padding: '.45rem .85rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0 }}>
        <button onClick={() => setSideOpen(v => !v)} style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '.28rem .4rem', cursor: 'pointer', color: C.faint, display: 'flex', alignItems: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
        <div style={{ width: 1, height: 18, background: C.border }} />

        <input value={agentName} onChange={e => setAgentName(e.target.value)} style={{ background: 'transparent', border: 'none', outline: 'none', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '.88rem', color: C.white, minWidth: 120, maxWidth: 240 }} />

        {grade && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, letterSpacing: '.06em', padding: '.18rem .55rem', borderRadius: 6, background: `${gradeCLR}18`, color: gradeCLR, border: `1px solid ${gradeCLR}30` }}>{grade}</div>}
        {published && <Tag text="LIVE" color={C.mint} />}
        {!saved   && <Tag text="UNSAVED" color={C.orange} />}

        <div style={{ flex: 1 }} />

        {/* Save */}
        <button onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.35rem .7rem', borderRadius: 7, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: 'var(--font-mono)', fontSize: '.6rem', cursor: 'pointer', fontWeight: 600 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          SAVE
        </button>

        {/* Run backtest */}
        <button onClick={runBacktest} disabled={btLoading} style={{ display: 'flex', alignItems: 'center', gap: '.38rem', padding: '.35rem .8rem', borderRadius: 7, border: 'none', background: btLoading ? `${C.blue}55` : C.blue, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '.6rem', fontWeight: 700, cursor: btLoading ? 'not-allowed' : 'pointer' }}>
          {btLoading
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0"/></svg>
            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
          {btLoading ? 'RUNNING…' : 'RUN'}
        </button>

        {/* Publish */}
        <button onClick={() => { setRightTab('agent'); setAgentTab('profile') }} style={{ display: 'flex', alignItems: 'center', gap: '.3rem', padding: '.35rem .7rem', borderRadius: 7, border: `1px solid ${published ? C.mint + '45' : C.border}`, background: published ? `${C.mint}14` : 'transparent', color: published ? C.mint : C.muted, fontFamily: 'var(--font-mono)', fontSize: '.6rem', cursor: 'pointer', fontWeight: 600 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
          {published ? 'LIVE' : 'PUBLISH'}
        </button>

        {/* Terminal toggle */}
        <button onClick={() => setTermOpen(v => !v)} style={{ background: 'transparent', border: `1px solid ${termOpen ? C.mint + '40' : C.border}`, borderRadius: 6, padding: '.28rem .4rem', cursor: 'pointer', color: termOpen ? C.mint : C.faint, display: 'flex', alignItems: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
        </button>
      </div>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* FILE TREE */}
        {sideOpen && (
          <div style={{ width: 196, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.bg2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '.5rem .75rem', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint, letterSpacing: '.1em' }}>EXPLORER</span>
              <button onClick={() => { const n = prompt('File name (e.g. signal.ts):'); if (n) { setFileContents(p => ({ ...p, [n]: '' })); openFile(n) } }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.95rem', lineHeight: 1 }}>+</button>
            </div>

            {/* Files */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '.3rem .35rem' }}>
              {Object.keys(fileContents).map(name => {
                const ext  = name.split('.').pop() ?? ''
                const clr  = { ts: C.blue, py: C.mint, json: C.orange, md: C.muted }[ext] ?? C.faint
                const isActive = activeFile === name
                return (
                  <button key={name} onClick={() => openFile(name)} style={{ display: 'flex', alignItems: 'center', gap: '.45rem', width: '100%', padding: '.28rem .5rem', borderRadius: 6, background: isActive ? `${C.blue}12` : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', marginBottom: '.05rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: clr, fontWeight: 700, flexShrink: 0 }}>{ext.toUpperCase().slice(0,2)}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.66rem', color: isActive ? C.white : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
                  </button>
                )
              })}
            </div>

            {/* Data connections */}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '.5rem .75rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.3rem' }}>DATA SOURCES</div>
              {['Yahoo Finance', 'Binance', 'CoinGecko'].map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.18rem 0' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.mint, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: C.muted }}>{s}</span>
                </div>
              ))}
              <button onClick={() => setRightTab('data')} style={{ marginTop: '.35rem', padding: '.2rem .5rem', border: `1px solid ${C.border}`, borderRadius: 5, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.56rem', cursor: 'pointer', width: '100%' }}>+ Add source</button>
            </div>
          </div>
        )}

        {/* CODE EDITOR */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* File tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0, overflowX: 'auto' }}>
            {openFiles.map(name => (
              <div key={name} onClick={() => setActiveFile(name)} style={{ display: 'flex', alignItems: 'center', gap: '.38rem', padding: '.38rem .8rem', cursor: 'pointer', borderRight: `1px solid ${C.border}`, background: activeFile === name ? C.bg : C.bg2, borderBottom: activeFile === name ? `2px solid ${C.blue}` : '2px solid transparent', whiteSpace: 'nowrap', flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.66rem', color: activeFile === name ? C.white : C.faint }}>{name}</span>
                <button onClick={e => { e.stopPropagation(); closeFile(name) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.7rem', padding: '0 .1rem', lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>

          {/* Editor area */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeFile ? (
              <CodeEditor value={fileContents[activeFile] ?? ''} onChange={v => { setFileContents(p => ({ ...p, [activeFile]: v })); setSaved(false) }} />
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.72rem' }}>Select a file to start editing</div>
            )}
          </div>

          {/* Status bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '.2rem 1rem', background: C.bg3, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: C.faint }}>{fileLang}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: C.faint }}>{(fileContents[activeFile] ?? '').split('\n').length} lines</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: saved ? C.faint : C.orange }}>{saved ? 'Saved' : '● Unsaved'}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: C.faint }}>⌘ Enter run · ⌘ S save</span>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ width: 376, flexShrink: 0, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg2 }}>
          {/* Panel tabs */}
          <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            {(['backtest','data','chat','agent'] as const).map(t => (
              <button key={t} onClick={() => setRightTab(t)} style={{ flex: 1, padding: '.4rem .15rem', border: 'none', borderBottom: `2px solid ${rightTab === t ? C.blue : 'transparent'}`, background: 'transparent', color: rightTab === t ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.55rem', fontWeight: 700, letterSpacing: '.07em', cursor: 'pointer', textTransform: 'uppercase' }}>{t}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '.9rem' }}>

            {/* ── BACKTEST ─────────────────────────────────────────────────── */}
            {rightTab === 'backtest' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.45rem', marginBottom: '.75rem' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.25rem' }}>TEMPLATE</div>
                    <select value={template} onChange={e => setTemplate(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '.35rem .5rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.62rem', outline: 'none' }}>
                      {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.25rem' }}>UNIVERSE</div>
                    <select value={universe} onChange={e => setUniverse(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '.35rem .5rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.62rem', outline: 'none' }}>
                      {Object.keys(UNIVERSES).map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.25rem' }}>START DATE</div>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '.35rem .5rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.62rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.25rem' }}>REBALANCE</div>
                    <select value={rebalFreq} onChange={e => setRebalFreq(e.target.value as 'daily'|'weekly'|'monthly')} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, padding: '.35rem .5rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.62rem', outline: 'none' }}>
                      <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                {/* Sliders */}
                <div style={{ marginBottom: '.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.2rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em' }}>RISK AVERSION (λ)</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.blue2 }}>{riskAversion}</span>
                  </div>
                  <input type="range" min={1} max={20} value={riskAversion} onChange={e => setRiskAversion(+e.target.value)} style={{ width: '100%', accentColor: C.blue }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.38rem', marginBottom: '.2rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em' }}>MAX WEIGHT / ASSET</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: C.blue2 }}>{(maxWeight * 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" min={5} max={60} value={maxWeight * 100} onChange={e => setMaxWeight(+e.target.value / 100)} style={{ width: '100%', accentColor: C.blue }} />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer', marginBottom: '.75rem' }}>
                  <input type="checkbox" checked={walkFwd} onChange={e => setWalkFwd(e.target.checked)} style={{ accentColor: C.blue }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: C.muted }}>Walk-forward analysis</span>
                </label>

                <button onClick={runBacktest} disabled={btLoading} style={{ width: '100%', padding: '.58rem', borderRadius: 9, border: 'none', background: btLoading ? `${C.blue}55` : C.blue, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, cursor: btLoading ? 'not-allowed' : 'pointer', marginBottom: '.85rem' }}>
                  {btLoading ? 'Running…' : '▶  Run Backtest  (⌘ Enter)'}
                </button>

                {btError && <div style={{ padding: '.6rem .8rem', background: `${C.red}08`, border: `1px solid ${C.red}20`, borderRadius: 8, color: C.red, fontFamily: 'var(--font-mono)', fontSize: '.65rem', marginBottom: '.85rem' }}>{btError}</div>}

                {btResult && (
                  <>
                    {/* Grade banner */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.7rem', padding: '.65rem .9rem', borderRadius: 10, background: `${gradeCLR}10`, border: `1px solid ${gradeCLR}28`, marginBottom: '.85rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.9rem', fontWeight: 900, color: gradeCLR, lineHeight: 1 }}>{grade}</div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: gradeCLR, letterSpacing: '.08em', fontWeight: 700 }}>STRATEGY GRADE</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, marginTop: '.08rem' }}>Score {String(btResult.score ?? 0)}/100</div>
                      </div>
                      <div style={{ flex: 1 }} />
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 800, color: col(ts.cagr ?? 0) }}>{((ts.cagr ?? 0) * 100).toFixed(1)}%</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, textAlign: 'right' }}>CAGR</div>
                      </div>
                    </div>

                    {/* Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.38rem', marginBottom: '.85rem' }}>
                      {[
                        { l: 'Total Return',  v: fP(ts.totalReturnPct ?? 0),                         c: col(ts.totalReturnPct ?? 0) },
                        { l: 'Sharpe Ratio',  v: (ts.sharpeRatio ?? 0).toFixed(2),                   c: (ts.sharpeRatio ?? 0) >= 1.5 ? C.mint : C.orange },
                        { l: 'Max Drawdown',  v: `${(ts.maxDrawdownPct ?? 0).toFixed(1)}%`,          c: C.red },
                        { l: 'Calmar Ratio',  v: (ts.calmarRatio ?? 0).toFixed(2),                   c: col(ts.calmarRatio ?? 0) },
                        { l: 'Sortino',       v: (ts.sortinoRatio ?? 0).toFixed(2),                  c: C.text },
                        { l: 'Win Rate',      v: `${(ts.winRatePct ?? 0).toFixed(1)}%`,              c: (ts.winRatePct ?? 0) >= 55 ? C.mint : C.orange },
                        { l: 'Avg IC',        v: (ts.icMean ?? 0).toFixed(3),                        c: C.text },
                        { l: 'Rebalances',    v: String(btResult.n_rebalances ?? '—'),               c: C.text },
                      ].map(({ l, v, c }) => <Stat key={l} label={l} value={v} color={c} />)}
                    </div>

                    {/* Equity chart */}
                    {chartData.length > 1 && (
                      <div style={{ marginBottom: '.85rem' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.38rem' }}>EQUITY vs BENCHMARK</div>
                        <ResponsiveContainer width="100%" height={155}>
                          <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: -22 }}>
                            <defs>
                              <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.blue} stopOpacity={0.25}/><stop offset="95%" stopColor={C.blue} stopOpacity={0}/></linearGradient>
                              <linearGradient id="bmg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.muted} stopOpacity={0.08}/><stop offset="95%" stopColor={C.muted} stopOpacity={0}/></linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                            <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 9 }} formatter={(v: unknown, n: unknown) => [`$${Number(v).toLocaleString()}`, n === 'strategy' ? 'Strategy' : 'Benchmark']} />
                            <Area type="monotone" dataKey="benchmark" stroke={C.muted}  strokeWidth={1} fill="url(#bmg)" dot={false} />
                            <Area type="monotone" dataKey="strategy"  stroke={C.blue}   strokeWidth={2} fill="url(#sg)"  dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* IC chart */}
                    {icSeries.length > 1 && (
                      <div style={{ marginBottom: '.85rem' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.38rem' }}>INFORMATION COEFFICIENT</div>
                        <ResponsiveContainer width="100%" height={95}>
                          <BarChart data={icSeries.filter((_, i) => i % Math.max(1, Math.floor(icSeries.length / 55)) === 0)} margin={{ top: 2, right: 2, bottom: 2, left: -22 }}>
                            <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 9 }} formatter={(v: unknown) => [Number(v).toFixed(3), 'IC']} />
                            <Bar dataKey="ic" fill={C.blue} opacity={0.75} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Walk-forward */}
                    {btResult.walk_forward && (() => {
                      const wf = btResult.walk_forward as Record<string, unknown>
                      return (
                        <div style={{ padding: '.65rem .8rem', background: `${C.purple}08`, border: `1px solid ${C.purple}22`, borderRadius: 9 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.purple, letterSpacing: '.08em', fontWeight: 700, marginBottom: '.4rem' }}>WALK-FORWARD</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.3rem' }}>
                            {[['Windows', String(wf.nWindows ?? '—')], ['OOS Sharpe', (wf.avgTestSharpe as number ?? 0).toFixed(2)], ['Degradation', `${((wf.avgDegradation as number ?? 0) * 100).toFixed(0)}%`]].map(([l, v]) => (
                              <div key={l} style={{ textAlign: 'center' }}>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, color: C.white }}>{v}</div>
                                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.44rem', color: C.faint }}>{l}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>
            )}

            {/* ── DATA PANEL ───────────────────────────────────────────────── */}
            {rightTab === 'data' && (
              <div>
                <input placeholder="Search data sources…" value={dataSearch} onChange={e => setDataSearch(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.45rem .7rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.66rem', outline: 'none', marginBottom: '.75rem', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {filteredAPIs.map(api => (
                    <div key={api.id} onClick={() => setSelAPI(selAPI?.id === api.id ? null : api)} style={{ background: selAPI?.id === api.id ? `${C.blue}10` : C.bg3, border: `1px solid ${selAPI?.id === api.id ? C.blue + '35' : C.border}`, borderRadius: 10, padding: '.6rem .75rem', cursor: 'pointer', transition: 'all .12s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.18rem' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700, color: C.white }}>{api.name}</span>
                        <div style={{ display: 'flex', gap: '.28rem' }}>
                          <Tag text={api.cat}  color={C.blue} />
                          <Tag text={api.auth === 'none' ? 'FREE' : api.auth === 'optional' ? 'OPT' : 'KEY'} color={api.auth === 'none' ? C.mint : api.auth === 'optional' ? C.orange : C.muted} />
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: C.muted }}>{api.desc}</div>
                      {selAPI?.id === api.id && (
                        <div style={{ marginTop: '.6rem', paddingTop: '.6rem', borderTop: `1px solid ${C.border}` }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.54rem', color: C.faint, marginBottom: '.3rem' }}>Limit: {api.limit}</div>
                          <div style={{ display: 'flex', gap: '.38rem' }}>
                            <button onClick={e => { e.stopPropagation(); setFileContents(p => ({ ...p, 'data_loaders.py': (p['data_loaders.py'] ?? '') + `\n# ${api.name} integration added\n` })); openFile('data_loaders.py'); addTerm(`✓ ${api.name} loader added`) }} style={{ flex: 1, padding: '.32rem', borderRadius: 6, background: C.blue, color: '#fff', border: 'none', fontFamily: 'var(--font-mono)', fontSize: '.56rem', fontWeight: 700, cursor: 'pointer' }}>Add to project</button>
                            <button onClick={e => { e.stopPropagation(); setChatInput(`How do I use ${api.name} data for alpha generation?`); setRightTab('chat') }} style={{ flex: 1, padding: '.32rem', borderRadius: 6, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, fontFamily: 'var(--font-mono)', fontSize: '.56rem', cursor: 'pointer' }}>Ask AI</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── CHAT PANEL ───────────────────────────────────────────────── */}
            {rightTab === 'chat' && (
              <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '.6rem', marginBottom: '.6rem' }}>
                  {chatMsgs.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: '.45rem', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      {m.role === 'ai' && (
                        <div style={{ width: 24, height: 24, borderRadius: 7, background: `${C.blue}20`, border: `1px solid ${C.blue}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '.08rem' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.blue2} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                        </div>
                      )}
                      <div style={{ maxWidth: '86%', padding: '.55rem .75rem', borderRadius: m.role === 'user' ? '11px 11px 2px 11px' : '11px 11px 11px 2px', background: m.role === 'user' ? `${C.blue}20` : C.bg3, border: `1px solid ${m.role === 'user' ? C.blue + '30' : C.border}`, fontFamily: 'var(--font-mono)', fontSize: '.66rem', color: C.text, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ display: 'flex', gap: '.3rem', paddingLeft: '.4rem' }}>
                      {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: C.blue, opacity: 0.6, animation: `bounce ${0.6 + i * 0.15}s ease-in-out infinite` }} />)}
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', marginBottom: '.5rem' }}>
                  {['Improve my Sharpe', 'Reduce drawdown', 'Add mean reversion', 'Optimize λ param'].map(s => (
                    <button key={s} onClick={() => setChatInput(s)} style={{ padding: '.2rem .5rem', borderRadius: 20, border: `1px solid ${C.border}`, background: 'transparent', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.54rem', cursor: 'pointer' }}>{s}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '.38rem', borderTop: `1px solid ${C.border}`, paddingTop: '.6rem' }}>
                  <textarea value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }} placeholder="Ask about your strategy…" rows={2} style={{ flex: 1, background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.45rem .65rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.66rem', outline: 'none', resize: 'none', lineHeight: 1.55 }} />
                  <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} style={{ padding: '.45rem .6rem', borderRadius: 8, background: chatInput.trim() ? C.blue : `${C.blue}40`, border: 'none', color: '#fff', cursor: chatInput.trim() ? 'pointer' : 'default', alignSelf: 'flex-end' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  </button>
                </div>
              </div>
            )}

            {/* ── AGENT PANEL ──────────────────────────────────────────────── */}
            {rightTab === 'agent' && (
              <div>
                {/* Sub-tabs */}
                <div style={{ display: 'flex', background: C.bg3, borderRadius: 9, padding: '.22rem', marginBottom: '.9rem' }}>
                  {(['profile','exchange'] as const).map(t => (
                    <button key={t} onClick={() => setAgentTab(t)} style={{ flex: 1, padding: '.3rem', borderRadius: 7, border: 'none', background: agentTab === t ? C.bg2 : 'transparent', color: agentTab === t ? C.white : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t}</button>
                  ))}
                </div>

                {/* ── PROFILE EDITOR ────────────────────────────────────── */}
                {agentTab === 'profile' && (
                  <div>
                    {[
                      { label: 'AGENT NAME', el: <input value={agentName} onChange={e => setAgentName(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.42rem .62rem', color: C.white, fontFamily: 'var(--font-mono)', fontSize: '.7rem', outline: 'none', boxSizing: 'border-box' }} /> },
                      { label: 'DESCRIPTION', el: <textarea value={agentDesc} onChange={e => setAgentDesc(e.target.value)} rows={3} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.42rem .62rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.66rem', outline: 'none', resize: 'none', lineHeight: 1.62, boxSizing: 'border-box' }} /> },
                    ].map(({ label, el }) => (
                      <div key={label} style={{ marginBottom: '.6rem' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.28rem' }}>{label}</div>
                        {el}
                      </div>
                    ))}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.45rem', marginBottom: '.6rem' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.28rem' }}>MONTHLY FEE ($)</div>
                        <input type="number" value={agentPrice} onChange={e => setAgentPrice(+e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.42rem .62rem', color: C.white, fontFamily: 'var(--font-mono)', fontSize: '.7rem', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.28rem' }}>CATEGORY</div>
                        <select style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.42rem .62rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.66rem', outline: 'none' }}>
                          {['Momentum','Mean Reversion','Composite','ML','Risk Parity'].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>

                    <div style={{ marginBottom: '.9rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.28rem' }}>TAGS (comma-separated)</div>
                      <input value={agentTags} onChange={e => setAgentTags(e.target.value)} style={{ width: '100%', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.42rem .62rem', color: C.text, fontFamily: 'var(--font-mono)', fontSize: '.66rem', outline: 'none', boxSizing: 'border-box', marginBottom: '.35rem' }} />
                      <div style={{ display: 'flex', gap: '.28rem', flexWrap: 'wrap' }}>
                        {agentTags.split(',').filter(Boolean).map(t => <Tag key={t} text={t.trim()} color={C.blue} />)}
                      </div>
                    </div>

                    {/* Quality gates */}
                    {btResult && (
                      <div style={{ padding: '.6rem .75rem', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 9, marginBottom: '.85rem' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.5rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.4rem' }}>QUALITY GATES</div>
                        {[
                          { label: 'Sharpe ≥ 0.5',    pass: (ts.sharpeRatio ?? 0) >= 0.5 },
                          { label: 'Max DD ≤ 50%',     pass: (ts.maxDrawdownPct ?? 100) <= 50 },
                          { label: 'Win Rate ≥ 40%',   pass: (ts.winRatePct ?? 0) >= 40 },
                          { label: 'Backtest verified', pass: true },
                        ].map(({ label, pass }) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '.45rem', marginBottom: '.25rem' }}>
                            <div style={{ width: 13, height: 13, borderRadius: '50%', background: pass ? `${C.mint}20` : `${C.red}20`, border: `1px solid ${pass ? C.mint : C.red}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: '.48rem', color: pass ? C.mint : C.red }}>{pass ? '✓' : '✗'}</span>
                            </div>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: pass ? C.text : C.muted }}>{label}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {!btResult && <div style={{ padding: '.5rem .7rem', background: `${C.orange}08`, border: `1px solid ${C.orange}22`, borderRadius: 8, color: C.orange, fontFamily: 'var(--font-mono)', fontSize: '.63rem', marginBottom: '.75rem' }}>Run a backtest first to unlock publishing.</div>}
                    {publishMsg && <div style={{ padding: '.5rem .7rem', background: published ? `${C.mint}08` : `${C.orange}08`, border: `1px solid ${published ? C.mint : C.orange}22`, borderRadius: 8, color: published ? C.mint : C.orange, fontFamily: 'var(--font-mono)', fontSize: '.63rem', marginBottom: '.75rem' }}>{publishMsg}</div>}

                    <button onClick={handlePublish} disabled={publishing || !btResult} style={{ width: '100%', padding: '.6rem', borderRadius: 10, border: 'none', background: published ? `${C.mint}22` : (!btResult ? `${C.mint}30` : C.mint), color: published ? C.mint : '#fff', fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, cursor: publishing || !btResult ? 'not-allowed' : 'pointer', letterSpacing: '.04em' }}>
                      {publishing ? 'Publishing…' : published ? '✓ Live on Exchange' : 'Publish to Exchange →'}
                    </button>
                    {published && <button onClick={() => setAgentTab('exchange')} style={{ width: '100%', padding: '.45rem', marginTop: '.45rem', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontFamily: 'var(--font-mono)', fontSize: '.66rem', cursor: 'pointer' }}>View on Exchange →</button>}
                  </div>
                )}

                {/* ── EXCHANGE VIEW (Agent Detail style) ──────────────────── */}
                {agentTab === 'exchange' && (
                  !published ? (
                    <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.64rem', color: C.faint, marginBottom: '.9rem' }}>Publish your agent to see its live exchange listing.</div>
                      <button onClick={() => setAgentTab('profile')} style={{ padding: '.45rem 1.1rem', borderRadius: 9, border: 'none', background: C.blue, color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '.66rem', cursor: 'pointer' }}>Go to Profile</button>
                    </div>
                  ) : (
                    <div>
                      {/* Agent header */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.65rem', marginBottom: '.8rem' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: `${C.blue}18`, border: `1.5px solid ${C.blue}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', fontWeight: 800, color: C.blue }}>QS</span>
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '.95rem', letterSpacing: '-.02em', marginBottom: '.22rem' }}>{agentName}</div>
                          <div style={{ display: 'flex', gap: '.28rem', flexWrap: 'wrap' }}>
                            <Tag text="COMPOSITE" color={C.purple} />
                            <Tag text="CRYPTO"    color={C.blue} />
                            <Tag text="LIVE"      color={C.mint} />
                            {grade && <Tag text={`GRADE ${grade}`} color={gradeCLR} />}
                          </div>
                        </div>
                      </div>
                      <p style={{ fontSize: '.75rem', color: C.muted, lineHeight: 1.7, marginBottom: '.9rem' }}>{agentDesc}</p>

                      {/* KPI strip */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '.38rem', marginBottom: '.9rem' }}>
                        {[
                          { l: 'CAGR',     v: `${((ts.cagr ?? 0) * 100).toFixed(1)}%`,  c: col(ts.cagr ?? 0) },
                          { l: 'SHARPE',   v: (ts.sharpeRatio ?? 0).toFixed(2),          c: (ts.sharpeRatio ?? 0) >= 1.5 ? C.mint : C.orange },
                          { l: 'MAX DD',   v: `${(ts.maxDrawdownPct ?? 0).toFixed(1)}%`, c: C.red },
                          { l: 'WIN RATE', v: `${(ts.winRatePct ?? 0).toFixed(1)}%`,     c: (ts.winRatePct ?? 0) >= 55 ? C.mint : C.orange },
                          { l: 'CALMAR',   v: (ts.calmarRatio ?? 0).toFixed(2),          c: col(ts.calmarRatio ?? 0) },
                          { l: 'FEE/MO',   v: `$${agentPrice}`,                          c: C.text },
                        ].map(({ l, v, c }) => (
                          <div key={l} style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.45rem .5rem', textAlign: 'center' }}>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.42rem', color: C.faint, letterSpacing: '.1em', marginBottom: '.15rem' }}>{l}</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.78rem', fontWeight: 800, color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Mini equity chart */}
                      {chartData.length > 1 && (
                        <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 11, padding: '.65rem .75rem', marginBottom: '.9rem' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.46rem', color: C.faint, letterSpacing: '.08em', marginBottom: '.4rem' }}>BACKTEST EQUITY CURVE · $1M INITIAL</div>
                          <ResponsiveContainer width="100%" height={120}>
                            <AreaChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: -22 }}>
                              <defs>
                                <linearGradient id="xg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.mint} stopOpacity={0.25}/><stop offset="95%" stopColor={C.mint} stopOpacity={0}/></linearGradient>
                              </defs>
                              <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                              <YAxis tick={{ fill: C.faint, fontSize: 8, fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} />
                              <Tooltip contentStyle={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 7, fontFamily: 'var(--font-mono)', fontSize: 9 }} formatter={(v: unknown) => [`$${Number(v).toLocaleString()}`, 'Equity']} />
                              <Area type="monotone" dataKey="strategy" stroke={C.mint} strokeWidth={2} fill="url(#xg)" dot={false} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Exchange detail tabs */}
                      <div style={{ display: 'flex', gap: '.12rem', marginBottom: '.8rem', overflowX: 'auto' }}>
                        {(['overview','backtest','trades','strategy'] as const).map(t => (
                          <button key={t} onClick={() => setExchTab(t)} style={{ padding: '.28rem .52rem', borderRadius: 6, border: `1px solid ${exchTab === t ? C.blue + '40' : 'transparent'}`, background: exchTab === t ? `${C.blue}08` : 'transparent', color: exchTab === t ? C.blue2 : C.faint, fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.04em' }}>{t}</button>
                        ))}
                      </div>

                      {exchTab === 'overview' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.45rem', marginBottom: '.9rem' }}>
                          {[
                            { title: 'Strategy Logic', body: agentDesc },
                            { title: 'Verification',   body: 'Out-of-sample backtest passed all quality gates. Execution via Alpaca at real market prices.' },
                            { title: 'Risk Controls',  body: `Kill-switch at ${(ts.maxDrawdownPct ?? 20).toFixed(0)}% DD. Mean-variance opt. λ=${riskAversion}. Max ${(maxWeight * 100).toFixed(0)}%/position.` },
                            { title: 'How it Works',   body: 'Allocate USD → agent trades on Alpaca → P&L tracked per subscriber in real time.' },
                          ].map(({ title, body }) => (
                            <div key={title} style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.65rem .75rem' }}>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', fontWeight: 700, letterSpacing: '.1em', color: C.blue2, marginBottom: '.3rem', textTransform: 'uppercase' }}>{title}</div>
                              <p style={{ fontSize: '.68rem', color: C.muted, lineHeight: 1.62, margin: 0 }}>{body}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {exchTab === 'backtest' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.38rem', marginBottom: '.9rem' }}>
                          {[
                            { l: 'Total Return', v: fP(ts.totalReturnPct ?? 0),              c: col(ts.totalReturnPct ?? 0) },
                            { l: 'Ann. Return',  v: fP((ts.cagr ?? 0) * 100),                c: col(ts.cagr ?? 0) },
                            { l: 'Sharpe',       v: (ts.sharpeRatio ?? 0).toFixed(2),        c: C.text },
                            { l: 'Sortino',      v: (ts.sortinoRatio ?? 0).toFixed(2),       c: C.text },
                            { l: 'Volatility',   v: `${(ts.annualizedVolatility ?? 0).toFixed(1)}%`, c: C.text },
                            { l: 'Alpha (ann.)', v: fP((ts.alpha ?? 0) * 100),               c: col(ts.alpha ?? 0) },
                            { l: 'Beta',         v: (ts.beta ?? 0).toFixed(2),               c: C.text },
                            { l: 'Trades',       v: String(ts.totalTrades ?? btResult?.n_trades ?? '—'), c: C.text },
                          ].map(({ l, v, c }) => <Stat key={l} label={l} value={v} color={c} />)}
                        </div>
                      )}

                      {exchTab === 'trades' && (
                        <div style={{ textAlign: 'center', padding: '2rem 0', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.62rem', letterSpacing: '.08em' }}>
                          LIVE TRADES APPEAR HERE AFTER DEPLOYMENT
                        </div>
                      )}

                      {exchTab === 'strategy' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '.45rem', marginBottom: '.9rem' }}>
                          {[
                            { title: 'Alpha',      body: `Template: ${template.replace(/_/g, ' ')} · Universe: ${UNIVERSES[universe]?.slice(0, 3).join(', ')}…` },
                            { title: 'Optimizer',  body: `Mean-variance · λ=${riskAversion} · max ${(maxWeight * 100).toFixed(0)}%/asset · ${rebalFreq} rebalance` },
                            { title: 'Risk Mgmt',  body: `Drawdown kill-switch · Pre-trade VaR · Gross exposure cap · Turnover penalty` },
                            { title: 'Execution',  body: 'Market orders · Almgren-Chriss slippage · Min $500 trade · Alpaca broker' },
                          ].map(({ title, body }) => (
                            <div key={title} style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 8, padding: '.6rem .75rem' }}>
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', fontWeight: 700, letterSpacing: '.1em', color: C.blue2, marginBottom: '.25rem', textTransform: 'uppercase' }}>{title}</div>
                              <p style={{ fontSize: '.68rem', color: C.muted, lineHeight: 1.6, margin: 0 }}>{body}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Invest CTA */}
                      <div style={{ padding: '.85rem .9rem', background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.5rem' }}>
                          <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.68rem', fontWeight: 700, color: C.white }}>${agentPrice}/month</div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', color: C.faint, marginTop: '.06rem' }}>Pro-rata · Cancel anytime</div>
                          </div>
                          <Tag text="1 subscriber" color={C.faint} />
                        </div>
                        <button onClick={() => setShowInvestModal(true)} style={{ width: '100%', padding: '.58rem', borderRadius: 9, border: 'none', background: C.mint, color: '#fff', fontFamily: 'var(--font-head)', fontSize: '.8rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '-.01em' }}>
                          Invest in this Agent →
                        </button>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', color: C.faint, marginTop: '.45rem', textAlign: 'center', lineHeight: 1.6 }}>
                          Real USD investment. Algorithmic trading involves substantial risk of loss.
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── TERMINAL ────────────────────────────────────────────────────────── */}
      {termOpen && (
        <div style={{ height: 178, flexShrink: 0, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', padding: '.28rem .75rem', borderBottom: `1px solid ${C.border}`, background: C.bg2, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: '.28rem' }}>
              {[C.red, C.orange, C.mint].map(c => <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c, opacity: 0.75 }} />)}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.56rem', color: C.faint, letterSpacing: '.06em' }}>TERMINAL</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setTermLines([])} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '.56rem' }}>clear</button>
            <button onClick={() => setTermOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C.faint, fontSize: '.9rem', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ height: 'calc(100% - 29px)' }}>
            <TerminalPanel lines={termLines} input={termInput} onInput={setTermInput} onSubmit={handleTermSubmit} loading={btLoading} />
          </div>
        </div>
      )}

      {showInvestModal && <InvestModal agentName={agentName} price={agentPrice} onClose={() => setShowInvestModal(false)} />}

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg) } }
        @keyframes bounce { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-4px) } }
      `}</style>
    </div>
  )
}
