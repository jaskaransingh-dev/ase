'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

type ValidationResult = {
  passed: boolean
  sharpe: number
  maxDD: number
  winRate: number
  totalTrades: number
  totalReturn: number
  issues: string[]
  warnings: string[]
}

const THRESHOLDS = {
  sharpe: 0.5,
  maxDD: 50,
  winRate: 40,
  minTrades: 20,
}

const STEP_LABELS = ['Info', 'Upload', 'Backtest', 'Review']

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,.08)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .6s ease' }} />
    </div>
  )
}

export default function BuilderSubmitPage() {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Step 0 - info
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [strategyType, setStrategyType] = useState('momentum')
  const [symbol, setSymbol] = useState('BTC-USD')
  const [contactEmail, setContactEmail] = useState('')

  // Step 1 - upload
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Step 2 - validation result
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [validationError, setValidationError] = useState('')

  function parseCSV(text: string): { date: string; return_pct: number }[] | null {
    try {
      const lines = text.trim().split('\n')
      if (lines.length < 3) return null
      const header = lines[0].toLowerCase().replace(/\s/g, '')
      const hasDate = header.includes('date')
      const hasReturn = header.includes('return') || header.includes('pnl') || header.includes('pct')
      if (!hasDate || !hasReturn) return null

      const cols = lines[0].split(',').map(c => c.trim().toLowerCase())
      const dateIdx = cols.findIndex(c => c.includes('date'))
      const retIdx = cols.findIndex(c => c.includes('return') || c.includes('pnl') || c.includes('pct'))

      return lines.slice(1).map(line => {
        const parts = line.split(',')
        return {
          date: parts[dateIdx]?.trim() ?? '',
          return_pct: parseFloat(parts[retIdx]?.trim() ?? '0'),
        }
      }).filter(r => r.date && !isNaN(r.return_pct))
    } catch {
      return null
    }
  }

  function runValidation(text: string): ValidationResult {
    const rows = parseCSV(text)
    if (!rows || rows.length < THRESHOLDS.minTrades) {
      return {
        passed: false,
        sharpe: 0, maxDD: 0, winRate: 0, totalTrades: rows?.length ?? 0, totalReturn: 0,
        issues: [`Not enough trades. Need at least ${THRESHOLDS.minTrades}, found ${rows?.length ?? 0}.`],
        warnings: [],
      }
    }

    const returns = rows.map(r => r.return_pct)
    const totalReturn = returns.reduce((a, b) => a + b, 0)
    const mean = totalReturn / returns.length
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length
    const stdDev = Math.sqrt(variance)
    const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0

    let peak = 0, equity = 0, maxDD = 0
    for (const r of returns) {
      equity += r
      if (equity > peak) peak = equity
      const dd = peak - equity
      if (dd > maxDD) maxDD = dd
    }

    const wins = returns.filter(r => r > 0).length
    const winRate = (wins / returns.length) * 100
    const totalTrades = returns.length

    const issues: string[] = []
    const warnings: string[] = []

    if (sharpe < THRESHOLDS.sharpe) issues.push(`Sharpe ratio ${sharpe.toFixed(2)} is below minimum ${THRESHOLDS.sharpe}`)
    if (maxDD > THRESHOLDS.maxDD) issues.push(`Max drawdown ${maxDD.toFixed(1)}% exceeds limit of ${THRESHOLDS.maxDD}%`)
    if (winRate < THRESHOLDS.winRate) issues.push(`Win rate ${winRate.toFixed(1)}% is below minimum ${THRESHOLDS.winRate}%`)
    if (totalTrades < 50) warnings.push('Fewer than 50 trades — more history improves confidence')
    if (sharpe > 3) warnings.push('Sharpe > 3 may indicate overfitting. Out-of-sample verification required.')

    return { passed: issues.length === 0, sharpe, maxDD, winRate, totalTrades, totalReturn, issues, warnings }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = ev => setCsvText(ev.target?.result as string ?? '')
    reader.readAsText(file)
  }

  function handleValidate() {
    setValidationError('')
    if (!csvText.trim()) { setValidationError('Please upload a CSV file first.'); return }
    setLoading(true)
    setTimeout(() => {
      try {
        const result = runValidation(csvText)
        setValidationResult(result)
        setStep(2)
      } catch {
        setValidationError('Failed to parse CSV. Check the format.')
      }
      setLoading(false)
    }, 800)
  }

  async function handleSubmit() {
    setLoading(true)
    // In a real implementation this would POST to /api/builders/submit
    await new Promise(r => setTimeout(r, 1200))
    setLoading(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div style={{ maxWidth: 640, margin: '6rem auto', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✓</div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.6rem', fontWeight: 800, marginBottom: '.75rem' }}>Submission Received</h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
          Your agent <strong>{name}</strong> has been submitted for review. We&apos;ll run out-of-sample testing, CPCV, and Deflated Sharpe Ratio analysis. You&apos;ll hear back at <strong>{contactEmail}</strong> within 3–5 business days.
        </p>
        <Link href="/agents" className="btn-primary" style={{ fontSize: '.85rem' }}>Browse Live Agents →</Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 2.5rem' }}>
      {/* Header */}
      <Link href="/agents" style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)', display: 'inline-flex', alignItems: 'center', gap: '.35rem', marginBottom: '1.5rem', textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--white)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--faint)'}>
        ← Back to Agents
      </Link>

      <div className="eyebrow" style={{ marginBottom: '.35rem' }}>BUILDERS</div>
      <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.75rem', fontWeight: 800, marginBottom: '.5rem' }}>Submit Your Agent</h1>
      <p style={{ color: 'var(--muted)', fontSize: '.9rem', lineHeight: 1.65, marginBottom: '2rem' }}>
        Upload your backtest results and strategy details. We automatically validate performance before listing — agents must pass Sharpe, drawdown, and win-rate thresholds.
      </p>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '2rem' }}>
        {STEP_LABELS.map((label, i) => (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {i > 0 && <div style={{ flex: 1, height: 1, background: i <= step ? 'rgba(155,140,255,.5)' : 'var(--border)' }} />}
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, flexShrink: 0, background: i < step ? 'rgba(110,231,183,.2)' : i === step ? 'rgba(155,140,255,.2)' : 'var(--bg2)', border: `1px solid ${i < step ? 'rgba(110,231,183,.4)' : i === step ? 'rgba(155,140,255,.4)' : 'var(--border)'}`, color: i < step ? '#6EE7B7' : i === step ? 'var(--gold)' : 'var(--faint)' }}>
                {i < step ? '✓' : i + 1}
              </div>
              {i < STEP_LABELS.length - 1 && <div style={{ flex: 1, height: 1, background: i < step ? 'rgba(155,140,255,.5)' : 'var(--border)' }} />}
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: i === step ? 'var(--gold)' : 'var(--faint)', letterSpacing: '.04em' }}>{label.toUpperCase()}</span>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, padding: '1.75rem' }}>

        {/* Step 0: Info */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, marginBottom: '.25rem' }}>Strategy Details</h3>

            {[
              { label: 'Agent Name', value: name, setter: setName, placeholder: 'e.g. BTC Momentum Alpha' },
              { label: 'Contact Email', value: contactEmail, setter: setContactEmail, placeholder: 'you@example.com' },
            ].map(({ label, value, setter, placeholder }) => (
              <div key={label}>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', letterSpacing: '.06em', display: 'block', marginBottom: '.35rem' }}>{label.toUpperCase()}</label>
                <input
                  value={value}
                  onChange={e => setter(e.target.value)}
                  placeholder={placeholder}
                  style={{ width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .9rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}

            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', letterSpacing: '.06em', display: 'block', marginBottom: '.35rem' }}>STRATEGY TYPE</label>
              <select value={strategyType} onChange={e => setStrategyType(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .9rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.82rem', outline: 'none' }}>
                {['momentum', 'mean_reversion', 'trend_following', 'crypto_momentum', 'crypto_mean_reversion', 'other'].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', letterSpacing: '.06em', display: 'block', marginBottom: '.35rem' }}>PRIMARY SYMBOL</label>
              <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="BTC-USD"
                style={{ width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .9rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', color: 'var(--faint)', letterSpacing: '.06em', display: 'block', marginBottom: '.35rem' }}>DESCRIPTION</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                placeholder="Describe the strategy logic, entry/exit signals, and risk controls..."
                style={{ width: '100%', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .9rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.82rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            <button
              onClick={() => { if (name && contactEmail && description) setStep(1) }}
              className="btn-primary"
              disabled={!name || !contactEmail || !description}
              style={{ marginTop: '.5rem' }}
            >
              Next: Upload Backtest →
            </button>
          </div>
        )}

        {/* Step 1: Upload CSV */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 800 }}>Upload Backtest Results</h3>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.65 }}>
              Upload a CSV with columns: <code style={{ fontFamily: 'var(--font-mono)', fontSize: '.78rem', background: 'rgba(255,255,255,.06)', padding: '.1rem .35rem', borderRadius: 5 }}>date, return_pct</code> — one row per trade or period.
            </p>

            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: '1.5px dashed rgba(155,140,255,.3)', borderRadius: 14, padding: '2.5rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color .14s, background .14s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(155,140,255,.6)'; (e.currentTarget as HTMLElement).style.background = 'rgba(155,140,255,.04)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(155,140,255,.3)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: '.5rem' }}>📊</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.75rem', color: 'var(--faint)' }}>
                {fileName ? fileName : 'Click to upload CSV'}
              </div>
              {fileName && <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: '#6EE7B7', marginTop: '.3rem' }}>File loaded ✓</div>}
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
            </div>

            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.06em', display: 'block', marginBottom: '.35rem' }}>OR PASTE CSV DIRECTLY</label>
              <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={8}
                placeholder={'date,return_pct\n2024-01-02,1.2\n2024-01-03,-0.4\n...'}
                style={{ width: '100%', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .9rem', color: 'var(--white)', fontFamily: 'var(--font-mono)', fontSize: '.72rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>

            {validationError && (
              <div style={{ background: 'rgba(251,113,133,.1)', border: '1px solid rgba(251,113,133,.3)', borderRadius: 10, padding: '.6rem .9rem', color: '#FB7185', fontFamily: 'var(--font-mono)', fontSize: '.72rem' }}>
                {validationError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '.75rem' }}>
              <button onClick={() => setStep(0)} style={{ padding: '.6rem 1.2rem', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.75rem', cursor: 'pointer' }}>
                ← Back
              </button>
              <button onClick={handleValidate} disabled={loading || !csvText.trim()} className="btn-primary" style={{ flex: 1 }}>
                {loading ? 'Running validation…' : 'Validate Performance →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Validation result */}
        {step === 2 && validationResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 800, flex: 1 }}>Validation Results</h3>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', fontWeight: 700, padding: '.3rem .8rem', borderRadius: 8, background: validationResult.passed ? 'rgba(110,231,183,.15)' : 'rgba(251,113,133,.15)', border: `1px solid ${validationResult.passed ? 'rgba(110,231,183,.35)' : 'rgba(251,113,133,.35)'}`, color: validationResult.passed ? '#6EE7B7' : '#FB7185' }}>
                {validationResult.passed ? 'PASSED' : 'FAILED'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              {[
                { label: 'Sharpe Ratio', value: validationResult.sharpe.toFixed(2), threshold: `≥ ${THRESHOLDS.sharpe}`, pass: validationResult.sharpe >= THRESHOLDS.sharpe, bar: validationResult.sharpe / 3 * 100 },
                { label: 'Max Drawdown', value: validationResult.maxDD.toFixed(1) + '%', threshold: `< ${THRESHOLDS.maxDD}%`, pass: validationResult.maxDD < THRESHOLDS.maxDD, bar: validationResult.maxDD / THRESHOLDS.maxDD * 100 },
                { label: 'Win Rate', value: validationResult.winRate.toFixed(1) + '%', threshold: `≥ ${THRESHOLDS.winRate}%`, pass: validationResult.winRate >= THRESHOLDS.winRate, bar: validationResult.winRate / 100 * 100 },
                { label: 'Total Trades', value: validationResult.totalTrades.toString(), threshold: `≥ ${THRESHOLDS.minTrades}`, pass: validationResult.totalTrades >= THRESHOLDS.minTrades, bar: Math.min(100, validationResult.totalTrades / 100 * 100) },
              ].map(({ label, value, threshold, pass, bar }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,.02)', border: `1px solid ${pass ? 'rgba(110,231,183,.2)' : 'rgba(251,113,133,.2)'}`, borderRadius: 12, padding: '.9rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.4rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)' }}>{label.toUpperCase()}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: pass ? '#6EE7B7' : '#FB7185' }}>{pass ? '✓' : '✗'} {threshold}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.2rem', color: pass ? '#6EE7B7' : '#FB7185', marginBottom: '.5rem' }}>{value}</div>
                  <ScoreBar value={bar} max={100} color={pass ? '#6EE7B7' : '#FB7185'} />
                </div>
              ))}
            </div>

            {validationResult.issues.length > 0 && (
              <div style={{ background: 'rgba(251,113,133,.08)', border: '1px solid rgba(251,113,133,.25)', borderRadius: 12, padding: '.9rem 1rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: '#FB7185', fontWeight: 700, marginBottom: '.5rem', letterSpacing: '.06em' }}>ISSUES TO FIX</div>
                {validationResult.issues.map((issue, i) => (
                  <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: '#FB7185', marginBottom: '.2rem' }}>• {issue}</div>
                ))}
              </div>
            )}

            {validationResult.warnings.length > 0 && (
              <div style={{ background: 'rgba(253,186,116,.08)', border: '1px solid rgba(253,186,116,.25)', borderRadius: 12, padding: '.9rem 1rem' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: '#FDBA74', fontWeight: 700, marginBottom: '.5rem', letterSpacing: '.06em' }}>WARNINGS</div>
                {validationResult.warnings.map((w, i) => (
                  <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: '#FDBA74', marginBottom: '.2rem' }}>• {w}</div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '.75rem' }}>
              <button onClick={() => { setStep(1); setValidationResult(null) }} style={{ padding: '.6rem 1.2rem', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.75rem', cursor: 'pointer' }}>
                ← Re-upload
              </button>
              {validationResult.passed && (
                <button onClick={() => setStep(3)} className="btn-primary" style={{ flex: 1 }}>
                  Continue to Review →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Review & Submit */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 800 }}>Review & Submit</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
              {[
                { label: 'Agent Name', value: name },
                { label: 'Contact', value: contactEmail },
                { label: 'Strategy', value: strategyType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
                { label: 'Symbol', value: symbol },
                { label: 'Sharpe', value: validationResult?.sharpe.toFixed(2) ?? '—' },
                { label: 'Win Rate', value: validationResult ? validationResult.winRate.toFixed(1) + '%' : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 10, padding: '.65rem .9rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.06em', marginBottom: '.2rem' }}>{label.toUpperCase()}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 700 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: 'rgba(155,140,255,.06)', border: '1px solid rgba(155,140,255,.2)', borderRadius: 12, padding: '.9rem 1rem', fontSize: '.82rem', color: 'var(--muted)', lineHeight: 1.65 }}>
              By submitting, you agree that ASE will run additional out-of-sample tests including CPCV and Deflated Sharpe Ratio analysis. Listing is not guaranteed. Response within 3–5 business days.
            </div>

            <div style={{ display: 'flex', gap: '.75rem' }}>
              <button onClick={() => setStep(2)} style={{ padding: '.6rem 1.2rem', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.75rem', cursor: 'pointer' }}>
                ← Back
              </button>
              <button onClick={handleSubmit} disabled={loading} className="btn-primary" style={{ flex: 1 }}>
                {loading ? 'Submitting…' : 'Submit Agent for Review →'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Requirements callout */}
      <div style={{ marginTop: '1.5rem', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.25rem 1.5rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', letterSpacing: '.08em', marginBottom: '.75rem' }}>LISTING REQUIREMENTS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: '.6rem' }}>
          {[
            { label: 'Sharpe Ratio', value: '≥ 0.5', desc: 'Risk-adjusted return threshold' },
            { label: 'Max Drawdown', value: '< 50%', desc: 'Capital preservation limit' },
            { label: 'Win Rate', value: '≥ 40%', desc: 'Minimum trade success rate' },
            { label: 'Trade History', value: '≥ 20 trades', desc: 'Statistical significance floor' },
            { label: 'Out-of-Sample', value: 'Required', desc: 'Walk-forward + CPCV test' },
            { label: 'Deflated Sharpe', value: 'Required', desc: 'Overfitting detection gate' },
          ].map(({ label, value, desc }) => (
            <div key={label} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--border)', borderRadius: 10, padding: '.7rem .85rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', marginBottom: '.2rem' }}>{label.toUpperCase()}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.82rem', fontWeight: 800, color: 'var(--gold)', marginBottom: '.15rem' }}>{value}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
