# Architecture — KickTick

Sub-minute micro prediction markets with TxODDS oracle settlement on Solana. Built for the Superteam World Cup Hackathon (TxODDS track) with SPIKES compressed NFT moments.

## Components

- **kicktick/** — Anchor workspace (Solana on-chain program `kicktick`)
  - `programs/kicktick/src/lib.rs` — market create / bet / settle / claim / cancel instructions
  - `client/` — TypeScript SDK (`KickTickManager`, `TxOddsClient`)
  - `tests/kicktick.ts` — Anchor integration tests
- **frontend/** — Next.js dashboard (SPIKES metrics, live odds feed, market cards)
- **scripts/simulation.js** — pure-JS logic simulation (22/22 passing, no chain needed)
- **docs/** — this file

## Flow

1. A World Cup fixture opens a micro market (15s–5min window).
2. Bettors trade YES/NO on odds-spike / next-goal outcomes; vault holds USDT.
3. TxODDS oracle streams live odds; market settles on window close + Merkle proof.
4. Winners claim proportional payout; key moments minted as SPIKES cNFTs.

## Local dev

```
anchor build          # build program
anchor test           # run program tests
cd frontend && npm run dev
node scripts/simulation.js
```
