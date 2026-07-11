---
id: program-readme
type: overview
title: "Anchor Program Overview"
service: program
depends_on: []
related_to:
  - program-architecture
  - program-instructions
  - program-constants
tags: [program, overview, PDA]
---

# Anchor Program Overview

## Purpose

Sub-minute prediction markets on Solana. Trustless settlement via CPI to txoracle program. Users bet native SOL on real-time soccer events with on-chain Merkle proof verification.

## Key Concepts

### Native SOL
No SPL tokens. All bets, payouts, and sponsor liquidity use native SOL (lamports).

### PDA Types (5)
| PDA | Seeds | Purpose |
|-----|-------|---------|
| Config | `["config"]` | Global config, admin, oracle program ID |
| Match_ | `["match", fixture_id]` | Match lifecycle, team names, vault |
| Round | `["round", match_pubkey, round_id]` | Market round state, outcome, settlement |
| Position | `["position", fixture_id, round_id, owner]` | User bet per round |
| SponsorVault | `["sponsor_vault"]` | Global sponsor liquidity pool |

Plus **MatchVault** — system-owned account `["match_vault", match_pubkey]`, holds lamports only.

Full details: `program/ARCHITECTURE.md`

### Instructions (12)

| # | Instruction | Purpose |
|---|-------------|---------|
| 1 | `init_config` | Initialize global Config PDA (one-time) |
| 2 | `init_match` | Create match from TxLINE fixture |
| 3 | `fund_sponsor` | Deposit SOL into SponsorVault |
| 4 | `sponsor_round` | Allocate sponsor liquidity to round |
| 5 | `open_round` | Open betting round with market type + timing |
| 6 | `place_bet` | Place bet (YES/NO/abstain) with native SOL |
| 7 | `settle_round` | Settle via CPI `txoracle::validate_stat` |
| 8 | `settle_offchain_round` | Settle off-chain markets (PenaltyShot, VARCheck) |
| 9 | `confirm_round` | Confirm after finality delay (60s) |
| 10 | `claim_winnings` | Claim pro-rata winnings |
| 11 | `refund_bet` | Refund cancelled/voided round |
| 12 | `cancel_round` | Cancel open round |
| 13 | `challenge_equivocation` | Challenge conflicting settlement |

### Settlement Models

- **On-chain:** `settle_round` → CPI `txoracle::validate_stat` with Merkle proof accounts. Binary/ternary predicates per MarketType.
- **Off-chain:** `settle_offchain_round` → relayer sets outcome for PenaltyShot, VARCheck.
- **Confirm:** `confirm_round` after `FINALITY_DELAY_SECONDS` (60s).
- **Payout:** `claim_winnings` → pro-rata `(position.amount * total_pool) / winning_pool`.
- **Refund:** voided/cancelled rounds return full `position.amount`.

### Market Types

**On-chain (CPI validate_stat):**
- NextGoalSide, GoalInWindow, NextCorner, CornerInWindow
- NextYellowCard, YellowCardInWindow, RedCardInMatch, PenaltyShootoutShot

**Off-chain (relayer sets outcome):**
- PenaltyShot, VARCheck

## File Structure

```
programs/kicktick/src/
├── lib.rs (140 lines) — module router, 12 instructions
├── constants.rs (48 lines) — seeds, limits, StatKeys, CPI discriminator
├── errors.rs (102 lines) — 30 error codes
├── state/ (6 files)
│   ├── mod.rs (11 lines) — re-exports
│   ├── config.rs (15 lines) — Config PDA
│   ├── match_.rs (47 lines) — Match_ PDA
│   ├── round.rs (143 lines) — Round PDA, MarketType, RoundStatus, RoundOutcome
│   ├── position.rs (16 lines) — Position PDA
│   └── vault.rs (12 lines) — SponsorVault PDA
└── instructions/ (11 files)
    ├── mod.rs (22 lines) — re-exports
    ├── init_config.rs (32 lines)
    ├── init_match.rs (104 lines)
    ├── fund_sponsor.rs (107 lines) — fund_sponsor + sponsor_round
    ├── open_round.rs (75 lines)
    ├── place_bet.rs (86 lines)
    ├── settle_round.rs (235 lines) — CPI validate_stat
    ├── settle_offchain_round.rs (46 lines)
    ├── confirm_round.rs (41 lines)
    ├── claim.rs (203 lines) — claim_winnings + refund_bet
    └── cancel_round.rs (87 lines) — cancel_round + challenge_equivocation
```

## Tests

- Test file: `kicktick/tests/kicktick.ts` (255 lines)
- Flow: init_config → init_match → open_round → place_bet → settle_offchain → claim_winnings
- Run: `anchor test --skip-deploy`

## Related Docs

- `program/ARCHITECTURE.md` — full PDA account model
- `program/BUILD.md` — build, test, debug
- `program/DEPLOY.md` — deploy to devnet/mainnet
- `operations/TROUBLESHOOTING.md` — error codes and fixes
