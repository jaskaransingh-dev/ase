import { placeOrder as krakenPlaceOrder, getAccountInfo, getPositions } from './kraken'
import { getCryptoBars } from './market-data'

export interface OrderParams {
  symbol: string
  side: 'buy' | 'sell'
  qty?: number
  notional?: number
  type?: 'market' | 'limit'
}

export interface OrderResult {
  id: string
  status: string
  filled_qty: string
  filled_avg_price: string
}

export async function submitOrder(
  params: OrderParams,
  userId: string,
  _apiKey?: string,
  _secretKey?: string
): Promise<OrderResult> {
  const result = await krakenPlaceOrder({
    userId,
    symbol: params.symbol,
    side: params.side,
    qty: params.qty,
    notional: params.notional,
    type: params.type,
  })

  if (!result) {
    return {
      id: 'failed',
      status: 'rejected',
      filled_qty: '0',
      filled_avg_price: '0',
    }
  }

  return {
    id: result.orderId,
    status: 'filled',
    filled_qty: result.filledQty.toString(),
    filled_avg_price: result.filledPrice.toString(),
  }
}

export async function waitForFill(
  orderId: string,
  _apiKey?: string,
  _secretKey?: string,
  _maxWaitMs?: number
): Promise<OrderResult> {
  await new Promise(r => setTimeout(r, 500))
  
  return {
    id: orderId,
    status: 'filled',
    filled_qty: '0',
    filled_avg_price: '0',
  }
}

export async function getAccount(_userId: string) {
  return { status: 'ACTIVE', cash: '0', portfolio_value: '0', buying_power: '0', currency: 'USD' }
}

export { getCryptoBars, getPositions }