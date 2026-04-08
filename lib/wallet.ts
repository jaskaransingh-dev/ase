/**
 * ASE Wallet Connection
 * Supports:
 *  - Coinbase Smart Wallet (SDK v4, no extension needed — popup/iframe)
 *  - Coinbase Wallet browser extension
 *  - MetaMask and any EIP-1193 injected wallet
 *  - EIP-6963 multi-provider detection
 */

export type WalletType = 'coinbase' | 'metamask' | 'injected'

export interface WalletState {
  address: string | null
  chainId: string | null
  type: WalletType | null
  connected: boolean
}

// ─── EIP-1193 provider shape ─────────────────────────────────────────────────

interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on: (event: string, handler: (...args: unknown[]) => void) => void
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void
  isMetaMask?: boolean
  isCoinbaseWallet?: boolean
  selectedAddress?: string
  providers?: EIP1193Provider[] // EIP-6963 multi-wallet array
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider
    coinbaseWalletExtension?: EIP1193Provider
  }
}

// ─── Provider detection ───────────────────────────────────────────────────────

/**
 * Handle the EIP-6963 providers array — when multiple wallets are installed
 * (e.g. MetaMask + Coinbase extension), they inject into window.ethereum.providers[].
 */
function getInjectedProviders(): EIP1193Provider[] {
  if (typeof window === 'undefined') return []
  const eth = window.ethereum
  if (!eth) return []
  // Multiple wallets: providers array
  if (eth.providers && eth.providers.length > 0) return eth.providers
  return [eth]
}

function findCoinbaseExtensionProvider(): EIP1193Provider | null {
  // 1. Dedicated extension namespace (legacy)
  if (typeof window !== 'undefined' && window.coinbaseWalletExtension) {
    return window.coinbaseWalletExtension
  }
  // 2. In the providers array (EIP-6963)
  const providers = getInjectedProviders()
  return providers.find(p => p.isCoinbaseWallet) ?? null
}

function findMetaMaskProvider(): EIP1193Provider | null {
  const providers = getInjectedProviders()
  return providers.find(p => p.isMetaMask && !p.isCoinbaseWallet) ?? null
}

export function detectWallets(): {
  metamask: boolean
  coinbaseExtension: boolean
  anyInjected: boolean
} {
  if (typeof window === 'undefined') {
    return { metamask: false, coinbaseExtension: false, anyInjected: false }
  }
  return {
    metamask: !!findMetaMaskProvider(),
    coinbaseExtension: !!(findCoinbaseExtensionProvider()),
    anyInjected: !!(window.ethereum || window.coinbaseWalletExtension),
  }
}

// ─── Coinbase Smart Wallet (SDK) ──────────────────────────────────────────────

let _cbProvider: EIP1193Provider | null = null

async function getCoinbaseSDKProvider(): Promise<EIP1193Provider> {
  if (_cbProvider) return _cbProvider

  // Dynamic import so this never runs server-side / on edge
  const { default: CoinbaseWalletSDK } = await import('@coinbase/wallet-sdk')

  const sdk = new CoinbaseWalletSDK({
    appName: 'ASE — Algorithmic Strategy Exchange',
    appLogoUrl: 'https://ase.finance/logo.png',
  })

  // makeWeb3Provider creates the EIP-1193 provider (Smart Wallet popup)
  // Chain: Base Mainnet (8453) — Coinbase's L2, cheap gas, Coinbase native
  const provider = sdk.makeWeb3Provider()

  _cbProvider = provider as unknown as EIP1193Provider
  return _cbProvider
}

// ─── Core connect function ────────────────────────────────────────────────────

export async function connectWallet(prefer?: 'coinbase' | 'metamask'): Promise<WalletState> {
  if (typeof window === 'undefined') throw new Error('Not in browser context')

  let provider: EIP1193Provider

  if (prefer === 'metamask') {
    const mm = findMetaMaskProvider()
    if (!mm) {
      throw new Error(
        'MetaMask not found. Install it at metamask.io'
      )
    }
    provider = mm
  } else {
    // Coinbase: try extension first, then SDK Smart Wallet
    const cbExt = findCoinbaseExtensionProvider()
    if (cbExt) {
      provider = cbExt
    } else {
      // Use Coinbase Smart Wallet SDK — opens a popup, no extension needed
      provider = await getCoinbaseSDKProvider()
    }
  }

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  if (!accounts || accounts.length === 0) throw new Error('No accounts returned — user may have cancelled')

  const chainId = (await provider.request({ method: 'eth_chainId' })) as string

  return {
    address: accounts[0].toLowerCase(),
    chainId,
    type: provider.isCoinbaseWallet ? 'coinbase' : provider.isMetaMask ? 'metamask' : 'injected',
    connected: true,
  }
}

export async function connectInjected(): Promise<WalletState> {
  if (typeof window === 'undefined') throw new Error('Not in browser context')
  const providers = getInjectedProviders()
  if (providers.length === 0 || !window.ethereum) {
    throw new Error('No injected wallet found. Install MetaMask or Coinbase Wallet.')
  }
  const provider = providers[0]
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

// ─── Passive check (no popup) ─────────────────────────────────────────────────

export async function getConnectedWallet(): Promise<WalletState | null> {
  if (typeof window === 'undefined') return null
  try {
    const providers = getInjectedProviders()
    if (providers.length === 0 && !window.ethereum) return null

    const provider = providers[0] ?? window.ethereum
    if (!provider) return null

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

// ─── Event listeners ──────────────────────────────────────────────────────────

export function onAccountsChanged(handler: (accounts: string[]) => void): () => void {
  if (typeof window === 'undefined' || !window.ethereum) return () => {}
  const eth = window.ethereum
  eth.on('accountsChanged', handler as (...args: unknown[]) => void)
  return () => eth.removeListener('accountsChanged', handler as (...args: unknown[]) => void)
}

export function onChainChanged(handler: (chainId: string) => void): () => void {
  if (typeof window === 'undefined' || !window.ethereum) return () => {}
  const eth = window.ethereum
  eth.on('chainChanged', handler as (...args: unknown[]) => void)
  return () => eth.removeListener('chainChanged', handler as (...args: unknown[]) => void)
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function chainName(chainId: string | null): string {
  const chains: Record<string, string> = {
    '0x1':    'Ethereum',
    '0x89':   'Polygon',
    '0x2105': 'Base',
    '0xa':    'Optimism',
    '0xa4b1': 'Arbitrum',
    '0x38':   'BNB Chain',
    '0xe708': 'Linea',
  }
  return chainId ? (chains[chainId] ?? `Chain ${parseInt(chainId, 16)}`) : 'Unknown'
}
