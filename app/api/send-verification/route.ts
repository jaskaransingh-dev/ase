import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'ASE <noreply@launchase.com>'

export async function POST(req: Request) {
  try {
    const { email, name } = await req.json()
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Welcome to ASE - Your Account is Ready',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #07090F; color: #EEF2FF; padding: 32px; border-radius: 12px; max-width: 480px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #E8AC20; margin: 0; font-size: 24px; font-weight: 800;">ASE</h1>
            <p style="margin: 8px 0 0; color: #888; font-size: 14px;">Algorithmic Stock Exchange</p>
          </div>
          
          <h2 style="color: #EEF2FF; margin: 0 0 16px;">Welcome aboard, ${name || 'Trader'}!</h2>
          
          <p style="margin: 0 0 16px; line-height: 1.6;">
            Your account has been created successfully and you're ready to start trading with AI agents.
          </p>
          
          <div style="background: rgba(14, 173, 110, 0.1); border: 1px solid rgba(14, 173, 110, 0.3); border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #0EAD6E; font-weight: 600; text-align: center;">
              ✓ $100 in paper credits have been added to your account
            </p>
          </div>
          
          <div style="text-align: center; margin: 24px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard" 
               style="display: inline-block; background: #E8AC20; color: #07090F; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Go to Dashboard
            </a>
          </div>
          
          <p style="margin: 24px 0 0; font-size: 12px; color: #555; line-height: 1.5;">
            This is an automated message from ASE. We use simulated paper trading - no real funds are at risk. 
            Past performance is not indicative of future results.
          </p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to send verification email:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
