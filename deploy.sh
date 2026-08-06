#!/bin/bash
# KickTick Deploy Script — Post-Keygen
# Run this AFTER: solana-keygen new -o ~/.config/solana/id.json
# This script does NOT auto-execute. Copy-paste each line or run: bash deploy.sh

set -e

echo "=== KICKTICK DEPLOY ==="

# Step 1: Verify keypair exists
if [ ! -f ~/.config/solana/id.json ]; then
    echo "ERROR: No keypair found. Run: solana-keygen new -o ~/.config/solana/id.json"
    exit 1
fi

echo "Keypair found. Pubkey:"
solana-keygen pubkey ~/.config/solana/id.json

# Step 2: Check balance (devnet)
echo ""
echo "Balance (devnet):"
solana balance --url devnet

# Step 3: Airdrop if needed (devnet only, 2 SOL max per request)
BALANCE=$(solana balance --url devnet | awk '{print $1}')
if (( $(echo "$BALANCE < 0.5" | bc -l) )); then
    echo ""
    echo "Low balance. Requesting airdrop..."
    solana airdrop 2 --url devnet
    sleep 5
    solana balance --url devnet
fi

# Step 4: Build with matched toolchain
echo ""
echo "Building KickTick..."
export PATH="$HOME/.local/share/solana/install/releases/stable-6a8c724a9ed8f093127ef6066e0bcfb074193cc3/solana-release/bin:$HOME/.cargo/bin:$PATH"
cd /Users/test/projects/kicktick
anchor build

# Step 5: Verify artifacts
if [ ! -f target/deploy/kicktick.so ]; then
    echo "ERROR: Build failed. No .so file."
    exit 1
fi

echo ""
echo "Build verified:"
ls -lh target/deploy/kicktick.so
ls -lh target/idl/kicktick.json

# Step 6: Deploy to devnet (USER STEP — this is the gated action)
echo ""
echo "=== DEPLOY COMMAND ==="
echo "Run this to deploy to devnet:"
echo ""
echo "  cd /Users/test/projects/kicktick"
echo "  export PATH=\"\$HOME/.local/share/solana/install/releases/stable-6a8c724a9ed8f093127ef6066e0bcfb074193cc3/solana-release/bin:\$HOME/.cargo/bin:\$PATH\""
echo "  anchor deploy --provider.cluster devnet"
echo ""
echo "Or for mainnet (requires real SOL):"
echo "  anchor deploy --provider.cluster mainnet"
echo ""
echo "Program ID: CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc"
echo "Deploy keypair: target/deploy/kicktick-keypair.json"
echo ""
echo "=== DONE ==="
