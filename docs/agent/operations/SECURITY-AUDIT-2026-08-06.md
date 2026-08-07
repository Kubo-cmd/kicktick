---
id: operations-security-audit-2026-08-06
type: operations
title: "Program Security Self-Audit (2026-08-06)"
service: program
depends_on:
  - services-program
related_to:
  - overview-roadmap
tags: [security, audit, colosseum, evidence]
---

# KickTick Program — Security Self-Audit (2026-08-06)

> Scope statement (per BountyForge LYTA scope gate): target = this repository
> (owned asset, Colosseum Eternal entry); authorization = owner; assets =
> `programs/kicktick` (1,566 LOC Rust/Anchor 0.31), sdk, relayer; active
> probing = local build/test only. Methodology: BountyForge v3
> smart-contract-agent patterns, manual full-source read, refutation pass.

## Verdict

**No critical or high findings.** All privileged paths are gated, all money
math is checked, and every unfinished flow fails closed. Program is in a
defensible state for Colosseum review.

## Method

- Full manual read: lib.rs, all 10 instructions, all 5 state accounts,
  constants, errors.
- Unit suite: `cargo test` — 14/14 pass (window math, side-lock, legacy
  layout, outcome/winner mapping, pool guards).
- Relayer suite: 25/25 vitest.
- Artifact: `target/deploy/kicktick.so` e_machine=247 (EM_BPF, deployable),
  403,448 bytes; IDL regenerated same-day.

## Fail-closed posture (verified)

| Path | State | Why safe |
|------|-------|----------|
| `settle_round` (on-chain CPI) | hard-fails `OracleValidationFailed` | no forged signer-supplied outcomes; awaits txoracle IDL |
| `fund_sponsor` / `sponsor_round` | hard-fails `SponsorFlowDisabled` | no stranded SOL in a ledgerless global vault |
| `open_round` | OffChain market types only | on-chain markets cannot open until CPI path lands |

## Money-path checks

- **place_bet**: checked_add everywhere; side change refused on funded
  position (`PositionSideMismatch`); legacy-version positions blocked from
  new stakes; vault validated by seeds + stored bump; window enforced
  (`now < locks_at` with checked arithmetic).
- **claim_winnings**: pro-rata in u128 with try_from back to u64; winner
  side mapping (0→1, 1→2, 2→3) enforced; `position_is_covered` rejects
  legacy aggregated positions larger than the winning pool; claim flag set
  only after successful transfer; owner + !claimed constraints in accounts.
- **refund_bet**: void/cancelled only; routes through the same handler.
- **cancel_round**: admin anytime, anyone after `expires_at` (anti-lockup).
- **challenge_equivocation**: admin only, ResolvedPending only → Voided.
- **confirm_round**: 60s finality delay enforced before Settled.
- **init_config**: gated on program upgrade authority (programdata check).

## Findings

1. **NOTE — abstain pool pays winners (documented intent).** Payout is
   `amount × (yes+no+abstain) / winning_pool`. Abstain stakes flow to the
   winning side. 1M-round Monte Carlo solvency sim passed (c9adc73).
   Disclosure point for judges, not a defect.
2. **LOW — void branch bypasses position version gate (intentional).**
   Legacy (v255) positions receive full principal refund on void/cancel but
   can never enter winner accounting. Verified consistent across both
   handlers; covered by unit test.
3. **TRUST ASSUMPTION — admin is a gate-keeper by design.** Admin can cancel
   any Open/Locked round at any time and sets outcomes for off-chain markets
   (PenaltyShot, VARCheck). Mitigations on-chain: anyone may cancel after
   `expires_at`; equivocation challenge voids disputed settlements. This is
   the core trust disclosure for the submission writeup.
4. **INFO — settle_round CPI is the remaining critical-path work.** The
   fail-closed stub must become real `validate_stat` CPI with Merkle-proof
   accounts before on-chain market types can open. Tracked in ROADMAP.
5. **MEDIUM (economic) — round accounts are never closed.** No `close =`
   constraint exists in any instruction, so per-round rent (~0.0016 SOL ×
   Round::LEN) is locked forever. At the relayer's current cadence
   (rolling window markets re-open immediately after expiry) a 90-min match
   produces ~86 rounds (66 window + ~20 event-driven) → ~0.14 SOL (~$20)
   of unrecoverable rent per match, paid by the admin/authority that opened
   them. Options: (a) add `close_round` after claim-deadline with rent to
   the match vault or a rent-recovery crank; (b) lengthen window intervals
   in the relayer (300s → 600s halves window-round count); (c) accept as
   cost-of-operation for the demo. For Colosseum scope, (c) + documenting
   the number is sufficient; mainnet needs (a).

## Refutation pass (adversarial self-check)

- "Vault drain via fake round?" — No: round PDA seeds bind to match; vault
  seeds bind to match PDA; claim constraints bind position owner.
- "Double claim?" — No: `claimed` flag + AlreadyClaimed constraint.
- "Overflow in pool math?" — No: all u128 intermediates, checked ops.
- "Relayer can settle early?" — No: `settlement_window_open` blocks until
  `locks_at`.
- "Legacy position inflation?" — No: version gate + coverage check; legacy
  positions are refund-only.

## Evidence pointers

- Commits: fa3da6c (Position v2 migration), 9c37c6e-class tests in
  `programs/kicktick/src/**/tests`, c9adc73 (Monte Carlo), scripts/
  audit-legacy-solvency.mjs.
- This audit: manual read 2026-08-06, cargo test 14/14, relayer 25/25.

---

## Addendum — Live localnet smoke (2026-08-06, post-audit)

Copy-harness E2E executed per solana-anchor-toolchain-fix protocol:
harness copy of the program with declare_id patched to the local deploy
keypair (CYsfi63w…), `cargo build-sbf --arch v3` (EM_BPF 247 verified),
deployed to a local solana-test-validator 4.1.1, relayer booted against it.

Result: **SMOKE_PASS** — ANCHOR_IDL_LOADED (executable=true), relayer
runtime started, WS welcome contract served (`{"version":"0.1.0"}`).
Committed source verified pristine after (declare_id canonical, IDL
address restored, harness + ledger wiped).

---

## Addendum 2 — SDK adversarial verification (2026-08-06)

Fresh-eyes verification of the SDK rewrite (6cb52e3) using
reviewer-context-hygiene method: checks derived from the Rust source of
truth, not from the implementation's claims.

- PDAs: all six (config, match, match_vault, round, position,
  sponsor_vault) independently recomputed from the Rust `seeds = [...]`
  recipes via raw web3.js and compared against `sdk/dist/pda.js` output —
  byte-identical (fixture 777, round 5).
- Account order + signer/writable flags: all 8 instruction structs diffed
  against their Rust `#[derive(Accounts)]` field order — exact match
  (init_config, init_match, open_round, place_bet, settle_offchain_round,
  confirm_round, claim, cancel_round).
- Discriminators: all 10 instruction discriminators verified as real Anchor
  sighashes (sha256("global:<name>")[0..8]), no placeholders.
- Deserialization offsets in accounts.ts match the Round/Position/Config/
  Match_ struct layouts field-by-field (verified against state/*.rs).

Verdict: PASS on all six SDK files.
