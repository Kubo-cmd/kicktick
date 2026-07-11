---
id: overview-architecture
type: architecture
title: "System Architecture"
service: overview
depends_on:
  - overview-project
related_to:
  - program-architecture
  - integration-data-flow
tags: [architecture, data-flow, components]
---

# KickTick — System Architecture

> Three subsystems: Anchor program (on-chain) ↔ Relayer (off-chain crank) ↔ Frontend (Next.js)

---

## Data Flow

```
                         TxLINE API (txline-dev.txodds.com)
                      ┌──────────────────────────────────┐
                      │  POST /auth/guest/start → JWT     │
                      │  POST /api/token/activate         │
                      │  GET  /api/odds/snapshot/{id}     │
                      │  GET  /api/scores/stat-validation │
                      │  GET  /api/odds/stream (SSE)      │
                      │  GET  /api/scores/stream (SSE)    │
                      └─────────────┬────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────┐
│  RELAYER (Node/TS crank — no DB, no REST API)              │
│                                                             │
│  txline-auth.ts ──► txodds-client SDK ──► JWT + API token  │
│                                                             │
│  SSE scores stream ──► fixture-watcher (StatusId 1-19)     │
│       │                                                     │
│       ▼                                                     │
│  market-trigger.ts (rules engine)                           │
│    • Event-triggered: goal→NextGoalSide, corner→NextCorner  │
│    • Cron: every 5min→GoalInWindow                          │
│    • Shootout mode: PE status→sequential rounds             │
│    • Timeouts: deadline→settle(NO)                          │
│       │                                                     │
│       ├──► proof-gatherer (GET /stat-validation)            │
│       │       │                                             │
│       │       ▼                                             │
│       │   crank.ts (build tx → sign → send to devnet)     │
│       │       │                                             │
│       └──► ws-server.ts (WebSocket → frontend)             │
└──────────┬────────────────────────────────────────────────┘
           │ CPI validate_stat               │ WebSocket
           ▼                                 ▼
┌──────────────────────┐       ┌──────────────────────┐
│ Solana Devnet        │       │ Frontend (Next.js)    │
│                      │       │                       │
│ kicktick program     │       │ Header (wallet)       │
│   init_config        │       │ MarketCard (bet UI)   │
│   init_match         │       │ CreateMarketModal     │
│   open_round         │       │ LiveOddsFeed (demo)   │
│   place_bet          │       │                       │
│   settle_round       │       │ Wallet: Phantom/Solflare│
│   settle_offchain_round│     │                       │
│   confirm_round      │       │ Currently: demo data  │
│   claim_winnings     │       │ No on-chain integration│
│   cancel_round       │       │ yet                   │
│   challenge_equivocation│   │                       │
│ txoracle program     │       │ No on-chain integration│
│   validate_stat (CPI)│       │ yet                   │
└──────────────────────┘       └──────────────────────┘
```

---

## Component Responsibilities

### Anchor Program (trustless, on-chain)
- Match/Round lifecycle (Open → Locked → Settled/Cancelled/Voided)
- Native SOL custody in MatchVault (system-owned PDA per match)
- Position tracking per user per round
- Settlement via CPI txoracle::validate_stat or off-chain relayer
- Instructions: init_config, init_match, open_round, place_bet, settle_round, settle_offchain_round, confirm_round, claim_winnings, cancel_round, challenge_equivocation, fund_sponsor, sponsor_round
- **Current:** Phase 1 — modular, native SOL, Match/Round/Position/SponsorVault

### Relayer (off-chain crank, trusted for MVP)
- No database, no user sessions, no REST API
- SSE consumer: parses live match actions (goal, corner, card, VAR)
- Market trigger rules: opens/closes rounds based on match events
- Proof gatherer: fetches Merkle proofs from TxLINE REST
- Crank: builds and sends Solana transactions
- WebSocket: pushes round statuses to frontend

### Frontend (Next.js, currently demo-only)
- Wallet connection (Phantom, Solflare)
- Market browsing with bet interface
- Live odds visualization (demo data)
- Market creation modal
