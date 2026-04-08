/**
 * ASE Wallet Connection
 * Supports MetaMask and Coinbase Wallet via EIP-1193 (window.ethereum)
 */

export type WalletType = 'metamask' | 'coinbase' | 'injected'

export interface WalletState {
  address: string | null
  chainId: string | null
  type: WalletType | null
  connected: boolean
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
    coinbaseWalletExtension?: EthereumProvider
  }
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void
  isMetaMask?: boolean
  isCoinbaseWallet?: boolean
  selectedAddress?: string
}

function getProvider(prefer?: 'coinbase' | 'metamask'): EthereumProvider | null {
  if (typeof window === 'undefined') return null

  // Prefer Coinbase Wallet extension if requested
  if (prefer === 'coinbase' && window.coinbaseWalletExtension) {
    return window.coinbaseWalletExtension
  }

  // Prefer MetaMask if requested
  if (prefer === 'metamask' && window.ethereum?.isMetaMask) {
    return window.ethereum
  }

  // Return Coinbase Wallet extension if available
  if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension

  // Return injected provider (MetaMask or any EIP-1193)
  if (window.ethereum) return window.ethereum

  return null
}

export function detectWallets(): { metamask: boolean; coinbase: boolean; any: boolean } {
  if (typeof window === 'undefined') return { metamask: false, coinbase: false, any: false }
  return {
    metamask: !!(window.ethereum?.isMetaMask),
    coinbase: !!(window.coinbaseWalletExtension || window.ethereum?.isCoinbaseWallet),
    any: !!(window.ethereum || window.coinbaseWalletExtension),
  }
}

export async function connectWallet(prefer?: 'coinbase' | 'metamask'): Promise<WalletState> {
  const provider = getProvider(prefer)

  if (!provider) {
    throw new Error(
      prefer === 'coinbase'
        ? 'Coinbase Wallet not found. Install the Coinbase Wallet browser extension.'
        : 'No Web3 wallet found. Install MetaMask or Coinbase Wallet.'
    )
  }

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accounts || accounts.length === 0) throw new Error('No accounts returned')

  const chainId = (await provider.request({ method: 'eth_chainId' })) as string

  return {
    address: accounts[0].toLowerCase(),
    chainId,
    type: provider.isCoinbaseWallet ? 'coinbase' : provider.isMetaMask ? 'metamask' : 'injected',
    connected: true,
  }
}

export async function getConnectedWallet(): Promise<WalletState | null> {
  const provider = getProvider()
  if (!provider) return null

  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
    if (!accounts || accounts.length === 0) return null

    const chainId = (await provider.request({ method: 'eth_chainId' })) as string
    return {
      address: accounts[0].toLowerCase(),
      chainId,
      type: provider.isCoinbaseWallet ? 'coinbase' : provider.isMetaMask ? 'metamask' : 'injected',
      connected: true,
    }
  } catch {
    return null
  }
}

export function onAccountsChanged(handler: (accounts: string[]) => void): () => void {
  const provider = getProvider()
  if (!provider) return () => {}
  provider.on('accountsChanged', handler as (...args: unknown[]) => void)
  return () => provider.removeListener('accountsChanged', handler as (...args: unknown[]) => void)
}

export function onChainChanged(handler: (chainId: string) => void): () => void {
  const provider = getProvider()
  if (!provider) return () => {}
  provider.on('chainChanged', handler as (...args: unknown[]) => void)
  return () => provider.removeListener('chainChanged', handler as (...args: unknown[]) => void)
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
