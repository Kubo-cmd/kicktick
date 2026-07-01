#!/bin/bash
# deploy.sh - Deploy KickTick to Solana
# Prerequisites: anchor CLI, solana CLI, node/yarn

set -e

NETWORK=${1:-devnet}
echo "Deploying KickTick to: $NETWORK"

# ===== Build & Deploy KickTick =====
echo "Building KickTick program..."
cd kicktick
anchor build

# Get program ID from keypair
PROGRAM_ID=$(solana address -k target/deploy/kicktick-keypair.json)
echo "KickTick Program ID: $PROGRAM_ID"

# Deploy
if [ "$NETWORK" = "devnet" ]; then
  anchor deploy --provider.cluster devnet
else
  anchor deploy --provider.cluster mainnet
fi

cd ..

# ===== Optional: Initialize (if init script exists) =====
if [ -f "kicktick/scripts/init-kicktick.ts" ]; then
  echo "Initializing KickTick on $NETWORK..."
  npx ts-node kicktick/scripts/init-kicktick.ts --cluster $NETWORK
else
  echo "Skipping init (no kicktick/scripts/init-kicktick.ts found)"
fi

# ===== Save deployment info =====
cat > deployment-${NETWORK}.json << EOF
{
  "network": "$NETWORK",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "kicktick": {
    "programId": "$PROGRAM_ID"
  },
  "txodds": {
    "programId": "$([ "$NETWORK" = "devnet" ] && echo "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J" || echo "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA")"
  }
}
EOF

echo ""
echo "Deployment complete!"
echo "KickTick Program ID: $PROGRAM_ID"
echo "Config saved to: deployment-${NETWORK}.json"
echo ""
echo "Next: cd frontend && npm run dev"
