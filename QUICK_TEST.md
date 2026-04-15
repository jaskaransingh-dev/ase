# Quick Test: Buy Agent Flow

## 60-Second Test

### Step 1: Check Alpaca Connection (in browser console)
```javascript
fetch('/api/account/balance')
  .then(r => r.json())
  .then(d => {
    console.log('Status:', d.status)
    console.log('Balance:', d.cash_cents ? '$' + (d.cash_cents/100).toFixed(2) : 'None')
  })
```

**Expected:** 
- Status shows `connected` 
- Balance shows amount like `$100.00`

**If fails:** Connect Alpaca account in Settings

---

### Step 2: Get Agent ID
```javascript
// From agents page, inspect an agent link:
// /agents/[slug] → copy UUID from console or URL
// Example: /agents/spy-momentum → find agent with slug 'spy-momentum'
const agentId = 'PASTE_AGENT_UUID_HERE'
```

---

### Step 3: Test Buy (in browser console)
```javascript
const agentId = 'YOUR_AGENT_UUID'
const amountCents = 1000 // $10

fetch('/api/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agent_id: agentId, amount_cents: amountCents })
})
.then(r => r.json())
.then(d => {
  if (d.error) {
    console.error('❌ Error:', d.error)
  } else {
    console.log('✅ Success!')
    console.log('Holding ID:', d.holding_id)
    console.log('Shares:', d.shares)
    console.log('Entry Price:', d.entry_price_cents/100)
  }
})
```

**Expected:** 
```json
{
  "ok": true,
  "holding_id": "abc123...",
  "shares": 10.5,
  "entry_price_cents": 952,
  ...
}
```

**If error:**
- `"Insufficient Alpaca balance"` → Fund account with more cash
- `"Agent not available"` → Agent status isn't 'active'
- `"No Alpaca account connected"` → Connect in Settings
- Other error → Note the message, check server logs

---

### Step 4: Verify in Database
```sql
-- Check holding created
SELECT id, shares, invested_cents, current_value_cents 
FROM holdings 
WHERE user_id = 'YOUR_USER_ID' 
ORDER BY created_at DESC 
LIMIT 1;

-- Check subscription created
SELECT id, status 
FROM subscriptions 
WHERE user_id = 'YOUR_USER_ID' 
ORDER BY created_at DESC 
LIMIT 1;

-- Check transaction recorded
SELECT type, amount_cents 
FROM transactions 
WHERE user_id = 'YOUR_USER_ID' 
ORDER BY created_at DESC 
LIMIT 1;
```

**Expected:** All three should have recent records

---

### Step 5: Verify Trades Executed
```sql
-- Check if immediate trade was executed
SELECT COUNT(*) as trade_count
FROM user_trades
WHERE user_id = 'YOUR_USER_ID'
  AND filled_at > NOW() - INTERVAL '5 minutes'
  AND qty > 0;
```

**Expected:** `trade_count` > 0 (at least 1 trade)

**If 0:** Agent may be crypto (trades in cron) or trade not filled yet

---

### Step 6: Dashboard Check
1. Refresh dashboard
2. Look for agent in "Your Agents" section
3. Should show:
   - Shares owned
   - Investment amount
   - Current value
   - P&L (if agent traded)

---

## Common Issues & Fixes

### "No Alpaca account connected"
```
Fix: Go to /dashboard/settings → Connect Alpaca
```

### "Insufficient Alpaca balance"
```
Fix: Fund Alpaca account with sandbox cash
- Go to Alpaca app
- Create or use paper/sandbox account
- Add cash (sandbox allows $100k free)
```

### "Agent not available"
```
Fix: Check agent status:
SELECT status FROM agents WHERE slug = 'agent-slug';
-- Should be 'active'
```

### "Socket hang up" or timeout
```
Fix: Broker API might be down
- Check Alpaca status page
- Restart server
- Check internet connection
```

### Capital allocation warning (non-fatal)
```
Message: "Capital allocation table may not exist"
Status: ✓ OK - system still works
Fix: Run migrations: supabase migration up
```

---

## What Each Error Means

| Error | Cause | Fix |
|-------|-------|-----|
| `Unauthorized` | Not logged in | Login first |
| `No Alpaca account` | Not connected | Settings → Alpaca |
| `Insufficient balance` | Not enough cash | Fund account |
| `Agent not available` | Agent not active | Check agent status |
| `Internal error` | Backend crash | Check server logs |
| `Socket hang up` | Network issue | Check connection |

---

## Server Logs to Check

After purchase, check server console for:

```
[Subscribe] Starting purchase
[Subscribe] User X Alpaca cash: $100.00
[Subscribe] Reserved capital allocation (or warning about table)
[subscribe] User X subscribed to AGENT_NAME
```

All should appear in order = successful purchase.

---

## Success Criteria ✅

All of these must be true:

1. ✅ No error returned from `/api/subscribe`
2. ✅ Holding created in DB with invested_cents
3. ✅ Subscription created with status 'active'
4. ✅ Transaction recorded with negative amount
5. ✅ Dashboard shows agent in "Your Agents"
6. ✅ Shares shown match API response

If all ✅, purchase flow is working!

---

## Full Test Script (bash)

```bash
#!/bin/bash

# Test 1: Check connection
echo "Testing Alpaca connection..."
curl -s http://localhost:3000/api/account/balance | jq '.status'

# Test 2: List agents
echo "Getting agents..."
AGENT_ID=$(curl -s http://localhost:3000/api/agents | jq -r '.[0].id')
echo "Using agent: $AGENT_ID"

# Test 3: Buy
echo "Submitting purchase..."
curl -X POST http://localhost:3000/api/subscribe \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\":\"$AGENT_ID\",\"amount_cents\":10000}" \
  | jq '.ok'

# Test 4: Check holdings
echo "Checking holdings..."
curl -s http://localhost:3000/api/account/holdings | jq '.holdings | length'

echo "Done!"
```

Save as `test.sh`, make executable, run: `./test.sh`
