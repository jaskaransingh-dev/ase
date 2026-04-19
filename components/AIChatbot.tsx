'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Message {
  role: 'user' | 'model'
  content: string
}

// Smart ghost-text completions keyed by input prefix
const GHOST_COMPLETIONS: [string, string][] = [
  // Data & CSV
  ['upload', 'upload CSV data and run backtest'],
  ['csv', 'CSV upload and integration — how?'],
  ['import data', 'import data from CSV and run backtest'],
  ['data', 'data integration and CSV handling explained'],

  // Strategy queries
  ['how does s', 'how does slippage affect backtests?'],
  ['how does sl', 'how does slippage affect backtests?'],
  ['how does sli', 'how does slippage affect backtests?'],
  ['how', 'how does slippage affect backtests?'],

  // Metrics
  ['what is sh', 'what is the Sharpe ratio?'],
  ['what is so', 'what is the Sortino ratio?'],
  ['what is ma', 'what is max drawdown?'],
  ['what is ca', 'what is the Calmar ratio?'],
  ['what is pr', 'what is profit factor?'],
  ['what is ro', 'what is rolling Sharpe?'],
  ['what', 'what is the Sharpe ratio?'],

  // Strategy explanations
  ['explain m', 'explain momentum crossover strategy'],
  ['explain d', 'explain dual momentum strategy'],
  ['explain r', 'explain RSI mean reversion'],
  ['explain', 'explain mean reversion strategy'],
  ['breakout', 'breakout trend strategy — how does it work?'],

  // Optimization
  ['how to red', 'how to reduce overfitting in backtests?'],
  ['optimize', 'optimize strategy parameters — best practices?'],
  ['tune', 'tune strategy parameters using walk-forward analysis'],
  ['how to', 'how to reduce overfitting in backtests?'],

  // Code & Implementation
  ['write', 'write a MACD strategy in Python'],
  ['wri', 'write a MACD strategy in Python'],
  ['show', 'show me a Bollinger Band strategy'],
  ['sho', 'show me a Bollinger Band strategy'],
  ['code', 'write a complete trading strategy in Python'],

  // Advanced analysis
  ['backtest', 'backtest with walk-forward analysis — how?'],
  ['back', 'backtest with walk-forward analysis — how?'],
  ['monte', 'monte carlo simulation — what does it tell me?'],
  ['pairs', 'pairs trading — how does statistical arbitrage work?'],
  ['risk', 'risk parity portfolio allocation — explain'],
  ['position', 'position sizing with ATR — how?'],
  ['alpha', 'alpha vs beta — what is the difference?'],

  // Performance analysis
  ['score', 'what does the strategy scorecard measure?'],
  ['composite', 'composite score breakdown and interpretation'],
  ['benchmark', 'benchmark comparison — SPY vs strategy'],
  ['perform', 'performance metrics and what they mean'],
]

function getGhostText(input: string): string {
  if (!input.trim()) return ''
  const lower = input.toLowerCase()
  for (const [prefix, completion] of GHOST_COMPLETIONS) {
    if (lower === prefix) {
      // Return only the suffix (what comes after what user typed)
      return completion.slice(input.length)
    }
  }
  // Partial prefix match
  for (const [prefix, completion] of GHOST_COMPLETIONS) {
    if (prefix.startsWith(lower) && completion.startsWith(lower)) {
      return completion.slice(input.length)
    }
  }
  return ''
}

const QUICK_PROMPTS = [
  { label: 'CSV Data Upload',     text: 'How do I upload CSV data and backtest it?' },
  { label: 'Sharpe Ratio',        text: 'What is the Sharpe ratio and why does it matter?' },
  { label: 'Reduce Overfitting',  text: 'How to reduce overfitting in backtests?' },
  { label: 'Walk-Forward Test',   text: 'What is walk-forward analysis and when to use it?' },
  { label: 'Dual Momentum',       text: 'Explain dual momentum strategy' },
  { label: 'MACD Strategy',       text: 'Write a MACD crossover strategy in Python' },
  { label: 'Position Sizing',     text: 'How to size positions with ATR?' },
  { label: 'Score Explained',     text: 'What does the strategy scorecard measure?' },
]

function TerminalOutput({ content }: { content: string }) {
  // Parse code blocks
  const codeMatch = content.match(/___CODE_START___([\s\S]*?)___CODE_END___/)
  if (codeMatch) {
    const before = content.slice(0, content.indexOf('___CODE_START___')).trim()
    const code = codeMatch[1].trim()
    const after = content.slice(content.indexOf('___CODE_END___') + '___CODE_END___'.length).trim()
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {before && <TerminalText text={before} />}
        <TerminalCode code={code} />
        {after && <TerminalText text={after} />}
      </div>
    )
  }
  return <TerminalText text={content} />
}

function TerminalText({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
      {text.split('\n').map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
        return (
          <div key={i} style={{ fontSize: '0.82rem', lineHeight: 1.65, color: '#A8B8C8', minHeight: '0.85rem' }}>
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <span key={j} style={{ color: '#C9D1E0', fontWeight: 600 }}>{part.slice(2, -2)}</span>
              }
              if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em', color: '#22F0B5', background: 'rgba(34,240,181,0.1)', padding: '0.1em 0.35em', borderRadius: 3 }}>{part.slice(1, -1)}</code>
              }
              return part
            })}
          </div>
        )
      })}
    </div>
  )
}

function detectLanguage(code: string): string {
  if (code.includes('def ') || code.includes('import ') || code.includes('print(')) return 'python'
  if (code.includes('function ') || code.includes('const ') || code.includes('=>') || code.includes('await ')) return 'javascript'
  if (code.includes('interface ') || code.includes(': string') || code.includes(': number')) return 'typescript'
  return 'python'
}

function highlightVSCode(code: string, language: string): string {
  const lines = code.split('\n')
  return lines.map(line => {
    let colored = line
    if (language === 'python') {
      colored = colored
        .replace(/(#.*)$/, '<span style="color:#6A9955">$1</span>')
        .replace(/\b(import|from|as|class|def|return|if|elif|else|for|while|and|or|not|in|is|True|False|None|pass|try|except|finally|with|lambda|yield|global|nonlocal)\b/g,
          '<span style="color:#569CD6">$1</span>')
        .replace(/("""[\s\S]*?"""|'''[\s\S]*?''')/g, '<span style="color:#CE9178">$1</span>')
        .replace(/(".*?"|'.*?')/g, '<span style="color:#CE9178">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#B5CEA8">$1</span>')
        .replace(/\b(np|pd|df|self|plt|os|sys)\b/g, '<span style="color:#DCDCAA">$1</span>')
    } else {
      colored = colored
        .replace(/(\/\/.*)$/, '<span style="color:#6A9955">$1</span>')
        .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#6A9955">$1</span>')
        .replace(/\b(const|let|var|function|return|if|else|for|while|and|or|not|in|new|class|extends|implements|try|catch|finally|throw|async|await|import|export|from|as|default|static|this|super)\b/g,
          '<span style="color:#569CD6">$1</span>')
        .replace(/\b(true|false|null|undefined)\b/g, '<span style="color:#569CD6">$1</span>')
        .replace(/(`[^`]*`)/g, '<span style="color:#CE9178">$1</span>')
        .replace(/(".*?"|'.*?')/g, '<span style="color:#CE9178">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#B5CEA8">$1</span>')
        .replace(/\b(console|document|window|Array|Object|Number|String|Boolean|Math|JSON|Date|Promise|Set|Map)\b/g,
          '<span style="color:#DCDCAA">$1</span>')
    }
    colored = colored.replace(/(\w+)(?=\s*\()/g, '<span style="color:#DCDCAA">$1</span>')
    return colored
  }).join('\n')
}

function TerminalCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const language = detectLanguage(code)
  const highlighted = highlightVSCode(code, language)
  return (
    <div style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: 6, overflow: 'hidden', fontSize: '0.78rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.75rem', borderBottom: '1px solid #3c3c3c', background: '#252526' }}>
        <span style={{ color: '#858585', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>{language}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          style={{ background: 'transparent', border: 'none', color: copied ? '#4ec9b0' : '#858585', cursor: 'pointer', fontSize: '0.68rem', fontFamily: 'var(--font-mono)', padding: '0.1rem 0.3rem' }}
        >
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
      <div style={{ padding: '0.6rem 0.75rem', overflowX: 'auto' }}>
        {code.split('\n').map((line, i) => {
          const coloredLine = line
            .replace(/(\/\/.*)$/, '<span style="color:#6A9955">$1</span>')
            .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color:#6A9955">$1</span>')
            .replace(/\b(const|let|var|function|return|if|else|for|while|and|or|not|in|new|class|extends|implements|try|catch|finally|throw|async|await|import|export|from|as|default|static|this|super)\b/g,
              '<span style="color:#569CD6">$1</span>')
            .replace(/\b(true|false|null|undefined)\b/g, '<span style="color:#569CD6">$1</span>')
            .replace(/(`[^`]*`)/g, '<span style="color:#CE9178">$1</span>')
            .replace(/(".*?"|'.*?')/g, '<span style="color:#CE9178">$1</span>')
            .replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#B5CEA8">$1</span>')
            .replace(/\b(console|document|window|Array|Object|Number|String|Boolean|Math|JSON|Date|Promise|Set|Map)\b/g,
              '<span style="color:#DCDCAA">$1</span>')
            .replace(/(\w+)(?=\s*\()/g, '<span style="color:#DCDCAA">$1</span>')
          return (
            <div key={i} style={{ display: 'flex', minHeight: '1.5em', gap: '0.75rem' }}>
              <span style={{ color: '#858585', minWidth: '1.5em', textAlign: 'right', userSelect: 'none', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{i + 1}</span>
              <code style={{ fontFamily: 'Consolas, Monaco, monospace', whiteSpace: 'pre', color: '#d4d4d4' }} dangerouslySetInnerHTML={{ __html: coloredLine || ' ' }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AIChatbot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ghostText, setGhostText] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [sessionTime] = useState(() => new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }))

  const inputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const ghostTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages, loading])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Ghost text logic — appear after 500ms pause, hide immediately on typing
  useEffect(() => {
    clearTimeout(ghostTimerRef.current)
    if (!input) {
      setGhostText('')
      return
    }
    // Hide immediately when typing starts
    setGhostText('')
    ghostTimerRef.current = setTimeout(() => {
      setGhostText(getGhostText(input))
    }, 500)
    return () => clearTimeout(ghostTimerRef.current)
  }, [input])

  // Hide quick prompts when user starts typing
  useEffect(() => {
    if (input.length > 0) {
      setShowSuggestions(false)
    } else if (messages.length === 0) {
      const t = setTimeout(() => setShowSuggestions(true), 200)
      return () => clearTimeout(t)
    }
  }, [input, messages.length])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    setError('')
    setGhostText('')
    setShowSuggestions(false)

    const trimmed = text.trim()
    setCommandHistory(prev => [trimmed, ...prev.slice(0, 49)])
    setHistoryIdx(-1)

    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json() as { reply?: string; error?: string }

      if (!res.ok || data.error) {
        setError(res.status === 503 ? 'AI service not configured' : (data.error ?? 'Request failed'))
        setLoading(false)
        return
      }
      setMessages(prev => [...prev, { role: 'model', content: data.reply ?? '' }])
    } catch {
      setError('Network error — check your connection')
    } finally {
      setLoading(false)
    }
  }, [messages, loading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' && ghostText) {
      e.preventDefault()
      setInput(prev => prev + ghostText)
      setGhostText('')
      return
    }
    if (e.key === 'Escape') {
      setGhostText('')
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIdx = Math.min(historyIdx + 1, commandHistory.length - 1)
      setHistoryIdx(newIdx)
      if (commandHistory[newIdx]) setInput(commandHistory[newIdx])
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIdx = Math.max(historyIdx - 1, -1)
      setHistoryIdx(newIdx)
      setInput(newIdx === -1 ? '' : (commandHistory[newIdx] ?? ''))
      return
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 300,
          width: 48,
          height: 48,
          borderRadius: 10,
          border: open ? '1px solid #22F0B5' : '1px solid #1E2D45',
          background: open ? 'rgba(34,240,181,0.1)' : '#0B1728',
          color: open ? '#22F0B5' : '#5B8CFF',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: open ? '0 0 20px rgba(34,240,181,0.15)' : '0 4px 24px rgba(0,0,0,0.5)',
          transition: 'all 0.2s',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '-0.02em',
        }}
        title="AI Terminal"
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
        ) : (
          <span style={{ letterSpacing: 0 }}>AI</span>
        )}
      </button>

      {/* Terminal panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: '4.5rem',
          right: '1.5rem',
          zIndex: 300,
          width: 460,
          maxWidth: 'calc(100vw - 3rem)',
          height: 580,
          maxHeight: 'calc(100vh - 6rem)',
          background: '#060E1B',
          border: '1px solid #1E2D45',
          borderRadius: 12,
          boxShadow: '0 0 0 1px rgba(34,240,181,0.05), 0 24px 80px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--font-mono, "Courier New", monospace)',
        }}>
          {/* Terminal title bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.55rem 1rem',
            background: '#0A1525',
            borderBottom: '1px solid #1A2A40',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '5px' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
              </div>
              <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: '#3A5A72' }}>
                ASE Quant
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.65rem', color: '#2A3A50', fontFamily: 'var(--font-mono)' }}>
                llama-3.3-70b • {sessionTime}
              </span>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22F0B5', boxShadow: '0 0 6px #22F0B5' }} />
            </div>
          </div>

          {/* Messages area */}
          <div
            ref={messagesRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0',
              scrollbarWidth: 'thin',
              scrollbarColor: '#1A2A40 transparent',
            }}
          >
            {/* Welcome banner */}
            {messages.length === 0 && (
              <div style={{ marginBottom: '0.85rem', paddingBottom: '0.75rem', borderBottom: '1px solid #0F1E30' }}>
                <div style={{ fontSize: '0.72rem', color: '#22F0B5', marginBottom: '0.2rem' }}>
                  ASE Quant — strategy assistant
                </div>
                <div style={{ fontSize: '0.68rem', color: '#2A3E55', lineHeight: 1.6 }}>
                  Type a question or use ↑↓ for history. Tab accepts suggestions.
                </div>
              </div>
            )}

            {/* Quick prompts — hidden when typing */}
            {messages.length === 0 && showSuggestions && (
              <div style={{
                marginBottom: '0.75rem',
                transition: 'opacity 0.2s',
                opacity: showSuggestions ? 1 : 0,
              }}>
                <div style={{ fontSize: '0.63rem', color: '#2A3E55', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  suggestions
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {QUICK_PROMPTS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => void send(p.text)}
                      style={{
                        padding: '0.25rem 0.6rem',
                        borderRadius: 4,
                        border: '1px solid #1A2A40',
                        background: '#0A1525',
                        color: '#4A6A88',
                        fontSize: '0.68rem',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.borderColor = '#22F0B5'
                        e.currentTarget.style.color = '#22F0B5'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.borderColor = '#1A2A40'
                        e.currentTarget.style.color = '#4A6A88'
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message history */}
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: '0.6rem' }}>
                {msg.role === 'user' ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <span style={{ color: '#22F0B5', fontSize: '0.8rem', flexShrink: 0, marginTop: '0.05rem' }}>›</span>
                    <span style={{ fontSize: '0.82rem', color: '#C9D1E0', lineHeight: 1.5, wordBreak: 'break-word' }}>{msg.content}</span>
                  </div>
                ) : (
                  <div style={{ paddingLeft: '1rem', borderLeft: '1px solid #1A2A40', marginLeft: '0.15rem', marginTop: '0.2rem', marginBottom: '0.4rem' }}>
                    <TerminalOutput content={msg.content} />
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1rem', marginTop: '0.1rem' }}>
                <span style={{ fontSize: '0.68rem', color: '#22F0B5', fontFamily: 'var(--font-mono)' }}>
                  thinking
                </span>
                <span style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 3, height: 3, borderRadius: '50%', background: '#22F0B5',
                      animation: `termDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                      display: 'inline-block',
                    }} />
                  ))}
                </span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ fontSize: '0.75rem', color: '#FF5468', fontFamily: 'var(--font-mono)', paddingLeft: '1rem', marginTop: '0.25rem' }}>
                ! {error}
              </div>
            )}
          </div>

          {/* Input area */}
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid #0F1E30',
            background: '#060E1B',
          }}>
            {/* Ghost text hint */}
            {ghostText && (
              <div style={{
                padding: '0.3rem 1rem 0',
                fontSize: '0.65rem',
                color: '#1E3050',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}>
                <span style={{ padding: '0.05rem 0.3rem', border: '1px solid #1A2840', borderRadius: 3, color: '#2A4060', fontSize: '0.6rem' }}>Tab</span>
                <span style={{ color: '#2A4A6A' }}>{input}</span>
                <span style={{ color: '#22F0B5', opacity: 0.4 }}>{ghostText}</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1rem' }}>
              <span style={{ color: '#22F0B5', fontSize: '0.85rem', flexShrink: 0, lineHeight: 1 }}>›</span>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="ask anything..."
                  disabled={loading}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#C9D1E0',
                    fontSize: '0.82rem',
                    fontFamily: 'var(--font-mono)',
                    caretColor: '#22F0B5',
                    letterSpacing: '0.01em',
                  }}
                />
              </div>
              {input.trim() && !loading && (
                <button
                  onClick={() => void send(input)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#22F0B5',
                    cursor: 'pointer',
                    padding: '0.1rem',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: 0.7,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                </button>
              )}
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 1rem 0.45rem',
              fontSize: '0.6rem',
              color: '#1A2A40',
              fontFamily: 'var(--font-mono)',
            }}>
              <span>↑↓ history · Tab complete · Enter send</span>
              <span>{messages.filter(m => m.role === 'user').length} queries</span>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes termDot {
          0%, 100% { opacity: 0.2; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
    </>
  )
}
