-- ============================================================
-- Migration 025 — Fix Agent Publishing & Add Better Error Handling
-- Run in Supabase SQL Editor
-- ============================================================

-- Fix: Ensure agents have all required columns for publishing
alter table public.agents add column if not exists backtest_strategy text default 'momentum_crossover';
alter table public.agents add column if not exists asset_class text default 'crypto';
alter table public.agents add column if not exists share_price_cents bigint default 10000;
alter table public.agents add column if not exists max_aum_cents bigint default 100000000;
alter table public.agents add column if not exists monthly_fee_cents bigint default 0;
alter table public.agents add column if not exists total_aum_cents bigint default 0;
alter table public.agents add column if not exists total_shares bigint default 100000;

-- Ensure backtest_stats column exists (JSONB for storing stats)
alter table public.agents add column if not exists backtest_stats jsonb;

-- Fix: Add missing columns to holdings table for better tracking
alter table public.holdings add column if not exists capital_allocation_id uuid;
alter table public.holdings add column if not exists updated_at timestamptz;

-- Ensure agent_stats has all needed columns
alter table public.agent_stats add column if not exists sortino_ratio numeric default 0;
alter table public.agent_stats add column if not exists profit_factor numeric default 0;
alter table public.agent_stats add column if not exists avg_trade_return_pct numeric default 0;

-- Create function to handle agent status changes (active/pending/delisted)
create or replace function public.update_agent_status(
  p_agent_id uuid,
  p_status text
) returns void as $$
begin
  update agents set status = p_status, updated_at = now() where id = p_agent_id;
  
  -- If delisting, update all holdings
  if p_status = 'delisted' then
    update holdings set status = 'sold', updated_at = now() where agent_id = p_agent_id and status = 'active';
  end if;
end;
$$ language plpgsql;

-- Create function to publish an agent (activate it)
create or replace function public.publish_agent(
  p_agent_id uuid,
  p_backtest_stats jsonb
) returns jsonb as $$
declare
  v_agent record;
begin
  -- Get agent
  select * into v_agent from agents where id = p_agent_id;
  
  if not found then
    return jsonb_build_object('success', false, 'error', 'Agent not found');
  end if;
  
  -- Validate backtest stats if provided
  if p_backtest_stats is not null then
    if (p_backtest_stats->>'sharpeRatio')::numeric < 0.5 then
      return jsonb_build_object('success', false, 'error', 'Sharpe ratio must be >= 0.5');
    end if;
    if (p_backtest_stats->>'maxDrawdownPct')::numeric > 50 then
      return jsonb_build_object('success', false, 'error', 'Max drawdown must be <= 50%');
    end if;
    if (p_backtest_stats->>'winRate')::numeric < 40 then
      return jsonb_build_object('success', false, 'error', 'Win rate must be >= 40%');
    end if;
  end if;
  
  -- Update agent to active
  update agents 
  set status = 'active', 
      backtest_stats = p_backtest_stats,
      updated_at = now()
  where id = p_agent_id;
  
  -- Create initial stats record
  insert into agent_stats (agent_id, nav_cents, total_return_pct, sharpe_ratio, max_drawdown_pct, win_rate_pct, total_trades)
  values (
    p_agent_id, 
    10000, 
    COALESCE((p_backtest_stats->>'totalReturnPct')::numeric, 0),
    COALESCE((p_backtest_stats->>'sharpeRatio')::numeric, 0),
    COALESCE((p_backtest_stats->>'maxDrawdownPct')::numeric, 0),
    COALESCE((p_backtest_stats->>'winRate')::numeric, 0),
    COALESCE((p_backtest_stats->>'totalTrades')::numeric, 0)
  );
  
  return jsonb_build_object('success', true, 'agent_id', p_agent_id);
end;
$$ language plpgsql security definer;

-- Grant permissions
grant execute on function public.update_agent_status to anon;
grant execute on function public.publish_agent to anon;