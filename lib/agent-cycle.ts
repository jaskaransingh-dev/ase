import { NextRequest } from 'next/server'
import { POST as runAgentsPost } from '@/app/api/cron/run-agents/route'

export async function triggerImmediateAgentRun(sourceReq: NextRequest, agentId: string) {
  try {
    const headers = new Headers()
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret) headers.set('x-cron-secret', cronSecret)
    headers.set('content-type', 'application/json')

    const runReq = new NextRequest(new URL('/api/cron/run-agents', sourceReq.url), {
      method: 'POST',
      headers,
      body: JSON.stringify({ agent_id: agentId }),
    })

    await runAgentsPost(runReq)
  } catch (error) {
    console.warn('Immediate agent run failed:', error)
  }
}
