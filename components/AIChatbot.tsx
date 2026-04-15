'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'model'
  content: string
}

const QUICK_PROMPTS = [
  'What is Sharpe ratio?',
  'How does slippage affect backtests?',
  'Explain dual momentum',
  'What is walk-forward analysis?',
  'How to reduce overfitting?',
]

function formatReply(text: string) {
  // Basic markdown-to-jsx: bold, inline code
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return (
      <p key={i} style={{ margin: '0.3rem 0', lineHeight: 1.55 }}>
        {parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={j} style={{ background: 'rgba(255,255,255,0.08)', padding: '0.1em 0.3em', borderRadius: 4, fontSize: '0.85em', fontFamily: 'var(--font-mono)' }}>{part.slice(1, -1)}</code>
          }
          return part
        })}
      </p>
    )
  })
}

export default function AIChatbot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [unavailable, setUnavailable] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [open, messages.length])

  const send = async (text: string) => {
    if (!text.trim() || loading) return
    setError('')

    const newMessages: Message[] = [...messages, { role: 'user', content: text.trim() }]
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
        if (res.status === 503) {
          setUnavailable(true)
          setError(data.error ?? 'AI unavailable')
        } else {
          setError(data.error ?? 'Failed to get response')
        }
        setLoading(false)
        return
      }

      setMessages(prev => [...prev, { role: 'model', content: data.reply ?? '' }])
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 300,
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: open ? 'var(--blue)' : 'var(--bg2)',
          color: 'var(--white)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          transition: 'all 0.2s',
        }}
        title="Strategy Assistant"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: '5rem',
          right: '1.5rem',
          zIndex: 300,
          width: 380,
          maxWidth: 'calc(100vw - 3rem)',
          maxHeight: 520,
          background: 'var(--bg1)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg2)' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(59,127,255,0.2)', border: '1px solid rgba(59,127,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Strategy Assistant</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Powered by Gemini</div>
            </div>
            {unavailable && (
              <div style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--yellow)', background: 'rgba(255,200,0,0.1)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: 6, padding: '0.15rem 0.5rem' }}>
                Setup needed
              </div>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {messages.length === 0 && (
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem', textAlign: 'center' }}>
                  Ask me about strategies, backtesting, risk metrics, or any ASE feature.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {QUICK_PROMPTS.map(p => (
                    <button key={p} onClick={() => send(p)} style={{ padding: '0.3rem 0.65rem', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--muted)', fontSize: '0.68rem', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; e.currentTarget.style.color = 'var(--blue)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? 'var(--blue)' : 'var(--bg2)',
                  border: msg.role === 'model' ? '1px solid var(--border)' : 'none',
                  fontSize: '0.8rem',
                  color: 'var(--white)',
                  lineHeight: 1.5,
                }}>
                  {msg.role === 'model' ? formatReply(msg.content) : msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--faint)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                <span style={{ display: 'flex', gap: '3px' }}>
                  {[0,1,2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--blue)', opacity: 0.6, animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
                </span>
                Thinking…
              </div>
            )}

            {error && !unavailable && (
              <div style={{ fontSize: '0.72rem', color: '#FF5A5F', padding: '0.5rem 0.75rem', background: 'rgba(255,90,95,0.1)', borderRadius: 8 }}>{error}</div>
            )}

            {unavailable && (
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', padding: '0.75rem', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                Add <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72em', background: 'rgba(255,255,255,0.08)', padding: '0.1em 0.3em', borderRadius: 4 }}>GEMINI_API_KEY</code> to your <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72em', background: 'rgba(255,255,255,0.08)', padding: '0.1em 0.3em', borderRadius: 4 }}>.env.local</code> to enable the AI assistant.
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {!unavailable && (
            <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }}
                placeholder="Ask about strategies, risk, backtest…"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.8rem',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg2)',
                  color: 'var(--white)',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
              />
              <button onClick={() => send(input)} disabled={loading || !input.trim()} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: input.trim() && !loading ? 'var(--blue)' : 'var(--bg3)', color: 'var(--white)', cursor: input.trim() && !loading ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </>
  )
}
