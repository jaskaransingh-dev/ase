# ASE Alpaca Broker API Architecture

## Overview
ASE as embedded brokerage using Alpaca Broker API with:
- Fully-disclosed customer accounts
- Plaid + ACH for bank linking
- Transfers API for deposits/withdrawals
- Agent sleeves for portfolio allocation

## Pre-requisites

### Broker API Access
- Need: `broker-api.alpaca.markets` credentials (different from Trading API)
- Get from: https://dashboard.alpaca.markets (Broker Dashboard)
- Auth: Basic Auth with `key_id:secret_key`

### Plaid Integration  
- Need: Plaid account with Alpaca integration activated
- Get from: https://plaid.com
- Used for: Bank account linking (ACH relationships)

## Architecture Components

### 1. Account Management

#### Account Creation (POST /v1/accounts)
```
Fields required:
- contact: { email, phone_number, address }
- identity: { first_name, last_name, birth_date, tax_id, country_of_residency }
- disclosures: { is_affiliated_exchange, is_control_person, ...
- agreements: [ margin_agreement, account_agreement, customer_acquisition, ...]
```
Status flow: SUBMITTED → APPROVED → ACTIVE

#### Account Status Events (WebSocket)
Subscribe to: ` account_status.updates.{account_id}`
Statuses: SUBMITTED, APPROVAL_PENDING, APPROVED, ACTION_REQUIRED, REJECTED

### 2. Bank Linking (ACH Relationships)

#### Via Plaid (processor_token flow)
```
1. Frontend: Plaid Link initialize
2. User: Selects bank in Plaid
3. Backend: POST /v1/accounts/{id}/ach_relationships
   { processor_token: "processor-xxx" }
4. Returns: relationship_id
```

### 3. Transfers (Funding)

#### Deposit (POST /v1/accounts/{id}/transfers)
```
{
  transfer_type: "ach",
  relationship_id: "xxx",
  amount: "1000",
  direction: "INCOMING"
}
```
Status: PENDING → EXECUTED → COMPLETE

#### Withdraw (POST /v1/accounts/{id}/transfers)
```
{
  transfer_type: "ach", 
  relationship_id: "xxx",
  amount: "500",
  direction: "OUTGOING"
}
```

### 4. Agent Sleeve Allocation System

#### ASE Database Schema
```sql
-- Agent Sleeves (user's allocated $ to each agent)
agent_sleeves (
  id, user_id, agent_id, allocated_cents, 
  target_weight_pct, status, created_at
)

-- Internal Ledger
ledger_entries (
  id, user_id, type, amount_cents,
  reference_type, reference_id,
  status, created_at
)

-- Transfer tracking  
transfers (
  id, user_id, alpaca_transfer_id,
  type, amount_cents, status,
  created_at, updated_at
)
```

#### Allocation Engine
```
1. User allocates $ to agents (sleeves)
2. ASE computes target portfolio (sum of agent target weights)
3. ASE converts to orders:
   - Current portfolio: get from Alpaca positions
   - Target portfolio: sum of (sleeve amount * agent's holdings)
   - Diff: orders to buy/sell
4. Submit orders via Broker API
```

### 5. Order Execution (via Broker API)

```
POST /v1/accounts/{id}/orders
{
  symbol: "AAPL",
  qty: "10",
  side: "buy",
  type: "market",
  time_in_force: "day"
}
```

## Database Schema

### new_tables.sql
```sql
-- Broker accounts (one per user)
CREATE TABLE broker_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  alpaca_account_id VARCHAR NOT NULL, -- uuid
  status VARCHAR NOT NULL, -- SUBMITTED, APPROVED, ACTIVE, etc
  kyc_level VARCHAR, -- basic, full
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ACH bank links
CREATE TABLE bank_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  alpaca_relationship_id VARCHAR NOT NULL,
  bank_name VARCHAR,
  account_last4 VARCHAR,
  status VARCHAR, -- QUEUED, ACTIVE, etc
  is_primary BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Transfers tracking
CREATE TABLE broker_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  alpaca_transfer_id VARCHAR,
  type VARCHAR, -- deposit, withdrawal
  amount_cents BIGINT NOT NULL,
  status VARCHAR, -- PENDING, EXECUTED, COMPLETE, REJECTED, FAILED
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Agent sleeves (allocations)
CREATE TABLE agent_sleeves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  agent_id UUID REFERENCES agents(id),
  allocated_cents BIGINT NOT NULL DEFAULT 0,
  target_weight_pct INTEGER, -- 0-100
  status VARCHAR DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ledger entries
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  type VARCHAR, -- deposit, withdrawal, allocation, trade, fee, pnl
  amount_cents BIGINT NOT NULL,
  reference_type VARCHAR, -- transfer, sleeve, order
  reference_id VARCHAR,
  balance_cents BIGINT NOT NULL, -- running balance
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## API Routes

### /api/broker/account/route.ts
- POST: Create new Alpaca brokerage account
- GET: Get account status

### /api/broker/kyc/route.ts
- POST: Submit KYC data
- GET: Check KYC status

### /api/broker/bank-link/route.ts
- POST: Create ACH relationship (Plaid)
- GET: List bank links
- DELETE: Remove bank link

### /api/broker/deposit/route.ts
- POST: Initiate deposit via transfer
- GET: Deposit history

### /api/broker/withdraw/route.ts
- POST: Initiate withdrawal
- GET: Withdrawal history

### /api/broker/sleeves/route.ts
- GET: List sleeves
- POST: Allocate to agent
- PUT: Update allocation
- DELETE: Remove allocation

### /api/broker/rebalance/route.ts
- GET: Preview rebalance (what orders would be created)
- POST: Execute rebalance

### /api/broker/orders/route.ts
- GET: Order history
- POST: Get current positions

## Flow Diagrams

### New User Onboarding
```
1. User signs up on ASE
2. User clicks "Open Brokerage Account"
3. ASE shows onboarding form:
   - Personal info (name, DOB, SSN/Tax ID)
   - Address
   - Employment
   - Disclosures
4. User submits → POST /api/broker/account
5. Backend → POST to Alpaca /v1/accounts
6. Account STATUS: "SUBMITTED"
7. Subscribe to WebSocket for status updates
8. On APPROVED → User can link bank
```

### Bank Linking Flow
```
1. User clicks "Link Bank"
2. Frontend initializes Plaid Link
3. User selects bank, authenticates
4. Plaid returns processor_token
5. ASE → POST /ach_relationships with token
6. Alpaca → relationship_id
7. Store in bank_links table
```

### Deposit Flow
```
1. User clicks "Deposit"
2. User enters amount
3. ASE → POST /transfers (INCOMING)
4. Alpaca → transfer_id, status: PENDING
5. User's bank initiates ACH
6. Alpaca webhook → status: EXECUTED
7. After 2-3 days → status: COMPLETE
8. Balance updates in ledger
```

### Invest/Allocate Flow  
```
1. User clicks "Invest $X in Agent Y"
2. Create agent_sleeve record
3. Calculate target portfolio weights
4. Get current positions from Alpaca
5. Generate diff orders
6. Show preview modal
7. User confirms
8. Execute orders via Broker API
9. Track in ledger
```

## Rebalance Preview

Show user exactly what will happen:
```
Current Portfolio:
  AAPL: 10 shares ($1,800)
  NVDA: 5 shares ($2,000)
  Cash: $200
  
Target (after allocation):
  Agent A (60%): needs $2,400
  Agent B (40%): needs $1,600
  
Orders to execute:
  BUY AAPL shares=3 (needs $540)
  SELL NVDA shares=2 (gets $800)
  
Net: $200 more cash needed -> deposit required

User confirms → Orders submitted
```

## Security Requirements

- All transfers must go through linked bank accounts only
- No custody of customer cash outside Alpaca
- Verify identity before account creation
- Track all ledger entries for audit
- Keep transfer status in sync via webhooks

## Implementation Priority

1. **Phase 1**: Broker API setup + account creation
2. **Phase 2**: Bank linking via ACH
3. **Phase 3**: Deposits/Withdrawals
4. **Phase 4**: Allocation engine + rebalance
5. **Phase 5**: Order execution + tracking