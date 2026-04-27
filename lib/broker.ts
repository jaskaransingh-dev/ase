import { krakenClientForUser } from './kraken-client'

export function createBrokerAPI(_apiKey?: string, _apiSecret?: string) {
  return {
    async getAccount(_accountId: string) {
      return { status: 'ACTIVE', cash: '0', portfolio_value: '0' }
    },
    async getTradingAccount(_accountId: string) {
      return { id: 'stub', status: 'ACTIVE', account_number: 'kraken', cash: '0', portfolio_value: '0', buying_power: '0' }
    },
    async getBalances(_accountId: string) {
      return { cash: '0', portfolio_value: '0' }
    },
    async listAccounts() {
      return { accounts: [] }
    },
    async createOrder(_accountId: string, _order: any) {
      return { id: 'stub', status: 'filled', filled_qty: '0', filled_avg_price: '0' }
    },
    async listOrders(_accountId: string, _opts?: any) {
      return { orders: [] }
    },
    async createACHRelationship(_accountId: string, _params: any) {
      return { id: 'stub-ach', status: 'pending', bank_name: 'Stub Bank', bank_account_type: 'CHECKING', account_last4: '1234' }
    },
    async deleteACHRelationship(_accountId: string, _relationshipId: string) {
      return { success: true }
    },
    async createAccount(_params: any) {
      return { id: 'stub-account', account_number: '123456789', status: 'ACTIVE', account_type: 'INDIVIDUAL', trading_enabled: true, transfers_enabled: true }
    },
    async getAccountNumbers(_accountId: string) {
      return { account_numbers: [{ account_number: 'stub', routing_number: 'stub' }] }
    },
    async createTransfer(_accountId: string, _params: any) {
      return { id: 'stub-transfer', status: 'pending' }
    },
    async ensureSandboxAchRelationship(_params: any): Promise<string> {
      return 'stub-ach'
    },
    async fundSandboxAccount(_params: any) {
      return { id: 'stub-fund', status: 'COMPLETED' }
    },
  }
}

export async function syncAlpacaPositionsToHoldings(_admin: any, _params: any) {
  console.log('[broker stub] syncAlpacaPositionsToHoldings called - no-op for Kraken')
}