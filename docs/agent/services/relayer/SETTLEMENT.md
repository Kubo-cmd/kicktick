---
id: relayer-settlement
type: reference
title: "Proof Gathering & Settlement Crank"
service: relayer
depends_on:
  - relayer-architecture
  - relayer-triggers
related_to:
  - program-instructions
  - integration-data-flow
tags: [settlement, proof, crank, CPI, transaction]
---

# Proof Gathering & Settlement Crank

## On-Chain Settlement Flow

```
market-trigger emits settle_onchain action
  │
  ▼
crank.executeSettleOnchain(fixtureId, roundId, marketType, settlementSeq)
  │
  ├── proof-gatherer.getStatKeysForMarket(marketType)
  │     returns statKey(s) needed
  │
  ├── proof-gatherer.gatherProof(fixtureId, seq, statKey, period)
  │     └── txline-client.getStatValidation(fixtureId, seq, statKey)
  │           └── GET /stat-validation → StatValidationResult
  │
  ├── proof-gatherer.buildPredicate(baseline, comparison)
  │
  ├── assemble SettleProofArgs from proof data
  │
  └── anchor-client.settleRound(roundId, matchPda, proofArgs)
        └── Solana tx: settle_round instruction
              ├── CPI: txoracle::validate_stat
              └── CU limit: 1,400,000
```

### Binary Markets (1 statKey)

- `GoalInWindow`, `CornerInWindow`, `YellowCardInWindow`, `RedCardInMatch`
- Single proof call, predicate = `value > 0`

### Ternary Markets (2 statKeys)

- `NextGoalSide`, `NextCorner`, `NextYellowCard`, `PenaltyShootoutShot`
- Two proof calls (home + away participant stats)
- Combined with `op: Add` → `statA + statB > 0` determines which side

---

## Off-Chain Settlement

For `PenaltyShot` and `VARCheck` — relayer sets outcome directly, no CPI.

```
market-trigger emits settle_offchain action
  │
  ▼
crank.executeSettleOffchain(fixtureId, roundId, outcome)
  └── anchor-client.settleOffchainRound(roundId, matchPda, outcome, winner)
        └── Solana tx: settle_offchain_round instruction
```

### Outcome Mapping

| Market | Event | Outcome | Winner |
|--------|-------|---------|--------|
| PenaltyShot | Scored | Yes | 1 |
| PenaltyShot | Missed | No | 2 |
| VARCheck | Overturned | Yes | 1 |
| VARCheck | Stands | No | 2 |

---

## Proof Data Structure

```typescript
interface SettleProofArgs {
  ts: number;
  fixtureSummary: {
    fixtureId: number;
    updateStats: { updateCount; minTimestamp; maxTimestamp };
    eventsSubTreeRoot: number[];
  };
  fixtureProof: ProofNode[];
  mainTreeProof: ProofNode[];
  predicate: { threshold: number; comparison: "GreaterThan" };
  statA: StatTermData;
  statB?: StatTermData;  // ternary markets
  op?: "Add";            // ternary markets
}
```

### StatKey Mapping

| Market Type | statKey(s) | Period |
|-------------|------------|--------|
| NextGoalSide | 1 (home goals), 2 (away goals) | H1 (0) |
| GoalInWindow | 1 (home goals) | H1 (0) |
| NextCorner | 7 (home corners), 8 (away corners) | H1 (0) |
| CornerInWindow | 7 (home corners) | H1 (0) |
| NextYellowCard | 3 (home YC), 4 (away YC) | H1 (0) |
| YellowCardInWindow | 3 (home YC) | H1 (0) |
| RedCardInMatch | 5 (home RC) | H1 (0) |
| PenaltyShootoutShot | 5001 (home PE goals), 5002 (away PE goals) | PE (5000) |

---

## Crank Executor

Implemented in `src/settlement/crank.ts`.

### Retry Policy

```typescript
maxRetries = 3
retryDelayMs = 1000 (×2 per attempt)

attempt 0 → 1000ms
attempt 1 → 2000ms
attempt 2 → 4000ms
```

### Action Execution

Sequential (one by one) to avoid nonce conflicts:

```
for each action:
  await executeAction(action)
```

### CrankStatus Events

```typescript
interface CrankStatus {
  fixtureId: number;
  roundId: number;
  action: string;     // open_round | settle_onchain | settle_offchain | confirm_round
  status: "pending" | "sent" | "confirmed" | "failed";
  txSig?: string;
  error?: string;
  timestamp: number;
}
```

Emitted via `EventEmitter`, consumed by:
- `ws-server.ts` → push to frontend
- `index.ts` → logging + WS broadcast

---

## Solana Transaction Building

### CU Budget

All `settle_round` transactions use `ComputeBudgetProgram.setComputeUnitLimit(1_400_000)`.

### Finality

```
settle_round → ResolvedPending
  ↓ (wait 60s = FINALITY_DELAY_SECONDS)
confirm_round → Settled
```

Timeout handler checks every 5s for rounds in `ResolvedPending` state with elapsed >= 60s.

### Error Recovery

| Error | Handling |
|-------|----------|
| Transaction failure | Retry up to 3x with backoff |
| Anchor error log | Parse for anchor error code, surface in status |
| Missing proof data | Failure logged, no retry (proof is deterministic for seq) |