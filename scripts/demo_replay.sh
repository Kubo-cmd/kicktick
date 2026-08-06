#!/usr/bin/env bash
# KickTick demo — Phase 3.5
# Replays the synthetic 90-min match tape through the relayer trigger engine
# and prints the settlement narrative. No network, no chain — pure logic demo.
# Usage: ./scripts/demo_replay.sh [speed=30] [tape=relayer/tapes/demo-match.json]
set -euo pipefail
cd "$(dirname "$0")/.."

SPEED="${1:-30}"
TAPE="${2:-relayer/tapes/demo-match.json}"

echo "=== KickTick replay demo ==="
echo "tape:  $TAPE"
echo "speed: ${SPEED}x"
echo

cd relayer
exec npx tsx src/replay/replay.ts "../$TAPE" "$SPEED"
