/**
 * Migration: Add missing indexes to agent_trades table
 *
 * PROBLEM: The agent_trades table had NO indexes on frequently-queried columns.
 * This caused FULL TABLE SCANS when:
 * - getAgentPositions() fetches positions by agent_id
 * - calcSellPnL() looks up buy orders by agent_id + symbol
 * - Queries would timeout as the table grew
 *
 * SOLUTION: Add composite + single-column indexes for common queries
 */

-- Index for fetching all trades by agent (most common operation)
-- Used in: getAgentPositions(), calcSellPnL(), agent detail pages
create index if not exists idx_agent_trades_agent_id
  on public.agent_trades(agent_id);

-- Index for fetching trades by agent + symbol (position tracking)
-- Used when checking if agent has position in a symbol
create index if not exists idx_agent_trades_agent_symbol
  on public.agent_trades(agent_id, symbol);

-- Index for FIFO cost basis calculation in calcSellPnL()
-- Needs both agent_id, symbol, and order by filled_at
create index if not exists idx_agent_trades_agent_symbol_filled
  on public.agent_trades(agent_id, symbol, side, filled_at);

-- Index for recent trades (UI display, diagnostics)
create index if not exists idx_agent_trades_filled_at
  on public.agent_trades(filled_at desc);

-- Index for alpaca order ID lookups (tracking order fills)
create index if not exists idx_agent_trades_alpaca_order_id
  on public.agent_trades(alpaca_order_id);

-- Analyze table to update stats
analyze public.agent_trades;
