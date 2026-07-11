#!/usr/bin/env bash
# setup-local.sh - Local development setup for KickTick
set -euo pipefail

echo "=== KickTick Dev Setup ==="

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1 — $2"; exit 1; }; }
need node "https://nodejs.org"
need npm  "comes with Node.js"

HAVE_ANCHOR=0
if command -v anchor >/dev/null 2>&1 && command -v solana >/dev/null 2>&1; then
  HAVE_ANCHOR=1
else
  echo "Note: anchor/solana CLI not found — skipping on-chain build/tests."
  echo "      Install: https://www.anchor-lang.com/docs/installation"
  echo "      Or use Docker: ./scripts/build.sh contracts"
fi

echo "Installing program test deps..."
(cd kicktick && npm install)

echo "Installing relayer deps..."
(cd relayer && npm install)

echo "Installing frontend deps..."
(cd frontend && npm install)

if [ "$HAVE_ANCHOR" -eq 1 ]; then
  echo "Building KickTick program..."
  (cd kicktick && anchor build)
  echo "Running anchor tests..."
  (cd kicktick && anchor test) || echo "anchor test failed (validator may be unavailable) — continuing"
fi

echo "Running pure logic simulation..."
node simulation.js

echo ""
echo "Setup complete. Next steps:"
echo "  1. cp .env.example .env   # fill TxLINE + program IDs"
echo "  2. solana-keygen new --outfile ~/.config/solana/id.json"
echo "  3. solana airdrop 2       # devnet"
echo "  4. cd frontend && npm run dev"
echo "  5. cd relayer && npm run dev"
echo ""
echo "Docker path: ./scripts/build.sh all && ./scripts/deploy.sh devnet"
