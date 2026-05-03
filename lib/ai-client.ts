/**
 * OpenRouter client — drop-in replacement for the CF Workers AI binding.
 * Uses OPEN_ROUTER_API_KEY from env. Falls back to the CF worker if missing.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const CF_WORKER_URL = process.env.CF_AI_WORKER_URL || 'https://ase-ai.jazing14.workers.dev'

// Model to use — override via OPEN_ROUTER_MODEL env var
const MODEL = process.env.OPEN_ROUTER_MODEL || 'google/gemini-2.0-flash-001'

export interface Message {
  role: string
  content: string
}

export async function callAI(
  messages: Message[],
  maxTokens = 2048,
): Promise<string> {
  const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim()

  if (apiKey) {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://www.launchase.com',
        'X-Title': 'ASE',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: maxTokens,
      }),
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`)
    }

    const data = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    return data.choices?.[0]?.message?.content ?? ''
  }

  // Fallback: CF worker (no key)
  const res = await fetch(CF_WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: maxTokens }),
  })
  if (!res.ok) throw new Error(`CF Worker ${res.status}`)
  const data = await res.json() as { content?: string }
  return data.content ?? ''
}
