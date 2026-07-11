---
id: relayer-triggers
type: reference
title: "Market Trigger Rules"
service: relayer
depends_on:
  - relayer-architecture
  - relayer-streams
related_to:
  - relayer-settlement
  - program-instructions
tags: [triggers, rules, markets, events, cron]
---

# Market Trigger Rules

## Overview

Rules engine in `src/market/triggers.ts`. Converts match events and time windows into `TriggerAction[]` consumed by the crank.

### TriggerAction Types

```typescript
type TriggerAction =
  | { type: "open_round"; fixtureId; matchPda; roundId; marketType; lockSeconds; deadlineSeconds }
  | { type: "settle_onchain"; fixtureId; matchPda; roundId; marketType; settlementSeq }
  | { type: "settle_offchain"; fixtureId; matchPda; roundId; marketType; outcome: "Yes" | "No" }
  | { type: "confirm_round"; fixtureId; matchPda; roundId }
```

### Round States

```
open → settling → settled
  │                  │
  ▼                  ▼
(cancelled)    (confirmed via timeout)
```

---

## Market Type Timing

| Market Type | Lock (s) | Deadline (s) | Settlement |
|-------------|----------|--------------|------------|
| NextGoalSide | 30 | 90 | On-chain |
| GoalInWindow | 15 | 300 | On-chain |
| NextCorner | 30 | 120 | On-chain |
| CornerInWindow | 15 | 180 | On-chain |
| NextYellowCard | 30 | 120 | On-chain |
| YellowCardInWindow | 15 | 300 | On-chain |
| RedCardInMatch | 15 | 99999 | On-chain |
| PenaltyShootoutShot | 10 | 30 | On-chain |
| PenaltyShot | 15 | 90 | Off-chain |
| VARCheck | 15 | 120 | Off-chain |

---

## Event-Triggered Rules

### Goal → NextGoalSide

```typescript
handleGoal(event, fixtureId, matchState, actions):
  // if NextGoalSide round open → settle with outcome (home=Yes, away=No)
  // open new NextGoalSide round
```

### Corner → NextCorner

```typescript
handleCorner(event, fixtureId, matchState, actions):
  // if NextCorner round open → settle (home=Yes, away=No)
  // open new NextCorner round
```

### Yellow Card → NextYellowCard

```typescript
handleYellowCard(event, fixtureId, matchState, actions):
  // if NextYellowCard open → settle (home=Yes, away=No)
  // open new NextYellowCard round
```

### Red Card → RedCardInMatch

```typescript
handleRedCard(event, fixtureId, matchState, actions):
  // if RedCardInMatch open → settle(Yes)
  // no new round opened (match-level binary market)
```

### Penalty Award → PenaltyShot

```typescript
handlePenalty(fixtureId, matchState, actions):
  // open new PenaltyShot round
```

### Penalty Outcome → PenaltyShot settle + optional shootout

```typescript
handlePenaltyOutcome(event, fixtureId, matchState, actions):
  if event.outcome === "Retake":
    // extend current PenaltyShot deadline +60s
    return
  // settle PenaltyShot (Scored=Yes, Missed=No)
  if penaltyShootoutMode:
    // settle current PenaltyShootoutShot
    // open new PenaltyShootoutShot
```

### VAR → VARCheck

```typescript
handleVar(event, fixtureId, matchState, actions):
  // open new VARCheck round
```

### VAR End → VARCheck settle

```typescript
handleVarEnd(event, fixtureId, matchState, actions):
  // settle VARCheck (Overturned=Yes, Stands=No)
```

---

## Cron Window Rules

Window markets fire on interval during live match time.

### Intervals

| Market Type | Interval |
|-------------|----------|
| GoalInWindow | 300s (5 min) |
| CornerInWindow | 180s (3 min) |
| YellowCardInWindow | 300s (5 min) |

### Logic

```typescript
checkCronWindows(fixtureId, matchState, actions):
  if matchClockMs <= 0 → return
  if match ended → return
  for each window market:
    if matchTime - lastOpened >= interval:
      open new round
      update lastOpened
```

Enabled via `startCronWindows(fixtureId)` after match init.

---

## Penalty Shootout Mode

Triggered when StatusId transitions to `PenaltyShootout` (12).

```typescript
handleStatus({ statusId: PenaltyShootout }, fixtureId, matchState, actions):
  f.penaltyShootoutMode = true
  open PenaltyShootoutShot #1
```

Each shootout shot follows:
```
penalty_outcome event
  → settle current PenaltyShootoutShot
  → open next PenaltyShootoutShot
  → f.penaltyShootoutRound++
```

Cleaned up on `FinishedAfterPenaltyShootout` (13).

---

## Timeout Handling

Polled every 5s via `setInterval` in `index.ts`.

```typescript
checkTimeouts(fixtureId):
  for each round:
    if round expired (now > expiresAt):
      if round.settlement_model === OnChain:
        settle_onchain(seq=0)
      else:
        settle_offchain(No)
    if round settling and now > settleAt + 60s:
      confirm_round
```

---

## Match End Cleanup

On `FullTime`, `FinishedAfterExtraTime`, `FinishedAfterPenaltyShootout`:

1. Settle any open `RedCardInMatch` → No (no red card in remaining time)
2. Settle all remaining open rounds → No (event didn't happen)
3. Stop cron windows