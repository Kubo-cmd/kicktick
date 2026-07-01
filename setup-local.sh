#!/bin/bash
# setup-local.sh - Local development setup for KickTick

echo "=== KickTick Dev Setup ==="

# Check prerequisites
command -v anchor >/dev/null 2>&1 || { echo "anchor CLI required: https://www.anchor-lang.com/docs/installation"; exit 1; }
command -v solana >/dev/null 2>&1 || { echo "solana CLI required: https://docs.solana.com/cli/install"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js required"; exit 1; }

# Install JS dependencies for client + frontend
echo "Installing client dependencies..."
cd kicktick/client && npm install
cd ../..

echo "Installing frontend dependencies..."
cd frontend && npm install
cd ..

# Build KickTick program
echo "Building KickTick program..."
cd kicktick && anchor build && cd ..

# Run tests
echo "Running tests..."
cd kicktick && anchor test && cd ..

echo ""
echo "Setup complete! Next steps:"
echo "  1. solana-keygen new --outfile ~/.config/solana/id.json"
echo "  2. solana airdrop 2   # (devnet)"
echo "  3. cd frontend && npm run dev"
echo ""
echo "Deploy: ./deploy.sh devnet"
