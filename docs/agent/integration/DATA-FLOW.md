---
id: integration-data-flow
type: architecture
title: "End-to-End Data Flow"
service: integration
depends_on:
  - overview-architecture
related_to:
  - program-instructions
  - relayer-readme
tags: [data-flow, SSE, CPI, WebSocket]
---

# End-to-End Data Flow

## System Diagram

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

## Data Flow Steps

1. **Auth:** Relayer authenticates with TxLINE API → JWT + API token
2. **SSE Subscribe:** Relayer connects to SSE streams (scores + odds)
3. **Event Parse:** SSE events trigger market rules (goal → NextGoalSide, corner → NextCorner)
4. **Proof Fetch:** Relayer fetches Merkle proof from `/api/scores/stat-validation`
5. **Crank:** Relayer builds Solana transaction, signs with keypair, sends to devnet
6. **CPI:** `settle_round` instruction calls `txoracle::validate_stat` with proof accounts
7. **WebSocket:** Relayer pushes round status updates to frontend
8. **Frontend:** User sees live market state, places bets via wallet

## SSE Event Types (TxLINE Soccer Feed)

Key actions that drive market triggers:

| Event | Market Action |
|-------|---------------|
| `goal` | Close NextGoalSide, open new one |
| `corner` | Close NextCorner, open new one |
| `yellow_card` | Close NextYellowCard, open new one |
| `red_card` | Settle RedCardInMatch (YES) |
| `penalty` | Open PenaltyShot |
| `penalty_outcome` {Scored/Missed/Retake} | Settle or extend |
| `var` / `var_end` | Open/settle VARCheck |
| `status` {StatusId} | Phase transitions (HT, ET, PE, F) |
| `possible` | Pre-market triggers (future use) |

## Match Phases

```
NS(1) → H1(2) → HT(3) → H2(4) → F(5) → WET(6) → ET(7-10) → WPE(11) → PE(12) → FPE(13)
```

- **NS:** Not Started
- **H1:** First Half
- **HT:** Half Time
- **H2:** Second Half
- **F:** Full Time
- **WET:** Wait Extra Time
- **ET:** Extra Time
- **WPE:** Wait Penalty Shootout
- **PE:** Penalty Shootout
- **FPE:** Final (after penalties)

## Related Docs

- `program/README.md` — Anchor program instructions
- `relayer/README.md` — relayer overview
- `relayer/ARCHITECTURE.md` — full module architecture
- `relayer/STREAMS.md` — SSE streams and auth
- `relayer/TRIGGERS.md` — market trigger rules
- `relayer/SETTLEMENT.md` — proof gathering and crank
- `integration/ENVIRONMENT.md` — network endpoints
