---
id: relayer-readme
type: overview
title: "Relayer Overview"
service: relayer
depends_on:
  - overview-architecture
related_to:
  - relayer-architecture
  - relayer-streams
  - relayer-triggers
  - relayer-settlement
  - relayer-api
  - relayer-build
  - program-readme
  - integration-data-flow
tags: [relayer, overview, crank]
---

# Relayer Overview

## Purpose

Off-chain crank for KickTick. No database, no REST API, no user sessions.

Responsibilities:
- **SSE consumer** — parses live match actions from TxLINE (goal, corner, card, VAR, status)
- **Market trigger rules** — opens/closes rounds based on match events
- **Proof gatherer** — fetches Merkle proofs from TxLINE REST for CPI settlement
- **Crank** — builds and sends Solana transactions to devnet
- **WebSocket** — pushes round statuses to frontend

## Data Flow

```
TxLINE SSE scores stream
  → txline-client (with reconnect)
    → event-parser (raw SSE → typed FootballEvent)
      → fixture-watcher (match state: scores, status, phase)
        → market-trigger (rules engine: event + cron)
          → proof-gatherer (GET /stat-validation)
            → crank (build tx → sign → send to devnet)
              → ws-server (push status to frontend)
```

## Key Concepts

- **Event-driven:** markets open/close in response to live match events
- **Cron windows:** time-window markets fire on interval (GoalInWindow every 5min)
- **No database:** all state in memory + on-chain Solana accounts
- **Auto-reconnect:** exponential backoff on SSE disconnects (1s–30s)

## Module Structure

```
src/
├── config.ts               env config loader
├── index.ts                main loop wiring
├── clients/                external integrations
│   ├── txline-auth.ts      JWT + API token activation
│   ├── txline-client.ts    SSE scores/odds stream
│   └── anchor-client.ts    Solana Anchor tx builder
├── market/                 event processing + rules
│   ├── event-parser.ts     raw SSE → typed FootballEvent
│   ├── fixture-watcher.ts  match state tracking
│   └── triggers.ts         market trigger rules engine
├── settlement/             proof + transactions
│   ├── proof-gatherer.ts   Merkle proof fetcher
│   └── crank.ts            tx builder + retry
├── api/
│   └── ws-server.ts        WebSocket for frontend
└── scripts/                one-off utilities
    ├── cpi-spike.ts        CPI validate_stat feasibility test
    └── verify-tokens.ts    TxL/USDT mint verification
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@swingkiddo/txodds-client` | TxLINE API wrapper (auth, SSE, proof) |
| `@solana/web3.js` | Solana RPC interaction |
| `@anchor-lang/core` | Anchor tx building |
| `ws` | WebSocket server |
| `dotenv` | Environment config |

## Related Docs

| Doc | Content |
|-----|---------|
| `relayer/ARCHITECTURE.md` | Module dependency graph, startup sequence, event pipeline |
| `relayer/STREAMS.md` | SSE connectivity, auth, fixture loading, reconnect |
| `relayer/TRIGGERS.md` | Market trigger rules — event, cron, shootout, timeout |
| `relayer/SETTLEMENT.md` | Proof gathering, crank, retry policy |
| `relayer/API.md` | WebSocket protocol — messages, subscriptions |
| `relayer/BUILD.md` | Build, run, scripts |
| `integration/ENVIRONMENT.md` | Env vars, program IDs, endpoints |
