'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const supabase = createClient()
  const [account, setAccount] = useState<{alpaca_account_id: string; account_number: string; status: string} | null>(null)

  useEffect(() => {
    fetch('/api/broker/create-account')
      .then(r => r.json())
      .then(d => {
        if (d.has_account) setAccount(d)
      })
      .catch(() => null)
  }, [])

  return (
    <div style={{ maxWidth: 600, padding: '2rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem' }}>Settings</h1>

      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Brokerage Account</h2>
        
        {account ? (
          <div style={{ 
            padding: '1.5rem', 
            background: 'var(--bg2)', 
            borderRadius: 12,
            border: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.25rem' }}>ACCOUNT</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{account.account_number}</div>
              </div>
              <span style={{ 
                fontSize: '0.7rem', 
                padding: '0.25rem 0.5rem',
                borderRadius: 4,
                background: account.status === 'ACTIVE' ? 'rgba(0,255,150,0.15)' : 'rgba(255,200,0,0.15)',
                color: account.status === 'ACTIVE' ? 'var(--mint)' : 'var(--yellow)'
              }}>
                {account.status}
              </span>
            </div>

            <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              Manage your account through the Account Management modal.
            </p>
          </div>
        ) : (
          <div style={{ 
            padding: '1.5rem', 
            background: 'var(--bg2)', 
            borderRadius: 12,
            border: '1px solid var(--border)'
          }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              No brokerage account connected.
            </p>
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Account</h2>
        
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 8,
            border: '1px solid var(--red)',
            background: 'transparent',
            color: 'var(--red)',
            fontSize: '0.9rem',
            cursor: 'pointer',
            width: '100%'
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}