'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { DATA_SOURCES, INDICATORS, STRATEGY_DOCS, RISK_METRICS, BACKTEST_GUIDE } from '@/lib/quant-docs'

const C = {
  bg:     '#07111F',
  bg2:    '#0B1728',
  bg3:    '#101A2D',
  bg4:    '#141F33',
  border: '#1E2D45',
  blue:   '#5B8CFF',
  mint:   '#22F0B5',
  red:    '#FF5468',
  orange: '#FFB648',
  purple: '#C084FC',
  text:   '#C9D1E0',
  muted:  '#8E9AB0',
  faint:  '#4A5A72',
  white:  '#F5F7FB',
}

const TYPE_COLORS: Record<string, string> = {
  'momentum':      C.blue,
  'mean-reversion': C.mint,
  'breakout':      C.orange,
  'multi-factor':  C.purple,
  'arbitrage':     C.red,
}

const CATEGORY_COLORS: Record<string, string> = {
  'trend':      C.blue,
  'momentum':   C.orange,
  'volatility': C.red,
  'volume':     C.purple,
  'oscillator': C.mint,
}

const METRIC_COLORS: Record<string, string> = {
  'return': C.mint,
  'risk':   C.red,
  'ratio':  C.blue,
  'trade':  C.orange,
}

const SECTIONS = [
  { id: 'intro',       label: 'Introduction',         icon: '⊡' },
  { id: 'data',        label: 'Data Sources',          icon: '◈' },
  { id: 'indicators',  label: 'Technical Indicators',  icon: '∿' },
  { id: 'strategies',  label: 'Strategy Patterns',     icon: '◎' },
  { id: 'metrics',     label: 'Risk & Metrics',        icon: '⊗' },
  { id: 'guide',       label: 'Backtest Guide',        icon: '⊞' },
]

function CopyButton({ code, id }: { code: string; id: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      style={{
        padding: '0.25rem 0.65rem',
        borderRadius: 5,
        border: `1px solid ${C.border}`,
        background: copied ? 'rgba(34,240,181,0.12)' : C.bg3,
        color: copied ? C.mint : C.muted,
        fontSize: '0.7rem',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        transition: 'all 0.15s',
        flexShrink: 0,
      }}
    >
      {copied ? '✓ copied' : 'copy'}
    </button>
  )
}

function CodeBlock({ code, id }: { code: string; id: string }) {
  return (
    <div style={{
      position: 'relative',
      background: C.bg,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      overflow: 'hidden',
      marginTop: '0.5rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.5rem 0.75rem',
        borderBottom: `1px solid ${C.border}`,
        background: C.bg2,
      }}>
        <span style={{ fontSize: '0.7rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>python</span>
        <CopyButton code={code} id={id} />
      </div>
      <pre style={{
        margin: 0,
        padding: '0.85rem 1rem',
        overflowX: 'auto',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.78rem',
        lineHeight: 1.65,
        color: C.text,
        whiteSpace: 'pre',
      }}>
        <SyntaxHighlight code={code} />
      </pre>
    </div>
  )
}

function SyntaxHighlight({ code }: { code: string }) {
  const lines = code.split('\n')
  return (
    <>
      {lines.map((line, i) => {
        const colored = line
          .replace(/(#.*)$/, `<span style="color:#546E7A">$1</span>`)
          .replace(/\b(import|from|as|class|def|return|if|elif|else|for|while|and|or|not|in|is|True|False|None|pass|continue|break|raise|with|lambda|async|await|try|except|finally)\b/g,
            `<span style="color:#C792EA">$1</span>`)
          .replace(/(".*?"|'.*?'|"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\')/g,
            `<span style="color:#C3E88D">$1</span>`)
          .replace(/\b(\d+\.?\d*)\b/g, `<span style="color:#F78C6C">$1</span>`)
          .replace(/\b(np|pd|df|self)\b/g, `<span style="color:#D77FFF">$1</span>`)
          .replace(/(\w+)(?=\s*\()/g, `<span style="color:#82AAFF">$1</span>`)

        return (
          <div key={i} style={{ display: 'flex', minHeight: '1.65em' }}>
            <span style={{
              minWidth: '2.2em', textAlign: 'right', paddingRight: '1em',
              color: C.faint, fontSize: '0.75em', userSelect: 'none', opacity: 0.6,
            }}>{i + 1}</span>
            <code dangerouslySetInnerHTML={{ __html: colored || '&nbsp;' }} />
          </div>
        )
      })}
    </>
  )
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: 4,
      border: `1px solid ${color}40`,
      background: `${color}15`,
      color,
      fontSize: '0.65rem',
      fontFamily: 'var(--font-mono)',
      fontWeight: 600,
      letterSpacing: '0.05em',
    }}>
      {text}
    </span>
  )
}

function Tag({ text }: { text: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.1rem 0.4rem',
      borderRadius: 3,
      background: C.bg3,
      color: C.muted,
      fontSize: '0.7rem',
      fontFamily: 'var(--font-mono)',
      border: `1px solid ${C.border}`,
    }}>
      {text}
    </span>
  )
}

export default function QuantDocsPage() {
  const [activeSection, setActiveSection] = useState('intro')
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null)
  const [expandedIndicator, setExpandedIndicator] = useState<string | null>(null)
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null)
  const [expandedSource, setExpandedSource] = useState<string | null>(null)
  const [expandedPitfall, setExpandedPitfall] = useState<string | null>(null)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id)
        }
      }
    }, { threshold: 0.2, rootMargin: '-80px 0px -60% 0px' })

    SECTIONS.forEach(s => {
      const el = sectionRefs.current[s.id]
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'var(--font-sans, system-ui)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        borderRight: `1px solid ${C.border}`,
        background: C.bg2,
        padding: '1.5rem 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        <div style={{ padding: '0 1rem 1.25rem', borderBottom: `1px solid ${C.border}` }}>
          <Link href="/dashboard/build" style={{ color: C.blue, textDecoration: 'none', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            ← Build
          </Link>
          <div style={{ marginTop: '0.75rem', fontSize: '0.95rem', fontWeight: 700, color: C.white }}>Quant Library</div>
          <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: '0.15rem' }}>Strategy reference & data docs</div>
        </div>

        <nav style={{ padding: '0.75rem 0', flex: 1 }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                width: '100%',
                padding: '0.6rem 1rem',
                background: activeSection === s.id ? `${C.blue}18` : 'transparent',
                borderLeft: `2px solid ${activeSection === s.id ? C.blue : 'transparent'}`,
                border: 'none',
                color: activeSection === s.id ? C.white : C.muted,
                fontSize: '0.82rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: '1rem', borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: '0.65rem', color: C.faint, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Edit this file</div>
          <code style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'var(--font-mono)', background: C.bg3, padding: '0.3rem 0.5rem', borderRadius: 4, display: 'block', wordBreak: 'break-all' }}>
            lib/quant-docs.ts
          </code>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '2.5rem 2rem', maxWidth: 900 }}>

        {/* ── Introduction ── */}
        <section
          id="intro"
          ref={el => { sectionRefs.current['intro'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.4rem' }}>⊡</span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: C.white, margin: 0 }}>Quant Library</h1>
          </div>
          <p style={{ fontSize: '0.9rem', color: C.muted, lineHeight: 1.7, marginBottom: '1.5rem', maxWidth: 640 }}>
            Complete reference for building algorithmic trading strategies on ASE. All data sources are free, no API keys required. Edit <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em', color: C.blue }}>lib/quant-docs.ts</code> to add new sources, strategies, or indicators.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            {[
              { label: 'Data Sources', count: DATA_SOURCES.length, color: C.mint, icon: '◈' },
              { label: 'Indicators', count: INDICATORS.length, color: C.blue, icon: '∿' },
              { label: 'Strategies', count: STRATEGY_DOCS.length, color: C.orange, icon: '◎' },
              { label: 'Risk Metrics', count: RISK_METRICS.length, color: C.purple, icon: '⊗' },
              { label: 'Backtest Pitfalls', count: BACKTEST_GUIDE.pitfalls.length, color: C.red, icon: '⚠' },
              { label: 'No Keys Needed', count: DATA_SOURCES.filter(d => d.noKey).length, color: C.mint, icon: '✓' },
            ].map(item => (
              <div key={item.label} style={{
                padding: '1rem',
                background: C.bg2,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}>
                <div style={{ fontSize: '1.3rem' }}>{item.icon}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: item.color, fontFamily: 'var(--font-mono)' }}>{item.count}</div>
                <div style={{ fontSize: '0.75rem', color: C.muted }}>{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Data Sources ── */}
        <section
          id="data"
          ref={el => { sectionRefs.current['data'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.2rem' }}>◈</span>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: 0 }}>Data Sources</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            All sources are free and require zero API keys. The backtest engine tries them in priority order with automatic fallback.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {DATA_SOURCES.map((src, idx) => (
              <div key={src.id} style={{
                border: `1px solid ${expandedSource === src.id ? C.border : C.border}`,
                borderRadius: 12,
                background: C.bg2,
                overflow: 'hidden',
              }}>
                <button
                  onClick={() => setExpandedSource(expandedSource === src.id ? null : src.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    width: '100%',
                    padding: '1rem 1.25rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: C.text,
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: `${src.badgeColor}20`,
                    border: `1px solid ${src.badgeColor}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700, color: src.badgeColor,
                    flexShrink: 0, fontFamily: 'var(--font-mono)',
                  }}>
                    {idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem', color: C.white }}>{src.name}</span>
                      <Badge text={src.badge} color={src.badgeColor} />
                      {src.noKey && <Badge text="NO KEY" color={C.mint} />}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: C.muted, lineHeight: 1.5 }}>{src.description.slice(0, 120)}...</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" style={{ flexShrink: 0, transform: expandedSource === src.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginTop: 4 }}>
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>

                {expandedSource === src.id && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: '1.25rem' }}>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.83rem', color: C.muted, lineHeight: 1.65 }}>{src.description}</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                      {[
                        { label: 'Endpoint', value: src.endpoint },
                        { label: 'Rate Limit', value: src.rateLimit },
                        { label: 'History Depth', value: src.historyDepth },
                        { label: 'Asset Classes', value: src.assetClasses.join(', ') },
                      ].map(item => (
                        <div key={item.label} style={{ padding: '0.6rem 0.75rem', background: C.bg3, borderRadius: 6, border: `1px solid ${C.border}` }}>
                          <div style={{ fontSize: '0.65rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>{item.label}</div>
                          <div style={{ fontSize: '0.78rem', color: C.text, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Available Symbols</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {src.symbols.map(s => <Tag key={s} text={s} />)}
                      </div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Intervals</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {src.intervals.map(i => <Tag key={i} text={i} />)}
                      </div>
                    </div>

                    <div style={{ marginBottom: '0.25rem' }}>
                      <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>Fetch Example</div>
                      <CodeBlock code={src.fetchExample} id={`src-${src.id}`} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Technical Indicators ── */}
        <section
          id="indicators"
          ref={el => { sectionRefs.current['indicators'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.2rem' }}>∿</span>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: 0 }}>Technical Indicators</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            All implemented with pandas/numpy. Each code snippet adds a column to the strategy DataFrame and is copy-paste ready.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {INDICATORS.map(ind => (
              <div key={ind.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedIndicator(expandedIndicator === ind.id ? null : ind.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    width: '100%', padding: '0.85rem 1.25rem',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: C.text,
                  }}
                >
                  <div style={{
                    padding: '0.2rem 0.5rem', borderRadius: 4,
                    background: `${CATEGORY_COLORS[ind.category]}18`,
                    color: CATEGORY_COLORS[ind.category],
                    fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 700,
                    flexShrink: 0, minWidth: 52, textAlign: 'center',
                  }}>
                    {ind.abbrev}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500, fontSize: '0.88rem', color: C.white }}>{ind.name}</span>
                    <span style={{ marginLeft: '0.6rem', fontSize: '0.75rem', color: CATEGORY_COLORS[ind.category], opacity: 0.8 }}>{ind.category}</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" style={{ flexShrink: 0, transform: expandedIndicator === ind.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>

                {expandedIndicator === ind.id && (
                  <div style={{ borderTop: `1px solid ${C.border}`, padding: '1.25rem' }}>
                    <p style={{ margin: '0 0 0.75rem', fontSize: '0.83rem', color: C.muted, lineHeight: 1.65 }}>{ind.description}</p>

                    <div style={{ padding: '0.65rem 0.85rem', background: C.bg3, borderRadius: 6, marginBottom: '0.75rem', border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: '0.65rem', color: C.faint, marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Formula</div>
                      <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: C.mint, whiteSpace: 'pre-wrap' }}>{ind.formula}</pre>
                    </div>

                    {ind.parameters.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Parameters</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          {ind.parameters.map(p => (
                            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8rem' }}>
                              <code style={{ fontFamily: 'var(--font-mono)', color: C.blue, fontSize: '0.8em', background: `${C.blue}12`, padding: '0.1rem 0.35rem', borderRadius: 3 }}>{p.name}</code>
                              <span style={{ color: C.orange, fontFamily: 'var(--font-mono)', fontSize: '0.78em' }}>= {p.default}</span>
                              <span style={{ color: C.muted }}>{p.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Trading Signals</div>
                      <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {ind.signals.map((s, i) => (
                          <li key={i} style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.5 }}>{s}</li>
                        ))}
                      </ul>
                    </div>

                    <CodeBlock code={ind.code} id={`ind-${ind.id}`} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Strategy Patterns ── */}
        <section
          id="strategies"
          ref={el => { sectionRefs.current['strategies'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.2rem' }}>◎</span>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: 0 }}>Strategy Patterns</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            10 production-ready strategy classes with complete Python code. Each has a <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>generate_signals(df)</code> method returning a DataFrame with a <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>signal</code> column (+1 = long, −1 = short, 0 = flat).
          </p>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {['All', 'momentum', 'mean-reversion', 'breakout', 'multi-factor', 'arbitrage'].map(type => (
              <span key={type} style={{
                padding: '0.25rem 0.65rem',
                borderRadius: 20,
                fontSize: '0.73rem',
                background: type === 'All' ? `${C.blue}20` : `${TYPE_COLORS[type] ?? C.faint}15`,
                color: type === 'All' ? C.blue : (TYPE_COLORS[type] ?? C.faint),
                border: `1px solid ${type === 'All' ? `${C.blue}40` : `${TYPE_COLORS[type] ?? C.faint}30`}`,
                fontFamily: 'var(--font-mono)',
              }}>
                {type}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {STRATEGY_DOCS.map(strat => {
              const color = TYPE_COLORS[strat.type] ?? C.faint
              return (
                <div key={strat.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedStrategy(expandedStrategy === strat.id ? null : strat.id)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
                      width: '100%', padding: '1rem 1.25rem',
                      background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: C.text,
                    }}
                  >
                    <div style={{
                      width: 4, height: '100%', minHeight: 24, borderRadius: 4,
                      background: color, flexShrink: 0, marginTop: 2,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.92rem', color: C.white }}>{strat.name}</span>
                        <Badge text={strat.type} color={color} />
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: C.muted, lineHeight: 1.5 }}>{strat.description.slice(0, 110)}...</p>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" style={{ flexShrink: 0, transform: expandedStrategy === strat.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginTop: 2 }}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>

                  {expandedStrategy === strat.id && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: '1.25rem' }}>
                      <p style={{ margin: '0 0 1rem', fontSize: '0.83rem', color: C.muted, lineHeight: 1.65 }}>{strat.description}</p>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ padding: '0.65rem 0.85rem', background: `${C.mint}10`, borderRadius: 6, border: `1px solid ${C.mint}25` }}>
                          <div style={{ fontSize: '0.65rem', color: C.mint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>✓ Best For</div>
                          <div style={{ fontSize: '0.78rem', color: C.text, lineHeight: 1.5 }}>{strat.bestFor}</div>
                        </div>
                        <div style={{ padding: '0.65rem 0.85rem', background: `${C.red}10`, borderRadius: 6, border: `1px solid ${C.red}25` }}>
                          <div style={{ fontSize: '0.65rem', color: C.red, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>✗ Avoid</div>
                          <div style={{ fontSize: '0.78rem', color: C.text, lineHeight: 1.5 }}>{strat.avoid}</div>
                        </div>
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Parameters</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {strat.params.map(p => (
                            <div key={p.name} style={{
                              display: 'grid', gridTemplateColumns: '140px 50px 60px 1fr',
                              gap: '0.5rem', alignItems: 'center',
                              padding: '0.4rem 0.6rem', background: C.bg3,
                              borderRadius: 5, border: `1px solid ${C.border}`,
                              fontSize: '0.78rem',
                            }}>
                              <code style={{ fontFamily: 'var(--font-mono)', color: C.blue, fontSize: '0.85em' }}>{p.name}</code>
                              <span style={{ color: C.orange, fontFamily: 'var(--font-mono)' }}>{p.default}</span>
                              <span style={{ color: C.faint, fontFamily: 'var(--font-mono)', fontSize: '0.75em' }}>[{p.min}–{p.max}]</span>
                              <span style={{ color: C.muted }}>{p.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <CodeBlock code={strat.code} id={`strat-${strat.id}`} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Risk & Metrics ── */}
        <section
          id="metrics"
          ref={el => { sectionRefs.current['metrics'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.2rem' }}>⊗</span>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: 0 }}>Risk & Metrics</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            All metrics computed by the ASE backtest engine. Each metric&apos;s interpretation range and quality thresholds are listed.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {RISK_METRICS.map(metric => {
              const color = METRIC_COLORS[metric.category]
              return (
                <div key={metric.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedMetric(expandedMetric === metric.id ? null : metric.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      width: '100%', padding: '0.85rem 1.25rem',
                      background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{
                      padding: '0.2rem 0.55rem', borderRadius: 4,
                      background: `${color}18`,
                      color, fontSize: '0.68rem', fontFamily: 'var(--font-mono)',
                      fontWeight: 700, flexShrink: 0, minWidth: 64, textAlign: 'center',
                    }}>
                      {metric.abbrev}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 500, fontSize: '0.88rem', color: C.white }}>{metric.name}</span>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.73rem', color, opacity: 0.8 }}>{metric.category}</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'var(--font-mono)', maxWidth: 220, textAlign: 'right', lineHeight: 1.3, flexShrink: 0 }}>
                      {metric.goodRange}
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" style={{ flexShrink: 0, transform: expandedMetric === metric.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>

                  {expandedMetric === metric.id && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: '1.25rem' }}>
                      <p style={{ margin: '0 0 0.75rem', fontSize: '0.83rem', color: C.muted, lineHeight: 1.65 }}>{metric.description}</p>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.85rem' }}>
                        <div style={{ padding: '0.6rem 0.75rem', background: C.bg3, borderRadius: 6, border: `1px solid ${C.border}` }}>
                          <div style={{ fontSize: '0.63rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>Formula</div>
                          <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: C.mint, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{metric.formula}</pre>
                        </div>
                        <div style={{ padding: '0.6rem 0.75rem', background: C.bg3, borderRadius: 6, border: `1px solid ${C.border}` }}>
                          <div style={{ fontSize: '0.63rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>Interpretation</div>
                          <div style={{ fontSize: '0.75rem', color: C.text, lineHeight: 1.5 }}>{metric.interpretation}</div>
                        </div>
                      </div>

                      <CodeBlock code={metric.code} id={`metric-${metric.id}`} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Backtest Guide ── */}
        <section
          id="guide"
          ref={el => { sectionRefs.current['guide'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '1.2rem' }}>⊞</span>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: 0 }}>Backtest Guide</h2>
          </div>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Common mistakes that inflate backtest results and how to avoid them. Valid strategies survive all of these tests.
          </p>

          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: C.white, marginBottom: '0.85rem' }}>Common Pitfalls</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '2rem' }}>
            {BACKTEST_GUIDE.pitfalls.map(p => {
              const sevColor = p.severity === 'CRITICAL' ? C.red : p.severity === 'HIGH' ? C.orange : C.blue
              return (
                <div key={p.name} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedPitfall(expandedPitfall === p.name ? null : p.name)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      width: '100%', padding: '0.85rem 1.25rem',
                      background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <Badge text={p.severity} color={sevColor} />
                    <span style={{ flex: 1, fontWeight: 500, fontSize: '0.88rem', color: C.white }}>{p.name}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" style={{ flexShrink: 0, transform: expandedPitfall === p.name ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </button>
                  {expandedPitfall === p.name && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: C.muted, lineHeight: 1.65 }}>{p.description}</p>
                      <div style={{ padding: '0.6rem 0.85rem', background: `${C.mint}0D`, borderRadius: 6, border: `1px solid ${C.mint}25` }}>
                        <span style={{ fontSize: '0.65rem', color: C.mint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fix: </span>
                        <span style={{ fontSize: '0.8rem', color: C.text }}>{p.fix}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: C.white, marginBottom: '0.75rem' }}>Walk-Forward Analysis</h3>
              <p style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.6, marginBottom: '0.5rem' }}>
                Splits data into rolling train/test windows. Optimizes on train, measures out-of-sample performance on test. Honest evaluation of strategy adaptability.
              </p>
              <CodeBlock code={BACKTEST_GUIDE.walkForward} id="guide-walkforward" />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: C.white, marginBottom: '0.75rem' }}>Monte Carlo Simulation</h3>
              <p style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.6, marginBottom: '0.5rem' }}>
                Runs N random time-window samples to test strategy robustness across different market periods. Reports P5/P50/P95 return distribution.
              </p>
              <CodeBlock code={BACKTEST_GUIDE.monteCarlo} id="guide-montecarlo" />
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}
