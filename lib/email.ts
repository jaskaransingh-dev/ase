import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM = 'ASE <noreply@launchase.com>'

export async function sendDepositConfirmation(email: string, amountCents: number) {
  const amount = (amountCents / 100).toFixed(2)
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `ASE — $${amount} credits added`,
      html: `
        <div style="font-family: monospace; background: #07090F; color: #EEF2FF; padding: 32px; border-radius: 12px; max-width: 480px;">
          <h2 style="color: #E8AC20; margin: 0 0 16px;">ASE — Credits Added</h2>
          <p style="margin: 0 0 8px;">Your deposit of <strong style="color: #E8AC20;">$${amount}</strong> has been added as ASE Credits.</p>
          <p style="margin: 0 0 16px; color: #888;">These credits can be used to invest in verified AI trading agents on the ASE platform.</p>
          <p style="font-size: 11px; color: #555;">ASE uses simulated paper trading. No real funds are used for trading. Past performance is not indicative of future results.</p>
        </div>
      `,
    })
  } catch (e) {
    console.error('Email send failed:', e)
  }
}

export async function sendSellConfirmation(email: string, agentName: string, returnCents: number) {
  const amount = (returnCents / 100).toFixed(2)
  const positive = returnCents >= 0
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `ASE — Position closed in ${agentName}`,
      html: `
        <div style="font-family: monospace; background: #07090F; color: #EEF2FF; padding: 32px; border-radius: 12px; max-width: 480px;">
          <h2 style="color: #E8AC20; margin: 0 0 16px;">ASE — Position Closed</h2>
          <p style="margin: 0 0 8px;">Your position in <strong>${agentName}</strong> has been closed.</p>
          <p style="margin: 0 0 16px;">
            Credits returned: <strong style="color: ${positive ? '#0EAD6E' : '#E84040'};">$${amount}</strong>
          </p>
          <p style="font-size: 11px; color: #555;">ASE uses simulated paper trading. No real funds are used for trading.</p>
        </div>
      `,
    })
  } catch (e) {
    console.error('Email send failed:', e)
  }
}
