'use client'

import { useEffect, useState } from 'react'

interface BrokerAccount {
  has_account: boolean
  account_id: string | null
  account_number: string | null
  status: string | null
  trading_enabled: boolean
  cash?: string
  portfolio_value?: string
  buying_power?: string
  has_bank_link?: boolean
}

interface BankLink {
  id: string
  bank_name: string
  account_last4: string
  status: string
}

interface FundingModalProps {
  onClose: () => void
}

type Step = 'method' | 'amount' | 'linking' | 'processing' | 'success' | 'error'

export default function FundingModal({ onClose }: FundingModalProps) {
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<BrokerAccount | null>(null)
  const [bankLinks, setBankLinks] = useState<BankLink[]>([])
  const [step, setStep] = useState<Step>('method')
  const [amount, setAmount] = useState('5000')
  const [method, setMethod] = useState<'virtual' | 'bank'>('virtual')
  const [error, setError] = useState('')
  const [linkToken, setLinkToken] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [accountRes, bankRes] = await Promise.all([
        fetch('/api/broker/account'),
        fetch('/api/broker/bank-link'),
      ])
      const accountData = await accountRes.json()
      const bankData = await bankRes.json()
      setAccount(accountData)
      setBankLinks(bankData.bank_links || [])
    } catch (e) {
      console.error('Failed to load data:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleAddVirtualFunds() {
    const amountNum = parseInt(amount)
    if (!amountNum || amountNum < 100) {
      setError('Minimum $100')
      return
    }

    setStep('processing')
    setError('')

    try {
      const res = await fetch('/api/broker/fund-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: amountNum }),
      })

      if (res.ok) {
        const data = await res.json()
        // Update the account cash with the new balance from the API
        if (data.new_balance_cents !== undefined) {
          setAccount(prev => prev ? { ...prev, cash: (data.new_balance_cents / 100).toString() } : null)
        }
        setStep('success')
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to add funds')
        setStep('amount')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      setStep('amount')
    }
  }

  async function handleBankDeposit() {
    if (!account?.has_bank_link) {
      // Need to link bank first
      await initiateBankLink()
      return
    }

    const amountNum = parseInt(amount)
    if (!amountNum || amountNum < 10) {
      setError('Minimum $10')
      return
    }

    setStep('processing')
    setError('')

    try {
      const res = await fetch('/api/broker/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: amountNum * 100 }),
      })

      if (res.ok) {
        setStep('success')
        loadData()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to deposit')
        setStep('amount')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      setStep('amount')
    }
  }

  async function initiateBankLink() {
    setStep('linking')
    setError('')

    try {
      const res = await fetch('/api/broker/plaid/link-token', { method: 'POST' })
      const data = await res.json()

      if (data.link_token) {
        setLinkToken(data.link_token)
        
        // In demo mode, simulate the flow
        if (data.demo) {
          await new Promise(r => setTimeout(r, 1500))
          await completeDemoLink()
        } else if (typeof window !== 'undefined' && (window as any).Plaid) {
          const handler = (window as any).Plaid.create({
            token: data.link_token,
            onSuccess: async (public_token: string) => {
              await completeBankLink(public_token)
            },
            onExit: () => {
              setStep('method')
            },
          })
          handler.open()
        }
      }
    } catch (e) {
      setError('Failed to initiate bank linking')
      setStep('method')
    }
  }

  async function completeDemoLink() {
    try {
      const res = await fetch('/api/broker/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          public_token: 'demo-public-token',
          bank_account_type: 'CHECKING',
        }),
      })
      
      if (res.ok) {
        await loadData()
        setStep('amount')
      } else {
        throw new Error('Failed to link bank')
      }
    } catch (e) {
      setError('Bank linking failed')
      setStep('method')
    }
  }

  async function completeBankLink(publicToken: string) {
    try {
      const res = await fetch('/api/broker/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token: publicToken }),
      })
      
      if (res.ok) {
        await loadData()
        setStep('amount')
      } else {
        throw new Error('Failed to link bank')
      }
    } catch (e) {
      setError('Bank linking failed')
      setStep('method')
    }
  }

  async function handleSubmit() {
    if (method === 'virtual') {
      await handleAddVirtualFunds()
    } else {
      await handleBankDeposit()
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
          <div className="spinner" style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <div style={{ fontWeight: 600 }}>Loading...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
          background: 'var(--bg2)', border: '1px solid var(--mint)', borderRadius: 20,
          padding: '2.5rem', width: '100%', maxWidth: 380, textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', color: 'var(--mint)' }}>✓</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--white)' }}>Funds Added!</h2>
          <p style={{ fontSize: '0.95rem', color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            {method === 'virtual' 
              ? `$${parseInt(amount).toLocaleString()} in virtual cash added to your paper account.`
              : `$${parseInt(amount).toLocaleString()} deposit initiated. Funds will arrive in 2-5 business days.`
            }
          </p>
          <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>NEW BALANCE</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--mint)' }}>
              ${account?.cash ? parseFloat(account.cash).toLocaleString() : '0.00'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
              background: 'var(--mint)', color: 'var(--bg)', fontWeight: 700, cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  if (step === 'linking') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2.5rem', width: '100%', maxWidth: 380, textAlign: 'center'
        }}>
          <div className="spinner" style={{ width: 48, height: 48, border: '3px solid var(--border)', borderTopColor: 'var(--blue)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Connecting Bank</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5 }}>
            Opening Plaid to securely link your bank account...
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  if (step === 'processing') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
      }}>
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '2.5rem', width: '100%', maxWidth: 380, textAlign: 'center'
        }}>
          <div className="spinner" style={{ width: 48, height: 48, border: '3px solid var(--border)', borderTopColor: 'var(--mint)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            {method === 'virtual' ? 'Adding Funds...' : 'Processing Deposit...'}
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5 }}>
            {method === 'virtual' 
              ? 'Adding virtual cash to your paper account.'
              : 'Initiating ACH transfer from your bank.'
            }
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  const hasBankLink = account?.has_bank_link || bankLinks.some(b => b.status === 'ACTIVE')

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
        padding: '2rem', width: '100%', maxWidth: 420
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--white)' }}>Add Funds</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
              Current: <span style={{ color: 'var(--mint)', fontFamily: 'var(--font-mono)' }}>
                ${account?.cash ? parseFloat(account.cash).toFixed(2) : '0.00'}
              </span>
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.25rem', padding: '0.25rem' }}>×</button>
        </div>

        {/* Method Selection */}
        {step === 'method' && (
          <>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
              <button
                onClick={() => setMethod('virtual')}
                style={{
                  flex: 1,
                  padding: '1rem',
                  borderRadius: 12,
                  border: `2px solid ${method === 'virtual' ? 'var(--blue)' : 'var(--border)'}`,
                  background: method === 'virtual' ? 'rgba(59,130,246,0.1)' : 'var(--bg3)',
                  color: method === 'virtual' ? 'var(--blue)' : 'var(--muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>Paper Trading</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Virtual funds for testing</div>
              </button>
              <button
                onClick={() => setMethod('bank')}
                disabled={!account?.has_account}
                style={{
                  flex: 1,
                  padding: '1rem',
                  borderRadius: 12,
                  border: `2px solid ${method === 'bank' ? 'var(--mint)' : 'var(--border)'}`,
                  background: method === 'bank' ? 'rgba(0,229,153,0.1)' : 'var(--bg3)',
                  color: method === 'bank' ? 'var(--mint)' : account?.has_account ? 'var(--muted)' : 'var(--faint)',
                  cursor: account?.has_account ? 'pointer' : 'not-allowed',
                  textAlign: 'left',
                  opacity: account?.has_account ? 1 : 0.5,
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>Real Money</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                  {hasBankLink ? 'Bank linked - deposit real funds' : 'Link bank to fund'}
                </div>
              </button>
            </div>

            {method === 'bank' && !hasBankLink && (
              <div style={{ padding: '1rem', background: 'rgba(0,229,153,0.1)', borderRadius: 12, marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ fontSize: '1.5rem' }}>🏦</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--mint)' }}>Link Your Bank</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Securely connect with Plaid</div>
                  </div>
                </div>
                <button
                  onClick={initiateBankLink}
                  style={{
                    width: '100%', marginTop: '1rem', padding: '0.75rem',
                    borderRadius: 8, border: '1px solid var(--mint)',
                    background: 'transparent', color: 'var(--mint)', fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Link Bank Account →
                </button>
              </div>
            )}

            {method === 'bank' && hasBankLink && (
              <button onClick={() => setStep('amount')} style={{
                width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
                background: 'var(--mint)', color: 'var(--bg)', fontWeight: 700, cursor: 'pointer'
              }}>
                Continue to Amount →
              </button>
            )}

            {method === 'virtual' && (
              <button onClick={() => setStep('amount')} style={{
                width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
                background: 'var(--blue)', color: 'white', fontWeight: 700, cursor: 'pointer'
              }}>
                Continue to Amount →
              </button>
            )}
          </>
        )}

        {/* Amount Selection */}
        {step === 'amount' && (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Amount ({method === 'virtual' ? 'Virtual USD' : 'Real USD'})
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: '1.25rem', fontWeight: 600 }}>$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min={method === 'virtual' ? 100 : 10}
                  max={method === 'virtual' ? 100000 : 100000}
                  style={{
                    width: '100%', padding: '1rem 1rem 1rem 2rem',
                    borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg3)',
                    color: 'white', fontSize: '1.5rem', fontFamily: 'var(--font-mono)', fontWeight: 600
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                {(method === 'virtual' ? [1000, 5000, 10000, 25000] : [100, 500, 1000, 2500]).map(amt => (
                  <button
                    key={amt}
                    onClick={() => setAmount(String(amt))}
                    style={{
                      flex: 1, padding: '0.5rem', borderRadius: 8, border: '1px solid var(--border)',
                      background: amount === String(amt) ? 'var(--blue)' : 'transparent',
                      color: amount === String(amt) ? 'white' : 'var(--muted)',
                      fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'var(--font-mono)'
                    }}
                  >
                    ${amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: 8, background: 'rgba(255,90,95,0.1)', color: 'var(--red)', fontSize: '0.8rem' }}>
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              style={{
                width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
                background: 'var(--mint)', color: 'var(--bg)', fontWeight: 700, cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              {method === 'virtual' 
                ? `Add $${parseInt(amount || '0').toLocaleString()} Virtual` 
                : `Deposit $${parseInt(amount || '0').toLocaleString()}`
              }
            </button>

            <button onClick={() => setStep('method')} style={{
              marginTop: '0.75rem', width: '100%', padding: '0.75rem', borderRadius: 10,
              background: 'transparent', color: 'var(--muted)', cursor: 'pointer'
            }}>
              ← Back
            </button>

            {method === 'bank' && (
              <p style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '1rem', textAlign: 'center' }}>
                Deposits typically arrive in 2-5 business days via ACH transfer
              </p>
            )}
            {method === 'virtual' && (
              <p style={{ fontSize: '0.65rem', color: 'var(--faint)', marginTop: '1rem', textAlign: 'center' }}>
                Paper trading - no real money, for testing only
              </p>
            )}
          </>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  )
}