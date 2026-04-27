'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import PublicNav from '@/components/ui/PublicNav'

function useInView(threshold = 0) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold })
    obs.observe(el); return () => obs.disconnect()
  }, [threshold])
  return { ref: ref as React.RefObject<HTMLDivElement>, visible }
}

function MiniChart({ positive, h = 40, w = 80 }: { positive: boolean; h?: number; w?: number }) {
  const pts = Array.from({ length: 20 }, (_, i) => {
    const trend = positive ? i * 1.4 : -i * 0.9
    const noise = Math.sin(i * 0.8) * 5 + Math.cos(i * 1.3) * 3
    return `${(i / 19) * w},${Math.max(2, Math.min(h - 2, h * 0.6 - trend * 0.5 - noise))}`
  }).join(' ')
  const color = positive ? '#16C784' : '#E45867'
  const id = `mc-${positive}-${h}-${w}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.18"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#${id})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  )
}

/* ── Static UI mockups ── */

function ExchangeScreen() {
  const agents = [
    { rank: 1, name: 'Crypto Momentum Carry', sym: 'BTC-USD', ret: '+1.0%', sharpe: '7.79', dd: '100%', type: 'crypto', grade: 'A' },
    { rank: 2, name: 'S&P 500 Momentum Edge', sym: 'SPY', ret: '+0.1%', sharpe: '5.50', dd: '100%', type: 'equity', grade: 'B+' },
    { rank: 3, name: 'Nasdaq Growth Rotation', sym: 'QQQ', ret: '+0.0%', sharpe: '4.63', dd: '100%', type: 'equity', grade: 'B' },
  ]
  return (
    <div style={{ background: '#06111F', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1E2A3D' }}>
        <div style={{ fontSize: 11, color: '#55657A', letterSpacing: '0.1em', marginBottom: 4 }}>EXCHANGE</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#F7FAFF', fontFamily: 'Inter, sans-serif', letterSpacing: '-0.03em' }}>Crypto &amp; DeFi Agents</div>
        <div style={{ fontSize: 9, color: '#55657A', marginTop: 2 }}>Ranked by risk-adjusted performance · Hidden test set verified</div>
      </div>
      <div style={{ padding: '8px 16px', display: 'flex', gap: 6 }}>
        {['ALL', 'momentum', 'mean-reversion', 'crypto'].map((f, i) => (
          <div key={f} style={{ padding: '3px 8px', borderRadius: 12, background: i === 0 ? 'rgba(79,140,255,0.15)' : 'transparent', border: `1px solid ${i === 0 ? 'rgba(79,140,255,0.35)' : '#1E2A3D'}`, color: i === 0 ? '#6BA3FF' : '#55657A', fontSize: 8 }}>{f}</div>
        ))}
      </div>
      <div style={{ flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {agents.map(a => (
          <div key={a.rank} style={{ background: '#0B1728', border: '1px solid #1E2A3D', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, background: '#162438', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#4F8CFF', fontWeight: 700 }}>#{a.rank}</div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#F7FAFF', fontFamily: 'Inter, sans-serif' }}>{a.name}</div>
                  <div style={{ fontSize: 8, color: '#55657A' }}>{a.sym} · LIVE</div>
                </div>
              </div>
              <MiniChart positive h={24} w={48} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
              {[['RETURN', a.ret, '#16C784'], ['SHARPE', a.sharpe, '#F7FAFF'], ['MAX DD', a.dd, '#E45867'], ['GRADE', a.grade, '#16C784']].map(([l, v, c]) => (
                <div key={String(l)} style={{ background: '#101A2D', borderRadius: 5, padding: '4px 6px' }}>
                  <div style={{ fontSize: 7, color: '#55657A', marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: String(c) }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '6px 16px', borderTop: '1px solid #1E2A3D', display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 7, color: '#55657A' }}>17 agents</span>
        <span style={{ fontSize: 7, color: '#16C784' }}>avg sharpe: +0.92</span>
        <span style={{ fontSize: 7, color: '#55657A', marginLeft: 'auto' }}>live: 17</span>
      </div>
    </div>
  )
}

function QuantLabScreen() {
  const lines = [
    { n: 1, code: '// ── ASE Active Swing Strategy ────────────────────────────', dim: true },
    { n: 2, code: '// Template: active_swing — RSI(7) + EMA trend filter + ATR trailing stop', dim: true },
    { n: 3, code: '//', dim: true },
    { n: 4, code: '// Target: ~200 trades over 6 months | ~30% return in bull crypto markets', dim: true },
    { n: 5, code: '', dim: false },
    { n: 6, code: "import type { FeatureRow } from '@ase/quant'", dim: false },
    { n: 7, code: '', dim: false },
    { n: 8, code: 'export const config = {', dim: false },
    { n: 9, code: "  name:     'Active Swing',", dim: false },
    { n: 10, code: "  strategy: 'active_swing' as const,", dim: false },
    { n: 11, code: "  universe: ['BTC-USD', 'ETH-USD', 'SOL-USD'],", dim: false },
    { n: 12, code: "  rebalanceFreq: 'daily' as const,", dim: false },
    { n: 13, code: '  riskAversion: 1,   // lower = more aggressive', dim: false },
    { n: 14, code: '  maxWeight:    0.50, // concentrated — up to 50% per asset', dim: false },
    { n: 15, code: '  feeBps:       7,    // round-trip fee in basis points', dim: false },
  ]
  return (
    <div style={{ background: '#06111F', height: '100%', display: 'flex', fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Explorer */}
      <div style={{ width: 120, borderRight: '1px solid #1E2A3D', padding: '8px 0' }}>
        <div style={{ padding: '4px 10px', fontSize: 8, color: '#55657A', letterSpacing: '0.1em', marginBottom: 4 }}>EXPLORER</div>
        {[['TS', 'strategy.ts', '#4F8CFF', true], ['JS', 'config.json', '#F5B942', false], ['PY', 'data_loaders.py', '#16C784', false], ['MD', 'DOCS.md', '#7F8CA3', false]].map(([ext, name, col, active]) => (
          <div key={String(name)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: active ? 'rgba(79,140,255,0.08)' : 'transparent', borderLeft: `2px solid ${active ? '#4F8CFF' : 'transparent'}` }}>
            <span style={{ fontSize: 7, color: String(col), background: `${String(col)}22`, padding: '1px 3px', borderRadius: 2 }}>{ext}</span>
            <span style={{ fontSize: 8, color: active ? '#F7FAFF' : '#55657A' }}>{name}</span>
          </div>
        ))}
      </div>
      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #1E2A3D', padding: '0 12px', gap: 2 }}>
          {['strategy.ts ×', 'config.json ×'].map((t, i) => (
            <div key={t} style={{ padding: '5px 10px', fontSize: 8, color: i === 0 ? '#F7FAFF' : '#55657A', borderBottom: `2px solid ${i === 0 ? '#4F8CFF' : 'transparent'}` }}>{t}</div>
          ))}
        </div>
        <div style={{ flex: 1, padding: '8px 0', overflow: 'hidden' }}>
          {lines.slice(0, 12).map(l => (
            <div key={l.n} style={{ display: 'flex', gap: 12, padding: '1px 12px', fontSize: 8.5, lineHeight: 1.6 }}>
              <span style={{ color: '#2A3A50', minWidth: 16, textAlign: 'right', userSelect: 'none' }}>{l.n}</span>
              <span style={{ color: l.dim ? '#2A3A50' : l.code.includes("'") ? '#16C784' : l.code.startsWith('import') ? '#4F8CFF' : '#B7C4D5', whiteSpace: 'nowrap' }}>{l.code}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Config panel */}
      <div style={{ width: 140, borderLeft: '1px solid #1E2A3D', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 8, color: '#55657A', letterSpacing: '0.08em' }}>BACKTEST</div>
        {[['TEMPLATE', 'Composite Balanced'], ['REBALANCE', 'Daily'], ['RISK AVS.', '5'], ['MAX WEIGHT', '200%'], ['INIT. CAP', '100,000']].map(([l, v]) => (
          <div key={String(l)}>
            <div style={{ fontSize: 7, color: '#55657A', marginBottom: 2 }}>{l}</div>
            <div style={{ fontSize: 8, color: '#F7FAFF', fontWeight: 600 }}>{v}</div>
            <div style={{ height: 3, background: '#162438', borderRadius: 2, marginTop: 3 }}>
              <div style={{ height: '100%', width: '60%', background: 'linear-gradient(90deg, #4F8CFF, #16C784)', borderRadius: 2 }} />
            </div>
          </div>
        ))}
        <div style={{ marginTop: 'auto', background: '#4F8CFF', borderRadius: 5, padding: '6px 8px', textAlign: 'center', fontSize: 8, color: '#fff', fontWeight: 700 }}>▶ Run Backtest</div>
      </div>
    </div>
  )
}

function BacktestScreen() {
  const perfPts = '0,60 20,55 40,48 60,50 80,42 100,38 120,35 140,30 160,28 180,25 200,20 220,22 240,18 260,15'
  const bmkPts = '0,60 20,58 40,56 60,55 80,52 100,50 120,49 140,48 160,45 180,44 200,43 220,41 240,40 260,38'
  return (
    <div style={{ background: '#06111F', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #1E2A3D', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(79,140,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#4F8CFF" strokeWidth={2}><path d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#F7FAFF', fontFamily: 'Inter, sans-serif' }}>Backtest Studio</div>
          <div style={{ fontSize: 8, color: '#55657A' }}>Run, compare, and validate strategies</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <div style={{ padding: '3px 8px', background: '#162438', border: '1px solid #1E2A3D', borderRadius: 4, fontSize: 7, color: '#55657A' }}>PERIOD: 2 Years</div>
          <div style={{ padding: '3px 8px', background: '#162438', border: '1px solid #1E2A3D', borderRadius: 4, fontSize: 7, color: '#55657A' }}>FEE: 10 bps</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 0, padding: '8px 16px', borderBottom: '1px solid #1E2A3D' }}>
        {['Overview', 'Compare', 'Robustness', 'Trades', 'Agents'].map((t, i) => (
          <div key={t} style={{ padding: '4px 10px', fontSize: 8, color: i === 0 ? '#4F8CFF' : '#55657A', borderBottom: `2px solid ${i === 0 ? '#4F8CFF' : 'transparent'}`, marginRight: 4 }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1, padding: '10px 16px', display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ background: '#0B1728', border: '1px solid #1E2A3D', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 8, color: '#55657A', marginBottom: 6 }}>PERFORMANCE</div>
            <svg width="100%" height={80} viewBox="0 0 260 80" preserveAspectRatio="none">
              <defs>
                <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4F8CFF" stopOpacity="0.2"/><stop offset="100%" stopColor="#4F8CFF" stopOpacity="0"/></linearGradient>
              </defs>
              <polygon points={`0,80 ${perfPts} 260,80`} fill="url(#pg)"/>
              <polyline points={perfPts} fill="none" stroke="#4F8CFF" strokeWidth="1.5"/>
              <polyline points={bmkPts} fill="none" stroke="#55657A" strokeWidth="1" strokeDasharray="3,3"/>
            </svg>
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 2, background: '#4F8CFF', borderRadius: 1 }}/><span style={{ fontSize: 7, color: '#55657A' }}>DeFi Smart Beta</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 2, background: '#55657A', borderRadius: 1 }}/><span style={{ fontSize: 7, color: '#55657A' }}>Benchmark</span></div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {[['Total Return', '+28.4%', '#16C784'], ['Sharpe Ratio', '1.84', '#F7FAFF'], ['Max Drawdown', '-12.3%', '#E45867'], ['Win Rate', '64%', '#16C784']].map(([l, v, c]) => (
              <div key={String(l)} style={{ background: '#0B1728', border: '1px solid #1E2A3D', borderRadius: 7, padding: '8px 10px' }}>
                <div style={{ fontSize: 7, color: '#55657A', marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: String(c) }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ background: '#0B1728', border: '1px solid rgba(79,140,255,0.25)', borderLeft: '3px solid #4F8CFF', borderRadius: 7, padding: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#F7FAFF', marginBottom: 3 }}>DeFi Smart Beta Rotation</div>
            <div style={{ fontSize: 7, color: '#55657A' }}>DEFI | momentum crossover</div>
            <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: '#16C784' }}>+28.4%</div>
          </div>
          <div style={{ background: '#0B1728', border: '1px solid rgba(22,199,132,0.2)', borderLeft: '3px solid #16C784', borderRadius: 7, padding: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: '#F7FAFF', marginBottom: 3 }}>ETH Statistical Arb</div>
            <div style={{ fontSize: 7, color: '#55657A' }}>ETHR | momentum crossover</div>
            <div style={{ marginTop: 6, fontSize: 10, fontWeight: 700, color: '#16C784' }}>+19.2%</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SyneScreen() {
  return (
    <div style={{ background: '#000', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ height: 22, background: '#0A0A0A', borderBottom: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#FFB800', boxShadow: '0 0 5px #FFB800' }} />
          <span style={{ fontSize: 8, color: '#FFB800', letterSpacing: '0.12em' }}>SYNE · ENERGY INTELLIGENCE TERMINAL</span>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 7, color: '#333', letterSpacing: '0.1em' }}>WATCHTOWER ACTIVE · 14 ALERTS</div>
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        {/* Map area */}
        <div style={{ flex: 1, background: '#050505', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,184,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,184,0,0.03) 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
          {/* Mock map dots */}
          {[
            { x: 30, y: 35, c: '#FFB800', size: 6, label: 'Permian' },
            { x: 45, y: 55, c: '#FFB800', size: 5, label: 'Gulf Coast' },
            { x: 65, y: 30, c: '#FF3131', size: 7, label: 'North Sea' },
            { x: 72, y: 45, c: '#FFB800', size: 5, label: 'Rotterdam' },
            { x: 82, y: 55, c: '#00FF41', size: 4, label: 'Brent' },
            { x: 25, y: 65, c: '#00FF41', size: 4, label: 'WTI Exchange' },
            { x: 55, y: 70, c: '#FF3131', size: 6, label: 'Strait of Hormuz' },
          ].map(pt => (
            <div key={pt.label} style={{ position: 'absolute', left: `${pt.x}%`, top: `${pt.y}%`, transform: 'translate(-50%, -50%)' }}>
              <div style={{ width: pt.size * 2, height: pt.size * 2, border: `1px solid ${pt.c}`, transform: 'rotate(45deg)', background: `${pt.c}22` }} />
              <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', fontSize: 6, color: pt.c, whiteSpace: 'nowrap', marginTop: 2, opacity: 0.8 }}>{pt.label}</div>
            </div>
          ))}
          {/* SYNE label */}
          <div style={{ position: 'absolute', top: 8, left: 8, fontSize: 8, color: '#FFB800', letterSpacing: '0.2em', opacity: 0.6 }}>GHOST MAP · MERCATOR</div>
        </div>
        {/* Rail */}
        <div style={{ width: 130, borderLeft: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #1a1a1a' }}>
            {['WATCH', 'GEO', 'ORACLE'].map((t, i) => (
              <div key={t} style={{ flex: 1, padding: '4px 2px', textAlign: 'center', fontSize: 6.5, color: i === 0 ? '#FFB800' : '#333', borderBottom: `1px solid ${i === 0 ? '#FFB800' : 'transparent'}`, letterSpacing: '0.08em' }}>{t}</div>
            ))}
          </div>
          <div style={{ padding: 8, flex: 1 }}>
            <div style={{ fontSize: 7, color: '#FFB800', letterSpacing: '0.1em', marginBottom: 6 }}>⚠ HIGH RISK ALERTS</div>
            {[
              { label: 'Hormuz Strait', risk: 'HIGH', color: '#FF3131' },
              { label: 'North Sea Storm', risk: 'MED', color: '#FFB800' },
              { label: 'Brent Surge', risk: 'MON', color: '#00FF41' },
            ].map(a => (
              <div key={a.label} style={{ borderLeft: `2px solid ${a.color}`, padding: '4px 6px', marginBottom: 4, background: `${a.color}08` }}>
                <div style={{ fontSize: 7.5, color: '#ccc', fontWeight: 600 }}>{a.label}</div>
                <div style={{ fontSize: 6.5, color: a.color, letterSpacing: '0.1em' }}>{a.risk}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Base deck */}
      <div style={{ height: 36, background: '#0A0A0A', borderTop: '1px solid #1a1a1a', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['INFRA', 'FLOW', 'RISK'].map(cmd => (
            <div key={cmd} style={{ padding: '2px 7px', border: '1px solid #FFB800', fontSize: 7, color: '#FFB800', letterSpacing: '0.12em' }}>{cmd}</div>
          ))}
        </div>
        <div style={{ flex: 1, background: '#111', border: '1px solid #222', borderRadius: 2, display: 'flex', alignItems: 'center', padding: '2px 8px', gap: 6 }}>
          <span style={{ fontSize: 7, color: '#FFB800' }}>SYNE&gt;</span>
          <span style={{ fontSize: 7, color: '#555' }}>TYPE COMMAND...</span>
        </div>
        <div style={{ fontSize: 7, color: '#00FF41', letterSpacing: '0.06em' }}>WTI $78.42 · BRENT $82.11 · NG $2.31</div>
      </div>
    </div>
  )
}

function DashboardScreen() {
  return (
    <div style={{ background: '#06111F', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: "'JetBrains Mono', monospace" }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #1E2A3D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 8, color: '#55657A', letterSpacing: '0.1em' }}>ASE / DASHBOARD</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#0B1728', border: '1px solid #1E2A3D', borderRadius: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#55657A' }} />
            <span style={{ fontSize: 7, color: '#55657A' }}>CLOSED</span>
          </div>
          <div style={{ padding: '3px 10px', background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.25)', borderRadius: 7, fontSize: 7, color: '#6BA3FF', fontWeight: 600 }}>+ Connect</div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
        <div style={{ gridColumn: '1/-1', background: '#0B1728', border: '1px solid #1E2A3D', borderRadius: 8, padding: '12px' }}>
          <div style={{ fontSize: 7, color: '#55657A', marginBottom: 4 }}>PORTFOLIO VALUE</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#F7FAFF', letterSpacing: '-0.04em', fontFamily: 'Inter, sans-serif' }}>$84,241.32</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
            {[['TODAY P&L', '+$2,441', '#16C784'], ['ALL-TIME', '+22.7%', '#16C784'], ['TOTAL P&L', '+$15,241', '#16C784']].map(([l, v, c]) => (
              <div key={String(l)}>
                <div style={{ fontSize: 6.5, color: '#55657A' }}>{l}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: String(c) }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        {[['CASH', '$12,800', '#F7FAFF'], ['INVESTED', '$71,441', '#F7FAFF'], ['AGENTS', '3', '#16C784'], ['RISK', 'LOW', '#16C784']].map(([l, v, c]) => (
          <div key={String(l)} style={{ background: '#0B1728', border: '1px solid #1E2A3D', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 7, color: '#55657A', marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: String(c) }}>{v}</div>
          </div>
        ))}
        <div style={{ gridColumn: '1/-1', background: '#0B1728', border: '1px solid #1E2A3D', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #1E2A3D', fontSize: 7, color: '#55657A', letterSpacing: '0.1em' }}>YOUR ALLOCATIONS</div>
          {[['BTC Alpha', 'BTC-USD', '+18.4%', true], ['ETH Mean', 'ETH-USD', '+12.1%', true], ['Composite', 'MULTI', '+22.7%', true]].map(([n, s, r, p]) => (
            <div key={String(n)} style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #1E2A3D', gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 7, color: '#6BA3FF', fontWeight: 700 }}>{String(n).slice(0,3).toUpperCase()}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: '#F7FAFF' }}>{n}</div>
                <div style={{ fontSize: 7, color: '#55657A' }}>{s}</div>
              </div>
              <MiniChart positive={Boolean(p)} h={20} w={40} />
              <div style={{ fontSize: 10, fontWeight: 700, color: '#16C784' }}>{r}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const SCREENS_DATA = [
  { id: 'dashboard', label: 'Overview', sublabel: 'Live portfolio tracking', Component: DashboardScreen },
  { id: 'exchange', label: 'Exchange', sublabel: 'Browse verified agents', Component: ExchangeScreen },
  { id: 'quant', label: 'Quant Lab', sublabel: 'Build & backtest strategies', Component: QuantLabScreen },
  { id: 'backtest', label: 'Backtest', sublabel: 'Validate before deploying', Component: BacktestScreen },
  { id: 'syne', label: 'Syne Terminal', sublabel: 'Energy market intelligence', Component: SyneScreen },
]

function ScreenCarousel() {
  const [active, setActive] = useState(0)
  const [progress, setProgress] = useState(0)
  const DURATION = 5000

  const advance = useCallback(() => {
    setActive(a => (a + 1) % SCREENS_DATA.length)
    setProgress(0)
  }, [])

  useEffect(() => {
    setProgress(0)
    const step = 50
    const inc = (step / DURATION) * 100
    const t = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { advance(); return 0 }
        return p + inc
      })
    }, step)
    return () => clearInterval(t)
  }, [active, advance])

  const ActiveComponent = SCREENS_DATA[active].Component

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 6 }}>
        {SCREENS_DATA.map((s, i) => (
          <button key={s.id} onClick={() => { setActive(i); setProgress(0) }} style={{ padding: '6px 14px', background: active === i ? 'rgba(79,140,255,0.12)' : 'transparent', border: `1px solid ${active === i ? 'rgba(79,140,255,0.3)' : 'rgba(30,42,61,0.6)'}`, borderRadius: 8, color: active === i ? '#6BA3FF' : 'rgba(127,140,163,0.7)', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.68rem', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6 }}>
            {active === i && (
              <div style={{ width: 14, height: 3, background: '#162438', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${progress}%`, background: '#4F8CFF', borderRadius: 2, transition: 'width 0.05s linear' }} />
              </div>
            )}
            {s.label}
          </button>
        ))}
      </div>

      {/* Screen preview */}
      <div style={{ maxWidth: 900, margin: '0 auto', borderRadius: 14, overflow: 'hidden', boxShadow: '0 60px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,140,255,0.08)', border: '1px solid rgba(30,42,61,0.9)' }}>
        {/* Window chrome */}
        <div style={{ background: '#030D19', padding: '8px 14px', borderBottom: '1px solid #1E2A3D', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#E45867' }} />
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#F5B942' }} />
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#16C784' }} />
          </div>
          <div style={{ flex: 1, background: '#0B1728', border: '1px solid #1E2A3D', borderRadius: 5, padding: '2px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#55657A" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: '#55657A' }}>localhost:3000/dashboard/{SCREENS_DATA[active].id === 'dashboard' ? '' : SCREENS_DATA[active].id}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(79,140,255,0.3)' }} />
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(79,140,255,0.2)' }} />
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(79,140,255,0.15)' }} />
          </div>
        </div>
        {/* App shell */}
        <div style={{ display: 'flex', height: 420 }}>
          {/* Sidebar */}
          <div style={{ width: 160, background: '#030D19', borderRight: '1px solid #1E2A3D', padding: '10px 0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '0 12px 10px', borderBottom: '1px solid #1E2A3D', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <img src="/transparent_logo.png" alt="ASE" style={{ height: 22, width: 'auto', objectFit: 'contain' }} />
            </div>
            <div style={{ padding: '4px 8px', marginTop: 4 }}>
              {[
                { section: 'MAIN', items: [{ label: 'Overview', active: active === 0 }] },
                { section: 'TRADING', items: [{ label: 'Exchange', active: active === 1 }] },
                { section: 'BUILD', items: [{ label: 'Syne Terminal', active: active === 4, badge: 'TERMINAL' }, { label: 'Studio', active: false }, { label: 'Quant Lab', active: active === 2 }, { label: 'Backtest', active: active === 3 }, { label: 'Agents', active: false }] },
              ].map(g => (
                <div key={g.section} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 6.5, color: '#55657A', letterSpacing: '0.12em', padding: '4px 6px 2px', fontFamily: "'JetBrains Mono', monospace" }}>{g.section}</div>
                  {g.items.map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: item.active ? 'rgba(79,140,255,0.12)' : 'transparent', border: `1px solid ${item.active ? 'rgba(79,140,255,0.18)' : 'transparent'}`, marginBottom: 1, justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 8.5, color: item.active ? '#F7FAFF' : '#55657A', fontWeight: item.active ? 600 : 400 }}>{item.label}</span>
                      {(item as any).badge && <span style={{ fontSize: 5.5, color: '#FFB800', background: 'rgba(255,184,0,0.12)', border: '1px solid rgba(255,184,0,0.25)', padding: '1px 4px', borderRadius: 3, letterSpacing: '0.06em' }}>{(item as any).badge}</span>}
                      {item.active && !(item as any).badge && <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#4F8CFF', flexShrink: 0 }} />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {/* Content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ActiveComponent />
          </div>
        </div>
        {/* Status bar */}
        <div style={{ background: '#030D19', borderTop: '1px solid #1E2A3D', padding: '4px 14px', display: 'flex', gap: 16 }}>
          {[['ENV', 'PRODUCTION', false], ['API', 'CONNECTED', true], ['ALPACA', 'ACTIVE', true]].map(([l, v, g]) => (
            <div key={String(l)} style={{ display: 'flex', gap: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: '#55657A' }}>{l}:</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: g ? '#16C784' : '#7F8CA3', fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: '#55657A' }}>ASE Platform · Not financial advice</span>
        </div>
      </div>
    </div>
  )
}

/* ── Revolving orbit graphic ── */
function OrbitGraphic() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60)
    return () => clearInterval(t)
  }, [])
  const orbitRadius = [70, 100, 130]
  const speeds = [0.8, 0.5, 0.3]
  const dots = [
    { orbit: 0, offset: 0, color: '#16C784', size: 5 },
    { orbit: 0, offset: 120, color: '#16C784', size: 3 },
    { orbit: 1, offset: 45, color: '#4F8CFF', size: 6 },
    { orbit: 1, offset: 200, color: '#4F8CFF', size: 4 },
    { orbit: 1, offset: 300, color: '#4F8CFF', size: 3 },
    { orbit: 2, offset: 90, color: '#E45867', size: 5 },
    { orbit: 2, offset: 210, color: '#FFB800', size: 4 },
  ]
  return (
    <div style={{ position: 'absolute', right: '-60px', top: '50%', transform: 'translateY(-50%)', width: 300, height: 300, pointerEvents: 'none', opacity: 0.5 }}>
      <svg width={300} height={300} viewBox="-150 -150 300 300">
        {orbitRadius.map((r, i) => (
          <ellipse key={i} cx={0} cy={0} rx={r} ry={r * 0.4} fill="none" stroke="rgba(79,140,255,0.12)" strokeWidth={0.5} />
        ))}
        {dots.map((d, i) => {
          const angle = ((d.offset + tick * speeds[d.orbit]) * Math.PI) / 180
          const r = orbitRadius[d.orbit]
          const x = r * Math.cos(angle)
          const y = r * 0.4 * Math.sin(angle)
          return <circle key={i} cx={x} cy={y} r={d.size / 2} fill={d.color} opacity={0.9} />
        })}
        <circle cx={0} cy={0} r={16} fill="none" stroke="rgba(79,140,255,0.2)" strokeWidth={1} />
        <circle cx={0} cy={0} r={8} fill="rgba(79,140,255,0.15)" />
        <circle cx={0} cy={0} r={3} fill="#4F8CFF" />
      </svg>
    </div>
  )
}

const STATS = [
  { value: '24', label: 'Live Agents', sub: 'verified & active' },
  { value: '$2.4M', label: 'Total AUM', sub: 'managed on-chain' },
  { value: '1.84', label: 'Avg Sharpe', sub: 'risk-adjusted return' },
  { value: '62%', label: 'Win Rate', sub: 'across all strategies' },
]

const INVESTOR_FEATURES = [
  { icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', title: 'Verified track records', desc: 'Every agent\'s live P&L, Sharpe ratio, and drawdown is audited. No marketing numbers.' },
  { icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', title: 'Full custody always', desc: 'Funds never leave your wallet. Agents execute via permissions you can revoke anytime.' },
  { icon: 'M13 10V3L4 14h7v7l9-11h-7z', title: 'One-click allocation', desc: 'Browse, review backtests, and subscribe to strategies. Capital deployed in seconds.' },
  { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Real-time monitoring', desc: 'Track every trade, NAV change, and signal as it happens. Full transparency.' },
]

const BUILDER_FEATURES = [
  { icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', title: 'Quant Lab IDE', desc: 'Build strategies in TypeScript with AI-assisted signal generation and 20+ free data APIs.' },
  { icon: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', title: 'Institutional backtesting', desc: '9-layer quant pipeline with Monte Carlo, walk-forward validation, and scorecard grading.' },
  { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0z', title: 'Built-in distribution', desc: 'List on the marketplace and earn from subscribers. Platform handles execution, fees, and monitoring.' },
  { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', title: 'Production risk controls', desc: 'Set max allocation, position size, and stop-loss limits that protect all your subscribers.' },
]

const TICKER_ITEMS = [
  { l: 'BTC/USD', v: '+18.4%', p: true }, { l: 'ETH/USD', v: '+12.1%', p: true },
  { l: 'SOL/USD', v: '+31.8%', p: true }, { l: 'SPY', v: '+9.2%', p: true },
  { l: 'QQQ', v: '+14.7%', p: true }, { l: 'WTI CRUDE', v: '+2.3%', p: true },
  { l: 'Live Agents', v: '24', p: true }, { l: 'Avg Sharpe', v: '1.84', p: true },
  { l: 'Win Rate', v: '62%', p: true }, { l: 'Total AUM', v: '$2.4M', p: true },
]

export default function LandingPage() {
  const hero = useInView(0)
  const carouselSec = useInView(0)
  const stats = useInView(0.05)
  const investors = useInView(0.05)
  const builders = useInView(0.05)
  const cta = useInView(0.05)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', overflowX: 'hidden' }}>
      <PublicNav />

      {/* Background */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100vw', height: '70vh', background: 'radial-gradient(ellipse 60% 50% at 50% -5%, rgba(79,140,255,0.13), transparent 70%)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(79,140,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(79,140,255,0.035) 1px, transparent 1px)', backgroundSize: '64px 64px', maskImage: 'radial-gradient(ellipse 80% 65% at 50% 20%, black, transparent)' }} />
      </div>

      {/* ── HERO ── */}
      <section ref={hero.ref} style={{ padding: '9rem 1.5rem 4rem', maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1, opacity: hero.visible ? 1 : 0, transform: hero.visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.8s ease, transform 0.8s ease' }}>
        <OrbitGraphic />
        <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 100, background: 'rgba(22,199,132,0.07)', border: '1px solid rgba(22,199,132,0.2)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--mint)', marginBottom: '2rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--mint)', display: 'inline-block', animation: 'breathe 2.5s ease-in-out infinite' }} />
            24 AGENTS LIVE · REAL EXECUTION · VERIFIED RETURNS
          </div>

          <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 900, fontSize: 'clamp(3rem, 7vw, 5.5rem)', lineHeight: 0.93, letterSpacing: '-0.055em', margin: '0 0 1.5rem', color: 'var(--white)' }}>
            The platform for{' '}
            <span style={{ background: 'linear-gradient(135deg, #4F8CFF 0%, #6BA3FF 45%, #16C784 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              autonomous
            </span>
            <br />
            trading agents.
          </h1>

          <p style={{ fontSize: 'clamp(1rem, 2vw, 1.15rem)', color: 'var(--muted)', lineHeight: 1.8, maxWidth: 540, margin: '0 auto 2.5rem' }}>
            Invest in AI strategies with verified live track records. Build and publish your own quant agents. Everything in one terminal.
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.85rem 1.8rem', borderRadius: 10, background: 'linear-gradient(135deg, #3566E9, #4F8CFF)', color: '#fff', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none', boxShadow: '0 4px 24px rgba(79,140,255,0.35)', transition: 'all 0.18s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(79,140,255,0.45)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(79,140,255,0.35)' }}>
              Start Investing Free
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
            <Link href="/dashboard/build" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.85rem 1.6rem', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--muted)', fontWeight: 600, fontSize: '0.9rem', textDecoration: 'none', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.09)'; e.currentTarget.style.borderColor = 'rgba(79,140,255,0.28)'; e.currentTarget.style.color = 'var(--white)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'var(--muted)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              Open Quant Lab
            </Link>
          </div>

          {/* Trust indicators */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginTop: '2.5rem', flexWrap: 'wrap' }}>
            {[{ icon: '🐙', label: 'Kraken' }, { icon: '🔐', label: 'API Keys' }, { icon: '📊', label: 'Live Trading' }, { icon: '🔒', label: 'Non-Custodial' }].map(w => (
              <div key={w.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--faint)' }}>
                {w.icon} <span>{w.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SCREEN CAROUSEL ── */}
      <section ref={carouselSec.ref} style={{ padding: '0 1.5rem 6rem', position: 'relative', zIndex: 1, opacity: carouselSec.visible ? 1 : 0, transition: 'opacity 0.8s ease 0.2s' }}>
        <ScreenCarousel />
      </section>

      {/* ── TICKER ── */}
      <div style={{ borderTop: '1px solid rgba(30,42,61,0.5)', borderBottom: '1px solid rgba(30,42,61,0.5)', background: 'rgba(6,17,31,0.6)', overflow: 'hidden', height: 34, display: 'flex', alignItems: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', whiteSpace: 'nowrap', animation: 'drift 28s linear infinite', willChange: 'transform' }}>
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 20px', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', borderRight: '1px solid rgba(30,42,61,0.5)' }}>
              <span style={{ color: 'var(--faint)' }}>{item.l}</span>
              <span style={{ color: item.p ? '#16C784' : '#E45867', fontWeight: 700 }}>{item.v}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── STATS ── */}
      <section ref={stats.ref} style={{ padding: '5rem 1.5rem', maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1, opacity: stats.visible ? 1 : 0, transform: stats.visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.6s ease, transform 0.6s ease' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }} className="stats-grid">
          {STATS.map(s => (
            <div key={s.label} style={{ background: 'var(--bg2)', padding: '2rem 1.5rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', color: 'var(--white)', letterSpacing: '-0.04em', marginBottom: '0.25rem' }}>{s.value}</div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text)', marginBottom: '0.15rem' }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)' }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOR INVESTORS ── */}
      <section ref={investors.ref} style={{ padding: '0 1.5rem 6rem', maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1, opacity: investors.visible ? 1 : 0, transform: investors.visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }} className="split-grid">
          {/* Text */}
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 100, background: 'rgba(22,199,132,0.07)', border: '1px solid rgba(22,199,132,0.2)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--mint)', marginBottom: '1.25rem' }}>
              FOR INVESTORS
            </div>
            <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', letterSpacing: '-0.045em', color: 'var(--white)', margin: '0 0 1rem', lineHeight: 1.05 }}>
              Allocate to proven<br />AI strategies.
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.8, marginBottom: '1.75rem' }}>
              Every agent on ASE has a live track record you can verify. Browse real P&amp;L, subscribe in one click, and stay in full custody of your funds.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              {INVESTOR_FEATURES.map(f => (
                <div key={f.title} style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(22,199,132,0.08)', border: '1px solid rgba(22,199,132,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--mint)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon}/></svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--white)', marginBottom: '0.2rem' }}>{f.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/dashboard/marketplace" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.75rem 1.5rem', borderRadius: 10, background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.25)', color: 'var(--mint)', fontWeight: 600, fontSize: '0.88rem', textDecoration: 'none', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(22,199,132,0.18)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(22,199,132,0.1)' }}>
              Browse Exchange →
            </Link>
          </div>
          {/* Mockup */}
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(30,42,61,0.9)', boxShadow: '0 40px 80px rgba(0,0,0,0.4)', height: 380 }}>
            <DashboardScreen />
          </div>
        </div>
      </section>

      {/* ── FOR BUILDERS ── */}
      <section ref={builders.ref} style={{ padding: '0 1.5rem 6rem', maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1, opacity: builders.visible ? 1 : 0, transform: builders.visible ? 'none' : 'translateY(24px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }} className="split-grid">
          {/* Mockup */}
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(30,42,61,0.9)', boxShadow: '0 40px 80px rgba(0,0,0,0.4)', height: 380 }}>
            <QuantLabScreen />
          </div>
          {/* Text */}
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 100, background: 'rgba(79,140,255,0.07)', border: '1px solid rgba(79,140,255,0.2)', fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.1em', color: 'var(--blue2)', marginBottom: '1.25rem' }}>
              FOR BUILDERS
            </div>
            <h2 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', letterSpacing: '-0.045em', color: 'var(--white)', margin: '0 0 1rem', lineHeight: 1.05 }}>
              Build, backtest,<br />and publish agents.
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.95rem', lineHeight: 1.8, marginBottom: '1.75rem' }}>
              The Quant Lab gives you an institutional-grade IDE with backtesting, AI-assisted signal generation, and one-click listing on the marketplace.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
              {BUILDER_FEATURES.map(f => (
                <div key={f.title} style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(79,140,255,0.08)', border: '1px solid rgba(79,140,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--blue2)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon}/></svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--white)', marginBottom: '0.2rem' }}>{f.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/dashboard/build" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.75rem 1.5rem', borderRadius: 10, background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.25)', color: 'var(--blue2)', fontWeight: 600, fontSize: '0.88rem', textDecoration: 'none', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.18)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.1)' }}>
                Open Quant Lab →
              </Link>
              <Link href="/builders" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.75rem 1.5rem', borderRadius: 10, background: 'transparent', border: '1px solid var(--border2)', color: 'var(--muted)', fontWeight: 600, fontSize: '0.88rem', textDecoration: 'none', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--white)'; e.currentTarget.style.borderColor = 'var(--border3)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border2)' }}>
                Builder Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section ref={cta.ref} style={{ padding: '0 1.5rem 7rem', maxWidth: 1200, margin: '0 auto', position: 'relative', zIndex: 1, opacity: cta.visible ? 1 : 0, transform: cta.visible ? 'none' : 'translateY(20px)', transition: 'opacity 0.7s ease, transform 0.7s ease' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }} className="cta-grid">
          {/* Investor CTA */}
          <div style={{ background: 'linear-gradient(135deg, rgba(11,23,40,0.98), rgba(16,26,45,0.95))', padding: '3rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, right: 0, width: '60%', height: '100%', background: 'radial-gradient(ellipse at 100% 50%, rgba(22,199,132,0.07), transparent)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(22,199,132,0.1)', border: '1px solid rgba(22,199,132,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', color: 'var(--mint)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--mint)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>FOR INVESTORS</div>
              <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.04em', color: 'var(--white)', margin: '0 0 0.75rem', lineHeight: 1.1 }}>
                Your edge is one wallet connect away.
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                Join investors allocating to verified AI strategies. Full custody. Transparent P&amp;L. No lock-ins.
              </p>
              <Link href="/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.75rem 1.6rem', borderRadius: 10, background: 'linear-gradient(135deg, #3566E9, #4F8CFF)', color: '#fff', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none', boxShadow: '0 4px 20px rgba(79,140,255,0.3)' }}>
                Create Free Account →
              </Link>
            </div>
          </div>
          {/* Builder CTA */}
          <div style={{ background: 'linear-gradient(135deg, rgba(11,23,40,0.98), rgba(16,26,45,0.95))', padding: '3rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '60%', height: '100%', background: 'radial-gradient(ellipse at 0% 50%, rgba(79,140,255,0.07), transparent)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem', color: 'var(--blue2)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--blue2)', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>FOR BUILDERS</div>
              <h3 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.04em', color: 'var(--white)', margin: '0 0 0.75rem', lineHeight: 1.1 }}>
                Build once. Earn from every subscriber.
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                List your strategy, set your fee, and let the platform handle execution, risk controls, and subscriber management.
              </p>
              <Link href="/dashboard/build" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0.75rem 1.6rem', borderRadius: 10, background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.3)', color: 'var(--blue2)', fontWeight: 700, fontSize: '0.88rem', textDecoration: 'none', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.1)' }}>
                Open Quant Lab →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid var(--border)', background: 'rgba(3,13,25,0.9)', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '3rem 1.5rem 2rem', display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: '2.5rem' }} className="footer-grid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.85rem' }}>
              <img src="/transparent_logo.png" alt="ASE" style={{ height: 30, width: 'auto', objectFit: 'contain' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.75rem', color: 'var(--white)', letterSpacing: '0.06em' }}>ASE</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.75, maxWidth: 210, marginBottom: '1rem' }}>
              The marketplace for autonomous AI trading agents. Built for quants, open to everyone.
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              {['X', 'Discord', 'GitHub'].map(s => (
                <a key={s} href="#" style={{ padding: '0.28rem 0.6rem', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--faint)', textDecoration: 'none', transition: 'all 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--white)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--faint)'; e.currentTarget.style.borderColor = 'var(--border)' }}>{s}</a>
              ))}
            </div>
          </div>
          {[
            { title: 'PRODUCT', links: [['Exchange', '/dashboard/marketplace'], ['Quant Lab', '/dashboard/build'], ['Backtest', '/dashboard/backtest'], ['Syne Terminal', '/dashboard/geo'], ['Agents', '/agents']] },
            { title: 'COMPANY', links: [['About', '#'], ['Investors', '/investors'], ['Builders', '/builders'], ['Blog', '#'], ['Careers', '#']] },
            { title: 'LEGAL', links: [['Terms', '/legal/terms'], ['Privacy', '/legal/privacy'], ['Securities', '/legal/securities'], ['Risk Disclosure', '/legal/securities']] },
          ].map(col => (
            <div key={col.title}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.12em', marginBottom: '0.9rem' }}>{col.title}</div>
              {col.links.map(([label, href]) => (
                <Link key={String(label)} href={String(href)} style={{ display: 'block', fontSize: '0.8rem', color: 'var(--muted)', textDecoration: 'none', marginBottom: '0.45rem', transition: 'color 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--white)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>{label}</Link>
              ))}
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.25rem 1.5rem', borderTop: '1px solid rgba(30,42,61,0.5)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--faint)', lineHeight: 1.7, marginBottom: '0.85rem' }}>
            <strong style={{ color: 'var(--muted)' }}>DISCLOSURE:</strong> ASE is not a registered investment advisor. Past performance is not indicative of future results. All trading involves risk. Not financial advice.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)' }}>© 2026 ASE · Autonomous Strategy Exchange</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'rgba(228,88,103,0.65)', fontWeight: 700, letterSpacing: '0.06em' }}>⚠ NOT FINANCIAL ADVICE</div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes drift { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes breathe { 0%,100% { opacity:.4; box-shadow:0 0 4px currentColor } 50% { opacity:1; box-shadow:0 0 12px currentColor } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:.3 } }
        @media(max-width:900px) {
          .split-grid { grid-template-columns:1fr!important }
          .stats-grid { grid-template-columns:repeat(2,1fr)!important }
          .cta-grid { grid-template-columns:1fr!important }
          .footer-grid { grid-template-columns:repeat(2,1fr)!important }
        }
        @media(max-width:540px) {
          .stats-grid { grid-template-columns:1fr!important }
          .footer-grid { grid-template-columns:1fr!important }
        }
      `}</style>
    </div>
  )
}
