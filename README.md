# KickTick — Sub-Minute Micro Prediction Markets on Solana

Settle prediction markets in under 60 seconds. Built for the Superteam World Cup
hackathon (Prediction Markets & Settlement track, $18K USDT).

## Architecture

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Safari  │────▶│  Relayer │────▶│  Solana  │
│  (React) │     │  (Node)  │     │ (Anchor) │
│  :5173   │◀────│  :3001   │◀────│  :8899   │
└──────────┘     └──────────┘     └──────────┘
     │                                │
     └──────── SDK (client) ──────────┘
```

- **Program**: Anchor on Solana — `initMatch`, `openRound`, `placeBet`, `settleMarket`
- **Relayer**: TypeScript — TxODDS oracle integration, 30 unit tests
- **Frontend**: React + Vite + Solana wallet adapter
- **SDK**: Browser-compatible client with Web Crypto (no Node.js deps)

## Quick Start

### Prerequisites

- Solana CLI 4.1.1+ (matching platform-tools v1.54)
- Rust + Anchor CLI 0.31+
- Node.js 18+

### 1. Start Local Validator

```bash
solana-test-validator \
  --ledger /tmp/kicktick-ledger \
  --dynamic-port-range 18000-18200 \
  --gossip-port 18001
```

### 2. Build & Deploy Program

```bash
# Build with v3 arch for local validator compatibility
cargo build-sbf --arch v3

# Airdrop and deploy
solana airdrop 5
solana program deploy target/deploy/kicktick.so
```

### 3. Update Program ID (if needed)

The deploy keypair generates a unique program ID. Sync it:

```bash
anchor keys sync       # updates declare_id! in lib.rs
# OR update manually in:
#   - programs/kicktick/src/lib.rs  → declare_id!("...")
#   - Anchor.toml [programs.localnet]
#   - frontend/src/lib/constants.ts
#   - relayer/src/config.ts
```

### 4. Relayer

```bash
cd relayer
npm install
npm test          # 30 tests
npm run dev       # start:3001
```

### 5. Frontend

```bash
cd frontend
npm install
npm run dev       # :5173
```

### 6. Open Browser

[http://127.0.0.1:5173](http://127.0.0.1:5173)

Connect Phantom/Solflare wallet, create markets, open rounds, place bets.

## Deploy to Devnet

```bash
solana config set --url devnet
solana airdrop 5
anchor deploy
```

Requires a devnet wallet with SOL. Devnet faucet at faucet.solana.com.

## Project Structure

```
kicktick/
├── programs/kicktick/   # Anchor program (Rust)
│   └── src/lib.rs       # initMatch, openRound, placeBet, settleMarket
├── relayer/             # TypeScript settlement oracle
│   └── src/
│       ├── services/    # TxODDS integration
│       ├── solana/      # Program interaction
│       └── websocket/   # Frontend relay
├── frontend/            # React + Vite + Tailwind
│   └── src/
│       ├── admin/       # AdminMatchDetail (openRound wired)
│       ├── components/  # CreateMarketModal (initMatch wired)
│       └── lib/         # Wallet context, constants, SDK client
├── sdk/src/             # TypeScript client library
└── docker/              # Docker Compose deployment
```

## Status (2026-08-10)

| Component | Status |
|-----------|--------|
| Anchor program | Builds, deploys to localnet |
| Relayer | 30/30 tests passing |
| Frontend | Builds, wallet-connected, TODOs resolved |
| SDK client | Browser-compatible, Web Crypto |
| Devnet deployment | Blocked by faucet rate limit |

## License

MIT
