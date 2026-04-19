'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { 
  quantDocs, 
  DATA_SOURCES, 
  INDICATORS, 
  RISK_METRICS, 
  BACKTEST_GUIDE,
  STRATEGY_EXAMPLES,
  STRATEGY_API_CODE,
  PORTFOLIO_CONTEXT_CODE,
  LEDGER_SCHEMA_CODE,
  DECISION_FLOW,
  VALIDATION_PHILOSOPHY,
  PUBLISH_GUIDANCE
} from '@/lib/quant-docs'

const C = {
  bg:     '#06111F',
  bg2:    '#0B1728',
  bg3:    '#101A2D',
  bg4:    '#162438',
  border: '#1E2A3D',
  blue:   '#4F8CFF',
  mint:   '#16C784',
  red:    '#FF5468',
  orange: '#F5B942',
  purple: '#8B5CF6',
  text:   '#B7C4D5',
  muted:  '#7F8CA3',
  faint:  '#55657A',
  white:  '#F7FAFF',
}

const SECTIONS = quantDocs.sections

const CATEGORY_COLORS: Record<string, string> = {
  'trend':      C.blue,
  'momentum':  C.orange,
  'volatility': C.red,
  'volume':    C.purple,
  'oscillator':C.mint,
}

const METRIC_COLORS: Record<string, string> = {
  'return': C.mint,
  'risk':   C.red,
  'ratio':  C.blue,
  'trade':  C.orange,
}

function CopyButton({ code }: { code: string }) {
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

function CodeBlock({ code, lang = 'typescript' }: { code: string; lang?: string }) {
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
        <span style={{ fontSize: '0.7rem', color: C.faint, fontFamily: 'var(--font-mono)' }}>{lang}</span>
        <CopyButton code={code} />
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
          .replace(/(".*?"|'.*?'|"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\')/g,
            `<span style="color:#C3E88D">$1</span>`)
          .replace(/\b(\d+\.?\d*)\b/g, `<span style="color:#F78C6C">$1</span>`)
          .replace(/\b(np|pd|df|self|context|features|portfolio)\b/g, `<span style="color:#D77FFF">$1</span>`)
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

function DecisionChip({ decision }: { decision: 'BUY' | 'SELL' | 'HOLD' }) {
  const colors = {
    'BUY': C.mint,
    'SELL': C.red,
    'HOLD': C.blue,
  }
  return (
    <span style={{
      padding: '0.15rem 0.45rem',
      borderRadius: 4,
      background: `${colors[decision]}18`,
      color: colors[decision],
      fontSize: '0.7rem',
      fontFamily: 'var(--font-mono)',
      fontWeight: 700,
    }}>
      {decision}
    </span>
  )
}

function DecisionFlowDiagram() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '1.25rem',
      background: C.bg2,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      overflowX: 'auto',
    }}>
      {DECISION_FLOW.map((step, i) => (
        <div key={step.step} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            padding: '0.5rem 0.75rem',
            background: `${C.blue}15`,
            border: `1px solid ${C.blue}30`,
            borderRadius: 6,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: C.blue, fontFamily: 'var(--font-mono)' }}>
              {step.step}
            </div>
            <div style={{ fontSize: '0.65rem', color: C.muted, marginTop: '0.25rem', maxWidth: 100 }}>
              {step.description.split(' ')[0]}
            </div>
          </div>
          {i < DECISION_FLOW.length - 1 && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" style={{ margin: '0 0.25rem', flexShrink: 0 }}>
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          )}
        </div>
      ))}
    </div>
  )
}

function MetricCard({ metric }: { metric: typeof RISK_METRICS[0] }) {
  const [expanded, setExpanded] = useState(false)
  const color = METRIC_COLORS[metric.category]
  
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      background: C.bg2,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          width: '100%', padding: '0.85rem 1.25rem',
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}>
        <div style={{
          padding: '0.2rem 0.55rem', borderRadius: 4,
          background: `${color}18`, color, fontSize: '0.68rem', 
          fontFamily: 'var(--font-mono)', fontWeight: 700, flexShrink: 0, minWidth: 64, textAlign: 'center',
        }}>
          {metric.abbrev}
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 500, fontSize: '0.88rem', color: C.white }}>{metric.name}</span>
          <span style={{ marginLeft: '0.5rem', fontSize: '0.73rem', color, opacity: 0.8 }}>{metric.category}</span>
        </div>
        <div style={{ fontSize: '0.72rem', color: C.muted, fontFamily: 'var(--font-mono)', maxWidth: 180, textAlign: 'right', flexShrink: 0 }}>
          {metric.goodRange}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      
      {expanded && (
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
          <CodeBlock code={metric.code} lang="python" />
        </div>
      )}
    </div>
  )
}

function ExampleCard({ example }: { example: typeof STRATEGY_EXAMPLES[0] }) {
  const [expanded, setExpanded] = useState(false)
  
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      background: C.bg2,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
          width: '100%', padding: '1rem 1.25rem',
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
          color: C.text,
        }}>
        <div style={{
          width: 4, height: '100%', minHeight: 28, borderRadius: 4,
          background: C.orange, flexShrink: 0, marginTop: 2,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.2rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.92rem', color: C.white }}>{example.name}</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: C.muted, lineHeight: 1.5 }}>{example.description}</p>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.faint} strokeWidth="2" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', marginTop: 2 }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ padding: '0.65rem 0.85rem', background: `${C.mint}10`, borderRadius: 6, border: `1px solid ${C.mint}25` }}>
              <div style={{ fontSize: '0.65rem', color: C.mint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Works When</div>
              <div style={{ fontSize: '0.78rem', color: C.text, lineHeight: 1.5 }}>{example.whenItWorks}</div>
            </div>
            <div style={{ padding: '0.65rem 0.85rem', background: `${C.red}10`, borderRadius: 6, border: `1px solid ${C.red}25` }}>
              <div style={{ fontSize: '0.65rem', color: C.red, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Fails When</div>
              <div style={{ fontSize: '0.78rem', color: C.text, lineHeight: 1.5 }}>{example.whenItFails}</div>
            </div>
          </div>
          
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Code</div>
            <CodeBlock code={example.code} lang="typescript" />
          </div>
          
          <div>
            <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>Sample Output</div>
            <CodeBlock code={example.sampleOutput} lang="json" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function QuantDocsPage() {
  const [activeSection, setActiveSection] = useState('overview')
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
        width: 240,
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
          <div style={{ marginTop: '0.75rem', fontSize: '0.95rem', fontWeight: 700, color: C.white }}>Quant Builder</div>
          <div style={{ fontSize: '0.7rem', color: C.muted, marginTop: '0.15rem' }}>Crypto agent strategy docs</div>
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
                padding: '0.55rem 1rem',
                background: activeSection === s.id ? `${C.blue}18` : 'transparent',
                borderLeft: `2px solid ${activeSection === s.id ? C.blue : 'transparent'}`,
                border: 'none',
                color: activeSection === s.id ? C.white : C.muted,
                fontSize: '0.8rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div style={{ padding: '1rem', borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: '0.65rem', color: C.faint, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Source</div>
          <code style={{ fontSize: '0.65rem', color: C.muted, fontFamily: 'var(--font-mono)', background: C.bg3, padding: '0.3rem 0.5rem', borderRadius: 4, display: 'block', wordBreak: 'break-all' }}>
            lib/quant-docs.ts
          </code>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '2.5rem 2.5rem', maxWidth: 920 }}>

        {/* ── Hero ── */}
        <div style={{ marginBottom: '3.5rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: C.white, margin: '0 0 0.75rem' }}>
            {quantDocs.hero.title}
          </h1>
          <p style={{ fontSize: '0.95rem', color: C.muted, lineHeight: 1.7, marginBottom: '1.25rem', maxWidth: 680 }}>
            {quantDocs.hero.subtitle}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {quantDocs.hero.badges.map(badge => (
              <Badge key={badge.label} text={badge.label} color={badge.color} />
            ))}
          </div>
        </div>

        {/* ── Overview ── */}
        <section
          id="overview"
          ref={el => { sectionRefs.current['overview'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', opacity: 0.6 }}>⊡</span>
            {SECTIONS.find(s => s.id === 'overview')?.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {SECTIONS.find(s => s.id === 'overview')?.description}
          </p>

          <DecisionFlowDiagram />

          <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: C.white, margin: '0 0 1rem' }}>Strategy Lifecycle</h3>
            <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: C.muted, lineHeight: 1.6 }}>
              <li>ASE loads normalized crypto data and derived features.</li>
              <li>Your strategy receives the latest <code style={{ fontFamily: 'var(--font-mono)', color: C.blue }}>features</code> and <code style={{ fontFamily: 'var(--font-mono)', color: C.blue }}>portfolio</code> state.</li>
              <li>Your strategy returns BUY, SELL, or HOLD decisions.</li>
              <li>ASE converts those requests into target exposure changes.</li>
              <li>ASE applies cash, sizing, and execution constraints.</li>
              <li>ASE writes decision and execution events to the ledger.</li>
              <li>ASE updates positions, equity, metrics, and validation status.</li>
            </ol>
          </div>
        </section>

        {/* ── Strategy API ── */}
        <section
          id="strategy-api"
          ref={el => { sectionRefs.current['strategy-api'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', opacity: 0.6 }}>⊡</span>
            {SECTIONS.find(s => s.id === 'strategy-api')?.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {SECTIONS.find(s => s.id === 'strategy-api')?.description}
          </p>

          <div style={{ padding: '1rem', background: `${C.blue}08`, border: `1px solid ${C.blue}25`, borderRadius: 8, marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', color: C.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Required Exports</div>
            <div style={{ fontSize: '0.82rem', color: C.text, fontFamily: 'var(--font-mono)' }}>
              Every strategy must export <code style={{ color: C.mint }}>config</code> and <code style={{ color: C.mint }}>evaluate(context)</code>.
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>TypeScript Contract</div>
            <CodeBlock code={STRATEGY_API_CODE} lang="typescript" />
          </div>

          <div style={{ padding: '0.85rem 1rem', background: C.bg3, borderRadius: 6, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '0.75rem', color: C.muted, lineHeight: 1.6 }}>
              <strong style={{ color: C.orange }}>Rules:</strong>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <li><code style={{ fontFamily: 'var(--font-mono)', color: C.blue }}>conviction</code> must be between <code style={{ fontFamily: 'var(--font-mono)', color: C.orange }}>0</code> and <code style={{ fontFamily: 'var(--font-mono)', color: C.orange }}>1</code></li>
                <li><code style={{ fontFamily: 'var(--font-mono)', color: C.blue }}>targetPositionPct</code> is optional but recommended</li>
                <li><code style={{ fontFamily: 'var(--font-mono)', color: C.blue }}>thesis</code> should explain the trade in plain English</li>
                <li>Strategies should be deterministic for the same input</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── Portfolio Context ── */}
        <section
          id="portfolio-context"
          ref={el => { sectionRefs.current['portfolio-context'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', opacity: 0.6 }}>⊡</span>
            {SECTIONS.find(s => s.id === 'portfolio-context')?.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {SECTIONS.find(s => s.id === 'portfolio-context')?.description}
          </p>

          <div style={{ padding: '1rem', background: `${C.mint}08`, border: `1px solid ${C.mint}25`, borderRadius: 8, marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: C.mint, fontWeight: 600, marginBottom: '0.5rem' }}>Portfolio-Aware Strategies</div>
            <div style={{ fontSize: '0.82rem', color: C.text, lineHeight: 1.6 }}>
              ASE passes current portfolio state into every evaluation so your agent can make context-sensitive decisions.
            </div>
          </div>

          <CodeBlock code={PORTFOLIO_CONTEXT_CODE} lang="typescript" />

          <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', background: C.bg3, borderRadius: 6, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Example Usage</div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem', color: C.muted, lineHeight: 1.5 }}>
              <li>Buy BTC because momentum is improving and current BTC weight is small</li>
              <li>Hold ETH because the signal is still constructive but the position is already near its cap</li>
              <li>Sell SOL because the trend broke and capital should be reallocated</li>
              <li>Hold everything when drawdown is elevated and conviction is low</li>
            </ul>
          </div>
        </section>

        {/* ── Market Data ── */}
        <section
          id="market-data"
          ref={el => { sectionRefs.current['market-data'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', opacity: 0.6 }}>⊡</span>
            {SECTIONS.find(s => s.id === 'market-data')?.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {SECTIONS.find(s => s.id === 'market-data')?.description}
          </p>

          <div style={{ padding: '0.75rem 1rem', background: `${C.blue}10`, border: `1px solid ${C.blue}30`, borderRadius: 8, marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: C.blue, fontWeight: 600 }}>ASE is crypto-only.</div>
            <div style={{ fontSize: '0.82rem', color: C.muted, marginTop: '0.35rem' }}>
              All data sources focus on crypto assets. ASE may normalize, reconcile, or fallback across sources internally.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {DATA_SOURCES.map((src, idx) => (
              <div key={src.id} style={{
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                background: C.bg2,
                overflow: 'hidden',
              }}>
                <div style={{ padding: '1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: C.white }}>{src.name}</span>
                    <Badge text={src.badge} color={src.badgeColor} />
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: C.muted, lineHeight: 1.5 }}>{src.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Indicators ── */}
        <section
          id="indicators"
          ref={el => { sectionRefs.current['indicators'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', opacity: 0.6 }}>⊡</span>
            {SECTIONS.find(s => s.id === 'indicators')?.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {SECTIONS.find(s => s.id === 'indicators')?.description}
          </p>

          <div style={{ padding: '0.85rem 1rem', background: C.bg3, borderRadius: 6, border: `1px solid ${C.border}`, marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: C.muted, lineHeight: 1.6 }}>
              <strong style={{ color: C.orange }}>Strong strategies typically combine:</strong>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <li>trend confirmation + momentum awareness</li>
                <li>volatility awareness + position context</li>
                <li>entry/exit discipline + exposure controls</li>
              </ul>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem' }}>
            {INDICATORS.map(ind => (
              <span key={ind.id} style={{
                padding: '0.2rem 0.5rem',
                borderRadius: 4,
                background: `${CATEGORY_COLORS[ind.category]}15`,
                color: CATEGORY_COLORS[ind.category],
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
              }}>
                {ind.abbrev}
              </span>
            ))}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '0.6rem',
          }}>
            {INDICATORS.slice(0, 6).map(ind => (
              <div key={ind.id} style={{
                padding: '0.85rem 1rem',
                background: C.bg2,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: C.white }}>{ind.name}</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: C.muted, lineHeight: 1.5 }}>{ind.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Decision Model ── */}
        <section
          id="decision-model"
          ref={el => { sectionRefs.current['decision-model'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', opacity: 0.6 }}>⊡</span>
            {SECTIONS.find(s => s.id === 'decision-model')?.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {SECTIONS.find(s => s.id === 'decision-model')?.description}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {(['BUY', 'SELL', 'HOLD'] as const).map(decision => {
              const descriptions = {
                'BUY': 'Requests an increase in exposure for the asset. If targetPositionPct is provided, ASE attempts to move the asset toward that target within platform rules.',
                'SELL': 'Requests a reduction or exit. If targetPositionPct = 0, ASE interprets this as a full exit request. If a smaller target is provided, ASE interprets it as a trim.',
                'HOLD': 'Requests no change to the current position. A HOLD can still carry a thesis and risk note, which helps explain why the agent stayed disciplined.',
              }
              return (
                <div key={decision} style={{
                  padding: '1rem 1.25rem',
                  background: C.bg2,
                  border: `1px solid ${C.border}`,
                  borderRadius: 10,
                  borderLeft: `3px solid ${
                    decision === 'BUY' ? C.mint : decision === 'SELL' ? C.red : C.blue
                  }`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <DecisionChip decision={decision} />
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: C.white }}>{decision === 'BUY' ? 'Increase Exposure' : decision === 'SELL' ? 'Decrease Exposure' : 'Maintain Position'}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.82rem', color: C.muted, lineHeight: 1.6 }}>{descriptions[decision]}</p>
                </div>
              )
            })}
          </div>

          <div style={{ padding: '0.85rem 1rem', background: `${C.purple}10`, border: `1px solid ${C.purple}25`, borderRadius: 8 }}>
            <div style={{ fontSize: '0.75rem', color: C.purple, fontWeight: 600, marginBottom: '0.5rem' }}>Why This Model Exists</div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: C.muted, lineHeight: 1.6 }}>
              ASE standardizes all strategies around the same decision vocabulary so that strategies are comparable, backtests are fair, live behavior maps cleanly to paper behavior, and every request can be written to an auditable ledger.
            </p>
          </div>
        </section>

        {/* ── Ledger & Execution ── */}
        <section
          id="ledger-execution"
          ref={el => { sectionRefs.current['ledger-execution'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', opacity: 0.6 }}>⊡</span>
            {SECTIONS.find(s => s.id === 'ledger-execution')?.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {SECTIONS.find(s => s.id === 'ledger-execution')?.description}
          </p>

          <div style={{ padding: '1rem', background: `${C.mint}08`, border: `1px solid ${C.mint}25`, borderRadius: 8, marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: C.mint, fontWeight: 600, marginBottom: '0.5rem' }}>Two Types of Events</div>
            <div style={{ fontSize: '0.82rem', color: C.text, lineHeight: 1.6 }}>
              <strong>Decision events:</strong> what the agent requested<br/>
              <strong>Execution events:</strong> what was actually filled or simulated
            </div>
          </div>

          <CodeBlock code={LEDGER_SCHEMA_CODE} lang="typescript" />

          <div style={{ marginTop: '1rem', padding: '0.85rem 1rem', background: C.bg3, borderRadius: 6, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: '0.7rem', color: C.faint, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Common Statuses</div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem', color: C.muted, lineHeight: 1.5 }}>
              <li><code style={{ fontFamily: 'var(--font-mono)', color: C.mint }}>EXECUTED</code> — request was applied as intended</li>
              <li><code style={{ fontFamily: 'var(--font-mono)', color: C.orange }}>PARTIAL</code> — request was only partly filled under constraints</li>
              <li><code style={{ fontFamily: 'var(--font-mono)', color: C.blue }}>SKIPPED</code> — request was valid but resulted in no change</li>
              <li><code style={{ fontFamily: 'var(--font-mono)', color: C.red }}>REJECTED</code> — request could not be processed</li>
            </ul>
          </div>
        </section>

        {/* ── Validation & Backtests ── */}
        <section
          id="validation-backtests"
          ref={el => { sectionRefs.current['validation-backtests'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', opacity: 0.6 }}>⊡</span>
            {SECTIONS.find(s => s.id === 'validation-backtests')?.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {SECTIONS.find(s => s.id === 'validation-backtests')?.description}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
            {[
              { step: '1', title: 'Contract Validation', desc: 'ASE checks that the strategy exports required fields and returns valid BUY/SELL/HOLD decisions.' },
              { step: '2', title: 'Baseline Backtest', desc: 'ASE simulates strategy behavior over historical crypto data with standardized assumptions.' },
              { step: '3', title: 'Robustness Checks', desc: 'ASE evaluates across multiple stress conditions: cost sensitivity, unstable concentration, insufficient history.' },
              { step: '4', title: 'Publish Review', desc: 'A strategy may be blocked if validation quality is too weak, even when one window looks strong.' },
            ].map(item => (
              <div key={item.step} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: `${C.blue}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 700, color: C.blue,
                  flexShrink: 0,
                }}>
                  {item.step}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: C.white, marginBottom: '0.2rem' }}>{item.title}</div>
                  <div style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '0.85rem 1rem', background: `${C.purple}10`, border: `1px solid ${C.purple}25`, borderRadius: 8 }}>
            <div style={{ fontSize: '0.75rem', color: C.purple, fontWeight: 600, marginBottom: '0.5rem' }}>Public Principle</div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: C.muted, lineHeight: 1.6 }}>
              Users can understand the methodology and categories of tests, but ASE retains private implementation details to keep evaluation fair and harder to game.
            </p>
          </div>
        </section>

        {/* ── Metrics & Publish Rules ── */}
        <section
          id="metrics-publish-rules"
          ref={el => { sectionRefs.current['metrics-publish-rules'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', opacity: 0.6 }}>⊡</span>
            {SECTIONS.find(s => s.id === 'metrics-publish-rules')?.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {SECTIONS.find(s => s.id === 'metrics-publish-rules')?.description}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '1.5rem' }}>
            {RISK_METRICS.map(metric => (
              <MetricCard key={metric.id} metric={metric} />
            ))}
          </div>

          <div style={{ padding: '0.85rem 1rem', background: `${C.red}10`, border: `1px solid ${C.red}25`, borderRadius: 8 }}>
            <div style={{ fontSize: '0.75rem', color: C.red, fontWeight: 600, marginBottom: '0.5rem' }}>Publish Guidance</div>
            <div style={{ fontSize: '0.8rem', color: C.muted, lineHeight: 1.6 }}>
              A strategy may still be non-publishable when:
            </div>
            <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: C.muted }}>
              {PUBLISH_GUIDANCE.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Examples ── */}
        <section
          id="examples"
          ref={el => { sectionRefs.current['examples'] = el }}
          style={{ marginBottom: '4rem' }}
        >
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: C.white, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem', opacity: 0.6 }}>⊡</span>
            {SECTIONS.find(s => s.id === 'examples')?.title}
          </h2>
          <p style={{ fontSize: '0.85rem', color: C.muted, marginBottom: '1.5rem', lineHeight: 1.6 }}>
            {SECTIONS.find(s => s.id === 'examples')?.description}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {STRATEGY_EXAMPLES.map(example => (
              <ExampleCard key={example.id} example={example} />
            ))}
          </div>
        </section>

        {/* Bottom spacing */}
        <div style={{ height: '4rem' }} />

      </main>
    </div>
  )
}