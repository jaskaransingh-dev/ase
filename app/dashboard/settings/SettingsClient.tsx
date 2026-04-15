'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface SettingsProps {
  user: { id: string; email: string; name: string }
  walletBalanceCents: number
  brokerAccount: {
    alpaca_account_id: string
    account_number: string
    status: string
    trading_enabled: boolean
  } | null
  transactions: Array<{
    id: string
    type: string
    amount_cents: number
    note: string | null
    created_at: string
  }>
}

function fmtUSD(cents: number, decimals = 2): string {
  return `${cents >= 0 ? '+' : '-'}$${(Math.abs(cents) / 100).toFixed(decimals)}`
}
function fmtDateTime(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTimeFull(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const TX_LABELS: Record<string, string> = {
  deposit: 'Credit Deposit',
  invest: 'Invested in Agent',
  divest: 'Position Closed',
  return: 'Return Credited',
  withdrawal: 'Withdrawal',
  fee: 'Platform Fee',
}

export default function SettingsClient({ user, walletBalanceCents, brokerAccount, transactions }: SettingsProps) {
  const supabase = createClient()
  const router = useRouter()

  // Profile
  const [name, setName] = useState(user.name)
  const [profileMsg, setProfileMsg] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)

  // Password
  const [password, setPassword] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  // Notifications
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifTrade, setNotifTrade] = useState(false)
  const [notifAlert, setNotifAlert] = useState(true)
  const [notifMsg, setNotifMsg] = useState('')

  // Active section
  const [section, setSection] = useState('profile')

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileLoading(true)
    setProfileMsg('')
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', user.id)
    setProfileMsg(error ? error.message : 'Profile updated successfully')
    setProfileLoading(false)
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== pwConfirm) { setPwMsg('Passwords do not match'); return }
    if (password.length < 8) { setPwMsg('Password must be at least 8 characters'); return }
    setPwLoading(true)
    setPwMsg('')
    const { error } = await supabase.auth.updateUser({ password })
    setPwMsg(error ? error.message : 'Password updated successfully')
    if (!error) { setPassword(''); setPwConfirm('') }
    setPwLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const sections = [
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Security' },
    { id: 'brokerage', label: 'Brokerage' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'billing', label: 'Billing' },
    { id: 'history', label: 'History' },
  ]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="eyebrow" style={{ marginBottom: '.25rem' }}>ACCOUNT</div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-.02em' }}>Settings</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left nav */}
        <nav style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '0.75rem', position: 'sticky', top: '1rem' }}>
          {sections.map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                width: '100%',
                padding: '0.6rem 0.85rem',
                borderRadius: 8,
                border: 'none',
                background: section === s.id ? 'rgba(59,127,255,0.12)' : 'transparent',
                color: section === s.id ? 'var(--blue2)' : 'var(--muted)',
                fontSize: '0.82rem',
                fontWeight: section === s.id ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
                marginBottom: '0.15rem',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: section === s.id ? 'var(--blue)' : 'transparent', flexShrink: 0 }} />
              {s.label}
            </button>
          ))}
        </nav>

        {/* Right content */}
        <div>
          {/* ─── PROFILE ─────────────────────────────────────── */}
          {section === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Profile Information</h2>
                <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.4rem' }}>DISPLAY NAME</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-base" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.4rem' }}>EMAIL ADDRESS</label>
                    <input type="email" value={user.email} readOnly className="input-base" style={{ opacity: 0.5, cursor: 'not-allowed' }} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', marginTop: '.3rem' }}>Contact support to change your email address</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.58rem', color: 'var(--faint)', marginTop: '-.25rem' }}>
                    Member since {new Date().getFullYear()} — Account ID: <span style={{ color: 'var(--muted)' }}>{user.id.slice(0, 8)}…</span>
                  </div>
                  {profileMsg && (
                    <div style={{ fontSize: '.82rem', padding: '.6rem .85rem', borderRadius: 8, background: profileMsg.includes('success') ? 'rgba(0,229,153,0.08)' : 'rgba(242,54,69,0.08)', border: `1px solid ${profileMsg.includes('success') ? 'rgba(0,229,153,0.2)' : 'rgba(242,54,69,0.2)'}`, color: profileMsg.includes('success') ? 'var(--mint)' : 'var(--red)' }}>
                      {profileMsg}
                    </div>
                  )}
                  <div>
                    <button type="submit" disabled={profileLoading} className="btn-primary" style={{ fontSize: '.82rem', padding: '.55rem 1.4rem' }}>
                      {profileLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </section>

              {/* Alpaca Account Summary */}
              <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Alpaca Account</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.2rem' }}>AVAILABLE BALANCE</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', fontWeight: 700, color: walletBalanceCents > 0 ? 'var(--mint)' : 'var(--white)' }}>
                      {fmtUSD(walletBalanceCents)}
                    </div>
                  </div>
                  <a href="/dashboard/deposit" style={{ marginLeft: 'auto', padding: '.45rem 1rem', borderRadius: 8, background: 'var(--blue)', color: '#fff', fontSize: '.78rem', fontWeight: 700, textDecoration: 'none' }}>
                    Add Funds →
                  </a>
                </div>
              </section>

              {/* Danger Zone */}
              <section style={{ background: 'var(--bg2)', border: '1px solid rgba(242,54,69,0.2)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--red)' }}>Danger Zone</h2>
                <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>Once you delete your account, there is no going back. All your data will be permanently removed.</p>
                <button style={{ padding: '.5rem 1.2rem', borderRadius: 8, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  Delete Account
                </button>
              </section>
            </div>
          )}

          {/* ─── SECURITY ─────────────────────────────────────── */}
          {section === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Change Password</h2>
                <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Use a strong password with at least 8 characters, including numbers and symbols.</p>
                <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 400 }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.4rem' }}>NEW PASSWORD</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} placeholder="••••••••" className="input-base" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.58rem', letterSpacing: '.1em', color: 'var(--faint)', marginBottom: '.4rem' }}>CONFIRM PASSWORD</label>
                    <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="••••••••" className="input-base" />
                  </div>
                  {pwMsg && (
                    <div style={{ fontSize: '.82rem', padding: '.6rem .85rem', borderRadius: 8, background: pwMsg.includes('success') ? 'rgba(0,229,153,0.08)' : 'rgba(242,54,69,0.08)', border: `1px solid ${pwMsg.includes('success') ? 'rgba(0,229,153,0.2)' : 'rgba(242,54,69,0.2)'}`, color: pwMsg.includes('success') ? 'var(--mint)' : 'var(--red)' }}>
                      {pwMsg}
                    </div>
                  )}
                  <div>
                    <button type="submit" disabled={pwLoading} className="btn-primary" style={{ fontSize: '.82rem', padding: '.55rem 1.4rem' }}>
                      {pwLoading ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </section>

              <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Two-Factor Authentication</h2>
                <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Add an extra layer of security to your account using an authenticator app.</p>
                <button style={{ padding: '.55rem 1.2rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--muted)', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
                  Enable 2FA →
                </button>
              </section>

              <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Active Sessions</h2>
                <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1rem' }}>You are currently logged in on this device.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--mint)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--white)' }}>Current session</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginTop: '.1rem' }}>Active now</div>
                  </div>
                </div>
              </section>

              <section style={{ background: 'var(--bg2)', border: '1px solid rgba(242,54,69,0.15)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Sign Out</h2>
                <button onClick={handleSignOut} style={{ padding: '.6rem 1.4rem', borderRadius: 8, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
                  Sign Out of All Devices
                </button>
              </section>
            </div>
          )}

          {/* ─── BROKERAGE ─────────────────────────────────────── */}
          {section === 'brokerage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Alpaca Brokerage Account</h2>
                <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Your connected brokerage account for executing agent trades. ASE uses Alpaca for real-time market execution.</p>
                {brokerAccount ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      {[
                        { label: 'ACCOUNT ID', value: brokerAccount.alpaca_account_id.slice(0, 12) + '…' },
                        { label: 'ACCOUNT NUMBER', value: '••••' + brokerAccount.account_number.slice(-4) },
                        { label: 'STATUS', value: brokerAccount.status },
                        { label: 'TRADING', value: brokerAccount.trading_enabled ? 'Enabled' : 'Disabled' },
                      ].map(row => (
                        <div key={row.label} style={{ padding: '0.85rem 1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.55rem', color: 'var(--faint)', letterSpacing: '.1em', marginBottom: '.25rem' }}>{row.label}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.85rem', fontWeight: 700, color: row.label === 'STATUS' ? (brokerAccount.status === 'ACTIVE' ? 'var(--mint)' : 'var(--yellow)') : 'var(--white)' }}>{row.value}</div>
                        </div>
                      ))}
                    </div>
                    <a href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '.55rem 1.2rem', borderRadius: 8, background: 'var(--blue)', color: '#fff', fontSize: '.78rem', fontWeight: 700, textDecoration: 'none', alignSelf: 'flex-start' }}>
                      Manage Account →
                    </a>
                  </div>
                ) : (
                  <div style={{ padding: '1.5rem', border: '1px dashed var(--border)', borderRadius: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>No brokerage account connected.</div>
                    <a href="/dashboard" style={{ display: 'inline-block', padding: '.55rem 1.4rem', borderRadius: 8, background: 'var(--blue)', color: '#fff', fontSize: '.82rem', fontWeight: 700, textDecoration: 'none' }}>
                      Connect Alpaca →
                    </a>
                  </div>
                )}
              </section>

              <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Fund Transfer</h2>
                <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Transfer funds between your ASE wallet and Alpaca trading account.</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <a href="/dashboard/deposit" style={{ flex: 1, padding: '.75rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--white)', fontSize: '.82rem', fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
                    Add Funds to ASE Wallet
                  </a>
                  <a href="/dashboard/withdraw" style={{ flex: 1, padding: '.75rem', borderRadius: 10, border: '1px solid rgba(242,54,69,0.3)', background: 'rgba(242,54,69,0.04)', color: 'var(--red)', fontSize: '.82rem', fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
                    Withdraw from ASE
                  </a>
                </div>
              </section>
            </div>
          )}

          {/* ─── NOTIFICATIONS ───────────────────────────────── */}
          {section === 'notifications' && (
            <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Notification Preferences</h2>
              <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Choose which emails and alerts you want to receive from ASE.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {[
                  { id: 'email', checked: notifEmail, set: setNotifEmail, title: 'Email Digest', desc: 'Weekly summary of agent performance and market updates' },
                  { id: 'trade', checked: notifTrade, set: setNotifTrade, title: 'Trade Alerts', desc: 'Get notified when an agent executes a buy or sell order' },
                  { id: 'alert', checked: notifAlert, set: setNotifAlert, title: 'Portfolio Alerts', desc: 'Critical alerts for drawdown warnings and agent status changes' },
                ].map((item, i) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 0', borderBottom: i < 2 ? '1px solid rgba(30,55,100,.2)' : 'none' }}>
                    <label style={{ position: 'relative', display: 'inline-block', width: 42, height: 22, flexShrink: 0 }}>
                      <input type="checkbox" checked={item.checked} onChange={e => item.set(e.target.checked)} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                      <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: item.checked ? 'var(--blue)' : 'var(--bg3)', borderRadius: 11, border: `1px solid ${item.checked ? 'var(--blue)' : 'var(--border)'}`, transition: 'all 0.2s' }}>
                        <span style={{ position: 'absolute', top: 2, left: item.checked ? 21 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'all 0.2s' }} />
                      </span>
                    </label>
                    <div>
                      <div style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--white)', marginBottom: '.15rem' }}>{item.title}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              {notifMsg && (
                <div style={{ marginTop: '1rem', fontSize: '.82rem', color: 'var(--mint)', padding: '.6rem .85rem', borderRadius: 8, background: 'rgba(0,229,153,0.08)', border: '1px solid rgba(0,229,153,0.2)' }}>
                  {notifMsg}
                </div>
              )}
            </section>
          )}

          {/* ─── BILLING ─────────────────────────────────────── */}
          {section === 'billing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Current Plan</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem', background: 'rgba(59,127,255,0.06)', border: '1px solid rgba(59,127,255,0.2)', borderRadius: 12, marginBottom: '1.25rem' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.7rem', fontWeight: 700, color: '#fff' }}>PRO</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--white)', marginBottom: '.15rem' }}>Pro Plan</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Unlimited agents, backtesting, and priority execution.</div>
                  </div>
                  <div style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '1.2rem', fontWeight: 700, color: 'var(--white)' }}>$0</div>
                </div>
                <p style={{ fontSize: '.78rem', color: 'var(--faint)' }}>All ASE services are currently free during beta. Billing will be enabled soon.</p>
              </section>

              <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Agent Fees</h2>
                <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Each agent may have its own performance fee. These are deducted from your NAV gains.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {[
                    { agent: 'BTC Momentum Alpha', fee: '2% performance' },
                    { agent: 'ETH Statistical Arbitrage', fee: '2% performance' },
                    { agent: 'S&P 500 Momentum Edge', fee: '1% performance' },
                  ].map(a => (
                    <div key={a.agent} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <span style={{ fontSize: '.82rem', color: 'var(--white)' }}>{a.agent}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--faint)' }}>{a.fee}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
                <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Invoices</h2>
                <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>Download invoices for your records.</p>
                <div style={{ color: 'var(--faint)', fontSize: '.82rem', fontStyle: 'italic' }}>No invoices yet — billing is free during beta.</div>
              </section>
            </div>
          )}

          {/* ─── HISTORY ─────────────────────────────────────── */}
          {section === 'history' && (
            <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>Transaction History</h2>
              <p style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>Your complete transaction log including deposits, investments, and returns.</p>
              {transactions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', opacity: 0.3 }}>📋</div>
                  <div style={{ fontSize: '.85rem' }}>No transactions yet</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        {['DATE', 'TYPE', 'NOTE', 'AMOUNT'].map(h => (
                          <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: '.58rem', fontWeight: 700, letterSpacing: '0.08em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx, i) => {
                        const isPos = ['deposit', 'divest', 'return', 'withdrawal_refund'].includes(tx.type)
                        return (
                          <tr key={tx.id} style={{ borderBottom: i === transactions.length - 1 ? 'none' : '1px solid rgba(30,55,100,.15)' }}>
                            <td style={{ padding: '0.7rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '.72rem', color: 'var(--faint)' }}>{fmtDateTimeFull(tx.created_at)}</td>
                            <td style={{ padding: '0.7rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)' }}>{TX_LABELS[tx.type] || tx.type}</td>
                            <td style={{ padding: '0.7rem 0.75rem', color: 'var(--muted)', fontSize: '.75rem', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.note ?? '—'}</td>
                            <td style={{ padding: '0.7rem 0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 700, color: isPos ? 'var(--mint)' : 'var(--red)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {isPos ? '+' : ''}{fmtUSD(Math.abs(tx.amount_cents))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
