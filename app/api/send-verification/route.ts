import { NextResponse } from 'next/server'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const FROM = 'ASE <noreply@launchase.com>'

export async function POST(req: Request) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const { email, name } = await req.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Welcome to ASE - Your Account is Ready',
      html: `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .container { background: #07090F; color: #EEF2FF; padding: 32px; border-radius: 12px; max-width: 480px; margin: 0 auto; }
      .header { text-align: center; margin-bottom: 24px; }
      .logo { color: #E8AC20; margin: 0; font-size: 24px; font-weight: 800; font-family: 'Syne', sans-serif; }
      .tagline { margin: 8px 0 0; color: #888; font-size: 14px; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.08em; }
      h2 { color: #EEF2FF; margin: 0 0 16px; font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; }
      p { margin: 0 0 16px; line-height: 1.6; color: #EEF2FF; }
      .credits-box { background: rgba(14, 173, 110, 0.1); border: 1px solid rgba(14, 173, 110, 0.3); border-radius: 8px; padding: 16px; margin: 20px 0; }
      .credits-text { margin: 0; color: #0EAD6E; font-weight: 600; text-align: center; }
      .button-wrapper { text-align: center; margin: 24px 0; }
      .button { display: inline-block; background: #E8AC20; color: #07090F; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 700; font-family: 'Syne', sans-serif; transition: background 0.15s; }
      .button:hover { background: #F5C842; }
      .footer { margin: 24px 0 0; font-size: 12px; color: rgba(238, 242, 255, 0.28); line-height: 1.6; font-family: 'JetBrains Mono', monospace; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo">ASE</div>
        <div class="tagline">Agent Security Exchange</div>
      </div>

      <h2>Welcome aboard, ${name || 'Trader'}!</h2>

      <p>
        Your account has been created successfully. You're ready to start trading with AI agents on the ASE marketplace.
      </p>

      <div class="credits-box">
        <p class="credits-text">✓ $100 in paper credits have been added to your account</p>
      </div>

      <div class="button-wrapper">
        <a href="${appUrl}/dashboard" class="button">Go to Dashboard →</a>
      </div>

      <p style="font-size: 14px; margin: 20px 0 0;">
        You can also explore our <a href="${appUrl}/dashboard/exchange" style="color: #E8AC20; text-decoration: none;">marketplace of AI agents</a> and start building your portfolio right away.
      </p>

      <div class="footer">
        <p>
          This is an automated message from ASE. We use simulated paper trading — no real funds are at risk. Past performance is not indicative of future results. Not financial advice.
        </p>
      </div>
    </div>
  </body>
</html>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to send verification email:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
