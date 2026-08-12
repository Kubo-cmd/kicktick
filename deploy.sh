#!/usr/bin/env bash
set -euo pipefail

# KickTick devnet deployment — run when faucet has SOL
# Usage: bash deploy.sh

echo "=== KickTick Devnet Deploy ==="

# Set devnet config
solana config set --url devnet

# Check balance
BAL=$(solana balance)
echo "Balance: $BAL"
if [[ "$BAL" == "0 SOL" ]]; then
  echo "ERROR: No SOL. Use faucet.solana.com (needs captcha) or wait for daily reset."
  exit 1
fi

# Build with v3 arch
echo "=== Building ==="
SOL_R4="/Users/test/.local/share/solana/install/releases/stable-6a8c724a9ed8f093127ef6066e0bcfb074193cc3/solana-release"
export PATH="$SOL_R4/bin:$HOME/.cargo/bin:$PATH"
anchor build --arch v3

# Sync keys
echo "=== Syncing keys ==="
anchor keys sync

# Deploy
echo "=== Deploying ==="
anchor deploy

echo "=== Deployment complete ==="
echo "Program ID: CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc"
echo ""
echo "Next: update frontend/relayer config with devnet RPC + program ID"
