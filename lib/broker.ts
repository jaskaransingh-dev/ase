/**
 * lib/broker.ts
 * 
 * Alpaca Broker API Client
 * 
 * Base URL: https://broker-api.alpaca.markets (production)
 *          https://broker-api.sandbox.alpaca.markets (sandbox)
 * 
 * Auth: Basic Auth (key_id:secret_key)
 */

const BROKER_BASE_URL = process.env.BROKER_API_URL || process.env.ALPACA_BASE_URL || 'https://broker-api.sandbox.alpaca.markets'

interface BrokerConfig {
  keyId: string
  secretKey: string
}

interface Contact {
  email: string
  phone_number: string
  address: {
    street_line_1: string
    street_line_2?: string
    city: string
    state: string
    postal_code: string
    country: string
  }
}

interface Identity {
  first_name: string
  last_name: string
  birth_date: string
  tax_id: string  // SSN for US
  tax_id_type?: string
  country_of_residency: string
  country_of_citizenship?: string
}

interface Agreement {
  agreement: string
  ip_address: string
  date_timestamp: string
  user_agent?: string
}

interface AccountRequest {
  account_type?: 'trading' | 'INDIVIDUAL' | 'JOINT' | 'CUSTODIAL' | 'CORPORATE' | 'LCI'
  account_sub_type?: string
  contact: {
    email_address: string
    phone_number: string
    street_address?: string[]
    city?: string
    state?: string
    postal_code?: string
    country?: string
  }
  identity: {
    given_name: string
    family_name: string
    date_of_birth: string
    tax_id: string
    tax_id_type?: 'USA_SSN' | 'SSN' | string
    country_of_citizenship?: string
    country_of_birth?: string
    country_of_tax_residence?: string
    funding_source?: string[]
  }
  disclosures?: {
    is_control_person?: boolean
    is_affiliated_exchange_or_finra?: boolean
    is_politically_exposed?: boolean
    immediate_family_exposed?: boolean
  }
  agreements: {
    agreement: string
    signed_at?: string
    ip_address?: string
    date_timestamp?: string
    user_agent?: string
  }[]
}

interface Account {
  id: string
  account_number: string
  status: string
  account_type: string
  currency: string
  trading_enabled: boolean
  transfers_enabled: boolean
  created_at: string
  updated_at: string
  cash?: string
  portfolio_value?: string
  buying_power?: string
  equity?: string
  last_equity?: string
}

interface ACHRelationship {
  id: string
  account_id: string
  bank_name: string
  bank_account_type: string
  account_last4: string
  status: string
  created_at: string
}

interface Transfer {
  id: string
  account_id: string
  relationship_id: string
  amount: string
  direction: 'INCOMING' | 'OUTGOING'
  type: string
  status: string
  created_at: string
}

interface Position {
  asset_id: string
  symbol: string
  exchange: string
  asset_class: string
  qty: string
  avg_entry_price: string
  side: string
  market_value: string
  cost_basis: string
  unrealized_pl: string
  unrealized_plpc: string
  unrealized_plppc: string
  current_price: string
  lastprice: string
}

class BrokerAPI {
  private keyId: string
  private secretKey: string
  private accessToken: string | null = null
  private tokenExpiry: number = 0

  constructor(config: BrokerConfig) {
    this.keyId = config.keyId
    this.secretKey = config.secretKey
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    const authxUrl = BROKER_BASE_URL.includes('sandbox')
      ? 'https://authx.sandbox.alpaca.markets'
      : 'https://authx.alpaca.markets'

    const response = await fetch(`${authxUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.keyId,
        client_secret: this.secretKey,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to get access token: ${response.status} - ${error}`)
    }

    const data = await response.json() as { access_token: string; expires_in: number }
    this.accessToken = data.access_token
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000

    return this.accessToken
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${BROKER_BASE_URL}${path}`
    
    const accessToken = await this.getAccessToken()

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Broker API error: ${response.status} - ${error}`)
    }

    if (response.status === 204) {
      return {} as T
    }

    return response.json() as Promise<T>
  }

  /**
   * Create a new trading account for an end user
   * POST /v1/accounts
   */
  async createAccount(request: AccountRequest): Promise<Account> {
    return this.request<Account>('/v1/accounts', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  /**
   * Get account by ID
   * GET /v1/accounts/{account_id}
   */
  async getAccount(accountId: string): Promise<Account> {
    return this.request<Account>(`/v1/accounts/${accountId}`)
  }

  /**
   * Get all accounts
   * GET /v1/accounts
   */
  async listAccounts(): Promise<{ accounts: Account[] }> {
    return this.request<{ accounts: Account[] }>('/v1/accounts')
  }

  /**
   * Update account
   * PATCH /v1/accounts/{account_id}
   */
  async updateAccount(accountId: string, updates: Partial<AccountRequest>): Promise<Account> {
    return this.request<Account>(`/v1/accounts/${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  /**
   * Create ACH relationship with bank account
   * POST /v1/accounts/{account_id}/ach_relationships
   * 
   * Can use either:
   * - processor_token (from Plaid Link)
   * - Manual bank details (account_owner_name, bank_account_type, bank_account_number, bank_routing_number)
   */
  async createACHRelationship(accountId: string, data: {
    processor_token?: string
    account_owner_name?: string
    bank_account_type?: 'CHECKING' | 'SAVINGS'
    bank_account_number?: string
    bank_routing_number?: string
    nickname?: string
  }): Promise<ACHRelationship> {
    return this.request<ACHRelationship>(`/v1/accounts/${accountId}/ach_relationships`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  /**
   * List ACH relationships
   * GET /v1/accounts/{account_id}/ach_relationships
   */
  async listACHRelationships(accountId: string): Promise<{ ach_relationships: ACHRelationship[] }> {
    return this.request<{ ach_relationships: ACHRelationship[] }>(
      `/v1/accounts/${accountId}/ach_relationships`
    )
  }

  /**
   * Delete ACH relationship
   * DELETE /v1/accounts/{account_id}/ach_relationships/{relationship_id}
   */
  async deleteACHRelationship(accountId: string, relationshipId: string): Promise<void> {
    return this.request<void>(`/v1/accounts/${accountId}/ach_relationships/${relationshipId}`, {
      method: 'DELETE',
    })
  }

  /**
   * Create transfer (deposit or withdrawal)
   * POST /v1/accounts/{account_id}/transfers
   */
  async createTransfer(accountId: string, data: {
    transfer_type: 'ach' | 'wire'
    relationship_id: string
    amount: string
    direction: 'INCOMING' | 'OUTGOING'
  }): Promise<Transfer> {
    return this.request<Transfer>(`/v1/accounts/${accountId}/transfers`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  /**
   * Get transfers
   * GET /v1/accounts/{account_id}/transfers
   */
  async listTransfers(accountId: string, params?: {
    direction?: 'INCOMING' | 'OUTGOING'
    status?: string
  }): Promise<{ transfers: Transfer[] }> {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return this.request<{ transfers: Transfer[] }>(
      `/v1/accounts/${accountId}/transfers${query ? `?${query}` : ''}`
    )
  }

  /**
   * Get account balances
   * GET /v1/accounts/{account_id}/balances
   */
  async getBalances(accountId: string): Promise<{
    currency: string
    cash: string
    portfolio_value: string
  }> {
    return this.request(`/v1/accounts/${accountId}/balances`)
  }

  /**
   * Get positions
   * GET /v1/accounts/{account_id}/positions
   */
  async getPositions(accountId: string): Promise<{ positions: Position[] }> {
    return this.request<{ positions: Position[] }>(`/v1/accounts/${accountId}/positions`)
  }

  /**
   * Get a single position
   * GET /v1/accounts/{account_id}/positions/{symbol}
   */
  async getPosition(accountId: string, symbol: string): Promise<Position> {
    return this.request<Position>(`/v1/accounts/${accountId}/positions/${symbol}`)
  }

  /**
   * Create order
   * POST /v1/accounts/{account_id}/orders
   */
  async createOrder(accountId: string, order: {
    symbol: string
    qty?: string
    notional?: string
    side: 'buy' | 'sell'
    type: 'market' | 'limit' | 'stop' | 'stop_limit'
    time_in_force: 'day' | 'gtc' | 'ioc' | 'fok'
    limit_price?: string
    stop_price?: string
    extended_hours?: boolean
  }): Promise<{
    id: string
    symbol: string
    side: string
    type: string
    time_in_force: string
    limit_price: string
    stop_price: string
    filled_qty: string
    filled_avg_price: string
    status: string
  }> {
    return this.request(`/v1/accounts/${accountId}/orders`, {
      method: 'POST',
      body: JSON.stringify(order),
    })
  }

  /**
   * Cancel order
   * DELETE /v1/accounts/{account_id}/orders/{order_id}
   */
  async cancelOrder(accountId: string, orderId: string): Promise<void> {
    return this.request<void>(`/v1/accounts/${accountId}/orders/${orderId}`, {
      method: 'DELETE',
    })
  }

  /**
   * Get order history
   * GET /v1/accounts/{account_id}/orders
   */
  async listOrders(accountId: string, params?: {
    status?: 'open' | 'closed' | 'all'
    limit?: number
    after?: string
    until?: string
  }): Promise<{ orders: any[] }> {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return this.request(`/v1/accounts/${accountId}/orders${query ? `?${query}` : ''}`)
  }

  /**
   * Get account activities
   * GET /v1/accounts/{account_id}/activities
   */
  async listActivities(accountId: string, params?: {
    activity_type?: string
    after?: string
    until?: string
    direction?: string
  }): Promise<{ activities: any[] }> {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return this.request(`/v1/accounts/${accountId}/activities${query ? `?${query}` : ''}`)
  }

  /**
   * Get trading account configuration
   * GET /v1/trading/accounts/{account_id}/account-configurations
   */
  async getTradingConfiguration(accountId: string): Promise<any> {
    return this.request(`/v1/trading/accounts/${accountId}/account-configurations`)
  }

  /**
   * Ensure a sandbox ACH relationship exists for the account.
   * Returns the relationship ID. Accepts any relationship status in sandbox.
   */
  async ensureSandboxAchRelationship(params: {
    accountId: string
    accountOwnerName: string
  }): Promise<string> {
    const { accountId, accountOwnerName } = params

    // 1) Try to find any existing relationship (any status in sandbox)
    try {
      const result = await this.listACHRelationships(accountId)
      const raw = result as Record<string, unknown>
      // Handle both { ach_relationships: [...] } and [...] formats
      const rels: ACHRelationship[] = Array.isArray(raw)
        ? (raw as ACHRelationship[])
        : Array.isArray(raw?.ach_relationships)
          ? (raw.ach_relationships as ACHRelationship[])
          : []
      console.log('[Broker] Found relationships:', rels.length, rels.map(r => ({ id: r.id, status: r.status })))
      const rel = rels[0]
      if (rel?.id) {
        console.log('[Broker] Using existing ACH relationship:', rel.id, 'status:', rel.status)
        return rel.id
      }
    } catch (e) {
      console.warn('[Broker] Could not list ACH relationships:', e)
    }

    // 2) Create a sandbox demo relationship
    try {
      const created = await this.createACHRelationship(accountId, {
        account_owner_name: accountOwnerName,
        bank_account_type: 'CHECKING',
        bank_account_number: '32131231abc',
        bank_routing_number: '121000358',
        nickname: 'Sandbox Checking',
      })
      console.log('[Broker] Created ACH relationship:', created.id, 'status:', created.status)
      return created.id
    } catch (e) {
      // 409 means active relationship already exists — check again
      if (e instanceof Error && e.message.includes('409')) {
        console.warn('[Broker] 409 conflict, re-checking relationships')
        try {
          const result = await this.listACHRelationships(accountId)
          const raw = result as Record<string, unknown>
          const rels: ACHRelationship[] = Array.isArray(raw)
            ? (raw as ACHRelationship[])
            : Array.isArray(raw?.ach_relationships)
              ? (raw.ach_relationships as ACHRelationship[])
              : []
          const rel = rels[0]
          if (rel?.id) return rel.id
        } catch {
          // fall through
        }
      }
      throw e
    }
  }

  /**
   * Fund sandbox/paper account via ACH transfer.
   * POST /v1/accounts/{account_id}/transfers
   */
  async fundSandboxAccount(params: {
    accountId: string
    relationshipId: string
    amount: string
  }): Promise<Transfer> {
    const { accountId, relationshipId, amount } = params
    return this.createTransfer(accountId, {
      transfer_type: 'ach',
      relationship_id: relationshipId,
      amount,
      direction: 'INCOMING',
    })
  }

  /**
   * Get trading account details (includes cash, buying_power, equity)
   * GET /v1/trading/accounts/{account_id}/account
   */
  async getTradingAccount(accountId: string): Promise<{
    id: string
    account_number: string
    status: string
    cash: string
    buying_power: string
    portfolio_value: string
    equity: string
    last_equity: string
  }> {
    return this.request(`/v1/trading/accounts/${accountId}/account`)
  }

  /**
   * Update trading account configuration
   * PATCH /v1/trading/accounts/{account_id}/account-configurations
   */
  async updateTradingConfiguration(accountId: string, config: {
    pdt_check?: boolean
    allow_international_today?: boolean
    disable_no_margin_trade?: boolean
    fractional_trading?: boolean
    cash_equivalents?: string[]
    // Add more as needed
  }): Promise<any> {
    return this.request(`/v1/trading/accounts/${accountId}/account-configurations`, {
      method: 'PATCH',
      body: JSON.stringify(config),
    })
  }
}

/**
 * Factory function to create BrokerAPI instance
 * Uses credentials from environment or passed in
 * For paper mode, use ALPACA_KEY_ID and ALPACA_SECRET_KEY
 */
export function createBrokerAPI(keyId?: string, secretKey?: string): BrokerAPI {
  // Use BROKER_API credentials if available, fall back to Alpaca trading keys
  const key = keyId || process.env.BROKER_API_KEY_ID || process.env.ALPACA_KEY_ID
  const secret = secretKey || process.env.BROKER_API_SECRET_KEY || process.env.ALPACA_SECRET_KEY
  
  if (!key || !secret) {
    throw new Error('No API credentials configured. Set BROKER_API_KEY_ID or ALPACA_KEY_ID in environment.')
  }
  
  return new BrokerAPI({
    keyId: key,
    secretKey: secret,
  })
}

/**
 * Check if Broker API is configured
 */
export function isBrokerConfigured(): boolean {
  const key = process.env.BROKER_API_KEY_ID || process.env.ALPACA_KEY_ID
  const secret = process.env.BROKER_API_SECRET_KEY || process.env.ALPACA_SECRET_KEY
  return !!(key && secret)
}

export type { BrokerConfig, AccountRequest, Account, ACHRelationship, Transfer, Position }
export default BrokerAPI