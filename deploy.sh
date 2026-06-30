#!/bin/bash
# deploy.sh - Deploy KickTick + SPIKES to Solana Devnet
# Prerequisites: anchor CLI, solana CLI, yarn/npm

set -e

NETWORK=${1:-devnet}
echo "Deploying to: $NETWORK"

# ===== Step 1: Build KickTick =====
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

# ===== Step 2: Build SPIKES =====
echo "Building SPIKES program..."
cd spikes
anchor build

SPIKES_PROGRAM_ID=$(solana address -k target/deploy/spikes-keypair.json)
echo "SPIKES Program ID: $SPIKES_PROGRAM_ID"

if [ "$NETWORK" = "devnet" ]; then
  anchor deploy --provider.cluster devnet
else
  anchor deploy --provider.cluster mainnet
fi

cd ..

# ===== Step 3: Initialize Collections =====
echo "Initializing SPIKES collection..."
# Run initialization script (creates Bubblegum tree, collection NFT)
npx ts-node scripts/init-spikes-collection.ts --cluster $NETWORK

echo "Initializing KickTick..."
npx ts-node scripts/init-kicktick.ts --cluster $NETWORK

# ===== Step 4: Save deployment info =====
cat > deployment-${NETWORK}.json << EOF
{
  "network": "$NETWORK",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "kicktick": {
    "programId": "$PROGRAM_ID"
  },
  "spikes": {
    "programId": "$SPIKES_PROGRAM_ID"
  },
  "txodds": {
    "programId": "$([ "$NETWORK" = "devnet" ] && echo "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J" || echo "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA")"
  }
}
EOF

echo ""
echo "Deployment complete!"
echo "KickTick: $PROGRAM_ID"
echo "SPIKES:   $SPIKES_PROGRAM_ID"
echo "Config saved to: deployment-${NETWORK}.json"
