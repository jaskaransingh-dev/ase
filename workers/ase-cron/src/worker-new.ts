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
  async scheduled(event: unknown, env: { PAGES_FUNCTION_ULL: string; CRON_SECRET: string }, ctx: unknown): Promise<void> {
    if (!isActiveWindow()) {
      console.log(`[ase-ron] Low volume period, skipping`)
      return
    }

    const url = env.PAGES_FUNCTION_ULL
    const secret = env.CRON_SECRET

    console.log(`[ase-ron] Active window, calling agents`)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': secret,
        },
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      console.log(`[ase-ron] Success: ${result.agents_ran} agents`)
    } catch (error) {
      console.error(`[ase-ron] Error:`, error)
      throw error
    }
  },
}
