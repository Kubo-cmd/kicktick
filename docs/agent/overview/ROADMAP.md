---
id: overview-roadmap
type: overview
title: "Development Roadmap"
service: overview
depends_on:
  - overview-project
related_to: []
tags: [roadmap, phases, timeline]
---

# KickTick — Development Roadmap

> **Deadline:** July 19, 2026
> **Branch:** `feat/backend`

---

## Phase 0 — Spike & Environment ✅ (Completed July 3)

| Task | Status | Commit |
|------|--------|--------|
| 0.1 Obtain JWT + API token from TxLINE | ✅ | `92d8870` |
| 0.2 Test `validate_stat` CPI on devnet | ✅ | `12196b0` |
| 0.3 Set up Anchor workspace + deploy | ✅ | `10358ca` |
| 0.4 Set up relayer workspace | ✅ | `92d8870` |
| 0.5 Verify TxL/USDT token programs | ✅ | `12196b0` |

**Key findings:**
- TxL uses Token-2022 program, USDT uses Token program (different!)
- CPI spike passed — `txoracle` program exists on devnet
- Proof format matches expected CPI layout
- WC Competition ID = 72

---

## Phase 1 — Anchor Program: Core (July 3–8)

### State Layer
| Task | Depends | Status |
|------|---------|--------|
| 1.1.1 Config PDA + constants + errors | — | ✅ |
| 1.1.2 Match PDA + MatchVault system account | 1.1.1 | ✅ |
| 1.1.3 Round PDA (enum + params + status) | 1.1.1 | ✅ |
| 1.1.4 Position PDA | 1.1.1 | ✅ |
| 1.1.5 SponsorVault PDA | 1.1.1 | ✅ |

### Instructions
| Task | Depends | Status |
|------|---------|--------|
| 1.2.1 `init_match` + `fund_sponsor` | 1.1.2 | ✅ |
| 1.2.2 `open_round` with MarketType validation | 1.1.3 | ✅ |
| 1.2.3 `place_bet` (SOL, no SPL token) | 1.1.4 | ✅ |
| 1.2.4 `settle_round` (on-chain CPI) | 1.1.3 | ⛔ Blocked — validation fails closed pending authoritative IDL/account layout |
| 1.2.5 `settle_offchain_round` | 1.1.3 | ✅ |
| 1.2.6 `confirm_round` (finality delay) | 1.2.4/1.2.5 | ✅ |
| 1.2.7 `claim_winnings` / refund | 1.1.4 | ✅ |
| 1.2.8 `cancel_round` | 1.1.3 | ✅ |
| 1.2.9 `challenge_equivocation` | 1.1.3 | ✅ |

### Settlement ★ Critical Path
| Task | Depends | Status |
|------|---------|--------|
| 1.3.1 `settle_round` — CPI `validate_stat` | 1.1.3 | ⛔ Blocked — authoritative IDL/account layout required |
| 1.3.2 Ternary logic (NextGoalSide) | 1.3.1 | ✅ Logic; ⛔ on-chain settlement blocked by 1.3.1 |
| 1.3.3 Binary logic (GoalInWindow, etc.) | 1.3.1 | ✅ Logic; ⛔ on-chain settlement blocked by 1.3.1 |
| 1.3.4 PenaltyShootoutShot (statKey 5001/5002) | 1.3.1 | ✅ Logic; ⛔ on-chain settlement blocked by 1.3.1 |
| 1.3.5 `settle_offchain_round` | 1.1.3 | ✅ |
| 1.3.6 `confirm_round` (finality delay) | 1.3.x | ✅ |
| 1.3.7 `claim` (pro-rata + refund) | 1.1.4 | ✅ |
| 1.3.8 `cancel_round` | 1.1.3 | ✅ |
| 1.3.9 `challenge_equivocation` | 1.1.3 | ✅ |

### Tests
| Task | Depends | Status |
|---------|--------|------|
| 1.4.0 Native SOL test suite | 1.2.x | ✅ |
|------|---------|--------|
| 1.4.1 CPI spike test | 0.2 | ✅ (exists as `cpi-spike.ts`) |
| 1.4.2 Core flow (init→match→open→bet→settle→claim) | 1.3.7 | ✅ Off-chain/replay; ⛔ on-chain CPI path blocked |
| 1.4.3 All market types | 1.3.x | ✅ Logic/replay coverage; ⛔ on-chain CPI settlement blocked |
| 1.4.4 Edge cases (void, cancel, refund) | 1.3.x | ✅ |

**MVP Gate:** ⛔ Not met. Off-chain and replay settlement are verified; on-chain oracle markets remain fail-closed until the authoritative TxODDS IDL/account layout enables exact CPI validation.

---

## Phase 2 — Relayer: TxLINE Integration (July 8–12)

### Connectivity
| Task | Files | Status |
|------|-------|--------|
| 2.1.1 `txline-auth.ts` | exists | ✅ |
| 2.1.2 `txline-client.ts` — SSE parser | new file | ✅ |
| 2.1.3 Parse 18 SSE action types | txline-client.ts | ✅ |
| 2.1.4 `fixture-watcher.ts` | new file | ✅ |

### Market Logic
| Task | Status |
|------|--------|
| 2.2.1 Event-triggered rules (goal, corner, etc.) | ✅ |
| 2.2.2 Cron-triggered rules (GoalInWindow 5min) | ✅ |
| 2.2.3 Penalty shootout mode | ✅ |
| 2.2.4 Timeout handling | ✅ |
| 2.2.5 Retake handling (penalty retake) | ✅ |

### Proof & Settlement Crank
| Task | Status |
|------|--------|
| 2.3.1 `proof-gatherer.ts` | ✅ |
| 2.3.2 `crank.ts` — build + send tx | ✅ |
| 2.3.3 Off-chain settlement (PenaltyShot/VARCheck) | ✅ |
| 2.3.4 `ws-server.ts` — WebSocket for frontend | ✅ |
| 2.3.5 `index.ts` — main loop wiring | ✅ |

**MVP Gate:** Relayer auto-opens and replay-settles rounds for a live match feed. ✅ Replay harness verified at `f58cd72`; on-chain TxOracle CPI settlement remains pending until the required IDL and account layout are available.

---

## Phase 3 — Replay & Demo (July 12–16)

| Task | Status |
|------|--------|
| 3.1 Load historical match data | ⬜ |
| 3.2 Replay at 30x speed | ✅ (replay.ts speed=N) |
| 3.3 Slow lane 1x mode | ✅ (speed=1) |
| 3.4 All 8 market types firing | ✅ (7 tests, 17/17 green) |
| 3.5 Demo script & fallback video | ⬜ |

**Final Gate:** 15-20 rounds settle in 3 minutes via 30x replay.

---

## Timeline

| Phase | Days | Hours | Dependencies | Status |
|-------|------|-------|-------------|--------|
| 0 — Spike | 2 | 8-12 | TxLINE access | ✅ Done |
| 1 — Anchor Program | 5 | 30-40 | Phase 0 | ✅ Done |
| 2 — Relayer | 4 | 24-32 | Phase 1 (crank) | ✅ Done |
| 3 — Replay/Demo | 4 | 16-20 | Phase 2 | ⏳ In progress |
| **Buffer** | **3** | — | — | ⏳ Jul 16-19 |

---

## Phase 1 Deliverables (current head)

| Commit | Description |
|--------|-------------|
| `[pending]` | Modular Anchor program (10 instructions, 5 PDAs), native SOL, Match/Round/Position, SponsorVault |
| `10358ca` | Anchor workspace scaffolded |
| `2faf4d4` | Bump Anchor SDK 0.30.1 → 0.32.0 |
| `92d8870` | Relayer workspace with TxLINE auth |
| `12196b0` | CPI spike test + token mint verification |
| `1830bcc` | Gitignore + env template |
| `[pending]` | Docs/agent navigation map for agents |

| Risk | Trigger | Fallback | Status |
|------|---------|----------|--------|
| CPI spike fails | `validate_stat` error | 2-of-3 relayer sigs | ✅ Resolved |
| TxLINE SSE unreliable | Frequent reconnects | REST poll 15s | ⚠️ Watch |
| CU budget exceeded | Tx fails | `setComputeUnitLimit(1_400_000)` | ⚠️ Watch |
| statKey 5001/5002 unsupported | CPI fails | Off-chain shootout | ⚠️ Need test |
| Deadline approaching | Week 3 gaps | Reduce to 4 core market types | ⚠️ Watch |
| JWT expires (30 days) | Auth fails | Re-request on 401 | ⚠️ Note |
| Own goal (GoalType=Own) | Wrong side settlement | Only Participant matters for market | ✅ Clarified |

---

## What Exists Now (Phase 0 Deliverables)

| Commit | Description |
|--------|-------------|
| `10358ca` | Anchor workspace with 6 instructions, 3 PDAs, 5 MarketTypes, 17 errors |
| `2faf4d4` | Bump Anchor SDK 0.30.1 → 0.32.0 |
| `92d8870` | Relayer workspace with TxLINE auth |
| `12196b0` | CPI spike test + token mint verification |
| `1830bcc` | Gitignore + env template |
