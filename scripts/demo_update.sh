#!/usr/bin/env bash
# KickTick weekly-update demo — one-command localnet demo for video updates.
#
# Stands up the full local stack and runs the two verified suites:
#   1. Anchor on-chain test suite (13/13) against a live local test-validator
#   2. Relayer integration smoke (SMOKE_PASS) against the live program
#
# METHOD (copy-harness — committed source is NEVER modified):
#   The repo program declares declare_id!("CCmcpUZtt...") but that keypair is not
#   on this machine, so `anchor test` would hit DeclaredProgramIdMismatch (4100).
#   We copy programs/ OUTSIDE the repo, patch ONLY the copy's declare_id to the
#   local deploy keypair, build arch v3, deploy to a local validator, point the
#   repo's gitignored target/idl at the deployed id, and run. declare_id feeds
#   only the identity check (not PDAs), so this exercises 100% of program logic.
#   On exit the repo IDL is restored, the validator is killed, and temp is wiped.
#   Concurrency-safe: a singleton lock (/tmp/kicktick-demo.lock) refuses a second
#   concurrent run, and each run uses a unique /tmp/kicktick-demo-<ts>-<pid> dir.
#
# USAGE:  bash scripts/demo_update.sh
# Requires: Solana CLI (stable-6a8c724a) + cargo-build-sbf on PATH (script adds it).

set -euo pipefail

# --- config ---
REPO="/Users/test/projects/kicktick"
SOLANA_RELEASE="$HOME/.local/share/solana/install/releases/stable-6a8c724a9ed8f093127ef6066e0bcfb074193cc3/solana-release/bin"
export PATH="$SOLANA_RELEASE:$HOME/.cargo/bin:$PATH"
RPC="http://127.0.0.1:8899"
# unique per-run temp dir so overlapping runs NEVER race on shared paths
# (previously a fixed path -> concurrent cleanups rm -rf'd each other's build,
#  causing "couldn't create a temp dir: No such file or directory")
RUN_ID="$(date +%s)-$$"
TMP="/tmp/kicktick-demo-$RUN_ID"
HARNESS="$TMP/harness"
LEDGER="$TMP/ledger"
WALLET="$TMP/wallet.json"
PROG_KP="$TMP/program-keypair.json"
IDL_BAK="$TMP/idl-bak.json"
ANCHOR_BAK="$TMP/anchor-bak.toml"
# singleton lock: refuse to run if another demo instance is alive
LOCK="/tmp/kicktick-demo.lock"
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "another demo run is in progress (pid $(cat "$LOCK")) — refusing to start a concurrent run" >&2
  exit 1
fi
echo $$ > "$LOCK"
# canonical (committed) program id — what the repo declares
CANONICAL_ID="CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc"

banner() { printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }

# --- cleanup on any exit: restore IDL, kill validator, wipe temp ---
cleanup() {
  set +e
  banner "CLEANUP"
  [ -f "$IDL_BAK" ] && cp "$IDL_BAK" "$REPO/target/idl/kicktick.json" && echo "repo IDL restored -> $(grep -o '\"address\": \"[^\"]*\"' "$REPO/target/idl/kicktick.json" | head -1)"
  [ -f "$ANCHOR_BAK" ] && cp "$ANCHOR_BAK" "$REPO/Anchor.toml" && echo "Anchor.toml restored"
  pkill -f "solana-test-validator.*$LEDGER" 2>/dev/null && echo "validator stopped" || echo "validator not running"
  rm -rf "$TMP" "$LOCK"
  echo "temp wiped"
}
trap cleanup EXIT

banner "0/6  PREP"
# only kill a validator using OUR run ledger (never another process's)
pkill -f "solana-test-validator.*$LEDGER" 2>/dev/null || true
sleep 1
rm -rf "$TMP"
mkdir -p "$HARNESS/programs"
cp -R "$REPO/programs/kicktick" "$HARNESS/programs/kicktick"
cp "$REPO/Cargo.toml" "$HARNESS/Cargo.toml"
# local deploy keypair: reuse the repo's gitignored target/deploy keypair if present,
# else generate one — its pubkey becomes the copy's declare_id
if [ -f "$REPO/target/deploy/kicktick-keypair.json" ]; then
  cp "$REPO/target/deploy/kicktick-keypair.json" "$PROG_KP"
else
  solana-keygen new --no-bip39-passphrase -s -o "$PROG_KP" --force >/dev/null 2>&1
fi
DEPLOY_ID="$(solana-keygen pubkey "$PROG_KP")"
echo "deploy program id: $DEPLOY_ID"
sed -i '' "s/declare_id!(\"$CANONICAL_ID\")/declare_id!(\"$DEPLOY_ID\")/" "$HARNESS/programs/kicktick/src/lib.rs"
grep -n 'declare_id' "$HARNESS/programs/kicktick/src/lib.rs"

banner "1/6  BUILD (cargo build-sbf --arch v3)"
(cd "$HARNESS" && cargo build-sbf --arch v3 2>&1 | tail -3)
echo "build ok"

banner "2/6  START VALIDATOR"
rm -rf "$LEDGER"
# --faucet: serve airdrops (the tests' fund() helper uses requestAirdrop).
# NOTE: keep the validator flags MINIMAL. Custom --ticks-per-slot/--slots-per-epoch
#       were tried and PREVENTED the validator from producing its first slot
#       (stuck at "Waiting for first slot 1..."), so they were reverted.
# --log (verbose) so a mid-suite crash is captured (the --quiet flag hid it).
solana-test-validator --ledger "$LEDGER" --reset \
  --faucet-sol 100000 --faucet-port 9900 \
  --log > /tmp/kicktick-demo-validator.log 2>&1 &
VPID=$!
for i in $(seq 1 30); do
  curl -s -m 3 "$RPC" -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q '"ok"' && { echo "validator healthy"; break; }
  sleep 1
done

banner "3/6  DEPLOY PROGRAM"
solana-keygen new --no-bip39-passphrase -s -o "$WALLET" --force >/dev/null 2>&1
solana airdrop 100 "$WALLET" --url "$RPC" >/dev/null 2>&1
solana program deploy "$HARNESS/target/deploy/kicktick.so" \
  --url "$RPC" --keypair "$WALLET" --program-id "$PROG_KP" 2>&1 | grep -E "Program Id|Signature" | head -2
echo "deploy ok"

# point repo IDL at the deployed localnet id (restored in cleanup)
cp "$REPO/target/idl/kicktick.json" "$IDL_BAK"
sed -i '' "s/\"address\": \"$CANONICAL_ID\"/\"address\": \"$DEPLOY_ID\"/" "$REPO/target/idl/kicktick.json"
echo "repo IDL (temp) -> $(grep -o '\"address\": \"[^\"]*\"' "$REPO/target/idl/kicktick.json" | head -1)"

banner "4/6  ON-CHAIN TESTS (ts-mocha against live validator)"
cd "$REPO"
# tests/kicktick.ts uses anchor.AnchorProvider.env() (ANCHOR_WALLET/ANCHOR_PROVIDER_URL)
# and anchor.workspace.Kicktick. The workspace reads Anchor.toml -> provider.cluster
# (committed as "devnet") -> programs.devnet.kicktick and OVERRIDES the IDL address with
# the devnet program id. On a localnet validator that program isn't deployed, so the
# first RPC call hangs forever (0%-CPU hang observed). Fix: temp-swap provider.cluster
# to "localnet" so the workspace resolves from target/idl/kicktick.json (the swapped
# deployed id) instead of overriding. Anchor.toml is backed up and restored in cleanup.
cp "$REPO/Anchor.toml" "$ANCHOR_BAK"
sed -i '' 's/^cluster = "devnet"/cluster = "localnet"/' "$REPO/Anchor.toml"
echo "Anchor.toml (temp) -> cluster=localnet"
ANCHOR_WALLET="$WALLET" ANCHOR_PROVIDER_URL="$RPC" \
  ./node_modules/.bin/ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts 2>&1 \
  | grep -aE "✓|✔|✗|[0-9]+\)|passing|failing|pending|Error|kicktick$|initializes|rejects|enforces|settles|pays|opens|cancels|locks" \
  | grep -avE "at async|at Connection|node_modules|Check signature"

banner "5/6  RELAYER INTEGRATION SMOKE"
cd "$REPO/relayer"
./node_modules/.bin/tsx src/integration-smoke.ts 2>&1 | grep -E "ANCHOR_IDL_LOADED|RELAYER_START|WS_WELCOME|RESULT|SMOKE" || true

banner "6/6  DEMO COMPLETE"
echo "All demo suites ran. Cleanup (IDL restore + validator stop + temp wipe) runs automatically."
