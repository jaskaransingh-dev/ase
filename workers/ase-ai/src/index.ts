export interface Env {
  AI: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      })
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 })
    }

    try {
      const body = await request.json()
      const { messages, stream, max_tokens } = body as { messages?: Array<{role: string; content: string}>; stream?: boolean; max_tokens?: number }

      if (!messages || !messages.length) {
        return Response.json({ content: "No messages provided" }, { status: 400 })
      }

      // Default to a generous output budget — the small model is cheap and our
      // callers (agent compile, AI chat) routinely produce 1-2KB responses.
      // The 256-token default truncates JSON specs mid-string.
      const outputTokens = typeof max_tokens === "number" && max_tokens > 0 ? max_tokens : 2048

      const response = await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct",
        {
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          max_tokens: outputTokens,
        }
      )

      return Response.json({
        content: response.response,
      })
    } catch (error) {
      return Response.json(
        { content: `Error: ${error instanceof Error ? error.message : String(error)}` },
        { status: 500 }
      )
    }
  },
};