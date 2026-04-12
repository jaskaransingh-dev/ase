'use client'

import { useState, useEffect } from 'react'

interface Props {
  onClose: () => void
  onFunded?: () => void
}

export default function FundingModal({ onClose, onFunded }: Props) {
  const [loading, setLoading] = useState(true)
  const [instructions, setInstructions] = useState<any>(null)
  const [selectedMethod, setSelectedMethod] = useState<'ach' | 'wire'>('ach')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/deposit/instructions')
      .then(r => r.json())
      .then(d => setInstructions(d))
      .catch(() => setInstructions({ error: 'Failed to load instructions' }))
      .finally(() => setLoading(false))
  }, [])

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>Loading funding options...</div>
      </div>
    )
  }

  if (instructions?.needs_connection) {
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
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>
            Connect Account First
          </h2>
          <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
            You need to connect your Alpaca account before adding funds.
          </p>
          <button
            onClick={() => window.location.href = '/api/auth/alpaca/connect'}
            style={{
              width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
              background: 'var(--blue)', color: 'white', fontWeight: 700, cursor: 'pointer'
            }}
          >
            Connect Alpaca Account →
          </button>
          <button onClick={onClose} style={{
            marginTop: '0.75rem', width: '100%', padding: '0.75rem', borderRadius: 10,
            background: 'transparent', color: 'var(--muted)', cursor: 'pointer'
          }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(4,3,12,.95)', backdropFilter: 'blur(20px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20,
        padding: '2rem', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Add Funds to Your Account</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Add funds to your Alpaca trading account to invest in AI agents. Funds are held by Alpaca Securities, member FINRA/SIPC.
        </p>

        {/* Quick Start */}
        {instructions?.quick_start && (
          <div style={{ background: 'rgba(0,229,153,.08)', border: '1px solid rgba(0,229,153,.2)', borderRadius: 12, padding: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--mint)', marginBottom: '0.5rem', fontSize: '0.85rem' }}>⚡ Quickest Way (ACH)</div>
            {instructions.quick_start.steps.map((step: string, i: number) => (
              <div key={i} style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>{step}</div>
            ))}
            <a href="https://app.alpaca.markets/dashboard/funding" target="_blank" style={{
              display: 'block', marginTop: '0.75rem', padding: '0.5rem', borderRadius: 8, background: 'var(--mint)',
              color: '#000', textAlign: 'center', fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none'
            }}>
              Go to Alpaca Funding →
            </a>
          </div>
        )}

        {/* Method Selector */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button onClick={() => setSelectedMethod('ach')} style={{
            flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none',
            background: selectedMethod === 'ach' ? 'var(--blue)' : 'var(--bg3)',
            color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
          }}>
            ACH Transfer
          </button>
          <button onClick={() => setSelectedMethod('wire')} style={{
            flex: 1, padding: '0.75rem', borderRadius: 8, border: 'none',
            background: selectedMethod === 'wire' ? 'var(--blue)' : 'var(--bg3)',
            color: 'white', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer'
          }}>
            Wire Transfer
          </button>
        </div>

        {selectedMethod === 'ach' && (
          <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '1rem' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>ACH Transfer (Recommended)</h3>
            <ul style={{ fontSize: '0.75rem', color: 'var(--muted)', paddingLeft: '1rem', marginBottom: '0.75rem' }}>
              <li>2-5 business days</li>
              <li>Up to $50,000/day</li>
              <li>Link bank once, transfers after</li>
            </ul>
            <a href="https://app.alpaca.markets/dashboard/funding" target="_blank" style={{
              display: 'block', padding: '0.6rem', borderRadius: 8, border: '1px solid var(--border)',
              color: 'var(--blue)', textAlign: 'center', fontSize: '0.8rem', textDecoration: 'none'
            }}>
              Open Alpaca Funding ↗
            </a>
          </div>
        )}

        {selectedMethod === 'wire' && instructions?.funding_options?.length > 1 && (
          <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '1rem' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' }}>Wire Transfer</h3>
            <ul style={{ fontSize: '0.75rem', color: 'var(--muted)', paddingLeft: '1rem', marginBottom: '0.75rem' }}>
              <li>Same business day</li>
              <li>No daily limit</li>
              <li>Wire fee may apply ($10-25)</li>
            </ul>
            
            {instructions.funding_options[1]?.wire_instructions && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'var(--bg2)', borderRadius: 8 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--faint)', marginBottom: '0.5rem' }}>WIRE INSTRUCTIONS</div>
                <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
                  <div>Bank: {instructions.funding_options[1].wire_instructions.bank_name}</div>
                  <div>Routing: {instructions.funding_options[1].wire_instructions.routing_number}</div>
                  <div>Account#: {instructions.account_number}</div>
                </div>
              </div>
            )}
          </div>
        )}

        <button onClick={() => window.open('https://app.alpaca.markets/dashboard/funding', '_blank')} style={{
          marginTop: '1.5rem', width: '100%', padding: '1rem', borderRadius: 10, border: 'none',
          background: 'var(--blue)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer'
        }}>
          Go to Alpaca Dashboard →
        </button>

        <p style={{ fontSize: '0.7rem', color: 'var(--faint)', marginTop: '1rem', textAlign: 'center' }}>
          Funds held by Alpaca Securities LLC, member FINRA/SIPC. 
          <a href="https://alpaca.markets/disclosuresesg" target="_blank" style={{ color: 'var(--blue)' }}>Member SIPC</a>
        </p>
      </div>
    </div>
  )
}