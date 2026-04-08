'use client'
/**
 * WalletProvider — global wallet state for the entire app.
 * Wrap the root layout with this so any component can call useWallet().
 *
 * Supports:
 *   - Coinbase Smart Wallet (SDK, no extension required — popup)
 *   - Coinbase Wallet browser extension
 *   - MetaMask + any EIP-1193 injected wallet
 *   - EIP-6963 multi-wallet detection
 */
import {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, type ReactNode,
} from 'react'
import {
  connectWallet,
  connectInjected,
  getConnectedWallet,
  detectWallets,
  onAccountsChanged,
  onChainChanged,
  formatAddress,
  chainName,
  type WalletState,
  type WalletType,
} from '@/lib/wallet'
import { createClient } from '@/lib/supabase/client'

// ─── Context types ────────────────────────────────────────────────────────────

interface WalletContextValue {
  wallet: WalletState
  connecting: boolean
  error: string | null
  /** Open the wallet selector modal. Pass 'coinbase' or 'metamask' to skip modal. */
  connect: (prefer?: WalletType) => Promise<void>
  disconnect: () => void
  shortAddress: string | null
  network: string | null
  /** Open the wallet selection modal explicitly */
  openModal: () => void
}

const DEFAULT: WalletState = { address: null, chainId: null, type: null, connected: false }

const WalletCtx = createContext<WalletContextValue>({
  wallet: DEFAULT,
  connecting: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
  shortAddress: null,
  network: null,
  openModal: () => {},
})

export function useWallet() {
  return useContext(WalletCtx)
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function WalletModal({
  onClose,
  onSelect,
  connecting,
  error,
}: {
  onClose: () => void
  onSelect: (type: 'coinbase' | 'metamask' | 'injected') => void
  connecting: boolean
  error: string | null
}) {
  const detected = detectWallets()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(8,6,18,.85)',
        backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)',
          border: '1px solid rgba(155,140,255,.25)',
          borderRadius: 24,
          padding: '2rem',
          width: '100%',
          maxWidth: 380,
          boxShadow: '0 40px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(155,140,255,.08)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-head)', fontWeight: 800, fontSize: '1.1rem' }}>Connect Wallet</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.62rem', color: 'var(--faint)', marginTop: '.2rem' }}>Subscribe to agents + future on-chain settlement</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,.06)', border: '1px solid var(--border)', borderRadius: 10, width: 32, height: 32, cursor: 'pointer', color: 'var(--faint)', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {/* Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.65rem' }}>

          {/* Coinbase Wallet — always available (SDK opens popup if no extension) */}
          <WalletOption
            icon={<CoinbaseIcon />}
            name="Coinbase Wallet"
            description={detected.coinbaseExtension ? 'Extension detected' : 'Smart Wallet — no extension needed'}
            badge={detected.coinbaseExtension ? 'EXTENSION' : 'SMART WALLET'}
            badgeColor="#0052FF"
            onClick={() => onSelect('coinbase')}
            loading={connecting}
            recommended
          />

          {/* MetaMask */}
          <WalletOption
            icon={<MetaMaskIcon />}
            name="MetaMask"
            description={detected.metamask ? 'Extension detected' : 'Install MetaMask to continue'}
            badge={detected.metamask ? 'DETECTED' : 'NOT FOUND'}
            badgeColor={detected.metamask ? '#F6851B' : '#6B7280'}
            onClick={() => onSelect('metamask')}
            loading={connecting}
            disabled={!detected.metamask}
            installUrl="https://metamask.io"
          />

          {/* Any injected (fallback) */}
          {detected.anyInjected && !detected.metamask && !detected.coinbaseExtension && (
            <WalletOption
              icon={<InjectIcon />}
              name="Browser Wallet"
              description="Use your detected injected wallet"
              badge="INJECTED"
              badgeColor="var(--gold)"
              onClick={() => onSelect('injected')}
              loading={connecting}
            />
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginTop: '1rem', background: 'rgba(251,113,133,.1)', border: '1px solid rgba(251,113,133,.25)', borderRadius: 12, padding: '.7rem .9rem', fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: '#FB7185', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {/* Connecting */}
        {connecting && (
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '.5rem', fontFamily: 'var(--font-mono)', fontSize: '.7rem', color: 'var(--faint)' }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', animation: 'pulse 1.2s ease-in-out infinite' }} />
            Waiting for wallet…
          </div>
        )}

        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', lineHeight: 1.6 }}>
          Connecting a wallet doesn&apos;t transfer any funds. Used for identity and future on-chain subscriptions.
        </div>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  )
}

function WalletOption({
  icon, name, description, badge, badgeColor,
  onClick, loading, disabled, recommended, installUrl,
}: {
  icon: React.ReactNode
  name: string
  description: string
  badge: string
  badgeColor: string
  onClick: () => void
  loading: boolean
  disabled?: boolean
  recommended?: boolean
  installUrl?: string
}) {
  const [hov, setHov] = useState(false)

  if (disabled && installUrl) {
    return (
      <a
        href={installUrl}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'flex', alignItems: 'center', gap: '.9rem',
          padding: '.9rem 1rem',
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: 'rgba(255,255,255,.02)',
          cursor: 'pointer',
          textDecoration: 'none',
          opacity: 0.6,
          transition: 'all .15s',
        }}
      >
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '.88rem', color: 'var(--white)' }}>{name}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginTop: '.1rem' }}>{description}</div>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, padding: '.15rem .45rem', borderRadius: 6, background: `${badgeColor}18`, border: `1px solid ${badgeColor}40`, color: badgeColor, flexShrink: 0 }}>
          INSTALL ↗
        </span>
      </a>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '.9rem',
        padding: '.9rem 1rem',
        borderRadius: 14,
        border: `1px solid ${hov && !loading ? 'rgba(155,140,255,.35)' : recommended ? 'rgba(155,140,255,.2)' : 'var(--border)'}`,
        background: hov && !loading ? 'rgba(155,140,255,.07)' : recommended ? 'rgba(155,140,255,.04)' : 'rgba(255,255,255,.02)',
        cursor: loading ? 'default' : 'pointer',
        width: '100%',
        textAlign: 'left',
        transition: 'all .15s',
        opacity: disabled ? 0.5 : 1,
        position: 'relative',
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '.88rem', color: 'var(--white)' }}>{name}</span>
          {recommended && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.48rem', fontWeight: 700, padding: '.1rem .35rem', borderRadius: 5, background: 'rgba(110,231,183,.15)', border: '1px solid rgba(110,231,183,.3)', color: '#6EE7B7' }}>RECOMMENDED</span>}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.6rem', color: 'var(--faint)', marginTop: '.1rem' }}>{description}</div>
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '.52rem', fontWeight: 700, padding: '.15rem .45rem', borderRadius: 6, background: `${badgeColor}18`, border: `1px solid ${badgeColor}40`, color: badgeColor, flexShrink: 0 }}>
        {badge}
      </span>
    </button>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CoinbaseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#0052FF"/>
      <rect x="7" y="7" width="10" height="10" rx="2" fill="white"/>
      <rect x="10" y="10" width="4" height="4" rx=".5" fill="#0052FF"/>
    </svg>
  )
}

function MetaMaskIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M21 3L13.5 8.5L15 5.5L21 3Z" fill="#E17726"/>
      <path d="M3 3L10.5 8.5L9 5.5L3 3Z" fill="#E27625"/>
      <path d="M18 16.5L16 20L20.5 21.5L22 17L18 16.5Z" fill="#E27625"/>
      <path d="M6 16.5L2 17L3.5 21.5L8 20L6 16.5Z" fill="#E27625"/>
      <path d="M7.5 11L5.5 14L10 14.5L9.5 10L7.5 11Z" fill="#E27625"/>
      <path d="M16.5 11L14.5 10L14 14.5L18.5 14L16.5 11Z" fill="#E27625"/>
      <path d="M8 20L9.5 18.5L8 17L8 20Z" fill="#D5BFB2"/>
      <path d="M16 20L14.5 17L16 18.5L16 20Z" fill="#D5BFB2"/>
      <path d="M9.5 18.5L14.5 18.5L14 14.5L10 14.5L9.5 18.5Z" fill="#F6851B"/>
    </svg>
  )
}

function InjectIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="6" width="18" height="13" rx="3" stroke="var(--gold)" strokeWidth="1.5"/>
      <path d="M16 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0z" fill="var(--gold)"/>
      <path d="M7 6V5a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1" stroke="var(--gold)" strokeWidth="1.5"/>
    </svg>
  )
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>(DEFAULT)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const pendingPrefer = useRef<'coinbase' | 'metamask' | 'injected' | undefined>(undefined)

  // Restore session on mount
  useEffect(() => {
    getConnectedWallet().then(w => { if (w) setWallet(w) })
  }, [])

  // Listen for account / chain changes
  useEffect(() => {
    const unsubAccounts = onAccountsChanged((accounts) => {
      if (accounts.length === 0) setWallet(DEFAULT)
      else setWallet(prev => ({ ...prev, address: accounts[0].toLowerCase(), connected: true }))
    })
    const unsubChain = onChainChanged((chainId) => {
      setWallet(prev => ({ ...prev, chainId }))
    })
    return () => { unsubAccounts(); unsubChain() }
  }, [])

  const doConnect = useCallback(async (prefer?: 'coinbase' | 'metamask' | 'injected') => {
    setConnecting(true)
    setError(null)
    try {
      let state: WalletState
      if (prefer === 'injected') {
        state = await connectInjected()
      } else {
        state = await connectWallet(prefer)
      }
      setWallet(state)
      setModalOpen(false)

      // Persist wallet address to Supabase profile
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user && state.address) {
        await supabase.from('profiles').update({ wallet_address: state.address }).eq('id', user.id)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Wallet connection failed'
      setError(msg)
      // Keep modal open so user sees error
    } finally {
      setConnecting(false)
    }
  }, [])

  /** Called from UI — if prefer is supplied, skip modal and connect directly.
   *  If no preference, open the selector modal. */
  const connect = useCallback(async (prefer?: WalletType) => {
    const p = prefer as 'coinbase' | 'metamask' | 'injected' | undefined
    if (p) {
      await doConnect(p)
    } else {
      setError(null)
      pendingPrefer.current = undefined
      setModalOpen(true)
    }
  }, [doConnect])

  const openModal = useCallback(() => {
    setError(null)
    setModalOpen(true)
  }, [])

  const disconnect = useCallback(() => {
    setWallet(DEFAULT)
    setError(null)
  }, [])

  const shortAddress = wallet.address ? formatAddress(wallet.address) : null
  const network = chainName(wallet.chainId)

  return (
    <WalletCtx.Provider value={{ wallet, connecting, error, connect, disconnect, shortAddress, network, openModal }}>
      {children}

      {modalOpen && (
        <WalletModal
          onClose={() => setModalOpen(false)}
          onSelect={doConnect}
          connecting={connecting}
          error={error}
        />
      )}
    </WalletCtx.Provider>
  )
}
