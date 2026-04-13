import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPasswordResetEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Generate a recovery link via Supabase admin
    const { data: linkData, error: resetError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${appUrl}/api/auth/callback?next=/reset-password&type=recovery`,
      },
    })

    if (resetError) {
      console.error('Error generating reset link:', resetError)
      // Don't reveal if user exists or not for security
      return NextResponse.json({ success: true })
    }

    // Send branded password reset email via Resend
    if (linkData?.properties?.action_link) {
      const userName = (linkData.user?.user_metadata?.display_name as string) || email.split('@')[0] || 'User'
      await sendPasswordResetEmail(email, userName, linkData.properties.action_link)
    }

    // Always return success for security (don't leak user existence)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json({ success: true })
  }
}
