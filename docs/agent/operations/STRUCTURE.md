---
id: operations-structure
type: reference
title: "Full Project Structure"
service: operations
depends_on: []
related_to:
  - overview-architecture
tags: [structure, files, tree]
---

# KickTick — Full Project Structure

> Every source file with purpose. Excludes `node_modules/`, `target/`, `build artifacts`.

---

## Root

| Path | Type | Purpose |
|------|------|---------|
| `README.md` | doc | Project overview, setup instructions |
| `KickTick-Backend-Roadmap.md` | doc | Deleted — superseded by `docs/agent/ROADMAP.md` |
| `opencode.json` | config | OpenCode MCP config: solanaMcp + pdf-reader |
| `skills-lock.json` | config | Caveman skills lockfile |
| `.env.example` | config | Environment variable template |
| `.gitignore` | config | Git ignore rules |
| `deploy.sh` | script | Solana deployment script |
| `setup-local.sh` | script | Local dev environment setup |
| `simulation.ts` | script | TS simulation (SpikeDetector + settlement logic, 204 lines) |
| `simulation.js` | script | Standalone JS simulation (122 lines) |

---

## `kicktick/` — Anchor Workspace

### Root config
| Path | Purpose |
|------|---------|
| `Anchor.toml` | Devnet cluster, program ID `CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc` |
| `Cargo.toml` | Workspace root — Anchor 1.0.0, borsh |
| `Cargo.lock` | Dependency lock |
| `rust-toolchain.toml` | Rust 1.96.0 |

### `programs/kicktick/` — On-Chain Program
| Path | Lines | Purpose |
|------|-------|---------|
| `src/lib.rs` | 140 | Module router — wires 10 instructions, 5 state PDAs |
| `src/constants.rs` | 48 | Seeds, limits, StatKeys, CPI discriminator |
| `src/errors.rs` | 102 | 25 KickTickError codes |
| `src/state/` | 5 files | PDAs: Config, Match_, Round, Position, SponsorVault |
| `src/instructions/` | 10 files | Instruction handlers + mod.rs |

#### PDAs
- `Config` — admin, txoracle id, finality delay, min liquidity
- `Match_` — fixture_id, teams, vault_bump, round_counter, totals
- `Round` — market_type, params, status, outcome, totals, winner
- `Position` — owner, fixture_id, round_id, side, amount, claimed
- `SponsorVault` — global sponsor liquidity
- `MatchVault` — system-owned SOL vault per match (not an Anchor account)

#### Instructions (10)
1. `init_config` — bootstrap Config PDA
2. `init_match` — create match + system-owned vault
3. `open_round` — open market/round on match
4. `place_bet` — SOL bet on round side
5. `settle_round` — on-chain CPI settlement
6. `settle_offchain_round` — relayer sets outcome
7. `confirm_round` — finalize after finality delay
8. `claim_winnings` / `refund_bet` — payout or refund
9. `cancel_round` — void open round
10. `challenge_equivocation` — void settled round

#### Sponsor (2)
- `fund_sponsor` — deposit SOL into SponsorVault (+ match_vault for rent)
- `sponsor_round` — allocate sponsor liquidity to round

### `client/` — TypeScript SDK (removed)

The `client/` directory previously contained a TypeScript SDK (`market-manager.ts`, `txodds-oracle.ts`). These files have been removed. The directory now only contains `node_modules/` and no source code.

### `tests/`
| Path | Lines | Purpose |
|------|-------|---------|
| `kicktick.ts` | 208 | Native SOL test suite: init_match → open_round → place_bet → settle → claim |

---

## `relayer/` — Node/TS Crank Worker

| Path | Lines | Purpose |
|------|-------|---------|
| `package.json` | - | Dependencies: @swingkiddo/txodds-client, @solana/web3.js, dotenv |
| `tsconfig.json` | - | TS config |
| `.env.example` | - | Env template (JWT, API token, RPC, keypair, program IDs) |
| `src/config.ts` | 45 | `loadConfig()` — env-based config with defaults |
| `src/index.ts` | 178 | Main loop wiring |
| `src/clients/txline-auth.ts` | 138 | `authenticateGuest()`, `activateApiToken()`, `testConnection()` |
| `src/clients/txline-client.ts` | 185 | SSE scores/odds stream with reconnection |
| `src/clients/anchor-client.ts` | 426 | Solana Anchor tx builder |
| `src/market/event-parser.ts` | 553 | SSE → typed FootballEvent + MarketType mapping |
| `src/market/fixture-watcher.ts` | 283 | Match state tracking, PDA derivation |
| `src/market/triggers.ts` | 593 | Rules engine: event-triggered + cron windows |
| `src/settlement/proof-gatherer.ts` | 208 | Merkle proof fetcher from TxLINE |
| `src/settlement/crank.ts` | 284 | Build + send Solana txs with retry |
| `src/api/ws-server.ts` | 168 | WebSocket push for frontend |
| `src/scripts/cpi-spike.ts` | 456 | CPI spike test — validate_stat feasibility |
| `src/scripts/verify-tokens.ts` | 75 | TxL + USDT mint verification |

### `docs/agent/services/relayer/` — Agent Docs

| Path | Type | Content |
|------|------|---------|
| `README.md` | overview | Purpose, data flow, module structure, deps |
| `ARCHITECTURE.md` | architecture | Module dependency graph, startup sequence, event pipeline |
| `STREAMS.md` | reference | SSE streams, auth, 18 event types, reconnect, status phases |
| `TRIGGERS.md` | reference | Market trigger rules — event, cron, shootout, timeout |
| `SETTLEMENT.md` | reference | Proof gathering, crank, retry policy, tx building |
| `API.md` | reference | WebSocket protocol — messages, subscriptions |
| `BUILD.md` | howto | Build, run, scripts, env, debug |

---

## `frontend/` — Next.js UI

| Path | Purpose |
|------|---------|
| `package.json` | Next.js 14.2, React 18, Tailwind 3.4 |
| `next.config.js` | Next config |
| `tailwind.config.js` | Dark theme: navy (#0F1923), teal (#14B8A6), cyan (#06B6D4) |
| `postcss.config.js` | PostCSS config |
| `tsconfig.json` | TS config |
| `app/layout.tsx` | Root layout with WalletContextProvider |
| `app/page.tsx` | Landing page: 4 demo markets, stats bar, live odds sidebar |
| `app/globals.css` | Tailwind + custom CSS |
| `components/Header.tsx` | Nav header + wallet multi-button (Phantom/Solflare) |
| `components/MarketCard.tsx` | Market card: YES/NO pool bar, bet buttons, countdown timer |
| `components/CreateMarketModal.tsx` | 2-step modal: type selection + duration/details |
| `components/LiveOddsFeed.tsx` | Simulated real-time odds display (demo data only) |
| `lib/constants.ts` | Program IDs, network config, market settings |
| `lib/WalletContext.tsx` | Solana wallet adapter provider |

---

## `scripts/`

| Path | Lines | Purpose |
|------|-------|---------|
| `txline-test.ts` | 238 | Full TxLINE API test: faucet USDT, subscribe, auth, fetch fixtures + odds, stream 3 events, stat-validation for WC fixture IDs |
| `keypair.json` | - | Generated dev keypair |

---

## `docs/`

| Path | Lines | Purpose |
|------|-------|---------|
| `KickTick-Architecture.md` | 455 | Full architecture: ASCII diagrams, SSE events, match phases, market types, trigger rules, component trees |
| `KickTick-MVP-Plan.md` | 799 | Complete MVP spec: real TxODDS facts, CPI mechanics, all 15 instructions, PDA schema, settlement logic, week-by-week schedule, 14 risks |
| `txodds-soccer-feed-v1.0.pdf` | - | TxODDS soccer feed specification PDF |

---

## `.agents/skills/` — Caveman Agent Skills

| Skill | Purpose |
|-------|---------|
| `caveman/` | Ultra-compressed communication (~75% token reduction) |
| `caveman-commit/` | Terse Conventional Commits |
| `caveman-compress/` | Compress .md files to caveman format |
| `caveman-help/` | Quick reference card |
| `caveman-review/` | One-line PR code review |
| `caveman-stats/` | Session token usage stats |
| `cavecrew/` | Subagent delegation guide |

---

## Project Totals

| Metric | Value |
|--------|-------|
| Source files (excl. generated) | ~50 |
| Rust (on-chain) | lib.rs 140 + state 5 + instructions 10 + constants 48 + errors 102 |
| TS (relayer) | 674 lines |
| TSX (frontend) | ~400 lines |
| Documentation | ~1,500 lines |
| Git commits | 12 (feat/backend branch) |
