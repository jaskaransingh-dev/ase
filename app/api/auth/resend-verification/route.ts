import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendVerificationEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Get user
    const { data: users, error: listError } = await admin.auth.admin.listUsers()

    if (listError || !users) {
      console.error('Error listing users:', listError)
      return NextResponse.json({ success: true })
    }

    const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())

    if (!user) {
      // Don't reveal if user exists for security
      return NextResponse.json({ success: true })
    }

    // Send verification email
    const userName = (user.user_metadata?.display_name as string) || user.email || 'User'
    const verificationLink = `${appUrl}/auth/verify-email`

    await sendVerificationEmail(email, userName, verificationLink)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Resend verification error:', error)
    return NextResponse.json({ success: true })
  }
}
