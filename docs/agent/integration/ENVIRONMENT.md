---
id: integration-environment
type: reference
title: "Environment & Network Configuration"
service: integration
depends_on: []
related_to:
  - program-constants
  - integration-dependencies
tags: [environment, network, program-IDs, endpoints]
---

# Environment & Network Configuration

## Program IDs

| Component | Devnet | Mainnet |
|-----------|--------|---------|
| **KickTick** | `CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc` | TBD |
| **TxOracle** | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` |

Defined in: `kicktick/programs/kicktick/src/constants.rs:4`

## Token Mints

| Token | Devnet Address | Program | Decimals |
|-------|---------------|---------|----------|
| **TxL** | `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` | Token-2022 | 9 |
| **USDT** | `ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh` | Token | 6 |

## Network Endpoints

| Service | URL |
|---------|-----|
| Solana Devnet RPC | `https://api.devnet.solana.com` |
| TxLINE Devnet API | `https://txline-dev.txodds.com` |
| TxLINE Mainnet API | `https://txline.txodds.com` |

## Environment Variables

| Variable | Default | Used In |
|----------|---------|--------|
| `TXLINE_JWT` | — | relayer |
| `TXLINE_API_TOKEN` | — | relayer |
| `TXLINE_API_HOST` | `https://txline-dev.txodds.com` | relayer |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | relayer |
| `SOLANA_KEYPAIR_PATH` | `~/.config/solana/id.json` | relayer |
| `KICKTICK_PROGRAM_ID` | `CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc` | relayer |
| `TXORACLE_PROGRAM_ID` | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` | relayer |
| `WS_PORT` | `8080` | relayer |

## Config Values (On-Chain)

| Parameter | Value | Source |
|-----------|-------|--------|
| Min market duration | **15 seconds** | `constants.rs:17` |
| Max market duration | **300 seconds** (5 min) | `constants.rs:18` |
| Finality delay | **60 seconds** | `constants.rs:22` |
| Default lock seconds | **15 seconds** | `constants.rs:20` |
| Default deadline seconds | **120 seconds** | `constants.rs:21` |
| Min round liquidity | **0.01 SOL** (10M lamports) | `constants.rs:25` |
| CPI compute units | **1,400,000** | `constants.rs:28` |

## Related Docs

- `program/ARCHITECTURE.md` — PDA seeds and account model
- `operations/TROUBLESHOOTING.md` — error codes
- `program/BUILD.md` — deploy instructions
