---
id: program-architecture
type: architecture
title: "On-Chain Account Model"
service: program
depends_on:
  - program-readme
related_to:
  - program-instructions
  - program-constants
tags: [architecture, PDA, state, seeds]
---

# On-Chain Account Model

## Config PDA

**Seeds:** `["config"]`

```
Config PDA
├── admin: Pubkey
├── txoracle_program_id: Pubkey
├── daily_scores_merkle_roots: Pubkey
├── finality_delay: i64
├── min_liquidity: u64
└── bump: u8
```

One per program. Initialized via `init_config`. Stores admin key, oracle program reference, and global settings.

---

## Match_ PDA

**Seeds:** `["match", fixture_id (i64 LE)]`

```
Match_ PDA
├── fixture_id: i64
├── status: MatchStatus (Pending/Live/Finished/Cancelled)
├── home_team: String
├── away_team: String
├── competition_id: i32
├── vault_bump: u8
├── round_counter: u64
├── total_deposited: u64
├── total_sponsored: u64
└── created_at: i64
```

One per fixture. Tracks match lifecycle and aggregate totals.

---

## Round PDA

**Seeds:** `["round", match_pubkey, round_id (u64 LE)]`

```
Round PDA
├── match_pda: Pubkey
├── round_id: u64
├── market_type: MarketType
├── params: RoundParams (lock_seconds, deadline_seconds)
├── settlement_model: OnChain/OffChain
├── status: RoundStatus (Open/Locked/ResolvedPending/Settled/Voided/Cancelled)
├── outcome: RoundOutcome
├── total_yes: u64
├── total_no: u64
├── total_abstain: u64
├── expires_at: i64
├── settle_at: i64
├── winner: Option<u8> (1=YES, 2=NO, 3=abstain, 0=void)
└── claimed: bool
```

One per market round per match. Core state machine for betting lifecycle.

---

## Position PDA

**Seeds:** `["position", fixture_id (i64 LE), round_id (u64 LE), owner]`

```
Position PDA
├── owner: Pubkey
├── fixture_id: i64
├── round_id: u64
├── side: u8 (0=YES, 1=NO, 2=abstain)
├── amount: u64
└── claimed: bool
```

One per bettor per round. Tracks individual bet and claim status.

---

## SponsorVault PDA

**Seeds:** `["sponsor_vault"]`

```
SponsorVault PDA
├── total_balance: u64
├── allocated: u64
└── bump: u8
```

Global sponsor liquidity pool. One per program.

---

## MatchVault

**Seeds:** `["match_vault", match_pubkey]`
**Type:** System-owned account (no data)

Holds lamports for match betting pool. No structured data — pure SOL custody.

---

## Account Summary Table

| PDA | Seeds | Type | Purpose |
|---------|-------|------|---------|
| Config | `["config"]` | Anchor | Admin, oracle program id, settings |
| Match_ | `["match", fixture_id]` | Anchor | Match lifecycle, vault_bump |
| Round | `["round", match_pubkey, round_id]` | Anchor | Market round state |
| Position | `["position", fixture_id, round_id, owner]` | Anchor | User position per round |
| SponsorVault | `["sponsor_vault"]` | Anchor | Global sponsor liquidity |
| MatchVault | `["match_vault", match_pubkey]` | System (no data) | SOL pool, holds lamports |
