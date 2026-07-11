---
id: program-constants
type: reference
title: "Constants & Configuration"
service: program
depends_on: []
related_to:
  - program-instructions
  - program-architecture
  - integration-environment
tags: [constants, seeds, enums, errors, StatKey]
---

# KickTick — Constants & Seeds (Phase 1)

> Single source of truth for addresses, seeds, config values. Read before any on-chain interaction.

---

## Program IDs

| Component | Devnet | Mainnet |
|-----------|--------|---------|
| **KickTick (devnet)** | `a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2` | declare_id |
| **KickTick (localnet)** | `CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc` | Anchor.toml |
| **TxOracle** | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` |

Defined in: `kicktick/programs/kicktick/src/constants.rs:4`

---

## PDA Seeds

| Account | Seeds | Notes |
|---------|-------|-------|
| `Config` | `["config"]` | One per program |
| `Match_` | `["match", fixture_id (i64 LE)]` | One per fixture |
| `MatchVault` | `["match_vault", match_pubkey]` | System-owned account, zero data |
| `Round` | `["round", match_pubkey, round_id (u64 LE)]` | One round per match id |
| `Position` | `["position", fixture_id (i64 LE), round_id (u64 LE), owner]` | One per bettor per round |
| `SponsorVault` | `["sponsor_vault"]` | Global sponsor liquidity pool |

Derivation paths: `init_match.rs:58`, `open_round.rs:23`, `place_bet.rs:34`, `fund_sponsor.rs:24`

---

## Enums

### `MarketType`
```rust
// On-chain (CPI validate_stat)
NextGoalSide, GoalInWindow, NextCorner, CornerInWindow,
NextYellowCard, YellowCardInWindow, RedCardInMatch, PenaltyShootoutShot

// Off-chain (relayer sets outcome)
PenaltyShot, VARCheck
```
Defined in: `state/round.rs:6-19`

### `RoundStatus`
```rust
Open, Locked, ResolvedPending, Settled, Voided, Cancelled
```
Defined in: `state/round.rs:63-70`

### `RoundOutcome`
```rust
None, Yes, No, NoGoal, Home, Away, Cancelled
```
Defined in: `state/round.rs:82-89`

---

## Config Values

| Parameter | Value | Source |
|-----------|-------|--------|
| Min market duration | **15 seconds** | `constants.rs:17` |
| Max market duration | **300 seconds** (5 min) | `constants.rs:18` |
| Finality delay | **60 seconds** | `constants.rs:22` |
| Default lock seconds | **15 seconds** | `constants.rs:20` |
| Default deadline seconds | **120 seconds** | `constants.rs:21` |
| Min round liquidity | **0.01 SOL** (10M lamports) | `constants.rs:25` |
| CPI compute units | **1,400,000** | `constants.rs:28` |

---

## StatKey Map (TxLINE Soccer Feed v1.0)

| Key | Stat | Period modifier |
|-----|------|----------------|
| 1 | P1 Total Goals | +1000 = H1 (+2000 = H2) |
| 2 | P2 Total Goals | +1000 = H1 (+2000 = H2) |
| 3 | P1 Total Yellow Cards | +1000 = H1 |
| 4 | P2 Total Yellow Cards | +1000 = H1 |
| 5 | P1 Total Red Cards | +1000 = H1 |
| 6 | P2 Total Red Cards | +1000 = H1 |
| 7 | P1 Total Corners | +1000 = H1 |
| 8 | P2 Total Corners | +1000 = H1 |
| 5001 | P1 Penalty Shootout Goals | PE period |
| 5002 | P2 Penalty Shootout Goals | PE period |

Defined in: `constants.rs:31-46`

---

## TxOracle selected PDAs (for CPI)

| Account | Seeds | Notes |
|---------|-------|-------|
| `daily_odds_merkle_roots` | `["daily_odds_merkle_roots", epochDay (2 bytes LE)]` | Odds data |
| `daily_scores_merkle_roots` | `["daily_scores_merkle_roots"]` | Score data (validate_stat) |
| `pricing_matrix` | `["pricing_matrix"]` | Subscription pricing |
| `token_treasury_pda` | `["token_treasury_pda"]` | Token treasury |

---

## Network Endpoints

| Service | URL |
|---------|-----|
| Solana Devnet RPC | `https://api.devnet.solana.com` |
| TxLINE Devnet API | `https://txline-dev.txodds.com` |
| TxLINE Mainnet API | `https://txline.txodds.com` |
