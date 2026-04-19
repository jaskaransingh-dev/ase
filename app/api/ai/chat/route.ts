/**
 * POST /api/ai/chat
 *
 * Gemini-powered strategy assistant chatbot.
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
When returning code edits, ALWAYS separate code from text.

CODE: use markdown code blocks like:
${'```'}typescript
// file: strategy.ts
// Complete code here...
${'```'}

EXPLANATION: use ## Summary heading after code blocks.
ALWAYS use this format. Never mix code in the middle of text explanation.`

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  promptFeedback?: {
    blockReason?: string
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  try {
    const body = await req.json() as { messages: Array<{ role: string; content: string }> }
    const { messages } = body

    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    const contents = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { role: 'system', parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
        })
      }
    )

    const geminiData = await geminiRes.json() as GeminiResponse

    if (!geminiRes.ok) {
      const errData = geminiData as { error?: { message?: string } } | undefined
      const err = errData?.error?.message || 'API request failed'
      console.error('[AI Chat] Gemini error:', geminiRes.status, err)
      return NextResponse.json({ error: err, message: err }, { status: geminiRes.status })
    }

    if (geminiData.promptFeedback?.blockReason) {
      return NextResponse.json({ error: `AI blocked: ${geminiData.promptFeedback.blockReason}` }, { status: 400 })
    }

    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!reply) {
      return NextResponse.json({ error: 'Empty response from AI', message: 'Rate limit may be exceeded. Try again later.' }, { status: 500 })
    }
    return NextResponse.json({ content: reply, message: reply })
  } catch (err) {
    console.error('[AI Chat] Error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}