import { Resend } from 'resend'

const FROM = 'ASE <noreply@launchase.com>'

function getResend() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set')
  }
  return new Resend(apiKey)
}

const emailBase = (content: string) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'JetBrains Mono', monospace; }
      .container { background: #07090F; color: #EEF2FF; padding: 40px 32px; border-radius: 12px; max-width: 520px; margin: 0 auto; }
      .header { text-align: center; margin-bottom: 32px; }
      .logo { color: #E8AC20; margin: 0; font-size: 28px; font-weight: 800; font-family: 'Syne', sans-serif; letter-spacing: 0.02em; }
      .tagline { margin: 8px 0 0; color: #888; font-size: 12px; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.1em; text-transform: uppercase; }
      h2 { color: #EEF2FF; margin: 0 0 20px; font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 700; letter-spacing: 0.01em; }
      p { margin: 0 0 16px; line-height: 1.7; color: #EEF2FF; font-size: 14px; }
      .accent { color: #E8AC20; font-weight: 600; }
      .accent-green { color: #0EAD6E; font-weight: 600; }
      .box { background: rgba(232, 172, 32, 0.08); border: 1px solid rgba(232, 172, 32, 0.2); border-radius: 8px; padding: 20px; margin: 24px 0; }
      .box-green { background: rgba(14, 173, 110, 0.08); border: 1px solid rgba(14, 173, 110, 0.2); }
      .box-red { background: rgba(232, 64, 64, 0.08); border: 1px solid rgba(232, 64, 64, 0.2); }
      .box-content { color: #EEF2FF; font-size: 14px; margin: 0; }
      .button-wrapper { text-align: center; margin: 32px 0; }
      .button { display: inline-block; background: #E8AC20; color: #07090F; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 700; font-family: 'Syne', sans-serif; transition: background 0.15s; font-size: 14px; letter-spacing: 0.01em; }
      .button:hover { background: #F5C842; }
      .link { color: #E8AC20; text-decoration: none; }
      .link:hover { text-decoration: underline; }
      .divider { border-top: 1px solid rgba(232, 172, 32, 0.1); margin: 32px 0; }
      .footer { margin: 32px 0 0; font-size: 12px; color: rgba(238, 242, 255, 0.4); line-height: 1.7; font-family: 'JetBrains Mono', monospace; }
      .code { background: rgba(0, 0, 0, 0.3); padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; color: #E8AC20; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo">ASE</div>
        <div class="tagline">Agent Security Exchange</div>
      </div>
      ${content}
    </div>
  </body>
</html>
`

export async function sendWelcomeEmail(email: string, name: string) {
  const resend = getResend()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Welcome to ASE — Your Account is Ready',
      html: emailBase(`
        <h2>Welcome aboard, ${name || 'Trader'}!</h2>
        <p>Your account has been created successfully. You're ready to start trading with AI agents on the ASE marketplace.</p>

        <div class="box box-green">
          <p class="box-content accent-green">✓ $100 in paper credits have been added to your account</p>
        </div>

        <p>You can now:</p>
        <p style="margin-left: 16px;">
          • Explore our <a href="${appUrl}/dashboard/exchange" class="link">marketplace of AI agents</a><br>
          • Start building your portfolio<br>
          • Track your performance in real-time
        </p>

        <div class="button-wrapper">
          <a href="${appUrl}/dashboard" class="button">Go to Dashboard →</a>
        </div>

        <div class="footer">
          <p>This is an automated message from ASE. We use simulated paper trading — no real funds are at risk. Past performance is not indicative of future results. Not financial advice.</p>
        </div>
      `)
    })
  } catch (e) {
    console.error('Failed to send welcome email:', e)
  }
}

export async function sendVerificationEmail(email: string, name: string, verificationLink: string) {
  const resend = getResend()

  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Verify Your ASE Account',
      html: emailBase(`
        <h2>Verify Your Email</h2>
        <p>Hi ${name || 'Trader'},</p>
        <p>Click the button below to verify your email address and activate your ASE account:</p>

        <div class="button-wrapper">
          <a href="${verificationLink}" class="button">Verify Email →</a>
        </div>

        <p style="font-size: 13px; color: rgba(238, 242, 255, 0.6); margin-top: 24px;">
          Or paste this link in your browser:<br>
          <span class="code" style="display: inline-block; margin-top: 8px; padding: 8px 12px; word-break: break-all;">${verificationLink}</span>
        </p>

        <p style="font-size: 13px; margin-top: 24px; color: rgba(238, 242, 255, 0.5);">This link expires in 24 hours.</p>

        <div class="footer">
          <p>If you didn't create an ASE account, you can safely ignore this email.</p>
        </div>
      `)
    })
  } catch (e) {
    console.error('Failed to send verification email:', e)
  }
}

export async function sendPasswordResetEmail(email: string, name: string, resetLink: string) {
  const resend = getResend()

  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Reset Your ASE Password',
      html: emailBase(`
        <h2>Password Reset Request</h2>
        <p>Hi ${name || 'User'},</p>
        <p>We received a request to reset your password. Click the button below to set a new password:</p>

        <div class="button-wrapper">
          <a href="${resetLink}" class="button">Reset Password →</a>
        </div>

        <p style="font-size: 13px; color: rgba(238, 242, 255, 0.6); margin-top: 24px;">
          Or paste this link in your browser:<br>
          <span class="code" style="display: inline-block; margin-top: 8px; padding: 8px 12px; word-break: break-all;">${resetLink}</span>
        </p>

        <p style="font-size: 13px; margin-top: 24px; color: rgba(238, 242, 255, 0.5);">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>

        <div class="footer">
          <p>Never share your password reset link with anyone. ASE support will never ask for your password or reset links.</p>
        </div>
      `)
    })
  } catch (e) {
    console.error('Failed to send password reset email:', e)
  }
}

export async function sendDepositConfirmation(email: string, amountCents: number) {
  const amount = (amountCents / 100).toFixed(2)
  const resend = getResend()
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `ASE — $${amount} credits added`,
      html: emailBase(`
        <h2>Credits Added</h2>
        <p>Your deposit of <span class="accent">$${amount}</span> has been added as ASE Credits.</p>

        <div class="box">
          <p class="box-content">These credits can be used to invest in verified AI trading agents on the ASE platform.</p>
        </div>

        <div class="footer">
          <p>ASE uses simulated paper trading. No real funds are used for trading. Past performance is not indicative of future results.</p>
        </div>
      `)
    })
  } catch (e) {
    console.error('Email send failed:', e)
  }
}

export async function sendSellConfirmation(email: string, agentName: string, returnCents: number) {
  const amount = (returnCents / 100).toFixed(2)
  const positive = returnCents >= 0
  const resend = getResend()
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `ASE — Position closed in ${agentName}`,
      html: emailBase(`
        <h2>Position Closed</h2>
        <p>Your position in <strong>${agentName}</strong> has been closed.</p>

        <div class="box ${positive ? 'box-green' : 'box-red'}">
          <p class="box-content" style="color: ${positive ? '#0EAD6E' : '#E84040'}; margin: 0;">
            Credits returned: <strong>$${amount}</strong>
          </p>
        </div>

        <div class="footer">
          <p>ASE uses simulated paper trading. No real funds are used for trading.</p>
        </div>
      `)
    })
  } catch (e) {
    console.error('Email send failed:', e)
  }
}
