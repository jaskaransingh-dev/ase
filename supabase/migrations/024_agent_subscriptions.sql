-- ============================================================
-- Migration 024 — Agent Subscription System
-- Enables direct investment in agents without share limits
-- Users allocate USD and receive proportional ownership
-- ============================================================

-- Create agent_holdings table for direct investment tracking
create table if not exists public.agent_holdings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles(id) on delete cascade,
  agent_id            uuid references public.agents(id) on delete cascade,
  
  -- Investment tracking
  shares              numeric default 0,           -- ownership shares (proportional)
  invested_cents      numeric not null,            -- total USD invested
  current_value_cents numeric,                     -- current value
  pnl_cents           numeric default 0,          -- profit/loss
  
  -- Status
  status              text default 'active'
    check (status in ('active', 'sold', 'delisted')),
  
  -- Timestamps
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  
  unique(user_id, agent_id)
);

-- Add holding_id to transactions for audit trail
alter table public.transactions add column if not exists holding_id uuid references public.agent_holdings(id);

-- Create agent_subscriptions as the primary subscription tracking (replaces old subscriptions for agents)
create table if not exists public.agent_subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.profiles(id) on delete cascade,
  agent_id            uuid references public.agents(id) on delete cascade,
  
  -- Investment details
  initial_investment_cents numeric not null,
  current_value_cents      numeric,
  shares                  numeric,
  
  -- Status
  status                  text default 'active'
    check (status in ('active', 'sold', 'delisted')),
  
  -- Timestamps
  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),
  
  unique(user_id, agent_id)
);

-- Create index for fast lookups
create index if not exists idx_agent_holdings_user   on public.agent_holdings(user_id);
create index if not exists idx_agent_holdings_agent  on public.agent_holdings(agent_id);
create index if not exists idx_agent_subs_user       on public.agent_subscriptions(user_id);
create index if not exists idx_agent_subs_agent      on public.agent_subscriptions(agent_id);

-- Enable RLS
alter table public.agent_holdings enable row level security;
alter table public.agent_subscriptions enable row level security;

-- RLS Policies for holdings
drop policy if exists "Users manage own holdings" on public.agent_holdings;
create policy "Users manage own holdings" on public.agent_holdings
  for all using (auth.uid() = user_id);

-- RLS Policies for subscriptions  
drop policy if exists "Users manage own agent subscriptions" on public.agent_subscriptions;
create policy "Users manage own agent subscriptions" on public.agent_subscriptions
  for all using (auth.uid() = user_id);

-- Function: Invest in agent (allocate USD, get proportional shares)
create or replace function public.invest_in_agent(
  p_user_id uuid,
  p_agent_id uuid,
  p_amount_cents numeric
) returns jsonb as $$
declare
  v_agent record;
  v_nav_cents numeric;
  v_shares numeric;
  v_invested_cents numeric;
  v_current_value numeric;
  v_pnl numeric;
  v_holding_id uuid;
  v_subscription_id uuid;
begin
  -- Get agent
  select id, name, total_aum_cents, share_price_cents, max_aum_cents, status
  into v_agent
  from agents
  where id = p_agent_id and status = 'active';

  if not found then
    return jsonb_build_object('success', false, 'error', 'Agent not found or not active');
  end if;

  -- Check AUM capacity
  if v_agent.max_aum_cents is not null then
    if (coalesce(v_agent.total_aum_cents, 0) + p_amount_cents) > v_agent.max_aum_cents then
      return jsonb_build_object('success', false, 'error', 'Agent at max capacity');
    end if;
  end if;

  -- Calculate shares based on NAV (or default to $100/share if no nav)
  v_nav_cents := coalesce(v_agent.share_price_cents, 10000); -- default $100/share
  v_shares := p_amount_cents / v_nav_cents;
  v_invested_cents := p_amount_cents;
  v_current_value := p_amount_cents; -- initially equal to invested
  v_pnl := 0;

  -- Insert/update holding
  insert into agent_holdings (user_id, agent_id, shares, invested_cents, current_value_cents, pnl_cents, status)
  values (p_user_id, p_agent_id, v_shares, v_invested_cents, v_current_value, v_pnl, 'active')
  on conflict (user_id, agent_id) do update set
    shares = agent_holdings.shares + v_shares,
    invested_cents = agent_holdings.invested_cents + v_invested_cents,
    current_value_cents = agent_holdings.current_value_cents + v_current_value,
    pnl_cents = agent_holdings.pnl_cents + v_pnl,
    updated_at = now()
  returning id into v_holding_id;

  -- Insert/update subscription
  insert into agent_subscriptions (user_id, agent_id, initial_investment_cents, current_value_cents, shares, status)
  values (p_user_id, p_agent_id, p_amount_cents, v_current_value, v_shares, 'active')
  on conflict (user_id, agent_id) do update set
    initial_investment_cents = agent_subscriptions.initial_investment_cents + p_amount_cents,
    current_value_cents = agent_subscriptions.current_value_cents + v_current_value,
    shares = agent_subscriptions.shares + v_shares,
    updated_at = now()
  returning id into v_subscription_id;

  -- Update agent AUM
  update agents 
  set total_aum_cents = coalesce(total_aum_cents, 0) + p_amount_cents
  where id = p_agent_id;

  return jsonb_build_object(
    'success', true,
    'holding_id', v_holding_id,
    'subscription_id', v_subscription_id,
    'shares', v_shares,
    'amount_cents', p_amount_cents,
    'nav_cents', v_nav_cents
  );
end;
$$ language plpgsql security definer;

-- Function: Sell/delist from agent
create or replace function public.sell_agent_holding(
  p_user_id uuid,
  p_agent_id uuid
) returns jsonb as $$
declare
  v_holding record;
  v_agent record;
  v_current_value numeric;
begin
  -- Get holding
  select * into v_holding
  from agent_holdings
  where user_id = p_user_id and agent_id = p_agent_id and status = 'active';

  if not found then
    return jsonb_build_object('success', false, 'error', 'No active holding found');
  end if;

  -- Get agent
  select * into v_agent
  from agents where id = p_agent_id;

  -- Calculate current value (simplified - real implementation would use current NAV)
  v_current_value := v_holding.invested_cents;

  -- Update holding to sold
  update agent_holdings
  set status = 'sold',
      current_value_cents = v_current_value,
      pnl_cents = v_current_value - v_holding.invested_cents,
      updated_at = now()
  where id = v_holding.id;

  -- Update subscription
  update agent_subscriptions
  set status = 'sold',
      current_value_cents = v_current_value,
      updated_at = now()
  where user_id = p_user_id and agent_id = p_agent_id;

  -- Reduce agent AUM
  update agents
  set total_aum_cents = greatest(0, coalesce(total_aum_cents, 0) - v_holding.invested_cents)
  where id = p_agent_id;

  return jsonb_build_object(
    'success', true,
    'shares', v_holding.shares,
    'amount_cents', v_current_value,
    'pnl_cents', v_current_value - v_holding.invested_cents
  );
end;
$$ language plpgsql security definer;

-- Function: Update holdings when agent is delisted
create or replace function public.mark_agent_delisted(p_agent_id uuid) returns void as $$
begin
  update agent_holdings
  set status = 'delisted',
      updated_at = now()
  where agent_id = p_agent_id and status = 'active';

  update agent_subscriptions
  set status = 'delisted',
      updated_at = now()
  where agent_id = p_agent_id and status = 'active';
end;
$$ language plpgsql;

-- Grant execute to anon for public read access
grant execute on function public.invest_in_agent to anon;
grant execute on function public.sell_agent_holding to anon;
grant execute on function public.mark_agent_delisted to anon;