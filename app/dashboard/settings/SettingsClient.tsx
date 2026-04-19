'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface SettingsProps {
  user: { id: string; email: string; name: string }
  walletBalanceCents: number
  brokerAccount: { alpaca_account_id: string; account_number: string; status: string; trading_enabled: boolean } | null
  transactions: Array<{ id: string; type: string; amount_cents: number; note: string | null; created_at: string }>
}

function fmtUSD(cents: number) { return `${cents >= 0 ? '+' : '-'}$${(Math.abs(cents) / 100).toFixed(2)}` }
function fmtDate(date: string | Date) { return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

const TX_LABELS: Record<string, string> = {
  deposit: 'Deposit', invest: 'Invested in Agent', divest: 'Position Closed',
  return: 'Return Credited', withdrawal: 'Withdrawal', fee: 'Platform Fee',
}
const TX_COLORS: Record<string, string> = {
  deposit: 'var(--mint)', invest: 'var(--blue)', divest: 'var(--orange)',
  return: 'var(--mint)', withdrawal: 'var(--red)', fee: 'var(--faint)',
}

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { id: 'security', label: 'Security', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { id: 'brokerage', label: 'Brokerage', icon: 'M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3' },
  { id: 'notifications', label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'history', label: 'History', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
]

export default function SettingsClient({ user, walletBalanceCents, brokerAccount, transactions }: SettingsProps) {
  const supabase = createClient()
  const router = useRouter()

  const [name, setName] = useState(user.name)
  const [profileMsg, setProfileMsg] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [password, setPassword] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [notifEmail, setNotifEmail] = useState(true)
  const [notifTrade, setNotifTrade] = useState(false)
  const [notifAlert, setNotifAlert] = useState(true)
  const [section, setSection] = useState('profile')

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileLoading(true); setProfileMsg('')
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', user.id)
    setProfileMsg(error ? error.message : 'Profile updated successfully')
    setProfileLoading(false)
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== pwConfirm) { setPwMsg('Passwords do not match'); return }
    if (password.length < 8) { setPwMsg('Password must be at least 8 characters'); return }
    setPwLoading(true); setPwMsg('')
    const { error } = await supabase.auth.updateUser({ password })
    setPwMsg(error ? error.message : 'Password updated successfully')
    if (!error) { setPassword(''); setPwConfirm('') }
    setPwLoading(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const initials = (user.name || user.email || 'U').slice(0, 2).toUpperCase()

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--blue)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.12em' }}>ACCOUNT SETTINGS</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--white)', letterSpacing: '-0.03em' }}>Settings</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.25rem', alignItems: 'start' }} className="settings-grid">
        {/* Sidebar nav */}
        <div style={{ position: 'sticky', top: '4rem' }}>
          {/* User card */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(79,140,255,.3),rgba(22,199,132,.2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--white)', flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || 'User'}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
              </div>
            </div>
            {brokerAccount && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.6rem', background: 'var(--bg3)', borderRadius: 7, border: '1px solid var(--border)' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: brokerAccount.status === 'ACTIVE' ? 'var(--mint)' : 'var(--orange)', flexShrink: 0 }} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: brokerAccount.status === 'ACTIVE' ? 'var(--mint)' : 'var(--orange)', fontWeight: 600 }}>ALPACA {brokerAccount.status}</div>
              </div>
            )}
          </div>

          {/* Nav items */}
          <nav style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.5rem', overflow: 'hidden' }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, border: 'none', background: section === s.id ? 'rgba(79,140,255,0.12)' : 'transparent', color: section === s.id ? 'var(--blue2)' : 'var(--muted)', fontSize: '0.82rem', fontWeight: section === s.id ? 600 : 400, cursor: 'pointer', textAlign: 'left', transition: 'all 0.14s', marginBottom: '0.1rem' }}
                onMouseEnter={e => { if (section !== s.id) { e.currentTarget.style.background = 'var(--blue-dim)'; e.currentTarget.style.color = 'var(--white)' } }}
                onMouseLeave={e => { if (section !== s.id) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)' } }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: section === s.id ? 1 : 0.6 }}><path d={s.icon}/></svg>
                {s.label}
              </button>
            ))}
          </nav>

          {/* Sign out */}
          <button onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', marginTop: '0.75rem', padding: '0.65rem 0.75rem', borderRadius: 10, border: '1px solid rgba(228,88,103,0.2)', background: 'rgba(228,88,103,0.05)', color: 'var(--red)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.14s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(228,88,103,0.1)'; e.currentTarget.style.borderColor = 'rgba(228,88,103,0.35)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(228,88,103,0.05)'; e.currentTarget.style.borderColor = 'rgba(228,88,103,0.2)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            Sign Out
          </button>
        </div>

        {/* Content panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* PROFILE */}
          {section === 'profile' && (
            <>
              <Panel title="Profile Information">
                <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <Field label="DISPLAY NAME">
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-base" />
                  </Field>
                  <Field label="EMAIL ADDRESS">
                    <input type="email" value={user.email} readOnly className="input-base" style={{ opacity: 0.5, cursor: 'not-allowed' }} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--faint)', marginTop: '0.3rem' }}>Contact support to change your email</div>
                  </Field>
                  <Field label="ACCOUNT ID">
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--muted)', padding: '0.6rem 0.9rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
                      {user.id.slice(0, 8)}…{user.id.slice(-4)}
                    </div>
                  </Field>
                  {profileMsg && <Msg text={profileMsg} />}
                  <div><button type="submit" disabled={profileLoading} className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.55rem 1.4rem' }}>{profileLoading ? 'Saving…' : 'Save Changes'}</button></div>
                </form>
              </Panel>

              <Panel title="Brokerage Balance">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>AVAILABLE CASH</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color: walletBalanceCents > 0 ? 'var(--mint)' : 'var(--white)' }}>
                      ${(Math.abs(walletBalanceCents) / 100).toFixed(2)}
                    </div>
                  </div>
                  <Link href="#" onClick={() => setSection('brokerage')} style={{ padding: '0.45rem 1rem', borderRadius: 8, background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, textDecoration: 'none' }}>
                    Manage →
                  </Link>
                </div>
              </Panel>

              <Panel title="Danger Zone" danger>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1rem', lineHeight: 1.6 }}>Once you delete your account, there is no going back. All data will be permanently removed.</p>
                <button style={{ padding: '0.5rem 1.2rem', borderRadius: 8, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  Delete Account
                </button>
              </Panel>
            </>
          )}

          {/* SECURITY */}
          {section === 'security' && (
            <>
              <Panel title="Change Password">
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>Use a strong password with at least 8 characters, including numbers and symbols.</p>
                <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 420 }}>
                  <Field label="NEW PASSWORD"><input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} placeholder="••••••••" className="input-base" /></Field>
                  <Field label="CONFIRM PASSWORD"><input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="••••••••" className="input-base" /></Field>
                  {pwMsg && <Msg text={pwMsg} />}
                  <div><button type="submit" disabled={pwLoading} className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.55rem 1.4rem' }}>{pwLoading ? 'Updating…' : 'Update Password'}</button></div>
                </form>
              </Panel>

              <Panel title="Two-Factor Authentication">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--white)', marginBottom: '0.3rem' }}>Authenticator App</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Add an extra layer of security using an authenticator app.</div>
                  </div>
                  <button style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--muted)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>Enable 2FA</button>
                </div>
              </Panel>

              <Panel title="Active Sessions">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--mint)', flexShrink: 0, animation: 'pulse 2s infinite' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--white)' }}>Current session</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--faint)', marginTop: '0.1rem' }}>Active now · {user.email}</div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--mint)', fontWeight: 600 }}>ACTIVE</div>
                </div>
              </Panel>
            </>
          )}

          {/* BROKERAGE */}
          {section === 'brokerage' && (
            <>
              <Panel title="Alpaca Brokerage Account">
                <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>Your connected brokerage account for executing agent trades. ASE uses Alpaca for real-time market execution.</p>
                {brokerAccount ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    {[
                      { label: 'ACCOUNT ID', value: brokerAccount.alpaca_account_id.slice(0, 12) + '…' },
                      { label: 'ACCOUNT NUMBER', value: '••••' + brokerAccount.account_number.slice(-4) },
                      { label: 'STATUS', value: brokerAccount.status, highlight: brokerAccount.status === 'ACTIVE' ? 'var(--mint)' : 'var(--orange)' },
                      { label: 'TRADING', value: brokerAccount.trading_enabled ? 'Enabled' : 'Disabled', highlight: brokerAccount.trading_enabled ? 'var(--mint)' : 'var(--red)' },
                    ].map(row => (
                      <div key={row.label} style={{ padding: '0.85rem 1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>{row.label}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, color: (row as { highlight?: string }).highlight ?? 'var(--white)' }}>{row.value}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '2rem', background: 'var(--bg3)', border: '1px dashed var(--border)', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--faint)', marginBottom: '0.75rem' }}>NO BROKERAGE ACCOUNT</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1rem' }}>Connect an Alpaca account to enable live trading.</div>
                    <button style={{ padding: '0.55rem 1.25rem', borderRadius: 8, background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                      Connect Alpaca
                    </button>
                  </div>
                )}
              </Panel>

              <Panel title="Balance & Funding">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.5rem', color: 'var(--faint)', letterSpacing: '0.1em', marginBottom: '0.25rem' }}>AVAILABLE CASH</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.35rem', fontWeight: 700, color: walletBalanceCents > 0 ? 'var(--mint)' : 'var(--white)' }}>
                      ${(Math.abs(walletBalanceCents) / 100).toFixed(2)}
                    </div>
                  </div>
                  <button style={{ padding: '0.5rem 1.1rem', borderRadius: 8, background: 'var(--blue)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                    + Deposit
                  </button>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--faint)', lineHeight: 1.7 }}>
                  Funds are held in your Alpaca brokerage account. Deposits typically settle within 1-3 business days. ASE does not hold your funds.
                </div>
              </Panel>
            </>
          )}

          {/* NOTIFICATIONS */}
          {section === 'notifications' && (
            <Panel title="Notification Preferences">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {[
                  { label: 'Email Notifications', sub: 'Receive account updates and security alerts via email', value: notifEmail, set: setNotifEmail },
                  { label: 'Trade Confirmations', sub: 'Get notified when agents execute trades on your behalf', value: notifTrade, set: setNotifTrade },
                  { label: 'Risk Alerts', sub: 'Alert me when drawdown or risk thresholds are breached', value: notifAlert, set: setNotifAlert },
                ].map((n, i) => (
                  <div key={n.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0', borderBottom: i < 2 ? '1px solid var(--border)' : 'none', gap: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--white)', marginBottom: '0.2rem' }}>{n.label}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{n.sub}</div>
                    </div>
                    <button onClick={() => n.set(!n.value)} style={{ width: 42, height: 24, borderRadius: 12, background: n.value ? 'var(--mint)' : 'var(--bg4)', border: `1px solid ${n.value ? 'var(--mint)' : 'var(--border)'}`, cursor: 'pointer', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: n.value ? 21 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1.25rem' }}>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '0.55rem 1.4rem' }}>Save Preferences</button>
              </div>
            </Panel>
          )}

          {/* HISTORY */}
          {section === 'history' && (
            <Panel title="Transaction History">
              {transactions.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--faint)' }}>NO TRANSACTIONS YET</div>
              ) : (
                <div style={{ overflowX: 'auto', margin: '0 -1.5rem -1.5rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['DATE', 'TYPE', 'AMOUNT', 'NOTE'].map(h => (
                          <th key={h} style={{ padding: '0.65rem 1.5rem', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: '0.5rem', fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.1em', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx, i) => (
                        <tr key={tx.id} style={{ borderBottom: i < transactions.length - 1 ? '1px solid rgba(30,42,61,0.5)' : 'none' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <td style={{ padding: '0.75rem 1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--faint)', whiteSpace: 'nowrap' }}>{fmtDate(tx.created_at)}</td>
                          <td style={{ padding: '0.75rem 1.5rem' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600, color: TX_COLORS[tx.type] ?? 'var(--muted)', background: `${TX_COLORS[tx.type] ?? 'var(--muted)'}18`, border: `1px solid ${TX_COLORS[tx.type] ?? 'var(--border)'}28`, borderRadius: 5, padding: '0.15rem 0.5rem' }}>
                              {TX_LABELS[tx.type] ?? tx.type}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: tx.amount_cents >= 0 ? 'var(--mint)' : 'var(--red)', whiteSpace: 'nowrap' }}>
                            {fmtUSD(tx.amount_cents)}
                          </td>
                          <td style={{ padding: '0.75rem 1.5rem', fontSize: '0.78rem', color: 'var(--muted)' }}>{tx.note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>

      <style>{`
        @media(max-width:768px){ .settings-grid{grid-template-columns:1fr!important} }
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
      `}</style>
    </div>
  )
}

function Panel({ title, children, danger }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${danger ? 'rgba(228,88,103,0.2)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${danger ? 'rgba(228,88,103,0.15)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: 3, height: 12, borderRadius: 2, background: danger ? 'var(--red)' : 'var(--blue)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 700, color: danger ? 'var(--red)' : 'var(--faint)', letterSpacing: '0.1em' }}>{title.toUpperCase()}</span>
      </div>
      <div style={{ padding: '1.5rem' }}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.52rem', letterSpacing: '0.1em', color: 'var(--faint)', marginBottom: '0.4rem', fontWeight: 700 }}>{label}</label>
      {children}
    </div>
  )
}

function Msg({ text }: { text: string }) {
  const ok = text.includes('success') || text.includes('updated')
  return (
    <div style={{ fontSize: '0.82rem', padding: '0.6rem 0.85rem', borderRadius: 8, background: ok ? 'rgba(22,199,132,0.08)' : 'rgba(228,88,103,0.08)', border: `1px solid ${ok ? 'rgba(22,199,132,0.2)' : 'rgba(228,88,103,0.2)'}`, color: ok ? 'var(--mint)' : 'var(--red)' }}>
      {text}
    </div>
  )
}
