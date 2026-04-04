#!/bin/bash

# Apply Migration 009: Add last_error column and seed 5 new agents
# This script applies the migration by calling the admin API endpoint

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$PROJECT_ROOT/ase/.env.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: .env.local not found at $ENV_FILE"
  exit 1
fi

# Extract NEXT_PUBLIC_APP_URL from .env.local (or use localhost)
APP_URL=$(grep "^NEXT_PUBLIC_APP_URL=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
APP_URL=${APP_URL:-http://localhost:3000}

# Check if the app is running
echo "🔄 Checking if app is running at $APP_URL..."
if ! curl -s "$APP_URL" > /dev/null 2>&1; then
  echo "❌ Error: App is not running at $APP_URL"
  echo ""
  echo "Please start your Next.js app with:"
  echo "  cd ase && npm run dev"
  echo ""
  echo "Then run this script again."
  exit 1
fi

echo "✅ App is running"
echo ""
echo "🔄 Applying migration 009..."
echo ""

# Call the migration endpoint with admin token
ADMIN_TOKEN="apply-migration-admin-token"
RESPONSE=$(curl -X POST "$APP_URL/api/admin/apply-migration" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  2>/dev/null)

# Check if the request was successful
if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✅ Migration 009 applied successfully!"
  echo ""
  echo "Changes made:"
  echo "  - Added 'last_error' column to agents table"
  echo "  - Seeded 5 new trading agents (btc-eth-pairs, vol-harvester, momentum-carry, cascade-detect, defi-yield)"
  echo ""
  echo "All 10 agents are now active:"
  echo "  1. btc-momentum (BTC Momentum Alpha)"
  echo "  2. eth-mean-revert (ETH Statistical Arbitrage)"
  echo "  3. crypto-trend (Multi-Asset Trend System)"
  echo "  4. sol-breakout (SOL Volatility Breakout)"
  echo "  5. defi-basket (DeFi Smart Beta Rotation)"
  echo "  6. btc-eth-pairs (BTC/ETH Pair Trading)"
  echo "  7. vol-harvester (Crypto Volatility Harvester)"
  echo "  8. momentum-carry (Crypto Momentum Carry)"
  echo "  9. cascade-detect (Liquidation Cascade Detector)"
  echo "  10. defi-yield (DeFi Yield Momentum)"
  echo ""
  echo "🚀 Cron job is already configured to run every minute."
  echo "   Your agents should start showing as ONLINE within 1-2 minutes!"
else
  echo "❌ Migration failed"
  echo ""
  echo "Response:"
  echo "$RESPONSE"
  exit 1
fi
