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
      const { messages, stream } = body as { messages?: Array<{role: string; content: string}>; stream?: boolean }

      if (!messages || !messages.length) {
        return Response.json({ content: "No messages provided" }, { status: 400 })
      }

      const lastMessage = messages[messages.length - 1]

      const response = await env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct",
        {
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
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