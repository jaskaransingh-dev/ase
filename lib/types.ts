export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface Wallet {
  id: string
  user_id: string
  balance_cents: number
  updated_at: string
}

export interface Transaction {
  id: string
  user_id: string
  type: 'deposit' | 'withdrawal' | 'invest' | 'divest' | 'return'
  amount_cents: number
  reference_id: string | null
  note: string | null
  created_at: string
}

export interface Agent {
  id: string
  slug: string
  name: string
  description: string | null
  strategy_type: 'momentum' | 'mean_reversion' | 'trend_following'
  status: 'active' | 'paused' | 'pending_review'
  alpaca_account: string | null
  total_aum_cents: number
  created_at: string
}

export interface AgentStats {
  id: string
  agent_id: string
  snapshot_at: string
  nav_cents: number
  total_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate_pct: number
  total_trades: number
}

export interface Holding {
  id: string
  user_id: string
  agent_id: string
  shares: number
  entry_nav_cents: number
  status: 'active' | 'pending_sell' | 'sold'
  invested_cents: number
  current_value_cents: number | null
  created_at: string
  sold_at: string | null
}

export interface AgentTrade {
  id: string
  agent_id: string
  alpaca_order_id: string | null
  symbol: string
  side: 'buy' | 'sell'
  qty: number
  fill_price: number
  filled_at: string | null
  pnl_cents: number | null
}
