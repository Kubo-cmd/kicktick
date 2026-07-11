---
id: overview-project
type: overview
title: "Project Overview"
service: overview
depends_on: []
related_to:
  - overview-architecture
  - overview-roadmap
tags: [project, hackathon, goals]
---

# Project Overview

## Hackathon Context

- **Event:** World Cup Hackathon — Superteam × Solana, powered by TxODDS
- **Track:** Prediction Markets & Settlement ($18k USDT)
- **Deadline:** July 19, 2026
- **Phase 0:** Completed July 3, 2026

## Project DNA

Sub-minute micro prediction markets on Solana. Create + settle markets in <60s using live TxODDS oracle odds + on-chain Merkle proof settlement.

Users bet on real-time soccer events (next goal, next corner, cards, penalties) with native SOL. Markets open and close in seconds, settled via CPI to the txoracle program using Merkle proofs from the TxLINE data feed.

## Three Subsystems

| # | Subsystem | Dir | Language | Purpose |
|---|-----------|-----|----------|---------|
| 1 | **Anchor Program** | `kicktick/programs/kicktick/` | Rust (Anchor 1.0.0) | On-chain PDAs, CPI settlement, bet accounting |
| 2 | **Relayer** | `relayer/` | Node/TS | Off-chain crank: SSE ingestion, market triggers, proof gathering, tx builder |
| 3 | **Frontend** | `frontend/` | Next.js + React + Tailwind | UI with wallet, market cards, live odds |

## Key Characteristics

- **Native SOL** — no SPL tokens for betting
- **CPI settlement** — `settle_round` calls `txoracle::validate_stat` on-chain
- **Off-chain settlement** — `settle_offchain_round` for PenaltyShot, VARCheck (relayer sets outcome)
- **Sub-minute markets** — 15s lock, 60s finality delay, 15-300s duration range
- **Event-driven** — SSE events from TxLINE trigger market creation and settlement

## Current Status

- **Phase 0** (completed): TxLINE auth, CPI spike test, token verification
- **Phase 1** (in progress): Modular Anchor program with Match/Round/Position/SponsorVault PDAs
- **Phase 2** (pending): Relayer SSE parser, fixture watcher, market triggers, proof gatherer, crank, WebSocket
- **Phase 3** (pending): Frontend on-chain integration

## Network

- **Target:** Solana Devnet
- **Program IDs and endpoints:** See `integration/ENVIRONMENT.md`

## Reading Order for Agents

1. `overview/PROJECT.md` (this file)
2. `services/program/README.md` — Anchor program overview
3. `services/relayer/README.md` — Relayer overview
4. `services/frontend/README.md` — Frontend overview
5. `integration/DATA-FLOW.md` — End-to-end data flow
6. `integration/ENVIRONMENT.md` — Network config, program IDs
7. `operations/TROUBLESHOOTING.md` — Error codes, debug commands
