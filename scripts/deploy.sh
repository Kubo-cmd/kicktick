#!/usr/bin/env bash
# Deploy KickTick program to Solana via Docker
# Usage: ./scripts/deploy.sh [network] [priority_fee]
#   network: devnet|mainnet (default: devnet)
#   priority_fee: micro-lamports per CU (default: 10000)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

NETWORK="${1:-devnet}"
PRIORITY_FEE="${2:-10000}"
IMAGE="kicktick-contracts:dev"
# Container user must match the USER_NAME used when the image was built
USER_NAME="${USER_NAME:-builder}"
DEPLOYER_KEY="${DEPLOYER_KEY:-$PROJECT_DIR/kicktick/kicktick-deployer.json}"
WALLET_MOUNT="/home/${USER_NAME}/.config/solana/id.json"

echo "=== KickTick Deploy ==="
echo "Network: $NETWORK"
echo "Priority fee: $PRIORITY_FEE micro-lamports/CU"
echo "Container user: $USER_NAME"

if ! docker image inspect "$IMAGE" > /dev/null 2>&1; then
  echo "Docker image not found. Building contracts image..."
  USER_NAME="$USER_NAME" "$SCRIPT_DIR/build.sh" contracts
fi

if [ ! -f "$DEPLOYER_KEY" ]; then
  echo "ERROR: deployer keypair not found at $DEPLOYER_KEY"
  echo "Create one: solana-keygen new --outfile $DEPLOYER_KEY"
  exit 1
fi

PROGRAM_ID=$(docker run --rm \
  -v "$PROJECT_DIR/kicktick:/workspace" \
  "$IMAGE" \
  solana address -k target/deploy/kicktick-keypair.json)

echo "Program ID: $PROGRAM_ID"

echo "Checking program status on $NETWORK..."
if docker run --rm \
  -v "$PROJECT_DIR/kicktick:/workspace" \
  "$IMAGE" \
  solana program show "$PROGRAM_ID" --url "$NETWORK" \
    --keypair target/deploy/kicktick-keypair.json > /dev/null 2>&1; then
  echo "Program exists. Updating..."
else
  echo "Program not found. Deploying..."
fi

docker run --rm -t \
  -v "$PROJECT_DIR/kicktick:/workspace" \
  -v "$DEPLOYER_KEY:$WALLET_MOUNT:ro" \
  "$IMAGE" \
  bash -c "
    anchor build && \
    anchor deploy --provider.cluster $NETWORK -- --with-compute-unit-price $PRIORITY_FEE
  "

echo "Initializing Config PDA..."
docker run --rm \
  -v "$PROJECT_DIR/kicktick:/workspace" \
  -v "$DEPLOYER_KEY:$WALLET_MOUNT:ro" \
  "$IMAGE" \
  bash -c "
    cd /workspace && \
    npx ts-node scripts/init-kicktick.ts --cluster $NETWORK
  "

TXORACLE_ID=$([ "$NETWORK" = "devnet" ] && echo "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J" || echo "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA")

cat > "$PROJECT_DIR/deployment-${NETWORK}.json" << EOF
{
  "network": "$NETWORK",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "kicktick": {
    "programId": "$PROGRAM_ID"
  },
  "txodds": {
    "programId": "$TXORACLE_ID"
  }
}
EOF

echo ""
echo "Deployment complete!"
echo "Program ID: $PROGRAM_ID"
echo "Config saved to: deployment-${NETWORK}.json"
echo ""
echo "Next: cd frontend && npm run dev"
