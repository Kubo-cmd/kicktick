# KickTick: Sub-Minute Micro Prediction Markets on Solana

Create and settle prediction markets in **under 60 seconds** using live TxODDS odds data + on-chain Merkle proof settlement via CPI to the `txoracle` program.

**World Cup Hackathon** — Superteam × Solana, powered by TxODDS

## Market Types

| Type | Description | Settlement |
|------|-------------|------------|
| `next_goal` | Which team scores next? | CPI (ternary: home/away/draw) |
| `next_goal_side` | Will next goal be by home team? | CPI (ternary) |
| `goal_in_window` | Goal in next N minutes? | CPI (binary) |
| `next_corner` | Corner in next 5 min? | CPI (binary) |
| `next_card` | Card in next 5 min? | CPI (binary) |
| `over_under_corners` | Corners threshold in window? | CPI (binary) |
| `penalty_shootout` | Penalty round outcome | CPI + off-chain fallback |
| `var_check` | VAR overturn? | Off-chain (relayer) |

## Key Features

- **Native SOL** betting — no SPL tokens for wagers
- **CPI settlement** — `settle_round` calls `txoracle::validate_stat` on-chain
- **Off-chain settlement** — `settle_offchain_round` for PenaltyShot/VARCheck
- **Sub-minute markets** — 15s lock, 60s finality delay, 15–300s duration
- **Event-driven** — SSE from TxLINE triggers market creation and settlement
- **PDA vaults** — MatchVault (system-owned), Position tracking, SponsorVault

## Architecture

```
                    TxLINE API (txline-dev.txodds.com)
                 ┌──────────────────────────────────┐
                 │  Guest JWT + API token            │
                 │  SSE odds/scores streams          │
                 │  REST stat-validation (Merkle)    │
                 └─────────────┬────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────┐
│  RELAYER (Node/TS — off-chain crank, no DB)           │
│                                                       │
│  txline-auth → SSE parser → fixture-watcher          │
│  market-trigger (rules engine)                       │
│  proof-gatherer → crank (build+sign+send tx)         │
│  ws-server → WebSocket to frontend                   │
└──────────┬───────────────────────────────────────────┘
           │ CPI validate_stat          │ WebSocket
           ▼                            ▼
┌─────────────────────┐    ┌─────────────────────────┐
│ Solana Devnet       │    │ Frontend (Vite + React) │
│                     │    │                         │
│ kicktick program    │    │ Wallet (Phantom/Solf)  │
│  init_config        │    │ MarketCard (bet UI)     │
│  init_match         │    │ CreateMarketModal       │
│  open_round         │    │ LiveOddsFeed            │
│  place_bet          │    │                         │
│  settle_round (CPI) │    └─────────────────────────┘
│  settle_offchain    │
│  confirm_round      │
│  claim_winnings     │
│  cancel_round       │
│  challenge_equivoc. │
│                     │
│ txoracle program    │
│  validate_stat(CPI) │
└─────────────────────┘
```

## Repository Structure

```
kicktick/
├── README.md
├── AGENTS.md                    # Agent instructions (copy of docs/agent/AGENTS.md)
├── setup-local.sh               # Local environment setup
├── docker-compose.yml           # Dev orchestration
├── docker-compose.prod.yml      # Prod orchestration
├── simulation.js                # Pure logic sim (22 tests, no chain)
├── scripts/
│   ├── build.sh                 # Docker build [all|contracts|frontend|relayer]
│   └── deploy.sh                # Deploy [devnet|mainnet]
├── docs/agent/                  # Full agent documentation
├── kicktick/                    # Anchor workspace
│   ├── Anchor.toml
│   ├── programs/kicktick/src/   # On-chain program (Rust)
│   ├── tests/                   # Integration tests
│   └── scripts/                 # Anchor scripts
├── relayer/                     # Off-chain crank (Node/TS)
│   ├── src/
│   │   ├── clients/             # Anchor + TxLINE clients
│   │   ├── market/              # Fixture watcher + triggers
│   │   ├── settlement/          # Proof gatherer + crank
│   │   ├── api/ws-server.ts     # WS to frontend
│   │   ├── config.ts
│   │   └── index.ts
│   ├── tests/
│   └── package.json
└── frontend/                    # Vite + React UI
    ├── src/                     # App, pages, components
    ├── index.html
    └── package.json
```

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/Kubo-cmd/kicktick.git
cd kicktick
./setup-local.sh

# 2. Configure wallet (devnet)
solana-keygen new --outfile ~/.config/solana/id.json
solana airdrop 2

# 3. Build all services
./scripts/build.sh all dev

# 4. Deploy program to devnet
./scripts/deploy.sh devnet

# 5. Start frontend
cd frontend && npm run dev
```

## Build & Deploy

```bash
# Build Docker images
./scripts/build.sh [all|contracts|frontend|relayer] [dev|prod]

# Deploy to devnet (auto-builds contracts if needed)
./scripts/deploy.sh [devnet|mainnet] [priority_fee]
```

Deployment info saved to `deployment-{network}.json`.

## Program IDs (Devnet)

| Component | Address |
|-----------|---------|
| KickTick program | `a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2` |
| TxOracle program | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| TxL mint (Token-2022) | `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` |
| USDT mint (Token) | `ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh` |

## On-Chain Config

| Parameter | Value |
|-----------|-------|
| Min market duration | 15 seconds |
| Max market duration | 300 seconds (5 min) |
| Finality delay | 60 seconds |
| Default lock | 15 seconds |
| Min round liquidity | 0.01 SOL |
| CPI compute units | 1,400,000 |

## Market Lifecycle

1. Relayer detects match event via SSE (goal, corner, card, etc.)
2. `open_round` — market opens with specified duration
3. Users place YES/NO bets (native SOL)
4. Market locks at deadline
5. `settle_round` via CPI to `txoracle::validate_stat` with Merkle proof
6. 60s finality delay → `confirm_round`
7. Winners `claim_winnings` from vault

## Development Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | TxLINE auth, CPI spike test, token verification | ✅ Done |
| 1 | Anchor program (10 instructions, 5 PDAs, native SOL) | ✅ Done |
| 2 | Relayer SSE parser, market triggers, crank, WebSocket | ✅ Done (core modules) |
| 3 | Logic sim + Docker/Vite UI | ✅ Done (22/22 sim) |
| 4 | Live demo polish + Superteam submission pack | ⏳ In progress |

**Track:** Prediction Markets and Settlement ($18k USDT) — Superteam World Cup · deadline 2026-07-19

**Submit:** live MVP link · demo video · public repo `https://github.com/Kubo-cmd/kicktick`

## Security

- All settlements reference verifiable TxODDS Merkle data via CPI
- PDA-controlled vaults (no privileged withdrawal keys)
- Strict duration + overflow checks on-chain
- Equivocation challenge mechanism
- Finality delay before confirmation

## Documentation

Full agent documentation in `docs/agent/`:

```
docs/agent/overview/    → Project context, architecture, roadmap
docs/agent/services/    → Program, relayer, frontend deep docs
docs/agent/integration/ → Data flow, dependencies, environment
docs/agent/operations/  → Workflows, troubleshooting
```

## License

MIT
