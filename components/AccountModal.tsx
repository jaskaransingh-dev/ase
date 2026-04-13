'use client'

import { useState, useEffect } from 'react'

interface AccountModalProps {
  onClose: () => void
  onSuccess?: () => void
}

type Step = 
  | 'menu'
  | 'create-account'
  | 'kyc-form'
  | 'link-bank'
  | 'deposit'
  | 'withdraw'
  | 'loading'
  | 'success'
  | 'error'

interface BrokerAccount {
  has_account: boolean
  account_id: string | null
  account_number: string | null
  status: string | null
  trading_enabled: boolean
}

interface BankLink {
  id: string
  alpaca_relationship_id: string
  bank_name: string
  bank_account_type: string
  account_last4: string
  status: string
}

interface Balance {
  cash: string
  portfolio_value: string
}

export default function AccountModal({ onClose, onSuccess }: AccountModalProps) {
  const [step, setStep] = useState<Step>('menu')
  const [account, setAccount] = useState<BrokerAccount | null>(null)
  const [bankLinks, setBankLinks] = useState<BankLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [kycData, setKycData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    date_of_birth: '',
    ssn: '',
    street_address: '',
    city: '',
    state: '',
    postal_code: '',
  })

  const [depositAmount, setDepositAmount] = useState('1000')
  const [withdrawAmount, setWithdrawAmount] = useState('1000')
  const [balance, setBalance] = useState<Balance | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [accountRes, bankRes, balanceRes] = await Promise.all([
        fetch('/api/broker/create-account'),
        fetch('/api/broker/bank-link'),
        fetch('/api/broker/balance'),
      ])
      const accountData = await accountRes.json()
      const bankData = await bankRes.json()
      const balanceData = await balanceRes.json()
      setAccount(accountData)
      setBankLinks(bankData.bank_links || [])
      setBalance(balanceData)
    } catch (e) {
      console.error('Failed to load data:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateAccount() {
    if (!kycData.first_name || !kycData.last_name || !kycData.email || 
        !kycData.date_of_birth || !kycData.street_address ||
        !kycData.city || !kycData.state || !kycData.postal_code) {
      setError('Please fill in all required fields')
      return
    }

    setStep('loading')
    setError('')

    try {
      const res = await fetch('/api/broker/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kycData),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create account')
      }

      setSuccessMessage(data.message || 'Account created!')
      setStep('success')
      loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creating account')
      setStep('error')
    }
  }

  async function handleLinkBank() {
    setStep('loading')
    setError('')

    try {
      const tokenRes = await fetch('/api/broker/plaid/link-token', { method: 'POST' })
      const tokenData = await tokenRes.json()

      if (tokenData.demo) {
        await new Promise(r => setTimeout(r, 1500))
        
        const res = await fetch('/api/broker/plaid/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            public_token: 'demo-public-token',
            bank_account_type: 'CHECKING',
          }),
        })
        
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to link bank (demo mode)')
        }
        
        setSuccessMessage('Bank account linked in demo mode!')
        setStep('success')
        loadData()
        return
      }

      if (typeof window !== 'undefined' && (window as any).Plaid) {
        const handler = (window as any).Plaid.create({
          token: tokenData.link_token,
          onSuccess: async (public_token: string) => {
            const res = await fetch('/api/broker/plaid/exchange-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ public_token }),
            })
            
            if (!res.ok) {
              const data = await res.json()
              throw new Error(data.error || 'Failed to link bank')
            }
            
            setSuccessMessage('Bank account linked successfully!')
            setStep('success')
            loadData()
          },
          onExit: () => {
            setStep('menu')
          },
        })
        handler.open()
      } else {
        throw new Error('Plaid not available')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error linking bank')
      setStep('error')
    }
  }

  async function handleDeposit() {
    const amount = parseInt(depositAmount)
    if (!amount || amount < 100) {
      setError('Minimum deposit is $100')
      return
    }

    setStep('loading')
    setError('')

    try {
      const res = await fetch('/api/broker/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: amount * 100 }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate deposit')
      }

      setSuccessMessage('Deposit initiated! Funds will arrive in 2-5 business days.')
      setStep('success')
      loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error initiating deposit')
      setStep('error')
    }
  }

  async function handleWithdraw() {
    const amount = parseInt(withdrawAmount)
    if (!amount || amount < 100) {
      setError('Minimum withdrawal is $100')
      return
    }

    setStep('loading')
    setError('')

    try {
      const res = await fetch('/api/broker/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: amount * 100 }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate withdrawal')
      }

      setSuccessMessage('Withdrawal initiated! Funds will arrive in 2-5 business days.')
      setStep('success')
      loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error initiating withdrawal')
      setStep('error')
    }
  }

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ fontWeight: 600 }}>Loading...</div>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2rem', width: '100%', maxWidth: 400, textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Success!</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>{successMessage}</p>
          <button
            onClick={() => { onSuccess?.(); onClose() }}
            style={{
              width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
              background: 'var(--blue)', color: 'white', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2rem', width: '100%', maxWidth: 400, textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✕</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Error</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--red)', marginBottom: '1.5rem' }}>{error}</p>
          <button
            onClick={() => setStep('menu')}
            style={{
              width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
              background: 'var(--blue)', color: 'white', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (step === 'loading') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ fontWeight: 600 }}>Processing...</div>
        </div>
      </div>
    )
  }

  if (step === 'menu') {
    const rawHasAccount = account?.has_account
    const accountStatus = account?.status?.toUpperCase()
    const isAccountMissing = !rawHasAccount || !accountStatus || accountStatus === 'NOT_FOUND'
    const hasActiveAccount = rawHasAccount && ['ACTIVE', 'APPROVED'].includes(accountStatus || '')
    const shouldCreateAccount = isAccountMissing || !hasActiveAccount
    const hasAnyBankLink = bankLinks.length > 0
    const hasActiveBankLink = bankLinks.some(b => b.status === 'ACTIVE')

    function formatAmount(amt: string | number | undefined) {
      const val = typeof amt === 'string' ? parseFloat(amt) : (amt || 0)
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2rem', width: '100%', maxWidth: 440
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Account Management</h2>
            {shouldCreateAccount && (
              <button 
                onClick={() => setStep('kyc-form')}
                style={{ 
                  padding: '0.4rem 0.75rem', borderRadius: 6, border: '1px solid var(--blue)', 
                  background: 'var(--blue)', color: 'white', fontSize: '0.75rem', cursor: 'pointer' 
                }}
              >
                + Create Account
              </button>
            )}
          </div>
          {shouldCreateAccount ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
              <p style={{ fontSize: '1rem', fontWeight: 600, color: 'white', marginBottom: '0.5rem' }}>
                No Brokerage Account
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
                Create a brokerage account to trade with real money
              </p>
              <button
                onClick={() => setStep('kyc-form')}
                style={{
                  width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
                  background: 'var(--blue)', color: 'white', fontWeight: 700, cursor: 'pointer'
                }}
              >
                Create Brokerage Account
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--bg3)', borderRadius: 12, border: `1px solid ${hasActiveAccount ? 'var(--mint)' : 'var(--border)'}` }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.25rem' }}>BROKERAGE ACCOUNT</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'white', marginBottom: '0.25rem' }}>
                ****{account?.account_number?.slice(-4)}
              </div>
              <div style={{ fontSize: '0.7rem', color: hasActiveAccount ? 'var(--mint)' : 'var(--yellow)', textTransform: 'uppercase' }}>
                {account?.status}
                {!hasActiveAccount && ' - Trading disabled'}
              </div>
              {balance && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                    <span style={{ color: 'var(--faint)' }}>Cash</span>
                    <span style={{ color: 'white', fontFamily: 'var(--font-mono)' }}>${Number(balance.cash || 0).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                    <span style={{ color: 'var(--faint)' }}>Portfolio</span>
                    <span style={{ color: 'white', fontFamily: 'var(--font-mono)' }}>${Number(balance.portfolio_value || 0).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {rawHasAccount && !hasActiveAccount && (
            <div style={{ fontSize: '0.75rem', color: 'var(--yellow)', marginBottom: '1rem', padding: '0.5rem', background: 'rgba(255,200,0,0.1)', borderRadius: 8 }}>
              ℹ️ Account pending verification. You can link bank & deposit, but trading disabled until approved.
            </div>
          )}

          {rawHasAccount && !hasAnyBankLink && (
            <button
              onClick={handleLinkBank}
              style={{
                width: '100%', padding: '1rem', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--bg3)', color: 'var(--white)', fontWeight: 600, cursor: 'pointer',
                marginBottom: '0.75rem'
              }}
            >
              Link Bank Account (Plaid)
            </button>
          )}

          {rawHasAccount && hasActiveBankLink && (
            <>
              <button
                onClick={() => setStep('deposit')}
                style={{
                  width: '100%', padding: '1rem', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--bg3)', color: 'var(--white)', fontWeight: 600, cursor: 'pointer',
                  marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}
              >
                <span>Deposit Funds</span>
                <span style={{ color: 'var(--mint)' }}>+ $</span>
              </button>
              <button
                onClick={() => setStep('withdraw')}
                style={{
                  width: '100%', padding: '1rem', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--bg3)', color: 'var(--white)', fontWeight: 600, cursor: 'pointer',
                  marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}
              >
                <span>Withdraw Funds</span>
                <span style={{ color: 'var(--red)' }}>- $</span>
              </button>
            </>
          )}

          {bankLinks.length > 0 && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg3)', borderRadius: 12 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>LINKED ACCOUNTS</div>
              {bankLinks.filter(b => b.status === 'ACTIVE').map(b => (
                <div key={b.id} style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {b.bank_name} •••• {b.account_last4}
                </div>
              ))}
            </div>
          )}

          <button onClick={onClose} style={{
            marginTop: '1.5rem', width: '100%', padding: '0.75rem', borderRadius: 10,
            background: 'transparent', color: 'var(--muted)', cursor: 'pointer'
          }}>
            Close
          </button>
        </div>
      </div>
    )
  }

  if (step === 'kyc-form') {
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2rem', width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Create Brokerage Account</h2>
            <button onClick={() => setStep('menu')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.25rem' }}>×</button>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '1.5rem', padding: '0.75rem', background: 'rgba(59,130,246,0.1)', borderRadius: 8, borderLeft: '3px solid var(--blue)' }}>
            ℹ️ This creates a trading account with Alpaca Securities. All information is required for SEC compliance.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.3rem' }}>FIRST NAME</label>
              <input
                type="text"
                value={kycData.first_name}
                onChange={e => setKycData({ ...kycData, first_name: e.target.value })}
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: 'white', fontSize: '0.85rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.3rem' }}>LAST NAME</label>
              <input
                type="text"
                value={kycData.last_name}
                onChange={e => setKycData({ ...kycData, last_name: e.target.value })}
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: 'white', fontSize: '0.85rem'
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.3rem' }}>EMAIL</label>
            <input
              type="email"
              value={kycData.email}
              onChange={e => setKycData({ ...kycData, email: e.target.value })}
              style={{
                width: '100%', padding: '0.6rem', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'white', fontSize: '0.85rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.3rem' }}>PHONE (optional)</label>
            <input
              type="tel"
              value={kycData.phone}
              onChange={e => setKycData({ ...kycData, phone: e.target.value })}
              style={{
                width: '100%', padding: '0.6rem', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'white', fontSize: '0.85rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.3rem' }}>DATE OF BIRTH</label>
            <input
              type="date"
              value={kycData.date_of_birth}
              onChange={e => setKycData({ ...kycData, date_of_birth: e.target.value })}
              style={{
                width: '100%', padding: '0.6rem', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'white', fontSize: '0.85rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.3rem' }}>SSN (full 9 digits)</label>
            <input
              type="password"
              maxLength={11}
              value={kycData.ssn}
              onChange={e => setKycData({ ...kycData, ssn: e.target.value.replace(/\D/g, '') })}
              placeholder="XXX-XX-XXXX"
              style={{
                width: '100%', padding: '0.6rem', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'white', fontSize: '0.85rem'
              }}
            />
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.3rem' }}>STREET ADDRESS</label>
            <input
              type="text"
              value={kycData.street_address}
              onChange={e => setKycData({ ...kycData, street_address: e.target.value })}
              style={{
                width: '100%', padding: '0.6rem', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'white', fontSize: '0.85rem'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.3rem' }}>CITY</label>
              <input
                type="text"
                value={kycData.city}
                onChange={e => setKycData({ ...kycData, city: e.target.value })}
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: 'white', fontSize: '0.85rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.3rem' }}>STATE</label>
              <input
                type="text"
                value={kycData.state}
                onChange={e => setKycData({ ...kycData, state: e.target.value })}
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: 'white', fontSize: '0.85rem'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.3rem' }}>ZIP</label>
              <input
                type="text"
                value={kycData.postal_code}
                onChange={e => setKycData({ ...kycData, postal_code: e.target.value })}
                style={{
                  width: '100%', padding: '0.6rem', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: 'white', fontSize: '0.85rem'
                }}
              />
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: '1rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,90,95,0.1)', color: 'var(--red)', fontSize: '0.8rem' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleCreateAccount}
            style={{
              width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
              background: 'var(--blue)', color: 'white', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Create Account
          </button>

          <button onClick={() => setStep('menu')} style={{
            marginTop: '0.75rem', width: '100%', padding: '0.75rem', borderRadius: 10,
            background: 'transparent', color: 'var(--muted)', cursor: 'pointer'
          }}>
            Back
          </button>

          <p style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '1rem', textAlign: 'center' }}>
            Your information is securely processed by Alpaca for KYC verification.
          </p>
        </div>
      </div>
    )
  }

  if (step === 'deposit') {
    const linkedBank = bankLinks.find(b => b.status === 'ACTIVE')
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2rem', width: '100%', maxWidth: 380
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Deposit Funds</h2>
            <button onClick={() => setStep('menu')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.25rem' }}>×</button>
          </div>
          {linkedBank && (
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '1rem', padding: '0.5rem', background: 'var(--bg3)', borderRadius: 8 }}>
              From: {linkedBank.bank_name} ••••{linkedBank.account_last4}
            </div>
          )}

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>AMOUNT (USD)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
              <input
                type="number"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                min={100}
                style={{
                  width: '100%', padding: '0.75rem 0.75rem 0.75rem 1.5rem',
                  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: 'white', fontSize: '1rem', fontFamily: 'var(--font-mono)'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              {[500, 1000, 2500, 5000].map(amt => (
                <button
                  key={amt}
                  onClick={() => setDepositAmount(String(amt))}
                  style={{
                    flex: 1, padding: '0.4rem', borderRadius: 6, border: '1px solid var(--border)',
                    background: depositAmount === String(amt) ? 'var(--blue)' : 'transparent',
                    color: depositAmount === String(amt) ? 'white' : 'var(--muted)',
                    fontSize: '0.7rem', cursor: 'pointer'
                  }}
                >
                  ${amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: '1rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,90,95,0.1)', color: 'var(--red)', fontSize: '0.8rem' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleDeposit}
            style={{
              width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
              background: 'var(--blue)', color: 'white', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Initiate Deposit
          </button>

          <button onClick={() => setStep('menu')} style={{
            marginTop: '0.75rem', width: '100%', padding: '0.75rem', borderRadius: 10,
            background: 'transparent', color: 'var(--muted)', cursor: 'pointer'
          }}>
            Cancel
          </button>

          <p style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '1rem', textAlign: 'center' }}>
            Deposits typically take 2-5 business days to clear.
          </p>
        </div>
      </div>
    )
  }

  if (step === 'withdraw') {
    return (
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2rem', width: '100%', maxWidth: 380
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Withdraw Funds</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
            Transfer money to your linked bank account.
          </p>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>AMOUNT (USD)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>$</span>
              <input
                type="number"
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                min={100}
                style={{
                  width: '100%', padding: '0.75rem 0.75rem 0.75rem 1.5rem',
                  borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: 'white', fontSize: '1rem', fontFamily: 'var(--font-mono)'
                }}
              />
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: '1rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,90,95,0.1)', color: 'var(--red)', fontSize: '0.8rem' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleWithdraw}
            style={{
              width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
              background: 'var(--blue)', color: 'white', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Initiate Withdrawal
          </button>

          <button onClick={() => setStep('menu')} style={{
            marginTop: '0.75rem', width: '100%', padding: '0.75rem', borderRadius: 10,
            background: 'transparent', color: 'var(--muted)', cursor: 'pointer'
          }}>
            Cancel
          </button>

          <p style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '1rem', textAlign: 'center' }}>
            Withdrawals typically take 2-5 business days.
          </p>
        </div>
      </div>
    )
  }

  return null
}