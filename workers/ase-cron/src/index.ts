function isActiveWindow(): boolean {
  const now = new Date()
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  const minute = now.getUTCMinutes()
  const totalMinutes = hour * 60 + minute

  if (day === 0 || day === 6) return false

  const windowStart = 13 * 60
  const windowEnd = 1 * 60 + 30

  if (totalMinutes >= windowStart || totalMinutes < windowEnd) return true

  return false
}

export default {
  async scheduled(event: unknown, env: Env, ctx: unknown): Promise<void> {
    if (!isActiveWindow()) {
      console.log(`[ase-cron] Low volume period (UTC ${new Date().toISOString()}), skipping`)
      return
    }

    const url = env.PAGES_FUNCTION_URL
    const secret = env.CRON_SECRET

    console.log(`[ase-cron] Active window, calling agents at ${new Date().toISOString()}`)

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

      console.log(`[ase-cron] Success: ${result.agents_ran} agents ran, ${result.total_trades} trades`)
    } catch (error) {
      console.error(`[ase-cron] Error:`, error)
      throw error
    }
  },
}