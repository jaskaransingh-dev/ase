'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2, Play, Save, Zap, ChevronRight } from 'lucide-react'

const STRATEGY_CODE = {
  momentum: `"""
Momentum Strategy
Fast EMA crosses slow EMA
"""
import pandas as pd
import numpy as np

class MomentumStrategy:
    def __init__(self, fast=5, slow=15):
        self.fast = fast
        self.slow = slow
        
    def generate_signals(self, df):
        df['fast_ema'] = df['close'].ewm(span=self.fast).mean()
        df['slow_ema'] = df['close'].ewm(span=self.slow).mean()
        
        # Golden cross = buy, Death cross = sell
        golden = (df['fast_ema'] > df['slow_ema']) & (df['fast_ema'].shift(1) <= df['slow_ema'].shift(1))
        death = (df['fast_ema'] < df['slow_ema']) & (df['fast_ema'].shift(1) >= df['slow_ema'].shift(1))
        
        df['signal'] = 0
        df.loc[golden, 'signal'] = 1  # BUY
        df.loc[death, 'signal'] = -1  # SELL
        return df`,
  
  mean_reversion: `"""
Mean Reversion Strategy
RSI + Bollinger Bands
"""
import pandas as pd

class MeanReversionStrategy:
    def __init__(self, rsi_p=7, bb_p=20):
        self.rsi_p = rsi_p
        self.bb_p = bb_p
        
    def generate_signals(self, df):
        # RSI
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0).rolling(self.rsi_p).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(self.rsi_p).mean()
        df['rsi'] = 100 - (100 / (1 + gain/loss))
        
        # Bollinger Bands
        sma = df['close'].rolling(self.bb_p).mean()
        std = df['close'].rolling(self.bb_p).std()
        df['bb_upper'] = sma + 2 * std
        df['bb_lower'] = sma - 2 * std
        
        # Buy when oversold, sell when overbought
        df['signal'] = 0
        df.loc[df['rsi'] < 30, 'signal'] = 1  # BUY
        df.loc[df['rsi'] > 70, 'signal'] = -1  # SELL
        return df`,
  
  rsi: `"""
RSI Oscillator Strategy
Buy oversold, sell overbought
"""
import pandas as pd

class RSIStrategy:
    def __init__(self, period=7, oversold=30, overbought=70):
        self.period = period
        self.oversold = oversold
        self.overbought = overbought
        
    def generate_signals(self, df):
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0).rolling(self.period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(self.period).mean()
        df['rsi'] = 100 - (100 / (1 + gain/loss))
        
        df['signal'] = 0
        df.loc[df['rsi'] < self.oversold, 'signal'] = 1
        df.loc[df['rsi'] > self.overbought, 'signal'] = -1
        return df`,
  
  breakout: `"""
Breakout Strategy
Volatility squeeze + ATR stops
"""
import pandas as pd
import numpy as np

class BreakoutStrategy:
    def __init__(self, lookback=10, atr_p=14):
        self.lookback = lookback
        self.atr_p = atr_p
        
    def generate_signals(self, df):
        # Rolling high/low
        df['roll_high'] = df['high'].rolling(self.lookback).max()
        df['roll_low'] = df['low'].rolling(self.lookback).min()
        
        # True Range for ATR
        high_low = df['high'] - df['low']
        tr = pd.concat([high_low, np.abs(df['high'] - df['close'].shift()), np.abs(df['low'] - df['close'].shift())], axis=1).max(axis=1)
        df['atr'] = tr.rolling(self.atr_p).mean()
        
        # Breakout signals
        df['signal'] = 0
        df.loc[df['close'] > df['roll_high'], 'signal'] = 1
        df.loc[df['close'] < (df['roll_low'] - df['atr']), 'signal'] = -1
        return df`,
}

const STRATEGIES = [
  { id: 'momentum', label: 'Momentum', desc: 'Fast/slow EMA crossover', icon: '↗' },
  { id: 'mean_reversion', label: 'Mean Reversion', desc: 'RSI + Bollinger Bands', icon: '↔' },
  { id: 'rsi', label: 'RSI Oscillator', desc: 'Buy oversold, sell overbought', icon: '⚡' },
  { id: 'breakout', label: 'Breakout', desc: 'Volatility squeeze + ATR', icon: '💥' },
]

const QUICK_PROMPTS = [
  "Optimize the RSI thresholds",
  "Add stop-loss logic",
  "Reduce trade frequency",
  "Improve risk management",
]

async function askGemini(question: string, code: string): Promise<string> {
  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ 
          role: 'user', 
          content: `You are a trading strategy expert. Help me improve this Python code for a crypto trading strategy.\n\nCurrent code:\n${code}\n\nRequest: ${question}\n\nRespond with improved code and brief explanation.` 
        }]
      })
    })
    const data = await res.json()
    return data.reply || data.error || 'AI unavailable'
  } catch { return 'AI unavailable' }
}

export default function BuildPage() {
  const router = useRouter()
  const codeRef = useRef<HTMLTextAreaElement>(null)
  
  const [strategy, setStrategy] = useState('momentum')
  const [code, setCode] = useState(STRATEGY_CODE.momentum)
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiHistory, setAiHistory] = useState<Array<{ q: string; a: string; code?: string }>>([])
  
  useEffect(() => { setCode(STRATEGY_CODE[strategy as keyof typeof STRATEGY_CODE] || STRATEGY_CODE.momentum) }, [strategy])

  const handleAiAsk = async () => {
    if (!aiQuestion.trim()) return
    setAiLoading(true)
    const response = await askGemini(aiQuestion, code)
    
    // Try to extract code from response
    let extractedCode = code
    const codeMatch = response.match(/```python\n([\s\S]*?)```/)
    if (codeMatch) {
      extractedCode = codeMatch[1]
    }
    
    setAiHistory([...aiHistory, { q: aiQuestion, a: response, code: extractedCode !== code ? extractedCode : undefined }])
    if (extractedCode !== code) setCode(extractedCode)
    setAiQuestion('')
    setAiLoading(false)
  }

  const applyQuickPrompt = async (prompt: string) => {
    setAiQuestion(prompt)
    setAiLoading(true)
    const response = await askGemini(prompt, code)
    
    let extractedCode = code
    const codeMatch = response.match(/```python\n([\s\S]*?)```/)
    if (codeMatch) {
      extractedCode = codeMatch[1]
      setCode(extractedCode)
    }
    
    setAiHistory([...aiHistory, { q: prompt, a: response, code: extractedCode !== code ? extractedCode : undefined }])
    setAiLoading(false)
  }

  const colors = {
    bg: '#07111F', bg2: '#0B1728', bg3: '#101A2D', bg4: '#142038',
    border: '#21314D', border2: '#3B5D94',
    blue: '#5B8CFF', blue2: '#78A2FF',
    mint: '#19E6A7', red: '#FF6B7A', orange: '#FFB648',
    text: '#B5C1D6', muted: '#7F8CA3', faint: '#5E6A7E',
    white: '#F5F7FB'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', background: colors.bg, color: colors.text }}>
      
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: `1px solid ${colors.border}`, background: colors.bg2 }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: colors.white, margin: 0 }}>Build Agent</h1>
          <p style={{ fontSize: '.7rem', color: colors.muted, margin: '4px 0 0' }}>Write strategy code with AI assistance</p>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <button style={{ padding: '.45rem .85rem', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.muted, fontSize: '.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Save size={14} />Save Draft
          </button>
          <button onClick={() => router.push(`/dashboard/backtest?strategy=${strategy}&code=${encodeURIComponent(code)}`)} style={{ padding: '.45rem 1rem', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #19E6A7, #10b981)', color: '#07111F', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Play size={14} />Run Backtest<ChevronRight size={14} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Left - Strategy Selector */}
        <div style={{ width: 220, borderRight: `1px solid ${colors.border}`, background: colors.bg2, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem', borderBottom: `1px solid ${colors.border}` }}>
            <h3 style={{ fontSize: '.5rem', color: colors.faint, fontWeight: 600, letterSpacing: '.1em', marginBottom: '.6rem' }}>STRATEGY</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              {STRATEGIES.map(s => (
                <button key={s.id} onClick={() => setStrategy(s.id)} style={{ padding: '.6rem', borderRadius: 8, border: `1px solid ${strategy === s.id ? colors.mint : colors.border}`, background: strategy === s.id ? 'rgba(25,230,167,.08)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: '.7rem', fontWeight: 600, color: strategy === s.id ? colors.mint : colors.text }}>{s.icon} {s.label}</span>
                  <p style={{ fontSize: '.5rem', color: colors.muted, marginTop: 2 }}>{s.desc}</p>
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ padding: '1rem', flex: 1 }}>
            <h3 style={{ fontSize: '.5rem', color: colors.faint, fontWeight: 600, letterSpacing: '.1em', marginBottom: '.6rem' }}>QUICK ACTIONS</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              {QUICK_PROMPTS.map(prompt => (
                <button key={prompt} onClick={() => applyQuickPrompt(prompt)} disabled={aiLoading} style={{ padding: '.45rem .6rem', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.muted, fontSize: '.55rem', cursor: 'pointer', textAlign: 'left' }}>
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center - Code Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: colors.bg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.5rem .8rem', borderBottom: `1px solid ${colors.border}`, background: colors.bg3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <span style={{ fontSize: '.6rem', color: colors.muted }}>strategy.py</span>
              <span style={{ fontSize: '.4rem', color: colors.mint, background: 'rgba(25,230,167,.1)', padding: '2px 5px', borderRadius: 3 }}>PYTHON</span>
            </div>
            <div style={{ display: 'flex', gap: '.4rem' }}>
              <button onClick={() => setCode(STRATEGY_CODE[strategy as keyof typeof STRATEGY_CODE])} style={{ fontSize: '.5rem', color: colors.muted, background: 'transparent', border: 'none', cursor: 'pointer' }}>Reset</button>
            </div>
          </div>
          <textarea 
            ref={codeRef}
            value={code} 
            onChange={e => setCode(e.target.value)} 
            spellCheck={false}
            style={{ flex: 1, padding: '.8rem', background: colors.bg, color: colors.text, fontFamily: 'var(--font-mono)', fontSize: '.6rem', lineHeight: 1.6, border: 'none', outline: 'none', resize: 'none' }} 
          />
        </div>

        {/* Right - AI Panel */}
        <div style={{ width: 340, borderLeft: `1px solid ${colors.border}`, background: colors.bg2, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '.8rem', borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <Zap size={16} style={{ color: colors.orange }} />
            <span style={{ fontSize: '.7rem', fontWeight: 600, color: colors.white }}>AI Assistant</span>
            <span style={{ fontSize: '.45rem', color: colors.muted, background: colors.bg3, padding: '2px 6px', borderRadius: 4 }}>GEMINI</span>
          </div>
          
          {/* Chat History */}
          <div style={{ flex: 1, overflow: 'auto', padding: '.8rem', display: 'flex', flexDirection: 'column', gap: '.8rem' }}>
            {aiHistory.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: colors.faint, fontSize: '.6rem' }}>
                <Zap size={32} style={{ opacity: 0.3, marginBottom: '.5rem' }} />
                <p>Ask me about your strategy</p>
                <p>I can help optimize parameters, add risk management, or fix bugs</p>
              </div>
            )}
            {aiHistory.map((item, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                <div style={{ padding: '.5rem .6rem', background: colors.bg3, borderRadius: 8, border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: '.5rem', color: colors.blue, marginBottom: '.2rem' }}>YOU</div>
                  <div style={{ fontSize: '.6rem', color: colors.text }}>{item.q}</div>
                </div>
                <div style={{ padding: '.6rem .7rem', background: colors.bg, borderRadius: 8, border: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: '.5rem', color: colors.mint, marginBottom: '.3rem' }}>AI</div>
                  <div style={{ fontSize: '.55rem', color: colors.muted, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{item.a}</div>
                  {item.code && (
                    <button onClick={() => setCode(item.code!)} style={{ marginTop: '.5rem', padding: '.25rem .5rem', borderRadius: 4, border: `1px solid ${colors.mint}`, background: 'rgba(25,230,167,.1)', color: colors.mint, fontSize: '.5rem', cursor: 'pointer' }}>
                      Apply Code
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Input */}
          <div style={{ padding: '.8rem', borderTop: `1px solid ${colors.border}`, background: colors.bg3 }}>
            <div style={{ display: 'flex', gap: '.4rem' }}>
              <input 
                value={aiQuestion} 
                onChange={e => setAiQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAiAsk()}
                placeholder="Ask about your strategy..." 
                style={{ flex: 1, padding: '.5rem', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: '.6rem' }}
              />
              <button onClick={handleAiAsk} disabled={aiLoading || !aiQuestion.trim()} style={{ padding: '.5rem', borderRadius: 6, border: 'none', background: aiLoading ? colors.border : colors.blue, color: '#fff', cursor: aiLoading ? 'not-allowed' : 'pointer' }}>
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}