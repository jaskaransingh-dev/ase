import { Resend } from 'resend'

const FROM = 'ASE <noreply@launchase.com>'

function getResend() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[Email] RESEND_API_KEY not set')
    throw new Error('RESEND_API_KEY is not set')
  }
  return new Resend(apiKey)
}

const colors = {
  bg: '#07111F',
  bg2: '#0B1728', 
  bg3: '#101A2D',
  border: '#21314D',
  blue: '#5B8CFF',
  blue2: '#78A2FF',
  ivory: '#F5F7FB',
  text: '#B5C1D6',
  muted: '#7F8CA3',
  mint: '#19E6A7',
  red: '#FF6B7A',
}

const emailBase = (content: string) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Syne:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { 
        font-family: 'JetBrains Mono', monospace; 
        background: ${colors.bg}; 
        color: ${colors.ivory}; 
        line-height: 1.7;
      }
      .container { 
        background: ${colors.bg}; 
        padding: 48px 32px; 
        max-width: 520px; 
        margin: 0 auto; 
      }
      .logo { 
        color: ${colors.blue}; 
        margin: 0; 
        font-size: 28px; 
        font-weight: 800; 
        font-family: 'Syne', sans-serif; 
        letter-spacing: 0.02em; 
      }
      .tagline { 
        margin: 8px 0 0; 
        color: ${colors.muted}; 
        font-size: 11px; 
        letter-spacing: 0.15em; 
        text-transform: uppercase; 
      }
      h2 { 
        color: ${colors.ivory}; 
        margin: 0 0 20px; 
        font-family: 'Syne', sans-serif; 
        font-size: 22px; 
        font-weight: 700; 
        letter-spacing: 0.01em; 
      }
      p { 
        margin: 0 0 16px; 
        color: ${colors.text}; 
        font-size: 14px; 
      }
      .accent { color: ${colors.blue}; font-weight: 600; }
      .accent-mint { color: ${colors.mint}; font-weight: 600; }
      .accent-red { color: ${colors.red}; font-weight: 600; }
      .box { 
        background: ${colors.bg2}; 
        border: 1px solid ${colors.border}; 
        border-radius: 12px; 
        padding: 24px; 
        margin: 24px 0; 
      }
      .box-mint { 
        border-color: ${colors.mint}20;
        background: ${colors.mint}08;
      }
      .box-red { 
        border-color: ${colors.red}20;
        background: ${colors.red}08;
      }
      .box-blue { 
        border-color: ${colors.blue}30;
        background: ${colors.blue}12;
      }
      .link { color: ${colors.blue}; text-decoration: none; }
      .link:hover { text-decoration: underline; }
      .button-wrapper { text-align: center; margin: 32px 0; }
      .button { 
        display: inline-block; 
        background: ${colors.blue}; 
        color: #fff; 
        padding: 14px 32px; 
        text-decoration: none; 
        border-radius: 8px; 
        font-weight: 700; 
        font-family: 'JetBrains Mono', monospace;
        transition: background 0.15s; 
        font-size: 14px; 
      }
      .button:hover { background: ${colors.blue2}; }
      .divider { border-top: 1px solid ${colors.border}50; margin: 32px 0; }
      .footer { 
        margin: 32px 0 0; 
        font-size: 11px; 
        color: ${colors.muted}80; 
        line-height: 1.7; 
      }
      .code { 
        background: ${colors.bg3}; 
        padding: 4px 8px; 
        border-radius: 4px; 
        font-family: 'JetBrains Mono', monospace; 
        color: ${colors.blue}; 
        font-size: 12px;
      }
      .badge { 
        display: inline-block; 
        padding: 4px 10px; 
        border-radius: 4px; 
        font-size: 10px; 
        font-weight: 600; 
        letter-spacing: 0.08em;
      }
      .badge-mint {
        background: ${colors.mint}20;
        color: ${colors.mint};
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo">ASE</div>
        <div class="tagline">Agent Securities Exchange</div>
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
    console.log('[Email] Sending welcome to:', email)
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Welcome to ASE — Your AI Trading Journey Starts Now',
      html: emailBase(`
        <h2>Welcome aboard, ${name || 'Trader'}!</h2>
        <p>Your ASE account is ready. You're now part of a community investing in verified AI-powered trading strategies with real-time execution and transparent performance tracking.</p>

        <div class="box box-mint">
          <span class="badge badge-mint">✓ ACCOUNT READY</span>
          <p style="margin-top: 12px; color: ${colors.ivory};">Start exploring AI trading agents on the marketplace.</p>
        </div>

        <p>With your account you can:</p>
        <p style="margin-left: 16px;">
          <span style="color: ${colors.muted};">•</span> Browse verified AI trading agents<br>
          <span style="color: ${colors.muted};">•</span> Invest real USD in algorithmic strategies<br>
          <span style="color: ${colors.muted};">•</span> Track live P&L in real-time<br>
          <span style="color: ${colors.muted};">•</span> Access transparent performance data
        </p>

        <div class="button-wrapper">
          <a href="${appUrl}/dashboard" class="button">Go to Dashboard →</a>
        </div>

        <div class="divider"></div>

        <div class="footer">
          <p style="color: ${colors.muted};">
            ASE — Agent Securities Exchange<br>
            Algorithmic trading involves risk. Past performance does not guarantee future results.
          </p>
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
    console.log('[Email] Sending verification to:', email)
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Verify Your Email — Activate Your ASE Account',
      html: emailBase(`
        <h2>Verify Your Email</h2>
        <p>Hi ${name || 'Trader'},</p>
        <p>Click below to verify your email address and activate your ASE account.</p>

        <div class="button-wrapper">
          <a href="${verificationLink}" class="button">Verify Email →</a>
        </div>

        <div class="box">
          <p style="font-size: 13px;">
            Or paste this link:<br>
            <span class="code" style="display: block; margin-top: 8px; word-break: break-all;">${verificationLink}</span>
          </p>
        </div>

        <p style="font-size: 12px; color: ${colors.muted};">This link expires in 24 hours.</p>

        <div class="divider"></div>

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
    console.log('[Email] Sending password reset to:', email)
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: 'Reset Your Password — ASE Account Recovery',
      html: emailBase(`
        <h2>Reset Your Password</h2>
        <p>Hi ${name || 'User'},</p>
        <p>We received a request to reset your password. Click below to create a new one.</p>

        <div class="button-wrapper">
          <a href="${resetLink}" class="button">Reset Password →</a>
        </div>

        <div class="box">
          <p style="font-size: 13px;">
            Or paste this link:<br>
            <span class="code" style="display: block; margin-top: 8px; word-break: break-all;">${resetLink}</span>
          </p>
        </div>

        <p style="font-size: 12px; color: ${colors.muted};">This link expires in 1 hour.</p>

        <div class="divider"></div>

        <div class="footer">
          <p>Didn't request this? You can safely ignore this email.</p>
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
    console.log('[Email] Sending deposit confirmation to:', email)
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `$${amount} Deposited — Balance Updated`,
      html: emailBase(`
        <h2>Deposit Successful</h2>
        <p>Your deposit of <span class="accent">$${amount}</span> has been processed.</p>

        <div class="box box-mint">
          <p class="accent-mint" style="font-size: 18px; margin: 0;">Ready to Invest</p>
          <p style="font-size: 13px; color: ${colors.text}; margin-top: 8px;">
            Your balance is ready for investing in AI trading agents.
          </p>
        </div>

        <div class="button-wrapper">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/agents" class="button">Browse Agents →</a>
        </div>

        <div class="footer">
          <p>Real USD from your bank is used for trading. Algorithmic trading involves risk.</p>
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
    console.log('[Email] Sending sell confirmation to:', email)
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `Position Closed — ${agentName}`,
      html: emailBase(`
        <h2>Position Closed</h2>
        <p>Your position in <strong>${agentName}</strong> has been closed.</p>

        <div class="box ${positive ? 'box-mint' : 'box-red'}">
          <p style="font-size: 24px; font-weight: 700; margin: 0; color: ${positive ? colors.mint : colors.red};">
            ${positive ? '+' : '-'}$${amount.replace(/^-/, '')}
          </p>
          <p style="font-size: 13px; color: ${colors.text}; margin-top: 8px;">
            ${positive ? 'Profit' : 'Loss'}
          </p>
        </div>

        <div class="button-wrapper">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard" class="button">View Dashboard →</a>
        </div>

        <div class="footer">
          <p>Past performance does not guarantee future results.</p>
        </div>
      `)
    })
  } catch (e) {
    console.error('Email send failed:', e)
  }
}