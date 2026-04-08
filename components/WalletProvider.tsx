'use client'
/**
 * WalletProvider — global wallet state for the entire app.
 * Wrap the root layout with this so any component can useWallet().
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import {
  connectWallet,
  getConnectedWallet,
  onAccountsChanged,
  onChainChanged,
  formatAddress,
  type WalletState,
  type WalletType,
} from '@/lib/wallet'
import { createClient } from '@/lib/supabase/client'

interface WalletContextValue {
  wallet: WalletState
  connecting: boolean
  error: string | null
  connect: (prefer?: WalletType) => Promise<void>
  disconnect: () => void
  shortAddress: string | null
}

const DEFAULT: WalletState = { address: null, chainId: null, type: null, connected: false }

const WalletCtx = createContext<WalletContextValue>({
  wallet: DEFAULT,
  connecting: false,
  error: null,
  connect: async () => {},
  disconnect: () => {},
  shortAddress: null,
})

export function useWallet() {
  return useContext(WalletCtx)
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>(DEFAULT)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // On mount: restore previously connected wallet
  useEffect(() => {
    getConnectedWallet().then(w => {
      if (w) setWallet(w)
    })
  }, [])

  // Listen for account / chain changes
  useEffect(() => {
    const unsubAccounts = onAccountsChanged((accounts) => {
      if (accounts.length === 0) {
        setWallet(DEFAULT)
      } else {
        setWallet(prev => ({ ...prev, address: accounts[0].toLowerCase(), connected: true }))
      }
    })
    const unsubChain = onChainChanged((chainId) => {
      setWallet(prev => ({ ...prev, chainId }))
    })
    return () => { unsubAccounts(); unsubChain() }
  }, [])

  const connect = useCallback(async (prefer?: WalletType) => {
    setConnecting(true)
    setError(null)
    try {
      const state = await connectWallet(prefer === 'injected' ? undefined : prefer)
      setWallet(state)
      // Persist wallet address to profile
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user && state.address) {
        await supabase.from('profiles').update({ wallet_address: state.address }).eq('id', user.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wallet connection failed')
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setWallet(DEFAULT)
  }, [])

  const shortAddress = wallet.address ? formatAddress(wallet.address) : null

  return (
    <WalletCtx.Provider value={{ wallet, connecting, error, connect, disconnect, shortAddress }}>
      {children}
    </WalletCtx.Provider>
  )
}
