# KickTick – Sub-Minute Micro Prediction Markets for World Cup

**Superteam World Cup Hackathon Submission (24 June - 19 July, $50K prize pool)**

Fits all 3 tracks:
- **Markets**: Real-time TxODDS-powered micro prediction markets for World Cup events (goals, cards, corners, odds_spike, match result).
- **Trading Agents**: Autonomous agent that turns KickTick predictions into trade signals or DEX executions.
- **Consumer & Fan Experiences**: Live leaderboards, shareable prediction cards, mobile-friendly UI for fans during matches.

## Overview

Create and settle prediction markets in **under 60 seconds** using live TxODDS odds data + on-chain Merkle proof settlement.

Perfect for World Cup: bet on next goal, next card, corners, or odds movement in real time.

## Key Features

- 5 market types optimized for football (odds_spike, next_goal, next_card, over_under_corners, match_result)
- TxODDS oracle integration (stable de-margined odds)
- Merkle proof validation for trustless settlement
- On-chain leaderboards and shareable fan prediction cards
- Autonomous trading agent that acts on predictions
- Next.js frontend with live odds feed and mobile support
- Simulation with real World Cup match examples (22/22 tests pass)

## Tech Stack

- Solana + Anchor
- TxODDS Oracle
- Next.js + TypeScript
- Merkle proofs for settlement

## Getting Started

```bash
git clone https://github.com/Kubo-cmd/kicktick.git
cd kicktick
./setup-local.sh
cd frontend && npm run dev
node simulation.js   # World Cup examples
```

## Demo

[Demo Video – Coming Soon] (live market creation, betting, resolution during a World Cup match simulation, leaderboard, agent trade execution)

## Why This Wins Superteam World Cup Hackathon

- Perfectly uses the provided TxODDS API for real-time football data.
- Combines fast markets, trading agents, and fan experiences in one product.
- Fully on-chain with transparent Merkle settlement.
- Ready for fans to engage during live World Cup matches.

## License

MIT

---

**Submitted for Superteam World Cup Hackathon — All 3 tracks covered.**

PATTERN PERSISTS.
