---
id: agents-index
type: overview
title: "Agent Navigation Map"
service: overview
depends_on: []
related_to: []
tags: [index, navigation, entry-point]
---

# KickTick — Agent Navigation Map

> **Hackathon:** World Cup Hackathon — Superteam × Solana, powered by TxODDS
> **Track:** Prediction Markets & Settlement ($18k USDT)
> **Deadline:** July 19, 2026
> **Phase 0:** ✅ Completed July 3, 2026

---

## Project DNA

Sub-minute micro prediction markets on Solana. Create + settle markets in <60s using live TxODDS oracle odds + on-chain Merkle proof settlement.

---

## Three Subsystems

| # | Subsystem | Dir | Language | Purpose |
|---|-----------|-----|----------|---------|
| 1 | **Anchor Program** | `kicktick/programs/kicktick/` | Rust (Anchor 1.0.0) | On-chain PDAs, CPI settlement, bet accounting |
| 2 | **Relayer** | `relayer/` | Node/TS | Off-chain crank: SSE ingestion, market triggers, proof gathering, tx builder |
| 3 | **Frontend** | `frontend/` | Next.js + React + Tailwind | UI with wallet, market cards, live odds |

---

## Documentation Structure

```
docs/agent/
├── AGENTS.md                      ← this file (root index)
├── overview/                      ← project context, architecture, roadmap
│   ├── PROJECT.md                 ← hackathon context, goals, DNA
│   ├── ARCHITECTURE.md            ← system-level data flow, components
│   └── ROADMAP.md                 ← phases, timeline, status
├── services/
│   ├── program/                   ← Anchor smart contract (deep docs)
│   │   ├── README.md              ← purpose, PDA overview, key concepts
│   │   ├── ARCHITECTURE.md        ← account model, PDA seeds, state
│   │   ├── INSTRUCTIONS.md        ← 12 instructions: accounts, args, logic
│   │   ├── CONSTANTS.md           ← seeds, enums, config, errors, StatKey
│   │   ├── BUILD.md               ← build, test, debug
│   │   └── DEPLOY.md              ← deploy to devnet/mainnet via Docker
│   ├── relayer/                   ← off-chain crank (stub)
│   │   └── README.md              ← purpose, modules, current state
│   └── frontend/                  ← Next.js UI (stub)
│       └── README.md              ← components, demo-only state
├── integration/                   ← cross-service docs
│   ├── DATA-FLOW.md               ← end-to-end: TxLINE → relayer → chain → UI
│   ├── DEPENDENCIES.md            ← tech stack, versions, dep graph
│   └── ENVIRONMENT.md             ← program IDs, endpoints, env vars
└── operations/                    ← how-to guides
    ├── WORKFLOWS.md               ← deploy, add market type, debug
    ├── STRUCTURE.md               ← full file tree
    └── TROUBLESHOOTING.md         ← error codes, fixes, debug commands
```

### Reading Order for New Agents

```
AGENTS.md → overview/PROJECT.md → overview/ARCHITECTURE.md → services/program/README.md
```

### Graph Metadata

All docs carry YAML frontmatter (`id`, `type`, `service`, `depends_on`, `related_to`, `tags`) for graph-based navigation and dependency tracking.

---

## Network Config (Devnet)

| Component | Address |
|-----------|---------|
| KickTick program | `CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc` |
| TxOracle program | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| TxL mint (Token-2022) | `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` |
| USDT mint (Token) | `ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh` |
| RPC | `https://api.devnet.solana.com` |
| TxLINE API | `https://txline-dev.txodds.com` |

---

## Command Cheat Sheet

```bash
# Scripts
./scripts/build.sh [all|contracts|frontend|relayer] [dev|prod]  # Docker build
./scripts/deploy.sh [devnet|mainnet] [priority_fee]              # Docker deploy

# Anchor
anchor build                          # Build program
anchor deploy --provider.cluster devnet  # Deploy to devnet
anchor test                           # Run tests

# Relayer
cd relayer && npx ts-node src/scripts/cpi-spike.ts  # Run CPI spike test
cd relayer && npx ts-node src/scripts/verify-tokens.ts  # Check token mints

# Frontend
cd frontend && npm run dev              # Dev server
```
