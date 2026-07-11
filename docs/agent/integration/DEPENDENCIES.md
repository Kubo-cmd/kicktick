---
id: integration-dependencies
type: reference
title: "Module Dependencies & Tech Stack"
service: integration
depends_on: []
related_to:
  - overview-architecture
  - integration-environment
tags: [dependencies, tech-stack, versions]
---

# KickTick — Module Dependencies & Tech Stack

---

## Tech Stack

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| **Smart Contract** | Rust + Anchor | anchor 1.0.0, rust 1.96.0 | On-chain program |
| **Blockchain** | Solana | sbpf target (devnet) | Runtime |
| **Token** | Native SOL | — | Betting, payouts, sponsor liquidity |
| **Oracle SDK** | `@swingkiddo/txodds-client` | GitHub package | TxLINE API wrapper |
| **Relayer** | Node.js + TypeScript | ES2020 | Off-chain crank |
| **Frontend** | Next.js + React | next 14.2, react 18.2 | UI |
| **Styling** | Tailwind CSS | 3.4.0 | Dark theme |
| **Wallet** | Solana Wallet Adapter | latest | Phantom/Solflare |
| **Solana SDK** | `@solana/web3.js` | 1.91-1.98 | RPC interaction |
| **Anchor TS** | `@anchor-lang/core` | ^1.0.0 | Program client |

---

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────┐
│                     kicktick/ (Anchor)                   │
│                                                          │
│  programs/kicktick/src/lib.rs                            │
│    ├── anchor-lang (program, context, accounts)          │
│    ├── borsh (serialization)                             │
│    └── txoracle (via CPI — Phase 1)                      │
│                                                          │
│  tests/kicktick.ts                                       │
│    └── @coral-xyz/anchor (provider, program, assert)     │
│                                                          │
│  client/ — TypeScript SDK removed (only node_modules/)   │
└──────────┬──────────────────────────────────────────────┘
           │ depends on (for CPI settlement address)
           ▼
┌─────────────────────────────────────────────────────────┐
│                    relayer/ (Node/TS)                    │
│                                                          │
│  src/config.ts                                           │
│    └── dotenv (env loading)                              │
│                                                          │
│  src/txline-auth.ts                                      │
│    └── @swingkiddo/txodds-client (SDK)                   │
│                                                          │
│  src/cpi-spike.ts                                        │
│    ├── @swingkiddo/txodds-client (StatValidationResult)  │
│    ├── @solana/web3.js (Connection, PublicKey)           │
│    └── ./config                                          │
│                                                          │
│  src/verify-tokens.ts                                    │
│    ├── @solana/web3.js (Connection, PublicKey)           │
│    └── @solana/spl-token (getMint, TOKEN_PROGRAM_ID)     │
│                                                          │
│  src/index.ts (placeholder)                              │
│    └── ./config                                          │
└──────────┬──────────────────────────────────────────────┘
           │ WebSocket (planned)
           ▼
┌─────────────────────────────────────────────────────────┐
│                  frontend/ (Next.js)                     │
│                                                          │
│  lib/WalletContext.tsx                                   │
│    └── @solana/wallet-adapter-react (WalletProvider)     │
│                                                          │
│  lib/constants.ts (no deps — pure config)                │
│                                                          │
│  components/ (demo-only — no on-chain deps yet)          │
│    ├── react (useState, useEffect)                       │
│    └── tailwind (styling)                                │
└─────────────────────────────────────────────────────────┘

External:
┌─────────────────────────────────────────────────────────┐
│  TxLINE API (txline-dev.txodds.com)                     │
│    ├── REST: /auth, /api/odds, /api/scores, /fixtures   │
│    └── SSE: /api/odds/stream, /api/scores/stream        │
│                                                          │
│  Solana Devnet (api.devnet.solana.com)                   │
│    └── Programs: txoracle (6pW64...), kicktick (CCmcp..)│
└─────────────────────────────────────────────────────────┘
```

---

## File Dependency Table

| File | Imports From | Depended By |
|------|-------------|-------------|
| `programs/kicktick/src/lib.rs` | anchor-lang, borsh | — (deployed to Solana) |
| `relayer/src/config.ts` | dotenv, web3.js | `cpi-spike.ts`, `index.ts`, `txline-auth.ts` |
| `relayer/src/txline-auth.ts` | @swingkiddo/txodds-client | futher relayer modules |
| `relayer/src/cpi-spike.ts` | txodds-client, web3.js, config | — (standalone test) |
| `relayer/src/verify-tokens.ts` | web3.js, spl-token | — (standalone script) |
| `relayer/src/index.ts` | config | — (main entry point) |
| `frontend/lib/constants.ts` | — | all frontend components |
| `frontend/lib/WalletContext.tsx` | wallet-adapter | `layout.tsx` |
| `frontend/app/page.tsx` | components, lib | — (page) |

---

## Version Conflicts to Watch

| Package | Relayer (relayer/) | Frontend (frontend/) | Notes |
|---------|--------------------|----------------------|-------|
| `@solana/web3.js` | `^1.98` | `^1.98` | Aligned |
| `@swingkiddo/txodds-client` | GitHub pkg | — | Only in relayer |

---

## Package Files

| Dir | `package.json` location |
|-----|------------------------|
| Anchor workspace | `kicktick/Cargo.toml` (Rust deps) |
| Relayer | `relayer/package.json` |
| Frontend | `frontend/package.json` |
| Scripts | `scripts/package.json` |

---

## Environment Variables (.env)

| Variable | Default | Used In |
|----------|---------|--------|
| `TXLINE_JWT` | — | relayer |
| `TXLINE_API_TOKEN` | — | relayer |
| `TXLINE_API_HOST` | `https://txline-dev.txodds.com` | relayer |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | relayer |
| `SOLANA_KEYPAIR_PATH` | `~/.config/solana/id.json` | relayer |
| `KICKTICK_PROGRAM_ID` | `a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2` | relayer (devnet) |
| `TXORACLE_PROGRAM_ID` | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` | relayer |
| `WS_PORT` | `8080` | relayer |
