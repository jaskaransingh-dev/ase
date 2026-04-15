export default {
  async scheduled(event: unknown, env: Env, ctx: unknown): Promise<void> {
    const url = env.PAGES_FUNCTION_URL
    const secret = env.CRON_SECRET

    console.log(`[ase-cron] Running at ${new Date().toISOString()}`)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': secret,
        },
      })

      const result = await response.json()
      console.log(`[ase-cron] Response:`, result)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`)
      }

      console.log(`[ase-cron] Success: ${result.agents_run} agents ran, ${result.total_trades} trades`)
    } catch (error) {
      console.error(`[ase-cron] Error:`, error)
      throw error
    }
  },
}

interface Env {
  PAGES_FUNCTION_URL: string
  CRON_SECRET: string
}