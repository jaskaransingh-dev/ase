'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtUSD } from '@/lib/utils'

interface PriceData {
  nav_cents: number
  bid_cents: number
  ask_cents: number
  volume_shares: number
  snapshot_at: string
}

interface Props {
  agentId: string
  className?: string
}

export default function RealtimePrice({ agentId, className }: Props) {
  const [price, setPrice] = useState<PriceData | null>(null)
  const [prevPrice, setPrevPrice] = useState<number | null>(null)
  const supabase = createClient()

  useEffect(() => {
    // Get initial price
    async function getInitialPrice() {
      try {
        const { data } = await supabase
          .from('agent_stats')
          .select('nav_cents, bid_cents, ask_cents, volume_shares, snapshot_at')
          .eq('agent_id', agentId)
          .order('snapshot_at', { ascending: false })
          .limit(1)
          .single()

        if (data) {
          // Add fallback bid/ask if columns don't exist yet
          const priceData: PriceData = {
            nav_cents: data.nav_cents,
            bid_cents: data.bid_cents || Math.round(data.nav_cents * 0.9985),
            ask_cents: data.ask_cents || Math.round(data.nav_cents * 1.0015),
            volume_shares: data.volume_shares || 0,
            snapshot_at: data.snapshot_at
          }
          setPrice(priceData)
          setPrevPrice(priceData.nav_cents)
        }
      } catch {
        // Fallback to basic nav if new columns don't exist
        const { data } = await supabase
          .from('agent_stats')
          .select('nav_cents, snapshot_at')
          .eq('agent_id', agentId)
          .order('snapshot_at', { ascending: false })
          .limit(1)
          .single()

        if (data) {
          const navCents = data.nav_cents || 10000
          const priceData: PriceData = {
            nav_cents: navCents,
            bid_cents: Math.round(navCents * 0.9985),
            ask_cents: Math.round(navCents * 1.0015),
            volume_shares: 0,
            snapshot_at: data.snapshot_at
          }
          setPrice(priceData)
          setPrevPrice(priceData.nav_cents)
        }
      }
    }

    getInitialPrice()

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`agent-price-${agentId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_stats',
        filter: `agent_id=eq.${agentId}`,
      }, (payload) => {
        const newPrice = payload.new as PriceData
        setPrice(newPrice)
        setPrevPrice(prev => prev || newPrice.nav_cents)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [agentId, supabase])

  if (!price) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-6 w-24 bg-gray-200 rounded"></div>
      </div>
    )
  }

  const priceChange = prevPrice ? price.nav_cents - prevPrice : 0
  const isUp = priceChange > 0

  return (
    <div className={className}>
      {/* Current Price */}
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">
          ${fmtUSD(price.nav_cents / 100)}
        </span>
        
        {/* Price Change Indicator */}
        {priceChange !== 0 && (
          <span className={`text-sm font-medium ${isUp ? 'text-green-600' : 'text-red-600'}`}>
            {isUp ? '▲' : '▼'} {fmtUSD(Math.abs(priceChange) / 100)}
          </span>
        )}
      </div>

      {/* Bid/Ask Spread */}
      <div className="flex gap-4 text-sm text-gray-600 mt-1">
        <span>Bid: {fmtUSD(price.bid_cents / 100)}</span>
        <span>Ask: {fmtUSD(price.ask_cents / 100)}</span>
        <span>Spread: {fmtUSD((price.ask_cents - price.bid_cents) / 100)}</span>
      </div>

      {/* Volume */}
      {price.volume_shares > 0 && (
        <div className="text-xs text-gray-500 mt-1">
          Vol: {price.volume_shares.toFixed(2)} shares
        </div>
      )}
    </div>
  )
}
