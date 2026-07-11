---
id: relayer-build
type: howto
title: "Build, Run & Scripts"
service: relayer
depends_on:
  - relayer-readme
related_to:
  - relayer-streams
  - integration-environment
tags: [build, run, scripts, dev]
---

# Build, Run & Scripts

## Quick Start

```bash
cd relayer

# Install
npm install

# Build (TypeScript compile)
npm run build

# Dev mode (ts-node)
npm run dev

# Production
npm run start
```

### Prerequisites

- Node.js 20+
- Solana CLI keypair at `~/.config/solana/id.json` (or `SOLANA_KEYPAIR_PATH`)
- TxLINE JWT + API token (see `STREAMS.md`)

---

## Environment

Copy `.env.example` → `.env`:

```bash
TXLINE_JWT=<jwt_from_auth>
TXLINE_API_TOKEN=<token_from_activation>
TXLINE_API_HOST=https://txline-dev.txodds.com
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_KEYPAIR_PATH=~/.config/solana/id.json
KICKTICK_PROGRAM_ID=CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc
TXORACLE_PROGRAM_ID=6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J
USDT_MINT=ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh
TXL_MINT=4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG
WS_PORT=8080
```

---

## Scripts

### CPI Spike Test

```bash
npx ts-node src/scripts/cpi-spike.ts
```

Validates `validate_stat` CPI feasibility:
1. Guest auth with TxLINE
2. Fetch World Cup fixtures
3. Fetch scores updates + stat validation proof
4. Inspect proof structure (statProof, fixtureProof, mainTreeProof)
5. Derive PDAs (`daily_scores_roots`)
6. Verify program existence on devnet

### Token Verification

```bash
npx ts-node src/scripts/verify-tokens.ts
```

Checks TxL (Token-2022) and USDT (Token) mint existence on devnet.

---

## Project Scripts (package.json)

| Command | Description |
|---------|-------------|
| `npm run dev` | `ts-node src/index.ts` — run with hot reload |
| `npm run build` | `tsc` — compile to `dist/` |
| `npm run start` | `node dist/index.js` — run compiled |

---

## Output Structure

```
dist/
├── config.js
├── index.js
├── clients/       txline-auth, txline-client, anchor-client
├── market/        event-parser, fixture-watcher, triggers
├── settlement/    proof-gatherer, crank
├── api/           ws-server
└── scripts/       cpi-spike, verify-tokens
```

---

## Debug

### Logs

Relayer outputs structured console logs:

```
╔══════════════════════════════════════════╗
║       KickTick Relayer v0.1.0            ║
╚══════════════════════════════════════════╝
  Solana RPC:      https://api.devnet.solana.com
  Keypair:         ~/.config/solana/id.json
  KickTick PID:    CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc
  WS Port:         8080
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `No TxLINE credentials` | Missing JWT/token | Set `TXLINE_JWT` + `TXLINE_API_TOKEN` |
| `StatValidation returned null` | Proof not available | Verify fixtureId + seq are correct |
| `Transaction failed` | CU budget, nonce, or account | Check logs, increase CU limit |
| `Heartbeat timeout` | SSE stream disconnected | Check network, auto-reconnect handles this |
| IDL not found | `kicktick.json` missing | Build anchor program first (`anchor build`) |

### IDL Path

The relayer loads the Anchor IDL from `kicktick/target/idl/kicktick.json` (relative from `dist/clients/anchor-client.js`). Ensure the program is built before running the relayer.