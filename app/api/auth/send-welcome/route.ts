import { NextResponse } from 'next/server'
import { sendWelcomeEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { email, name } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    await sendWelcomeEmail(email, name || 'Trader')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to send welcome email:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
