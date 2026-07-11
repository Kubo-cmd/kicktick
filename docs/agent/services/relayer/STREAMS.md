---
id: relayer-streams
type: reference
title: "SSE Streams & Connectivity"
service: relayer
depends_on:
  - relayer-architecture
related_to:
  - relayer-triggers
  - relayer-settlement
tags: [SSE, stream, auth, connection, reconnect]
---

# SSE Streams & Connectivity

## TxLINE Authentication

Implemented in `src/clients/txline-auth.ts`.

### Guest JWT

```
POST /auth/guest/start  →  JWT (read-only, free tier)
```

No on-chain tx required. Used for fixture lists, scores snapshots.

### API Token (Full Access)

```
1. POST /auth/guest/start                        → JWT
2. POST /api/token/activate (with signed msg)     → API token
```

Requires on-chain subscription tx (TxL tokens → TxLINE program). Enables SSE streams + stat-validation proofs.

### Auth Headers

```
Authorization: Bearer <JWT>
X-Api-Token: <API_TOKEN>
```

---

## SSE Stream Types

### Scores Stream

`TxLineClient.streamScores()` — async generator with auto-reconnect.

**Events:** match actions (goal, corner, yellow_card, red_card, penalty, var, status, etc.)

**Data shape:**
```json
{
  "Action": "goal",
  "Participant": 1,
  "GoalType": "Shot",
  "PlayerId": 12345,
  "Data": { ... }
}
```

### Odds Stream

`TxLineClient.streamOdds()` — identical pattern, delivers odds updates.

---

## Event Types (18 SSE Actions)

| Action | Enum | Fields | Markets Triggered |
|--------|------|--------|-------------------|
| `goal` | `FootballAction.Goal` | participant, goalType, playerId | NextGoalSide |
| `corner` | `FootballAction.Corner` | participant | NextCorner |
| `yellow_card` | `FootballAction.YellowCard` | participant, playerId | NextYellowCard |
| `red_card` | `FootballAction.RedCard` | participant, redCardType | RedCardInMatch |
| `penalty` | `FootballAction.Penalty` | participant | PenaltyShot |
| `penalty_outcome` | `FootballAction.PenaltyOutcome` | participant, outcome (Scored/Missed/Retake) | PenaltyShot, PenaltyShootoutShot |
| `shot` | `FootballAction.Shot` | participant, outcome | — |
| `free_kick` | `FootballAction.FreeKick` | participant, freeKickType | — |
| `throw_in` | `FootballAction.ThrowIn` | participant | — |
| `goal_kick` | `FootballAction.GoalKick` | participant | — |
| `var` | `FootballAction.Var` | participant, varType | VARCheck |
| `var_end` | `FootballAction.VarEnd` | participant, outcome (Stands/Overturned) | VARCheck |
| `possible` | `FootballAction.Possible` | participant, possibleGoal/Penalty/Corner/YC/RC/VAR | — |
| `status` | `FootballAction.Status` | statusId (1–16) | Match lifecycle |
| `score_adjustment` | `FootballAction.ScoreAdjustment` | participant, score | — |
| `additional_time` | `FootballAction.AdditionalTime` | minutes | — |
| `kickoff` | `FootballAction.Kickoff` | participant | — |
| `substitution` | `FootballAction.Substitution` | playerInId, playerOutId | — |
| `injury` | `FootballAction.Injury` | playerId, outcome | — |
| `suspend` | `FootballAction.Suspend` | reliable | — |

---

## Connection Management

### Reconnect Strategy (`TxLineClient`)

```
SSE disconnect
  │
  ▼
emit("disconnect")
  │
  ▼
delay = min(30s, 1s × 2^attempt) + jitter(50%)
  │
  ▼
emit("reconnect", attempt)
  │
  ▼
reconnect → emit("connect")
```

**Parameters:**
- Base delay: 1s
- Max delay: 30s
- Jitter: 50% random
- Retry: infinite (until stopped)

### Heartbeat

Timeout of 30s per SSE event. If no event received within window, triggers reconnect.

### Fixture Loading

```typescript
async loadFixture(fixtureId: number): Promise<MatchState>
```

1. Derive match PDA from fixtureId
2. Fetch scores snapshot for current state
3. Fetch fixture metadata (teams, start time)
4. Create MatchState tracker

### StatusId → Phase Mapping

| StatusId | Value | Phase | Watchdog Event |
|----------|-------|-------|----------------|
| NotStarted | 1 | Pre-match | — |
| FirstHalf | 2 | Live H1 | `match_start` |
| HalfTime | 3 | HT | `match_half` |
| SecondHalf | 4 | Live H2 | — |
| FullTime | 5 | FT | `match_end` |
| ExtraTimeFirstHalf | 7 | ET H1 | — |
| ExtraTimeSecondHalf | 9 | ET H2 | — |
| FinishedAfterExtraTime | 10 | FET | `match_end` |
| WaitingPenaltyShootout | 11 | WP | — |
| PenaltyShootout | 12 | PE | `match_pe` |
| FinishedAfterPenaltyShootout | 13 | FPE | `match_fpe` |
| Interrupted | 14 | I | `match_interrupted` |
| Abandoned | 15 | A | `match_interrupted` |
| Cancelled | 16 | C | `match_interrupted` |