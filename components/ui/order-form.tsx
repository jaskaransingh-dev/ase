'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtUSD } from '@/lib/utils'

interface Agent {
  id: string
  name: string
  slug: string
  ticker: string
}

interface PriceData {
  nav_cents: number
  bid_cents: number
  ask_cents: number
}

interface Props {
  agent: Agent
  currentPrice: PriceData | null
  onOrderPlaced?: () => void
}

interface OrderData {
  agent_id: string
  side: 'buy' | 'sell'
  order_type: 'market' | 'limit' | 'stop_loss' | 'recurring'
  notional_cents?: number
  shares?: number
  limit_price_cents?: number
  stop_price_cents?: number
  recurring_interval?: 'weekly' | 'monthly'
}

export default function OrderForm({ agent, currentPrice, onOrderPlaced }: Props) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'stop_loss' | 'recurring'>('market')
  const [amount, setAmount] = useState('')
  const [shares, setShares] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [stopPrice, setStopPrice] = useState('')
  const [recurringInterval, setRecurringInterval] = useState<'weekly' | 'monthly'>('weekly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const isBuy = side === 'buy'
  const executionPrice = orderType === 'market' 
    ? (isBuy ? currentPrice?.ask_cents : currentPrice?.bid_cents) || 0
    : Number(limitPrice) * 100 // Convert to cents

  const orderShares = shares ? Number(shares) : (Number(amount) * 100) / executionPrice
  const totalCost = Math.round(orderShares * executionPrice)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const orderData: OrderData = {
        agent_id: agent.id,
        side,
        order_type: orderType,
      }

      // Add amount or shares
      if (amount) {
        orderData.notional_cents = Number(amount) * 100
      } else if (shares) {
        orderData.shares = Number(shares)
      }

      // Add order-specific fields
      if (orderType === 'limit' && limitPrice) {
        orderData.limit_price_cents = Number(limitPrice) * 100
      }

      if (orderType === 'stop_loss' && stopPrice) {
        orderData.stop_price_cents = Number(stopPrice) * 100
      }

      if (orderType === 'recurring') {
        orderData.recurring_interval = recurringInterval
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Order failed')
      }

      // Reset form
      setAmount('')
      setShares('')
      setLimitPrice('')
      setStopPrice('')
      setError('')
      onOrderPlaced?.()

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Order failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Place Order</h3>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Side Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Order Side</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSide('buy')}
              className={`px-4 py-2 rounded font-medium ${
                side === 'buy' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setSide('sell')}
              className={`px-4 py-2 rounded font-medium ${
                side === 'sell' 
                  ? 'bg-red-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Sell
            </button>
          </div>
        </div>

        {/* Order Type Selection */}
        <div>
          <label className="block text-sm font-medium mb-2">Order Type</label>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as 'market' | 'limit' | 'stop_loss' | 'recurring')}
            className="w-full border rounded px-3 py-2"
          >
            <option value="market">Market Order</option>
            <option value="limit">Limit Order</option>
            <option value="stop_loss">Stop-Loss</option>
            <option value="recurring">Recurring Buy</option>
          </select>
        </div>

        {/* Amount Input */}
        <div>
          <label className="block text-sm font-medium mb-2">
            {orderType === 'recurring' ? 'Recurring Amount' : 'Amount'}
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="USD amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 border rounded px-3 py-2"
              step="0.01"
              min="10"
            />
            <input
              type="number"
              placeholder="Shares"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              className="flex-1 border rounded px-3 py-2"
              step="0.01"
              min="0.01"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Enter either USD amount or shares (not both)
          </p>
        </div>

        {/* Limit Price (for limit orders) */}
        {orderType === 'limit' && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Limit Price ({isBuy ? 'maximum' : 'minimum'})
            </label>
            <input
              type="number"
              placeholder="Limit price"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              className="w-full border rounded px-3 py-2"
              step="0.01"
              min="0.01"
            />
          </div>
        )}

        {/* Stop Price (for stop-loss) */}
        {orderType === 'stop_loss' && (
          <div>
            <label className="block text-sm font-medium mb-2">
              Stop Price (trigger price)
            </label>
            <input
              type="number"
              placeholder="Stop price"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              className="w-full border rounded px-3 py-2"
              step="0.01"
              min="0.01"
            />
          </div>
        )}

        {/* Recurring Interval */}
        {orderType === 'recurring' && (
          <div>
            <label className="block text-sm font-medium mb-2">Frequency</label>
            <select
              value={recurringInterval}
              onChange={(e) => setRecurringInterval(e.target.value as 'weekly' | 'monthly')}
              className="w-full border rounded px-3 py-2"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        )}

        {/* Order Summary */}
        {currentPrice && (amount || shares) && (
          <div className="bg-gray-50 p-4 rounded">
            <h4 className="font-medium mb-2">Order Summary</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Order Type:</span>
                <span className="font-medium">{orderType.replace('_', ' ').toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span>Side:</span>
                <span className="font-medium">{side.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span>Execution Price:</span>
                <span className="font-medium">
                  {orderType === 'market' 
                    ? fmtUSD(executionPrice / 100)
                    : `$${Number(limitPrice).toFixed(2)}`
                  }
                </span>
              </div>
              <div className="flex justify-between">
                <span>Shares:</span>
                <span className="font-medium">{orderShares.toFixed(4)}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t">
                <span>Total {isBuy ? 'Cost' : 'Proceeds'}:</span>
                <span>{fmtUSD(totalCost / 100)}</span>
              </div>
              {orderType === 'market' && (
                <div className="text-xs text-gray-500 mt-2">
                  Market orders execute immediately at current {isBuy ? 'ask' : 'bid'} price
                </div>
              )}
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading || !amount && !shares}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Placing Order...' : `Place ${orderType.replace('_', ' ').toUpperCase()} Order`}
        </button>
      </form>
    </div>
  )
}
