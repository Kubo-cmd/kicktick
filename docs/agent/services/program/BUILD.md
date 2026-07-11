---
id: program-build
type: howto
title: "Build & Test"
service: program
depends_on:
  - program-readme
related_to:
  - program-instructions
  - program-deploy
  - operations-workflows
tags: [build, test, debug]
---

# Build & Test

## Build

```bash
anchor build
```

### Update Program ID

After build, update program ID in 4 places:

| File | Line | Field |
|------|------|-------|
| `programs/kicktick/src/lib.rs` | 8 | `declare_id!("...")` |
| `frontend/lib/constants.ts` | 10 | `kicktickProgramId` |
| `relayer/.env` | — | `KICKTICK_PROGRAM_ID` |
| `kicktick/Anchor.toml` | 8 | `kicktick = "..."` |

---

## Deploy

See [DEPLOY.md](./DEPLOY.md) for deployment instructions.

---

## Test

```bash
anchor test --skip-deploy
```

### Test Flow (`kicktick/tests/kicktick.ts`, 255 lines)

1. `init_config` — bootstrap Config PDA
2. `init_match` — create fixture with home/away teams
3. `open_round` — open market with MarketType, lock/deadline seconds
4. `place_bet` — bet YES with native SOL
5. `settle_offchain_round` — settle VARCheck round (winner=1 for YES)
6. `claim_winnings` — claim for YES winner
7. Verify: `round.winner - 1` maps to `position.side` (0=YES, 1=NO, 2=abstain)

### Adding Tests for New Market Types

- Create fixture with specific `market_type`
- Place bets on both sides
- Settle with appropriate outcome
- Assert expected winner and payout

---

## Debug

### Common Error Codes

| Code | Name | Likely Cause | Fix |
|------|------|-------------|-----|
| 6003 | `InvalidFixtureId` | fixture_id <= 0 | Pass positive fixture_id |
| 6004 | `InvalidDuration` | lock/deadline not in 15-300s | Check args within range |
| 6005 | `RoundNotOpen` | round status not Open | Check round.status before betting |
| 6006 | `DeadlinePassed` | now >= expires_at | Create round with longer deadline |
| 6007 | `ZeroAmount` | amount = 0 | Pass amount > 0 |
| 6008 | `InvalidSide` | side > 2 | Use 0 (YES), 1 (NO), or 2 (abstain) |
| 6011 | `AlreadyClaimed` | double claim attempt | Check position.claimed before claiming |
| 6012 | `NotWinner` | wrong outcome side | Check winner mapping: winner-1 = side |
| 6016 | `FinalityDelayNotMet` | confirm too early | Wait 60s after settle before confirm |

### Debug Commands

```bash
# Check account data
solana account <PDA> --output json --url devnet

# Get transaction logs
solana confirm -v <TX_SIGNATURE> --url devnet

# Check program logs
solana logs --url devnet
```

### CPI Debug

For `settle_round` CPI failures:
- Verify txoracle program exists on devnet: `solana program show 6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J --url devnet`
- Check proof accounts match txoracle PDA seeds
- Run CPI spike test: `cd relayer && npx ts-node src/cpi-spike.ts`

---

## Add New Instruction

Follow existing pattern in `instructions/`:

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
pub fn my_new(ctx: Context<MyNewInstruction>, ...) -> Result<()> {
    instructions::my_new::handler(ctx, ...)
}
```

---

## Add New Market Type

Current types in `state/round.rs:6-19`:

```rust
// On-chain (CPI validate_stat)
NextGoalSide, GoalInWindow, NextCorner, CornerInWindow,
NextYellowCard, YellowCardInWindow, RedCardInMatch, PenaltyShootoutShot

// Off-chain (relayer sets outcome)
PenaltyShot, VARCheck
```

To add:
1. Add variant to `MarketType` enum in `state/round.rs`
2. Add statKey mapping in `settle_round` handler
3. Add test case in `tests/kicktick.ts`
