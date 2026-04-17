/**
 * POST /api/ai/chat
 *
 * Groq-powered strategy assistant chatbot.
 * Answers questions about backtesting, trading strategies, and ASE platform features.
 */

import { NextRequest, NextResponse } from 'next/server'
import { buildAIContext } from '@/lib/quant-docs'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `You are ASE's terminal-based strategy assistant — a quantitative finance expert embedded in the ASE (Agent Securities Exchange) platform.

Your expertise covers everything in the ASE Quant Library:

${buildAIContext()}

PLATFORM CONTEXT:
- ASE has 10 production strategies: Mean Reversion, Momentum Crossover, Breakout Trend, RSI Trend Filter, Volatility Breakout, Dual Momentum, Pairs Mean Reversion, Factor Rotation, RSI Mean Reversion, MACD Trend
- All data sources are free and require no API keys: Binance (crypto), Yahoo Finance (equities), CoinGecko (crypto fundamentals), Kraken (crypto), Stooq (equities/indices), FRED (macro data)
- Strategy signals: +1 = long, -1 = short, 0 = flat. The generate_signals(df) method takes a pandas DataFrame with open/high/low/close/volume columns
- Backtesting stats: Sharpe, Sortino, Calmar, Max DD, Win Rate, Profit Factor, CAGR, Exposure%, Turnover, Rolling Sharpe
- CSV Data: Users can upload historical OHLCV data (date, open, high, low, close, volume) in CSV format for custom backtests
- Scorecard Metrics: Performance (30%), Risk (25%), Robustness (30%), Execution (15%) — composite score 0-100
- Advanced Analysis: Monte Carlo simulation (robustness test), Walk-Forward analysis (out-of-sample validation), Drawdown analysis, Monthly returns heatmap

RESPONSE STYLE:
- You are a terminal assistant — be concise, technical, and precise
- Skip filler phrases like "Great question!" or "Certainly!"
- Use specific numbers: "Sharpe of 1.4", "20% max drawdown", "EMA(12,26)"
- Always mention out-of-sample validation when discussing backtesting
- When asked about risk, mention both the metric and its interpretation range
- Do NOT give specific investment advice or predict future prices
- When users ask about CSV data: explain date format (YYYY-MM-DD), required columns (date, open, high, low, close, volume), and expected file size
- Recommend Walk-Forward analysis for real-world testing and Monte Carlo for robustness validation
- Reference the Scorecard when discussing strategy quality — remind users of minimum thresholds (Composite ≥60, Sharpe ≥0.5, Max DD <50%)

CRITICAL CODE RESPONSE FORMAT:
When returning Python code, use this EXACT marker format:
___CODE_START___
# Complete Python code here
___CODE_END___

Code rules:
1. Complete and working — no partial snippets
2. Import pandas as pd and numpy as np
3. Class with generate_signals(df) method that adds a 'signal' column (+1/-1/0)
4. Use Wilder smoothing (ewm com=period-1) for RSI/ATR, not simple rolling mean
5. Forward-fill positions between signals: df['signal'].replace(0, np.nan).ffill().fillna(0)`

interface GroqResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

export async function POST(req: NextRequest) {
  const apiKey = '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'
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI assistant not configured.' },
      { status: 503 }
    )
  }

  try {
    const body = await req.json() as {
      messages: Array<{ role: 'user' | 'model'; content: string }>
    }

    const { messages } = body
    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    const groqRes = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages
          ],
          temperature: 0.7,
          max_completion_tokens: 1024,
        }),
        signal: AbortSignal.timeout(30000),
      }
    )

    const groqData = await groqRes.json() as GroqResponse

    if (groqData.error) {
      console.error('[AI Chat] Groq error:', groqData.error)
      return NextResponse.json(
        { error: `AI service error: ${groqData.error.message || 'Unknown'}` },
        { status: 500 }
      )
    }

    const reply = groqData.choices?.[0]?.message?.content
    if (!reply) {
      return NextResponse.json({ error: 'Empty response from AI' }, { status: 500 })
    }

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[AI Chat] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate response' },
      { status: 500 }
    )
  }
}
