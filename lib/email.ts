import { Resend } from 'resend'

const FROM = 'ASE <noreply@launchase.com>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.launchase.com'

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey.trim() === '') {
    console.warn('[Email] RESEND_API_KEY not set — email sends will be skipped')
    return null
  }
  return new Resend(apiKey.trim())
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const c = {
  bg:     '#07111F',
  bg2:    '#0B1728',
  bg3:    '#101A2D',
  card:   '#0D1829',
  border: '#1E2D45',
  blue:   '#4D8EFF',
  blue2:  '#7AAEFF',
  mint:   '#19E6A7',
  red:    '#FF5C6A',
  amber:  '#FFB930',
  white:  '#F0F4FF',
  text:   '#A8B8D0',
  muted:  '#5A7090',
}

// ─── Base layout ──────────────────────────────────────────────────────────────

function base(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ASE</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap');
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:${c.bg};font-family:'JetBrains Mono',monospace;color:${c.text};-webkit-font-smoothing:antialiased}
    .wrap{max-width:540px;margin:0 auto;padding:40px 20px 60px}
    .header{padding:0 0 32px;border-bottom:1px solid ${c.border}}
    .logo{font-family:'Syne',sans-serif;font-weight:800;font-size:22px;color:${c.blue};letter-spacing:.04em}
    .logo-sub{font-size:10px;color:${c.muted};letter-spacing:.18em;text-transform:uppercase;margin-top:3px}
    .content{padding:36px 0 0}
    h1{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;color:${c.white};letter-spacing:.01em;margin:0 0 10px}
    h2{font-family:'Syne',sans-serif;font-size:16px;font-weight:600;color:${c.white};margin:0 0 8px}
    p{font-size:13px;line-height:1.75;margin:0 0 14px}
    .lead{font-size:14px;color:${c.text}}
    .dim{color:${c.muted}}
    /* stat card */
    .card{background:${c.card};border:1px solid ${c.border};border-radius:10px;padding:20px 22px;margin:20px 0}
    .card-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}
    .stat{background:${c.card};border:1px solid ${c.border};border-radius:8px;padding:14px 16px}
    .stat-label{font-size:10px;color:${c.muted};letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}
    .stat-value{font-size:18px;font-weight:700;color:${c.white};letter-spacing:-.01em}
    .stat-sub{font-size:11px;color:${c.muted};margin-top:2px}
    /* colors */
    .green{color:${c.mint}}.red{color:${c.red}}.blue{color:${c.blue}}.amber{color:${c.amber}}
    /* badge */
    .badge{display:inline-block;padding:3px 9px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase}
    .badge-green{background:${c.mint}18;color:${c.mint};border:1px solid ${c.mint}30}
    .badge-blue{background:${c.blue}18;color:${c.blue};border:1px solid ${c.blue}30}
    .badge-red{background:${c.red}18;color:${c.red};border:1px solid ${c.red}30}
    .badge-amber{background:${c.amber}18;color:${c.amber};border:1px solid ${c.amber}30}
    /* highlight row */
    .highlight{background:${c.mint}08;border:1px solid ${c.mint}22;border-radius:10px;padding:18px 20px;margin:20px 0}
    .highlight-red{background:${c.red}08;border-color:${c.red}22}
    .highlight-blue{background:${c.blue}08;border-color:${c.blue}22}
    /* divider */
    .divider{border:none;border-top:1px solid ${c.border};margin:28px 0}
    /* button */
    .btn-wrap{text-align:center;margin:28px 0}
    .btn{display:inline-block;background:${c.blue};color:#fff;padding:13px 30px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:13px;text-decoration:none;letter-spacing:.02em}
    /* code */
    .code{background:${c.bg3};border:1px solid ${c.border};border-radius:5px;padding:3px 7px;font-size:12px;color:${c.blue};word-break:break-all}
    .code-block{background:${c.bg3};border:1px solid ${c.border};border-radius:8px;padding:14px 16px;font-size:12px;color:${c.blue};word-break:break-all;margin:10px 0}
    /* footer */
    .footer{margin-top:36px;padding-top:24px;border-top:1px solid ${c.border}20;font-size:11px;color:${c.muted};line-height:1.8}
    .footer a{color:${c.muted};text-decoration:underline}
    /* timeline */
    .step{display:flex;gap:14px;margin:12px 0;align-items:flex-start}
    .step-dot{width:22px;height:22px;border-radius:50%;background:${c.blue}20;border:1px solid ${c.blue}40;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${c.blue};flex-shrink:0;margin-top:1px}
    .step-text{font-size:13px;line-height:1.6}
    /* trade row */
    .trade-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${c.border}50}
    .trade-row:last-child{border-bottom:none}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="logo">ASE</div>
      <div class="logo-sub">Agent Securities Exchange</div>
    </div>
    <div class="content">
      ${body}
    </div>
    <div class="footer">
      <p>© 2026 Agent Securities Exchange · <a href="${APP_URL}">launchase.com</a></p>
      <p style="margin-top:6px">Algorithmic trading involves risk. Past performance does not guarantee future results. Not financial advice.</p>
    </div>
  </div>
</body>
</html>`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtPct(pct: number) {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
}

async function send(to: string, subject: string, html: string) {
  const resend = getResend()
  if (!resend) return
  try {
    const res = await resend.emails.send({ from: FROM, to, subject, html })
    console.log('[Email] Sent:', subject, '→', to, res.data?.id ?? '')
  } catch (e) {
    console.error('[Email] Failed to send:', subject, e instanceof Error ? e.message : e)
  }
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(email: string, name: string) {
  const first = name?.split(' ')[0] || 'Trader'
  await send(email, 'Welcome to ASE — Your account is ready', base(`
    <h1>Welcome, ${first}.</h1>
    <p class="lead">Your ASE account is live. You now have access to verified AI-powered trading agents with real-time execution and transparent performance data.</p>

    <div class="highlight highlight-blue">
      <span class="badge badge-green">✓ Account Active</span>
      <p style="margin-top:10px;color:${c.white};font-size:14px;font-weight:600">Ready to allocate capital</p>
      <p style="margin:4px 0 0;font-size:12px">Connect your Kraken account to start trading live.</p>
    </div>

    <div class="card">
      <h2>Get started in 3 steps</h2>
      <div style="margin-top:14px">
        <div class="step">
          <div class="step-dot">1</div>
          <div class="step-text"><span style="color:${c.white};font-weight:600">Connect Kraken</span> — Link your API keys so agents can execute trades on your behalf.</div>
        </div>
        <div class="step">
          <div class="step-dot">2</div>
          <div class="step-text"><span style="color:${c.white};font-weight:600">Browse agents</span> — Review verified strategies with full backtest data, Sharpe ratios, and drawdown history.</div>
        </div>
        <div class="step">
          <div class="step-dot">3</div>
          <div class="step-text"><span style="color:${c.white};font-weight:600">Allocate capital</span> — Choose how much to deploy and let the algorithm run 24/7.</div>
        </div>
      </div>
    </div>

    <div class="btn-wrap">
      <a href="${APP_URL}/dashboard" class="btn">Go to Dashboard →</a>
    </div>
  `))
}

// ─── Email verification ───────────────────────────────────────────────────────

export async function sendVerificationEmail(email: string, name: string, verificationLink: string) {
  const first = name?.split(' ')[0] || 'Trader'
  await send(email, 'Verify your email — ASE', base(`
    <h1>Verify your email</h1>
    <p class="lead">Hi ${first}, click the button below to activate your ASE account. This link expires in 24 hours.</p>

    <div class="btn-wrap" style="margin:32px 0">
      <a href="${verificationLink}" class="btn">Verify Email Address →</a>
    </div>

    <div class="card">
      <p style="font-size:12px;margin:0">Or copy this link into your browser:</p>
      <div class="code-block">${verificationLink}</div>
    </div>

    <hr class="divider">
    <p class="dim" style="font-size:12px">If you didn't create an ASE account, ignore this email.</p>
  `))
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(email: string, name: string, resetLink: string) {
  const first = name?.split(' ')[0] || 'User'
  await send(email, 'Reset your password — ASE', base(`
    <h1>Reset your password</h1>
    <p class="lead">Hi ${first}, we received a request to reset your ASE account password.</p>

    <div class="btn-wrap" style="margin:28px 0">
      <a href="${resetLink}" class="btn">Reset Password →</a>
    </div>

    <div class="card">
      <p style="font-size:12px;margin:0">Or paste this link:</p>
      <div class="code-block">${resetLink}</div>
    </div>

    <p class="dim" style="font-size:12px;margin-top:16px">This link expires in 1 hour. If you didn't request this, your account is safe — ignore this email.</p>
  `))
}

// ─── Investment confirmation ──────────────────────────────────────────────────

export async function sendInvestConfirmation(params: {
  email: string
  name: string
  agentName: string
  agentSlug: string
  amountCents: number
  shares: number
  pricePerShareCents: number
}) {
  const { email, name, agentName, agentSlug, amountCents, shares, pricePerShareCents } = params
  const first = name?.split(' ')[0] || 'Trader'
  await send(email, `Capital allocated — ${agentName}`, base(`
    <h1>Position opened</h1>
    <p class="lead">Hi ${first}, your capital has been allocated to <span class="blue">${agentName}</span>. The agent will begin executing trades on your behalf immediately.</p>

    <div class="highlight">
      <span class="badge badge-green">✓ Live Trading</span>
      <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:28px;font-weight:700;color:${c.white}">${fmt$(amountCents)}</div>
          <div style="font-size:12px;color:${c.muted};margin-top:2px">Allocated</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:600;color:${c.mint}">${shares.toFixed(4)}</div>
          <div style="font-size:12px;color:${c.muted};margin-top:2px">Shares</div>
        </div>
      </div>
    </div>

    <div class="card-grid">
      <div class="stat">
        <div class="stat-label">Agent</div>
        <div class="stat-value" style="font-size:14px">${agentName}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Entry Price</div>
        <div class="stat-value">${fmt$(pricePerShareCents)}</div>
        <div class="stat-sub">per share</div>
      </div>
    </div>

    <div class="btn-wrap">
      <a href="${APP_URL}/agents/${agentSlug}" class="btn">View Agent →</a>
    </div>

    <hr class="divider">
    <p class="dim" style="font-size:12px">Your Kraken account will execute trades as the agent generates signals. You can deallocate at any time from your dashboard.</p>
  `))
}

// ─── Sell / deallocate confirmation ──────────────────────────────────────────

export async function sendSellConfirmation(
  email: string,
  agentName: string,
  returnCents: number,
  pnlCents?: number,
  name?: string,
) {
  const first = (name ?? email)?.split('@')[0] || 'Trader'
  const positive = (pnlCents ?? 0) >= 0
  await send(email, `Position closed — ${agentName}`, base(`
    <h1>Position closed</h1>
    <p class="lead">Hi ${first}, your position in <span class="blue">${agentName}</span> has been closed and funds returned to your Kraken account.</p>

    <div class="highlight ${positive ? '' : 'highlight-red'}">
      <span class="badge ${positive ? 'badge-green' : 'badge-red'}">${positive ? '↑ Profit' : '↓ Loss'}</span>
      <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:28px;font-weight:700;color:${c.white}">${fmt$(returnCents)}</div>
          <div style="font-size:12px;color:${c.muted};margin-top:2px">Returned</div>
        </div>
        ${pnlCents !== undefined ? `
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;color:${positive ? c.mint : c.red}">${positive ? '+' : ''}${fmt$(pnlCents)}</div>
          <div style="font-size:12px;color:${c.muted};margin-top:2px">P&amp;L</div>
        </div>` : ''}
      </div>
    </div>

    <div class="btn-wrap">
      <a href="${APP_URL}/agents" class="btn">Browse Other Agents →</a>
    </div>

    <hr class="divider">
    <p class="dim" style="font-size:12px">Funds have been returned to your Kraken account. Past performance does not guarantee future results.</p>
  `))
}

// ─── Trade executed notification ─────────────────────────────────────────────

export async function sendTradeExecutedEmail(params: {
  email: string
  name: string
  agentName: string
  agentSlug: string
  trades: Array<{ symbol: string; side: 'buy' | 'sell'; qty: number; fillPrice: number; notionalCents: number }>
  totalNotionalCents: number
}) {
  const { email, name, agentName, agentSlug, trades, totalNotionalCents } = params
  const buys  = trades.filter(t => t.side === 'buy')
  const sells = trades.filter(t => t.side === 'sell')
  const first = name?.split(' ')[0] || 'Trader'

  const tradeRows = trades.map(t => `
    <div class="trade-row">
      <div>
        <span class="badge ${t.side === 'buy' ? 'badge-green' : 'badge-red'}">${t.side.toUpperCase()}</span>
        <span style="color:${c.white};font-weight:600;margin-left:10px">${t.symbol}</span>
      </div>
      <div style="text-align:right">
        <div style="color:${c.white};font-weight:600">${fmt$(t.notionalCents)}</div>
        <div style="font-size:11px;color:${c.muted}">${t.qty.toFixed(6)} @ $${t.fillPrice.toFixed(2)}</div>
      </div>
    </div>`).join('')

  await send(email, `${agentName} executed ${trades.length} trade${trades.length !== 1 ? 's' : ''}`, base(`
    <h1>Trades executed</h1>
    <p class="lead">Hi ${first}, <span class="blue">${agentName}</span> executed ${trades.length} trade${trades.length !== 1 ? 's' : ''} on your Kraken account.</p>

    <div class="card" style="margin:20px 0">
      <div style="display:flex;justify-content:space-between;margin-bottom:16px">
        <div>
          <div style="font-size:11px;color:${c.muted};text-transform:uppercase;letter-spacing:.1em">Total Volume</div>
          <div style="font-size:22px;font-weight:700;color:${c.white};margin-top:4px">${fmt$(totalNotionalCents)}</div>
        </div>
        <div style="text-align:right">
          <span style="margin-right:8px"><span class="badge badge-green">${buys.length} BUY</span></span>
          <span><span class="badge badge-red">${sells.length} SELL</span></span>
        </div>
      </div>
      ${tradeRows}
    </div>

    <div class="btn-wrap">
      <a href="${APP_URL}/agents/${agentSlug}" class="btn">View Agent Activity →</a>
    </div>
  `))
}

// ─── Deposit confirmation ─────────────────────────────────────────────────────

export async function sendDepositConfirmation(email: string, amountCents: number, name?: string) {
  const first = (name ?? email)?.split('@')[0] || 'Trader'
  await send(email, `${fmt$(amountCents)} deposited — ASE`, base(`
    <h1>Deposit confirmed</h1>
    <p class="lead">Hi ${first}, your deposit has been received and your Kraken balance has been updated.</p>

    <div class="highlight highlight-blue">
      <span class="badge badge-blue">✓ Deposited</span>
      <div style="margin-top:14px">
        <div style="font-size:32px;font-weight:700;color:${c.white}">${fmt$(amountCents)}</div>
        <div style="font-size:12px;color:${c.muted};margin-top:4px">Available to invest</div>
      </div>
    </div>

    <div class="btn-wrap">
      <a href="${APP_URL}/agents" class="btn">Browse Trading Agents →</a>
    </div>
  `))
}

// ─── NAV / performance digest (weekly) ───────────────────────────────────────

export async function sendWeeklyDigest(params: {
  email: string
  name: string
  positions: Array<{ agentName: string; agentSlug: string; invested: number; currentValue: number; pnlCents: number; pnlPct: number }>
  totalInvested: number
  totalValue: number
  totalPnl: number
}) {
  const { email, name, positions, totalInvested, totalValue, totalPnl } = params
  const first = name?.split(' ')[0] || 'Trader'
  const positive = totalPnl >= 0

  const rows = positions.map(p => `
    <div class="trade-row">
      <div>
        <a href="${APP_URL}/agents/${p.agentSlug}" style="color:${c.white};font-weight:600;text-decoration:none">${p.agentName}</a>
        <div style="font-size:11px;color:${c.muted};margin-top:2px">Invested: ${fmt$(p.invested)}</div>
      </div>
      <div style="text-align:right">
        <div style="color:${c.white};font-weight:600">${fmt$(p.currentValue)}</div>
        <div style="font-size:12px;color:${p.pnlCents >= 0 ? c.mint : c.red};margin-top:2px">${fmtPct(p.pnlPct)}</div>
      </div>
    </div>`).join('')

  await send(email, 'Your weekly ASE performance digest', base(`
    <h1>Weekly digest</h1>
    <p class="lead">Hi ${first}, here's how your portfolio performed this week.</p>

    <div class="highlight ${positive ? '' : 'highlight-red'}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:12px;color:${c.muted}">Total Portfolio Value</div>
          <div style="font-size:28px;font-weight:700;color:${c.white};margin-top:4px">${fmt$(totalValue)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:20px;font-weight:700;color:${positive ? c.mint : c.red}">${positive ? '+' : ''}${fmt$(totalPnl)}</div>
          <div style="font-size:11px;color:${c.muted};margin-top:2px">vs ${fmt$(totalInvested)} invested</div>
        </div>
      </div>
    </div>

    ${positions.length > 0 ? `
    <div class="card">
      <h2>Your positions</h2>
      <div style="margin-top:12px">${rows}</div>
    </div>` : ''}

    <div class="btn-wrap">
      <a href="${APP_URL}/dashboard" class="btn">View Full Dashboard →</a>
    </div>
  `))
}
