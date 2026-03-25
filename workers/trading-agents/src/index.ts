/**
 * ASE Trading Cron Worker — Cloudflare
 *
 * Runs on schedule and triggers the trading API endpoints.
 * Delegates all logic to the Next.js API routes, avoiding code duplication.
 *
 * Schedule:
 *  - Every 1 minute: /api/cron/run-agents (execute strategies)
 *  - Every 5 minutes: /api/cron/update-nav (update NAV + metrics)
 */

interface Env {
  NEXT_PUBLIC_APP_URL: string
  CRON_SECRET: string
}

interface ScheduledEvent {
  cron: string
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log(`⏰ Cron triggered: ${event.cron}`)

    const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'https://ase.pages.dev').replace(/\/$/, '')
    const cronSecret = env.CRON_SECRET || 'ase-dev-cron-2024'

    // Run agents every minute
    const runAgents = fetch(`${baseUrl}/api/cron/run-agents`, {
      method: 'POST',
      headers: { 'x-cron-secret': cronSecret },
    })
      .then(r => r.json())
      .then(d => {
        console.log('✅ Agents executed:', d?.total_trades, 'trades')
        return d
      })
      .catch(e => {
        console.error('❌ Agents failed:', e.message)
        return { error: e.message }
      })

    // Update NAV every 5 minutes
    const minuteOfHour = new Date().getMinutes()
    const updateNav =
      minuteOfHour % 5 === 0
        ? fetch(`${baseUrl}/api/cron/update-nav`, {
            method: 'POST',
            headers: { 'x-cron-secret': cronSecret },
          })
            .then(r => r.json())
            .then(d => {
              console.log('✅ NAV updated for', d?.agents_updated, 'agents')
              return d
            })
            .catch(e => {
              console.error('❌ NAV update failed:', e.message)
              return { error: e.message }
            })
        : Promise.resolve({ skipped: true, reason: 'Not a 5-minute mark' })

    // Wait for both to complete
    const [agentsResult, navResult] = await Promise.all([runAgents, updateNav])

    console.log('📊 Cron cycle complete at', new Date().toISOString())
    console.log('Results:', { agents: agentsResult, nav: navResult })

    ctx.waitUntil(
      Promise.resolve().then(() => {
        console.log('All cron tasks completed')
      })
    )
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    const baseUrl = (env.NEXT_PUBLIC_APP_URL || 'https://ase.pages.dev').replace(/\/$/, '')
    const cronSecret = env.CRON_SECRET || 'ase-dev-cron-2024'

    // Manual trigger via /run endpoint
    if (url.pathname === '/run') {
      const secret = request.headers.get('x-cron-secret')
      if (secret !== cronSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      try {
        const [agents, nav] = await Promise.all([
          fetch(`${baseUrl}/api/cron/run-agents`, {
            method: 'POST',
            headers: { 'x-cron-secret': cronSecret },
          }).then(r => r.json()),
          fetch(`${baseUrl}/api/cron/update-nav`, {
            method: 'POST',
            headers: { 'x-cron-secret': cronSecret },
          }).then(r => r.json()),
        ])

        return new Response(
          JSON.stringify({
            ok: true,
            message: 'Manual cron execution triggered',
            agents,
            nav,
            ran_at: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      } catch (e) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: e instanceof Error ? e.message : 'Unknown error',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }
    }

    // Health check
    return new Response(
      JSON.stringify({
        ok: true,
        message: 'ASE Trading Agents Worker is running',
        endpoints: {
          scheduled_cron: 'Runs every minute (run-agents) and every 5 minutes (update-nav)',
          manual_trigger: `POST ${url.origin}/run with header x-cron-secret`,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  },
}
