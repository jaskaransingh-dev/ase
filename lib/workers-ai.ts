const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "12ba092394bed6dc56f9ef901c637f0a";
const CF_API_TOKEN = process.env.CF_API_TOKEN;

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

export async function callWorkersAI(
  messages: Array<{role: string; content: string}>,
  options: { stream?: boolean; maxTokens?: number; temperature?: number } = {}
) {
  if (!CF_API_TOKEN) {
    throw new Error("CF_API_TOKEN not configured");
  }

  const { stream = false, maxTokens = 3000, temperature = 0.4 } = options;

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        stream,
        max_tokens: maxTokens,
        temperature,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Workers AI error: ${response.status} - ${error.slice(0, 200)}`);
  }

  return response.json();
}