/**
 * Cloudflare Worker — high-frequency cron pinger.
 *
 * Vercel's Hobby plan caps cron at once/day. To keep agents trading every
 * 5 minutes, this Worker fires the same /api/cron/run-agents endpoint on
 * a Cloudflare schedule (which is free up to 1-minute resolution).
 *
 * Deploy: `cd workers && wrangler deploy --config wrangler.toml`
 *
 * Bindings (configured in workers/wrangler.toml):
 *   - APP_URL    — e.g. https://launchase.com (the deployed Next.js URL)
 *   - CRON_SECRET — sent as x-cron-secret so the route can verify the call
 */

export interface Env {
  APP_URL: string
  CRON_SECRET?: string
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const tasks: Array<{ path: string; cron: string }> = [
      { path: '/api/cron/run-agents', cron: '*/5 * * * *'  },
      { path: '/api/cron/update-nav',  cron: '*/10 * * * *' },
      { path: '/api/cron/heal-agents', cron: '*/15 * * * *' },
    ]
    const cron = event.cron
    const due  = tasks.find(t => t.cron === cron) ?? tasks[0]
    const url  = `${env.APP_URL}${due.path}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (env.CRON_SECRET) headers['x-cron-secret'] = env.CRON_SECRET

    ctx.waitUntil((async () => {
      try {
        const r = await fetch(url, { method: 'POST', headers })
        const text = await r.text()
        console.log(`[cron] ${cron} → ${due.path}: ${r.status} ${text.slice(0, 200)}`)
      } catch (e) {
        console.error(`[cron] ${cron} → ${due.path} failed:`, e)
      }
    })())
  },

  // Manual trigger for debugging — POST to the worker URL with ?path=<...>
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const path = url.searchParams.get('path') ?? '/api/cron/run-agents'
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (env.CRON_SECRET) headers['x-cron-secret'] = env.CRON_SECRET
    const r = await fetch(`${env.APP_URL}${path}`, { method: 'POST', headers })
    const text = await r.text()
    return new Response(`status=${r.status}\n\n${text}`, {
      headers: { 'Content-Type': 'text/plain' },
    })
  },
}
