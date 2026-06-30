#!/bin/bash
# setup-local.sh - Local development setup for KickTick + SPIKES

echo "=== TxODDS Hackathon Dev Setup ==="

# Check prerequisites
command -v anchor >/dev/null 2>&1 || { echo "anchor CLI required: https://www.anchor-lang.com/docs/installation"; exit 1; }
command -v solana >/dev/null 2>&1 || { echo "solana CLI required: https://docs.solana.com/cli/install"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js required"; exit 1; }

# Install JS dependencies
echo "Installing dependencies..."
cd kicktick/client && npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token @noble/curves
cd ../..

# Build programs
echo "Building KickTick..."
cd kicktick && anchor build && cd ..

echo "Building SPIKES..."
cd spikes && anchor build && cd ..

# Run tests
echo "Running KickTick tests..."
cd kicktick && anchor test && cd ..

echo ""
echo "Setup complete! Next steps:"
echo "  1. solana-keygen new --outfile ~/.config/solana/id.json"
echo "  2. solana airdrop 2 (for devnet SOL)"
echo "  3. npm run dev (start frontend)"
echo "  4. npm run pipeline (start spike detection)"
