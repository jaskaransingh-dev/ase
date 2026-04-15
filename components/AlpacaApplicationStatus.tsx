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

interface AlpacaApplicationStatusProps {
  onCreateAccount?: () => void
  onAddFunds?: () => void
  onLinkBank?: () => void
}

export default function AlpacaApplicationStatus({ 
  onCreateAccount, 
  onAddFunds,
  onLinkBank 
}: AlpacaApplicationStatusProps) {
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState<BrokerAccount | null>(null)

  useEffect(() => {
    fetchStatus()
  }, [])

  async function fetchStatus() {
    try {
      const res = await fetch('/api/broker/account')
      const data = await res.json()
      setAccount(data)
    } catch (e) {
      console.error('Failed to fetch broker status:', e)
    } finally {
      setLoading(false)
    }
  }

  const hasAccount = account?.has_account ?? false
  const status = account?.status?.toUpperCase() ?? 'NONE'
  const isActive = status === 'ACTIVE' || status === 'APPROVED'
  const isPending = status === 'PENDING' || status === 'SUBMITTED' || status === 'SUBMISSION'
  const isRejected = status === 'REJECTED' || status === 'DECLINED'
  const hasBankLink = account?.has_bank_link ?? false
  const canFund = hasAccount && (isActive || isPending)
  const canTrade = hasAccount && isActive && account?.trading_enabled
  
  const cashBalance = account?.cash ? parseFloat(account.cash) : 0
  const portfolioValue = account?.portfolio_value ? parseFloat(account.portfolio_value) : 0
  const totalValue = cashBalance + portfolioValue

  if (loading) {
    return (
      <div className="alpaca-status-skeleton">
        <div className="skeleton-header">
          <div className="skeleton-icon" />
          <div className="skeleton-text">
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
          </div>
        </div>
        <div className="skeleton-steps" />
      </div>
    )
  }

  return (
    <div className="alpaca-status-container">
      {/* Main Status Card */}
      <div className="status-card">
        <div className={`status-icon-wrapper ${canTrade ? 'ready' : canFund ? 'ready' : isPending ? 'pending' : isRejected ? 'rejected' : ''}`}>
          <div className={`status-icon ${canTrade ? 'ready' : canFund ? 'approved' : isPending ? 'pending' : isRejected ? 'rejected' : 'none'}`}>
            {canTrade ? '✓' : canFund ? '◉' : isRejected ? '✕' : '○'}
          </div>
        </div>
        
        <div className="status-info">
          <div className="status-label">ALPACA BROKERAGE</div>
          <div className={`status-badge ${canTrade ? 'ready' : canFund ? 'approved' : isPending ? 'pending' : isRejected ? 'rejected' : 'none'}`}>
            {canTrade ? 'Ready to Trade' : canFund ? 'Ready to Fund' : isRejected ? 'Rejected' : isPending ? 'Under Review' : hasAccount ? 'Account Created' : 'Not Connected'}
          </div>
        </div>

        {hasAccount && account?.account_number && (
          <div className="account-badge">
            ****{account.account_number.slice(-4)}
          </div>
        )}
      </div>

      {/* Balance Display */}
      {hasAccount && (
        <div className="balance-card">
          <div className="balance-row">
            <div className="balance-item">
              <span className="balance-label">Cash</span>
              <span className="balance-value">${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            {portfolioValue > 0 && (
              <div className="balance-item">
                <span className="balance-label">Portfolio</span>
                <span className="balance-value">${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            {totalValue > 0 && (
              <div className="balance-item highlight">
                <span className="balance-label">Total Value</span>
                <span className="balance-value">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="progress-section">
        <div className="progress-steps">
          <Step 
            number={1}
            label="Account"
            status={hasAccount ? 'complete' : 'pending'}
          />
          <StepConnector active={hasAccount} />
          <Step 
            number={2}
            label="Verified"
            status={isActive ? 'complete' : isRejected ? 'failed' : isPending ? 'active' : 'pending'}
          />
          <StepConnector active={canFund} />
          <Step 
            number={3}
            label="Fund & Trade"
            status={canTrade ? 'complete' : canFund ? 'active' : 'pending'}
          />
        </div>

        {/* Bank Link Status */}
        {hasAccount && !hasBankLink && (
          <div className="bank-link-prompt">
            <div className="bank-icon">🏦</div>
            <div className="bank-text">
              <span className="bank-title">Link your bank account</span>
              <span className="bank-subtitle">Connect with Plaid to deposit real funds</span>
            </div>
            <button onClick={onLinkBank} className="bank-btn">
              Link Bank
            </button>
          </div>
        )}

        {hasAccount && hasBankLink && (
          <div className="bank-linked">
            <span className="bank-check">✓</span>
            Bank account linked
          </div>
        )}
      </div>

      {/* Action Button */}
      <div className="action-section">
        {!hasAccount && (
          <button onClick={onCreateAccount} className="btn-primary">
            <span>+</span> Create Brokerage Account
          </button>
        )}
        
        {hasAccount && !canFund && (
          <div className="status-message">
            {isPending && (
              <>
                <div className="message-icon">⏳</div>
                <div className="message-content">
                  <strong>Application Under Review</strong>
                  <p>Typically takes 1-2 business days. You'll receive an email once approved.</p>
                </div>
              </>
            )}
            {isRejected && (
              <>
                <div className="message-icon">⚠</div>
                <div className="message-content">
                  <strong>Application Not Approved</strong>
                  <p>Please try again or contact support for assistance.</p>
                </div>
              </>
            )}
          </div>
        )}

        {canFund && !canTrade && (
          <button onClick={onAddFunds} className="btn-fund">
            <span>$</span> Add Funds to Start Investing
          </button>
        )}

        {canTrade && (
          <div className="ready-banner">
            <div className="ready-icon">🚀</div>
            <div className="ready-content">
              <strong>Account Ready!</strong>
              <p>Browse agents and start investing with your allocated funds.</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .alpaca-status-container {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .alpaca-status-skeleton {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .skeleton-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .skeleton-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: var(--bg3);
          animation: pulse 1.5s ease-in-out infinite;
        }

        .skeleton-text {
          flex: 1;
        }

        .skeleton-line {
          height: 12px;
          background: var(--bg3);
          border-radius: 6px;
          margin-bottom: 0.5rem;
          animation: pulse 1.5s ease-in-out infinite;
        }

        .skeleton-line.short {
          width: 60%;
        }

        .skeleton-steps {
          height: 60px;
          background: var(--bg3);
          border-radius: 12px;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .status-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .status-icon-wrapper {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg3);
          transition: all 0.3s ease;
          flex-shrink: 0;
        }

        .status-icon-wrapper.ready {
          background: rgba(0, 229, 153, 0.15);
        }

        .status-icon-wrapper.pending {
          background: rgba(59, 130, 246, 0.15);
        }

        .status-icon-wrapper.rejected {
          background: rgba(255, 90, 95, 0.15);
        }

        .status-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          font-weight: 700;
          transition: all 0.3s ease;
        }

        .status-icon.ready {
          background: var(--mint);
          color: var(--bg);
          animation: pulse-success 2s infinite;
        }

        .status-icon.approved {
          background: var(--yellow);
          color: var(--bg);
        }

        .status-icon.pending {
          background: var(--blue);
          color: white;
          animation: pulse-active 2s infinite;
        }

        .status-icon.rejected {
          background: var(--red);
          color: white;
        }

        .status-icon.none {
          background: var(--border);
          color: var(--faint);
        }

        @keyframes pulse-success {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0, 229, 153, 0.4); }
          50% { box-shadow: 0 0 0 8px rgba(0, 229, 153, 0); }
        }

        @keyframes pulse-active {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          50% { box-shadow: 0 0 0 6px rgba(59, 130, 246, 0); }
        }

        .status-info {
          flex: 1;
        }

        .status-label {
          font-family: var(--font-mono);
          font-size: 0.6rem;
          color: var(--muted);
          letter-spacing: 0.12em;
          margin-bottom: 0.25rem;
        }

        .status-badge {
          font-family: var(--font-mono);
          font-size: 1rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .status-badge.ready { color: var(--mint); }
        .status-badge.approved { color: var(--yellow); }
        .status-badge.pending { color: var(--blue); }
        .status-badge.rejected { color: var(--red); }
        .status-badge.none { color: var(--faint); }

        .account-badge {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--muted);
          padding: 0.5rem 1rem;
          background: var(--bg3);
          border-radius: 10px;
        }

        .balance-card {
          background: linear-gradient(135deg, var(--bg3) 0%, rgba(0, 229, 153, 0.05) 100%);
          border-radius: 14px;
          padding: 1.25rem;
          margin-bottom: 1.25rem;
          border: 1px solid var(--border);
        }

        .balance-row {
          display: flex;
          gap: 2rem;
          flex-wrap: wrap;
        }

        .balance-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .balance-item.highlight {
          margin-left: auto;
        }

        .balance-label {
          font-family: var(--font-mono);
          font-size: 0.55rem;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .balance-value {
          font-family: 'SF Mono', var(--font-mono);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--white);
        }

        .balance-item.highlight .balance-value {
          color: var(--mint);
        }

        .progress-section {
          margin-bottom: 1.25rem;
        }

        .progress-steps {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          background: var(--bg3);
          border-radius: 12px;
          margin-bottom: 1rem;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          flex: 1;
        }

        .step-number {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          font-weight: 700;
          transition: all 0.3s ease;
        }

        .step-number.complete {
          background: var(--mint);
          color: var(--bg);
        }

        .step-number.active {
          background: var(--blue);
          color: white;
          animation: pulse-active 2s infinite;
        }

        .step-number.failed {
          background: var(--red);
          color: white;
        }

        .step-number.pending {
          background: var(--border);
          color: var(--faint);
        }

        .step-label {
          font-family: var(--font-mono);
          font-size: 0.5rem;
          color: var(--muted);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .step-connector {
          flex: 1;
          height: 2px;
          background: var(--border);
          position: relative;
          min-width: 24px;
          margin: 0 4px;
          align-self: center;
          margin-bottom: 20px;
        }

        .step-connector.active {
          background: var(--mint);
        }

        .step-connector::after {
          content: '';
          position: absolute;
          right: -5px;
          top: -4px;
          width: 0;
          height: 0;
          border-left: 6px solid var(--border);
          border-top: 5px solid transparent;
          border-bottom: 5px solid transparent;
        }

        .step-connector.active::after {
          border-left-color: var(--mint);
        }

        .bank-link-prompt {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: rgba(0, 229, 153, 0.08);
          border: 1px dashed rgba(0, 229, 153, 0.3);
          border-radius: 12px;
        }

        .bank-icon {
          font-size: 1.5rem;
        }

        .bank-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .bank-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--white);
        }

        .bank-subtitle {
          font-size: 0.7rem;
          color: var(--muted);
        }

        .bank-btn {
          padding: 0.5rem 1rem;
          border-radius: 8px;
          border: 1px solid var(--mint);
          background: transparent;
          color: var(--mint);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .bank-btn:hover {
          background: var(--mint);
          color: var(--bg);
        }

        .bank-linked {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          color: var(--mint);
          padding: 0.75rem 1rem;
          background: rgba(0, 229, 153, 0.1);
          border-radius: 10px;
        }

        .bank-check {
          font-size: 0.9rem;
        }

        .action-section {
          margin-top: 0.5rem;
        }

        .btn-primary {
          width: 100%;
          padding: 1rem;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, var(--blue) 0%, #2563eb 100%);
          color: white;
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
        }

        .btn-primary span {
          font-size: 1.1rem;
        }

        .btn-fund {
          width: 100%;
          padding: 1rem;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, var(--mint) 0%, #00c896 100%);
          color: var(--bg);
          font-size: 0.95rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(0, 229, 153, 0.3);
        }

        .btn-fund:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 229, 153, 0.4);
        }

        .btn-fund span {
          font-size: 1.1rem;
        }

        .status-message {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.25rem;
          background: var(--bg3);
          border-radius: 12px;
        }

        .message-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .message-content {
          flex: 1;
        }

        .message-content strong {
          display: block;
          font-size: 0.9rem;
          color: var(--white);
          margin-bottom: 0.25rem;
        }

        .message-content p {
          font-size: 0.8rem;
          color: var(--muted);
          margin: 0;
          line-height: 1.5;
        }

        .ready-banner {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.25rem;
          background: linear-gradient(135deg, rgba(0, 229, 153, 0.15) 0%, rgba(0, 229, 153, 0.05) 100%);
          border: 1px solid rgba(0, 229, 153, 0.3);
          border-radius: 12px;
        }

        .ready-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .ready-content strong {
          display: block;
          font-size: 0.95rem;
          color: var(--mint);
          margin-bottom: 0.25rem;
        }

        .ready-content p {
          font-size: 0.8rem;
          color: var(--muted);
          margin: 0;
          line-height: 1.5;
        }

        @media(max-width: 600px) {
          .progress-steps {
            flex-direction: column;
            gap: 0.75rem;
          }
          
          .step-connector {
            width: 2px;
            height: 16px;
          }

          .step-connector::after {
            right: -4px;
            top: auto;
            bottom: -4px;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid var(--border);
          }

          .step-connector.active::after {
            border-top-color: var(--mint);
          }

          .balance-row {
            flex-direction: column;
            gap: 1rem;
          }

          .balance-item.highlight {
            margin-left: 0;
            padding-top: 0.75rem;
            border-top: 1px solid var(--border);
          }

          .bank-link-prompt {
            flex-wrap: wrap;
          }

          .bank-btn {
            width: 100%;
            margin-top: 0.5rem;
          }
        }
      `}</style>
    </div>
  )
}

function Step({ number, label, status }: { number: number; label: string; status: 'pending' | 'active' | 'complete' | 'failed' }) {
  return (
    <div className="step">
      <div className={`step-number ${status}`}>{status === 'complete' ? '✓' : number}</div>
      <div className="step-label">{label}</div>
    </div>
  )
}

function StepConnector({ active }: { active: boolean }) {
  return <div className={`step-connector ${active ? 'active' : ''}`} />
}