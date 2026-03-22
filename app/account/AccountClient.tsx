'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtUSD, fmtDateTime } from '@/lib/utils'

interface Props {
  user: { id: string; email: string; name: string }
  transactions: Array<{ id: string; type: string; amount_cents: number; note: string; created_at: string }>
}

const TX_LABELS: Record<string, string> = {
  deposit: 'Credit Deposit',
  invest: 'Invested in Agent',
  divest: 'Position Closed',
  return: 'Return Credited',
}

export default function AccountClient({ user, transactions }: Props) {
  const supabase = createClient()
  const [name, setName] = useState(user.name)
  const [password, setPassword] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileLoading(true)
    setProfileMsg('')
    const { error } = await supabase.from('profiles').update({ display_name: name }).eq('id', user.id)
    setProfileMsg(error ? error.message : '✅ Profile updated')
    setProfileLoading(false)
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (password !== pwConfirm) { setPwMsg('Passwords do not match'); return }
    if (password.length < 8) { setPwMsg('Password must be at least 8 characters'); return }
    setPwLoading(true)
    setPwMsg('')
    const { error } = await supabase.auth.updateUser({ password })
    setPwMsg(error ? error.message : '✅ Password updated')
    if (!error) { setPassword(''); setPwConfirm('') }
    setPwLoading(false)
  }

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 720 }}>
      <div className="eyebrow" style={{ marginBottom: '.35rem' }}>SETTINGS</div>
      <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800, marginBottom: '2rem' }}>Account</h1>

      {/* Profile */}
      <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem' }}>Profile</h2>
        <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.45rem' }}>DISPLAY NAME</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="input-base" />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.45rem' }}>EMAIL (READ-ONLY)</label>
            <input type="email" value={user.email} readOnly className="input-base" style={{ opacity: .5, cursor: 'not-allowed' }} />
          </div>
          {profileMsg && <div style={{ fontSize: '.85rem', color: profileMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{profileMsg}</div>}
          <div>
            <button type="submit" disabled={profileLoading} className="btn-secondary" style={{ fontSize: '.85rem', padding: '.6rem 1.1rem' }}>
              {profileLoading ? <><span className="spinner" />Saving...</> : 'Save Changes'}
            </button>
          </div>
        </form>
      </section>

      {/* Password */}
      <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', marginBottom: '1.25rem' }}>
        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem' }}>Change Password</h2>
        <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.45rem' }}>NEW PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} placeholder="••••••••" className="input-base" />
          </div>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.08em', color: 'var(--faint)', marginBottom: '.45rem' }}>CONFIRM PASSWORD</label>
            <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="••••••••" className="input-base" />
          </div>
          {pwMsg && <div style={{ fontSize: '.85rem', color: pwMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{pwMsg}</div>}
          <div>
            <button type="submit" disabled={pwLoading} className="btn-secondary" style={{ fontSize: '.85rem', padding: '.6rem 1.1rem' }}>
              {pwLoading ? <><span className="spinner" />Updating...</> : 'Update Password'}
            </button>
          </div>
        </form>
      </section>

      {/* Transaction History */}
      <section style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem' }}>Transaction History</h2>
        {transactions.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '.88rem', padding: '1rem 0', textAlign: 'center' }}>No transactions yet</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>DATE</th>
                <th>TYPE</th>
                <th>NOTE</th>
                <th style={{ textAlign: 'right' }}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => {
                const isPos = ['deposit', 'divest', 'return'].includes(t.type)
                return (
                  <tr key={t.id}>
                    <td style={{ color: 'var(--faint)' }}>{fmtDateTime(t.created_at)}</td>
                    <td>{TX_LABELS[t.type] || t.type}</td>
                    <td style={{ color: 'var(--muted)' }}>{t.note || '—'}</td>
                    <td style={{ textAlign: 'right', color: isPos ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {isPos ? '+' : ''}{fmtUSD(Math.abs(t.amount_cents))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
