'use client'
import { useState } from 'react'
import RealtimePrice from '@/components/ui/realtime-price'
import OrderForm from '@/components/ui/order-form'

export default function TestExchangePage() {
  const [selectedAgent] = useState({
    id: '53cea0dd-0478-4a7b-ad5a-6fb13f6fbf04',
    name: 'Mean Reversion Pro',
    slug: 'mean-reversion-pro',
    ticker: 'REVT',
    description: 'Test agent',
    strategy_type: 'mean_reversion',
    status: 'active',
    total_aum_cents: 0
  })

  const mockPrice = {
    nav_cents: 10000,
    bid_cents: 9985,
    ask_cents: 10015,
    volume_shares: 100,
    snapshot_at: '2026-03-22T02:00:00.000Z'
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>ASE Exchange Features Test</h1>
      
      <div style={{ marginBottom: '3rem' }}>
        <h2>Real-Time Price Component</h2>
        <RealtimePrice agentId={selectedAgent.id} />
      </div>

      <div style={{ marginBottom: '3rem' }}>
        <h2>Order Form Component</h2>
        <OrderForm 
          agent={selectedAgent}
          currentPrice={mockPrice}
          onOrderPlaced={() => alert('Order placed!')}
        />
      </div>

      <div style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '8px' }}>
        <h3>Features Implemented:</h3>
        <ul>
          <li>Bid/Ask Spread (0.3% total)</li>
          <li>Real-Time Price Updates</li>
          <li>Market Orders</li>
          <li>Limit Orders</li>
          <li>Stop-Loss Orders</li>
          <li>Recurring Buys</li>
          <li>Order Matching Engine</li>
          <li>Price History Ticks</li>
        </ul>
      </div>
    </div>
  )
}
