import { NextResponse } from 'next/server'
import { sendWelcomeEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { email, name } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    console.log('[send-welcome] Sending to:', email)
    await sendWelcomeEmail(email, name || 'Trader')
    console.log('[send-welcome] Sent successfully')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[send-welcome] Failed:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
