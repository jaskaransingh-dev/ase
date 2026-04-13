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

    // Generate a signup link via Supabase admin
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'signup',
      email: email,
      password: 'temp_password_FOR_VERIFICATION_ONLY_' + Date.now(),
      options: {
        redirectTo: `${appUrl}/dashboard`,
      },
    })

    if (linkError) {
      console.error('Error generating verification link:', linkError)
      return NextResponse.json({ success: true })
    }

    // Send verification email with the generated link
    if (linkData?.properties?.action_link) {
      const userName = email.split('@')[0] || 'User'
      await sendVerificationEmail(email, userName, linkData.properties.action_link)
    }

    // Always return success for security (don't leak user existence)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Resend verification error:', error)
    return NextResponse.json({ success: true })
  }
}