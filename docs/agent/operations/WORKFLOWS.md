---
id: operations-workflows
type: howto
title: "Agent Workflows"
service: operations
depends_on:
  - program-build
related_to:
  - program-instructions
  - operations-troubleshooting
tags: [workflows, deploy, test, debug]
---

# KickTick — Agent Workflows

> Common scenarios an agent will execute during development.

---

## 1. Full Deploy Cycle (Docker → Devnet)

```bash
# 1. Build Docker image
./scripts/build.sh contracts

# 2. Deploy (Docker-based, sets --with-compute-unit-price 10000)
./scripts/deploy.sh

# 3. Update program ID in:
#    - programs/kicktick/src/lib.rs:8
#    - frontend/lib/constants.ts:10
#    - relayer/.env (KICKTICK_PROGRAM_ID)

# 4. Run tests
anchor test --skip-deploy
```

**Key files changed:**
- `lib.rs:8` — `declare_id!("...")`
- `frontend/lib/constants.ts:10` — `kicktickProgramId`
- `relayer/src/config.ts:27` — `KICKTICK_PROGRAM_ID` env

See [program/DEPLOY.md](../services/program/DEPLOY.md) for full details.

---

## 2. Add New Market Type

**Current Phase 1 market types** (in `state/round.rs:6-19`):
```rust
// On-chain (CPI validate_stat)
NextGoalSide, GoalInWindow, NextCorner, CornerInWindow,
NextYellowCard, YellowCardInWindow, RedCardInMatch, PenaltyShootoutShot

// Off-chain (relayer sets outcome)
PenaltyShot, VARCheck
```

**To add a new type:**
1. Add variant to `MarketType` enum in `state/round.rs`
2. Add statKey mapping in `settle_round` handler
3. Add test case in `tests/kicktick.ts`

---

## 3. Add New Instruction

**Pattern (follow existing 10 instructions in `instructions/`):**

```rust
// 1. Define accounts struct in instructions/<name>.rs
#[derive(Accounts)]
pub struct MyNewInstruction<'info> { ... }

// 2. Add handler
pub fn handler(ctx: Context<...>, ...) -> Result<()> { ... }

// 3. Re-export in instructions/mod.rs
pub mod my_new;
pub use my_new::*;

// 4. Wire in lib.rs program function
pub fn my_new( ... ) -> Result<()> {
    instructions::my_new::handler(ctx, ...)
}
```

---

## 4. CPI Integration (for Phase 1 settlement)

**Implemented:** `settle_round` calls `txoracle::cpi::validate_stat` with `stat_a`, `stat_b`, `predicate`, proof accounts.

**Accounts needed:**
- `txoracle_program` — TxOracle program ID
- `daily_scores_merkle_roots` — TxOracle PDA `["daily_scores_merkle_roots"]`
- `daily_odds_merkle_roots` — TxOracle PDA `["daily_odds_merkle_roots", epochDay]`
- Proof accounts (item trees, main tree)

**Validated by:** `relayer/src/cpi-spike.ts` — full proof format documented.

---

## 5. Test a Market Lifecycle

```bash
# Run Anchor tests
anchor test --skip-deploy

# Or via yarn
cd kicktick && yarn test
```

**Test flow** (`kicktick/tests/kicktick.ts`):
1. init_config (bootstrap Config PDA)
2. init_match (fixture, home/away teams)
3. open_round (MarketType, lock/deadline)
4. place_bet YES (native SOL)
5. settle_offchain round (VARCheck, winner=1)
6. claim_winnings for YES winner
7. Verify: round.winner - 1 maps to position.side (0=YES,1=NO,2=abstain)

**To add test for new market types:**
- Create fixture with specific `market_type`
- Place bets
- Settle with `settle_odds_value` that triggers YES/NO
- Assert expected outcome

---

## 6. Debug Transaction Failure

**Common error codes (Anchor errors):**

| Code | Name | Likely cause | Fix |
|------|------|-------------|-----|
| 6003 | `InvalidFixtureId` | fixture_id <= 0 | Pass positive fixture_id |
| 6004 | `InvalidDuration` | lock/deadline not in 15-300 | Check args |
| 6005 | `RoundNotOpen` | round not Open | Check round.status |
| 6006 | `DeadlinePassed` | now >= expires_at | Create longer round |
| 6007 | `ZeroAmount` | amount = 0 | Pass amount > 0 |
| 6008 | `InvalidSide` | side > 2 | Use 0/1/2 |
| 6011 | `AlreadyClaimed` | double claim | Check position.claimed |
| 6012 | `NotWinner` | wrong outcome side | Check winner mapping (winner-1 = side) |
| 6013 | `FinalityDelayNotMet` | confirm too early | Wait 60s after settle |

**Debug commands:**
```bash
# Check account data
solana account <PDA> --output json --url devnet

# Get program logs
solana confirm -v <TX_SIGNATURE> --url devnet
```
