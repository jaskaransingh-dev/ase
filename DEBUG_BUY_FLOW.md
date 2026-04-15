# Debugging Agent Purchase Flow

## Quick Test Checklist

Run these in order to identify where the purchase is breaking:

### 1. Check Alpaca Connection
```bash
# Open browser console and run:
fetch('/api/account/balance').then(r => r.json()).then(console.log)
```
Expected: Shows your Alpaca account balance and status "connected"
If error: Alpaca account not connected or credentials invalid

### 2. Test Subscribe Endpoint Directly
```bash
# In terminal:
curl -X POST http://localhost:3000/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "YOUR_AGENT_ID_HERE",
    "amount_cents": 10000
  }'
```
Expected: Returns JSON with `ok: true` and holding details
If error: See error message below

### 3. Check Broker Account Exists
```bash
fetch('/api/broker/account').then(r => r.json()).then(console.log)
```
Expected: Shows `has_account: true` and alpaca account ID
If error: Go to Settings > Connect Alpaca

### 4. Check Holdings Created
After purchase attempt:
```sql
SELECT * FROM holdings WHERE user_id = 'YOUR_USER_ID' ORDER BY created_at DESC LIMIT 1;
```
Expected: Shows holding with shares and invested_cents
If not found: Purchase endpoint failed before creating holding

### 5. Check Subscriptions Created
```sql
SELECT * FROM subscriptions WHERE user_id = 'YOUR_USER_ID' ORDER BY created_at DESC LIMIT 1;
```
Expected: Shows subscription with status 'active'
If not found: Payment creation failed

### 6. Check Transactions Recorded
```sql
SELECT * FROM transactions WHERE user_id = 'YOUR_USER_ID' ORDER BY created_at DESC LIMIT 1;
```
Expected: Shows invest transaction with negative amount
If not found: Transaction recording failed

## Common Error Messages & Fixes

### "No Alpaca account connected"
- **Cause:** User hasn't connected Alpaca account
- **Fix:** Go to Settings > Alpaca Account > Connect

### "Insufficient Alpaca balance"
- **Cause:** Not enough cash in Alpaca account
- **Fix:** Fund Alpaca account with real or sandbox cash

### "Agent not available" (status 400)
- **Cause:** Agent status is not 'active' or doesn't exist
- **Fix:** Verify agent.status in DB is 'active'

### "Capital allocation table may not exist" (Warning, continues)
- **Cause:** Migration 025_capital_allocations hasn't been run
- **Fix:** Run: `supabase migration up`
- **Impact:** System still works, just without capital tracking

### 500 Internal Error
- **Cause:** Unknown error in subscribe logic
- **Fix:** Check server console logs for `[Subscribe]` messages

## Step-by-Step Manual Test

1. **Setup:** Make sure you have:
   - User account logged in
   - Alpaca account connected with $100+ cash
   - Active agent with primary_symbol set

2. **Run this sequence:**
   ```bash
   # Check balance first
   curl http://localhost:3000/api/account/balance
   
   # Subscribe to agent
   curl -X POST http://localhost:3000/api/subscribe \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"agent_id": "AGENT_UUID", "amount_cents": 10000}'
   
   # Check holding created
   curl http://localhost:3000/api/holdings (check response in dashboard)
   ```

3. **Expected flow:**
   - ✅ Alpaca balance verified
   - ✅ Agent NAV fetched
   - ✅ Shares calculated
   - ✅ Holding created
   - ✅ Subscription created
   - ✅ Capital allocation attempted (may warn about migration)
   - ✅ Agent repriced
   - ✅ Immediate trade triggered
   - ✅ Response with holding details returned

## Checking Logs

### Server Console
Look for these logs in order:
```
[Subscribe] Starting purchase
[Subscribe] User X Alpaca cash: $100.00
[Subscribe] Reserved capital allocation: ... (or warning about migration)
[subscribe] User X subscribed to AGENT_NAME
```

### Database
Check these tables for records:
- `holdings` - holding record for investment
- `subscriptions` - subscription record
- `transactions` - invest transaction
- `capital_allocations` - if migration ran, capital allocation record
- `user_trades` - if trades executed, trade records

## If Nothing Works

1. **Check database schema:**
   ```sql
   \d holdings
   ```
   Should show columns: id, user_id, agent_id, shares, invested_cents, current_value_cents, status, created_at, capital_allocation_id, pnl_cents, updated_at

2. **Check Alpaca connection:**
   ```bash
   curl -X GET http://localhost:3000/api/broker/account
   ```
   Should show account details

3. **Enable debug logging:**
   In subscribe/route.ts, all `console.log` calls will print to server console

4. **Test Alpaca directly:**
   ```bash
   # If you have the Alpaca CLI:
   alpaca account
   alpaca positions
   ```
