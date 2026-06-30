# TxODDS World Cup Hackathon — KickTick + SPIKES

Two projects built for the [TxODDS World Cup Hackathon](https://superteam.fun/earn/hackathon/world-cup/) ($50k prize pool).

## Projects

### KickTick — Sub-Minute Micro Prediction Markets
Create and settle prediction markets in under 60 seconds using live TxODDS odds data.

**Market types:**
- `odds_spike` — Will odds move >X% in the next N seconds?
- `next_goal` — Which team scores next?
- `next_card` — Will there be a card in the next 5 minutes?
- `over_under_corners` — Corners in next N minutes?
- `match_result` — Who wins (short-format)

**Settlement:** Uses TxODDS stable price (de-margined odds) with Merkle proof validation against the on-chain `txoracle` program.

### SPIKES — Digital Sticker Album of Dramatic Moments
Compressed NFTs (via Metaplex Bubblegum) minted when odds explode. Collect, trade, and show off the most dramatic World Cup moments.

**Moment types:**
- `odds_surge` — Odds jumped >15%
- `odds_crash` — Odds dropped >15%
- `goal_scored` — Goal caused major shift
- `comeback` — Team came back from behind
- `upset` — Underdog won

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  KickTick UI  │  │  SPIKES Album │  │  Dashboard │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
└─────────┼─────────────────┼────────────────┼─────────┘
          │                 │                │
┌─────────┼─────────────────┼────────────────┼─────────┐
│         ▼                 ▼                ▼         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ Market Mgr  │  │ Spike Pipeline│  │  TxODDS    │  │
│  │  (TypeScript)│  │  (TypeScript) │  │  Client    │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                │                │          │
│  ┌──────▼────────────────────────────────▼──────┐   │
│  │           Solana Programs (Anchor)            │   │
│  │  ┌──────────────┐  ┌──────────────────────┐  │   │
│  │  │   KickTick    │  │       SPIKES         │  │   │
│  │  │  (markets +   │  │  (cNFT moments +     │  │   │
│  │  │   betting)    │  │   album tracking)    │  │   │
│  │  └──────────────┘  └──────────────────────┘  │   │
│  └──────────────────────────────────────────────┘   │
│                      │                               │
│  ┌───────────────────▼───────────────────────────┐  │
│  │        TxODDS Oracle (txoracle program)        │  │
│  │   Merkle roots on-chain for proof validation   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Clone and setup
git clone <this-repo>
cd txodds-hackathon
./setup-local.sh

# 2. Configure wallet
solana-keygen new --outfile ~/.config/solana/id.json
solana airdrop 2   # devnet SOL for gas

# 3. Deploy programs
./deploy.sh devnet

# 4. Initialize TxODDS subscription (free World Cup tier)
npx ts-node scripts/init-txodds.ts

# 5. Start spike detection pipeline
npx ts-node spikes/pipeline/detector.ts
```

## TxODDS Integration

| Feature | API Endpoint | Usage |
|---------|-------------|-------|
| Auth | `POST /auth/guest/start` | Get JWT |
| Subscribe | On-chain `subscribe()` | Free tier = service level 1 |
| Activate | `POST /api/token/activate` | Get API token |
| Odds Stream | `GET /api/odds/stream` | Real-time SSE |
| Odds Snapshot | `GET /api/odds/snapshot/{id}` | Current prices |
| Scores Stream | `GET /api/scores/stream` | Live match events |
| Validation | `GET /api/odds/validation` | Merkle proofs |

**Devnet Program ID:** `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`
**Mainnet Program ID:** `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA`

## Program Structure

```
txodds-hackathon/
├── kicktick/
│   ├── programs/kicktick/src/lib.rs    # Anchor program
│   ├── client/src/
│   │   ├── txodds-oracle.ts            # TxODDS API client
│   │   └── market-manager.ts           # High-level SDK
│   ├── tests/kicktick.ts               # Integration tests
│   ├── Cargo.toml
│   └── Anchor.toml
├── spikes/
│   ├── programs/spikes/src/lib.rs      # cNFT program
│   ├── pipeline/detector.ts            # Spike detection
│   ├── tests/
│   └── Cargo.toml
├── deploy.sh
├── setup-local.sh
└── README.md
```

## Security & Best Practices

- All settlements reference TxODDS Merkle proofs (on-chain verifiable)
- PDA-based vaults (no admin key exposure)
- Overflow checks enabled in release builds
- Cooldown periods prevent spam minting
- Grace periods for settlement (no front-running)

## Hackathon Tracks Covered

1. **Prediction Markets** — KickTick binary options with TxODDS settlement
2. **Trading Agents** — Spike detection pipeline can trigger automated trades
3. **Fan Engagement** — SPIKES collectible moments + album gamification
4. **Data Integrity** — All data validated against on-chain Merkle roots

## License

MIT
