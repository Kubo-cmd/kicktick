---
id: frontend-readme
type: overview
title: "Frontend Overview"
service: frontend
depends_on:
  - overview-architecture
related_to: []
tags: [frontend, overview, UI]
status: stub
---

# Frontend Overview

## Purpose

Next.js + React + Tailwind CSS application for KickTick prediction markets.

Features:
- Wallet connection (Phantom, Solflare)
- Market browsing with bet interface
- Live odds visualization
- Market creation modal

## Current State

**Demo data only.** No on-chain integration yet.

Components use hardcoded demo markets in `app/page.tsx`. Wallet adapter is wired but not connected to program calls.

## Component List

| File | Lines | Purpose |
|------|-------|---------|
| `app/layout.tsx` | 24 | Root layout with WalletContextProvider |
| `app/page.tsx` | 131 | Landing page with 4 demo markets |
| `app/globals.css` | — | Global styles |
| `components/Header.tsx` | 43 | Nav + wallet multi-button |
| `components/MarketCard.tsx` | 112 | Market card with YES/NO pool bar |
| `components/CreateMarketModal.tsx` | 136 | 2-step market creation modal |
| `components/LiveOddsFeed.tsx` | 90 | Simulated real-time odds feed |
| `lib/constants.ts` | 30 | Program IDs, network config |
| `lib/WalletContext.tsx` | 36 | Solana wallet adapter provider |

## Tech Stack

- **Framework:** Next.js 14.2
- **UI:** React 18.2
- **Styling:** Tailwind CSS 3.4.0 (dark theme)
- **Wallet:** Solana Wallet Adapter (Phantom, Solflare)
- **Solana SDK:** `@solana/web3.js`

## On-Chain Integration Path

To connect frontend to on-chain program:

1. **Replace demo data** — fetch Match/Round PDAs via `Connection` to devnet
2. **Wallet integration** — use `WalletContext` for transaction signing
3. **Program calls** — replace hardcoded actions with Anchor program calls:
   - `place_bet` — bet on market
   - `claim_winnings` — claim after settlement
4. **WebSocket listener** — connect to relayer `ws-server.ts` for live round status updates
5. **Account subscriptions** — subscribe to Round PDA changes for real-time state

## Running

```bash
cd frontend
npm run dev
```

Dev server runs on `http://localhost:3000`.

## Key Files

- `lib/constants.ts` — program IDs, RPC URL (update after deploy)
- `lib/WalletContext.tsx` — wallet adapter setup
- `components/MarketCard.tsx` — bet UI (needs on-chain integration)

## Related Docs

- `program/README.md` — Anchor program instructions
- `integration/ENVIRONMENT.md` — program IDs, network config
- `overview/PROJECT.md` — project overview
