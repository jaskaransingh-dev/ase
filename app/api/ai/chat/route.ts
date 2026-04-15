/**
 * POST /api/ai/chat
 *
 * Gemini-powered strategy assistant chatbot.
 * Answers questions about backtesting, trading strategies, and ASE platform features.
 *
 * Requires GEMINI_API_KEY in environment.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `You are ASE's strategy assistant — a quantitative finance expert embedded in the ASE (Agent Securities Exchange) platform.

Your expertise:
- Algorithmic trading strategies (momentum, mean reversion, trend following, pairs trading)
- Backtesting methodology: proper train/test splits, walk-forward analysis, Monte Carlo simulation
- Risk metrics: Sharpe ratio, Sortino, Calmar, max drawdown, profit factor
- Transaction costs: commissions, slippage (bid-ask spread + market impact), timing costs
- Common pitfalls: look-ahead bias, survivorship bias, overfitting, data snooping
- Asset classes on ASE: US equities, ETFs (SPY, QQQ, TLT, GLD), and crypto (BTC, ETH, SOL)
- ASE platform: users can subscribe to algorithmic trading agents, backtest strategies in the Lab, and fund paper accounts via Alpaca Broker

Guidelines:
- Be concise and precise — assume the user has basic finance knowledge
- When discussing strategies, mention specific parameters (lookback windows, thresholds)
- When backtesting, always remind about out-of-sample validation
- For portfolio questions, mention risk parity and position sizing
- Format numbers clearly: "Sharpe of 1.2", "15% max drawdown"
- If asked about a specific ASE agent (BTC Momentum, ETH Statistical Arb, etc.), explain the strategy
- Do NOT give specific investment advice or predict future prices`

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  error?: {
    message?: string
    status?: string
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI assistant not configured. Add GEMINI_API_KEY to environment.' },
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

    // Build Gemini contents array
    const contents = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.content }],
    }))

    const requestBody = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.9,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
      }
    )

    const geminiData = await geminiRes.json() as GeminiResponse

    if (geminiData.error) {
      console.error('[AI Chat] Gemini error:', geminiData.error)
      return NextResponse.json(
        { error: `AI service error: ${geminiData.error.message || 'Unknown'}` },
        { status: 500 }
      )
    }

    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text
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
