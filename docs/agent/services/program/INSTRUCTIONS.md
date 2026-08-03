---
id: program-instructions
type: reference
title: "On-Chain Instructions"
service: program
depends_on:
  - program-architecture
  - program-constants
related_to:
  - program-build
  - integration-data-flow
tags: [instructions, CPI, settlement, accounts]
---

# KickTick — On-Chain Instructions (Phase 1)

> 10 instructions across `kicktick/programs/kicktick/src/instructions/`. Pure SOL, no SPL tokens. Anchor program on devnet.

---

## 1. `init_config`

**Purpose:** Bootstrap global Config PDA (one-time admin setup).

**Rust signature:** `pub fn init_config(ctx: Context<InitConfig>) -> Result<()>`

**Accounts** (`InitConfig`):
| Account | Signer? | Mut? | Details |
|---------|---------|------|---------|
| `admin` | ✅ | ✅ | Future KickTick admin |
| `config` | — | ✅ | `Config` PDA — seeds: `["config"]` |

**State changes:**
- `config.admin = admin.key()`
- `config.txoracle_program_id = TXORACLE_PROGRAM_ID`
- `config.daily_scores_merkle_roots = ...`
- `config.finality_delay = 60`
- `config.min_liquidity = 0.01 SOL`
- `config.bump`

---

## 2. `init_match`

**Purpose:** Create match + vault PDA for a fixture.

**Rust signature:** `pub fn init_match(ctx: Context<InitMatch>, fixture_id: i64, home_team: String, away_team: String) -> Result<()>`

**Accounts** (`InitMatch`):
| Account | Signer? | Mut? | Details |
|---------|---------|------|---------|
| `creator` | ✅ | ✅ | Admin signer |
| `config` | — | ✅ | Config PDA (authorizes admin) |
| `match_pda` | — | ✅ | `Match_` PDA — seeds: `["match", fixture_id LE]` |
| `match_vault` | — | ✅ | System-owned PDA — seeds: `["match_vault", match_pda]` |
| `system_program` | — | — | For vault account creation |

**Validation:**
- `config.admin == creator`
- `fixture_id > 0`
- `home_team.len() <= 64`, `away_team.len() <= 64`

**State changes:**
- Match status = Pending, round_counter = 0, total_deposited = 0
- Creates vault system account via CPI if lamports == 0
- Stores `vault_bump`, `vault_authority_bump`

---

## 3. `open_round`

**Purpose:** Open a new market/round on a match.

**Rust signature:** `pub fn open_round(ctx: Context<OpenRound>, round_id: u64, market_type: MarketType, lock_seconds: i64, deadline_seconds: i64) -> Result<()>`

**Accounts** (`OpenRound`):
| Account | Signer? | Mut? | Details |
|---------|---------|------|---------|
| `authority` | ✅ | — | Match authority |
| `config` | — | — | Config PDA; authority must equal `config.admin` |
| `match_pda` | — | ✅ | Match PDA |
| `round` | — | ✅ | `Round` PDA — seeds: `["round", match_pda, round_id LE]` |

**Validation:**
- Only `PenaltyShot` and `VARCheck` may open while the on-chain oracle settlement
  path is disabled.
- `15 <= lock_seconds <= MAX_MARKET_DURATION`
- `lock_seconds <= deadline_seconds <= MAX_MARKET_DURATION`

**State changes:**
- `round.status = Open`
- `round.expires_at = now + deadline_seconds`
- `round.settlement_model = OffChain`
- `match_pda.round_counter++`

---

## 4. `place_bet`

**Purpose:** Bet SOL on a round side (YES/NO/ABSTAIN).

**Rust signature:** `pub fn place_bet(ctx: Context<PlaceBet>, fixture_id: i64, round_id: u64, side: u8, amount: u64) -> Result<()>`

**Accounts** (`PlaceBet`):
| Account | Signer? | Mut? | Details |
|---------|---------|------|---------|
| `bettor` | ✅ | ✅ | User placing bet |
| `match_pda` | — | ✅ | Match PDA |
| `match_vault` | — | ✅ | System-owned vault PDA |
| `round` | — | ✅ | Round PDA |
| `position` | — | ✅ | `Position` PDA — seeds: `["position", fixture_id, round_id, bettor]` |
| `system_program` | — | — | SOL transfer |

**Validation:**
- `amount > 0`
- `round.status == Open`
- `now < round.expires_at`
- `now < opened_at + lock_seconds`
- `side <= 2` (0=YES, 1=NO, 2=ABSTAIN)
- A funded position may only add stake to its existing side
- New positions carry the current account-layout version in the trailing byte.
  The byte remains after `claimed`, matching deployed 67-byte accounts whose
  trailing byte stored the PDA bump. Funded legacy positions cannot accept new
  bets and are refund-only after their round is cancelled or voided.

**CPI call:** `system_program::transfer(bettor -> match_vault)`

**State changes:**
- `match_pda.total_deposited += amount`
- `round.total_yes/no/abstain` += amount per side
- `position.amount += amount`, `position.side = side`, `position.claimed = false`

---

## 5. `settle_round` (on-chain)

**Purpose:** Reserved on-chain TxOracle settlement path. It currently returns
`OracleValidationFailed` without changing state because the exact TxOracle IDL and
Merkle-proof account layout are not present. This is intentionally fail-closed.

**Rust signature:** `pub fn settle_round(ctx: Context<SettleRound>) -> Result<()>`

**Accounts** (`SettleRound`): match_pda, round, txoracle_program, proof accounts, match_vault (for rent exemption).

**State changes:** None until verified CPI integration is implemented.

---

## 6. `settle_offchain_round`

**Purpose:** Relayer sets outcome directly for off-chain markets (PenaltyShot, VARCheck).

**Rust signature:** `pub fn settle_offchain_round(ctx: Context<SettleOffchainRound>, outcome: RoundOutcome, winner: u8) -> Result<()>`

**Accounts** (`SettleOffchainRound`): caller (must equal `config.admin`), config,
match_pda, round.

**Validation:** The outcome and winner code must agree (`Yes`/`Home` = 1,
`No`/`Away` = 2, `NoGoal` = 3, `Cancelled` = 0). Off-chain market types
accept only `Yes`, `No`, or `Cancelled`. Settlement is rejected until the
configured betting lock time has elapsed. A non-cancelled outcome is also
rejected when its selected winning side has no stake, preventing an
unclaimable settled pool.

**State changes:**
- Sets `round.outcome`, `round.winner`, `round.status = ResolvedPending`

---

## 7. `confirm_round`

**Purpose:** Finalize settlement after `FINALITY_DELAY_SECONDS` (60s).

**Rust signature:** `pub fn confirm_round(ctx: Context<ConfirmRound>) -> Result<()>`

**Validation:**
- `round.status == ResolvedPending`
- `now >= round.settle_at + FINALITY_DELAY_SECONDS`

**State changes:**
- `round.status = Settled`, `round.claimed = true`

---

## 8. `claim_winnings` / `refund_bet`

**Purpose:** Claim pro-rata payout for winning position, or refund if round cancelled/voided.

**Rust signature:** `pub fn claim_winnings(ctx: Context<ClaimWinnings>, fixture_id: i64, round_id: u64) -> Result<()>`

**Accounts** (`ClaimWinnings`):
| Account | Signer? | Mut? | Details |
|---------|---------|------|---------|
| `winner` | ✅ | ✅ | Winner / bettor |
| `match_pda` | — | ✅ | Match PDA |
| `round` | — | ✅ | Round PDA |
| `position` | — | ✅ | Must be `position.owner == winner` |
| `match_vault` | — | ✅ | Vault PDA (payer) |
| `system_program` | — | — | SOL transfer |

**Payout formula (winners):**
```
total_pool = total_yes + total_no + total_abstain
winning_pool = total_yes if winner==1 else total_no if winner==2 else total_abstain
payout = (position.amount * total_pool) / winning_pool
```

- If `round.winner == Some(0)` or `round.outcome == Cancelled`: full `position.amount` refunded.
- Proportional winner payouts require the current position version. Legacy
  positions remain deserializable but are ineligible for winner accounting
  because the pre-upgrade producer could aggregate multiple sides. Their safe
  migration path is cancellation/void followed by a principal-only refund.

**CPI call:** `system_program::transfer(match_vault -> winner)` with PDA signer `["match_vault", match_key, vault_bump]`

**State changes:** `position.claimed = true`

---

## 9. `cancel_round`

**Purpose:** Void an open or locked round. The admin may cancel immediately;
after `expires_at`, any signer may cancel permissionlessly so refunds cannot be
blocked forever by an unavailable authority.

**Rust signature:** `pub fn cancel_round(ctx: Context<CancelRound>) -> Result<()>`

**State changes:**
- `round.status = Cancelled`, `round.outcome = Cancelled`

---

## 10. `challenge_equivocation`

**Purpose:** Challenge a prior settlement if equivocation detected.

**Rust signature:** `pub fn challenge_equivocation(ctx: Context<ChallengeEquivocation>) -> Result<()>`

**State changes:**
- `round.status = Voided`, `round.winner = Some(0)`

---

## Sponsor Instructions

### `fund_sponsor`
**Purpose:** Reserved sponsor-deposit path. It currently fails closed with
`SponsorFlowDisabled` so a multi-donor pool cannot accept unrecoverable SOL.

**Rust signature:** `pub fn fund_sponsor(ctx: Context<FundSponsor>, amount: u64) -> Result<()>`

### `sponsor_round`
**Purpose:** Reserved sponsor-allocation path; currently fails closed.

**Rust signature:** `pub fn sponsor_round(ctx: Context<SponsorRound>, amount: u64) -> Result<()>`

- No state or SOL changes occur until contribution accounting and recovery semantics
  are implemented.

---

## Summary

| Instruction | Authority | SOL Transfer | PDA Created |
|-------------|-----------|--------------|-------------|
| `init_config` | Program upgrade authority | — | Config |
| `init_match` | Admin | — | Match_, match_vault (system) |
| `open_round` | Config admin | — | Round |
| `place_bet` | Bettor | bettor → match_vault | Position (init_if_needed) |
| `settle_round` | Disabled pending verified CPI | — | — |
| `settle_offchain_round` | Config admin | — | — |
| `confirm_round` | Anyone | — | — |
| `claim_winnings` | Winner | match_vault → winner | — |
| `cancel_round` | Config admin | — | — |
| `challenge_equivocation` | Config admin | — | — |
| `fund_sponsor` | Disabled | — | — |
| `sponsor_round` | Disabled | — | — |
