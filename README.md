# KickTick: Sub-Minute Micro Prediction Markets on Solana

Create and settle prediction markets in **under 60 seconds** using live TxODDS odds data + on-chain Merkle proof settlement.

**Market types:**
- `odds_spike` — Will odds move >X% in the next N seconds?
- `next_goal` — Which team scores next?
- `next_card` — Card in next 5 minutes?
- `over_under_corners` — Corners in next N minutes?
- `match_result` — Short-format winner

**Key Features**
- TxODDS oracle integration (stable de-margined odds)
- Merkle proof validation against `txoracle` program
- Fast settlement on Solana
- Sub-minute market lifecycles (15s – 5min)
- PDA vaults + on-chain position tracking

## Architecture

```
+------------------------------------------------------------------+
|                     FRONTEND (Next.js)                           |
|  +------------------+  +------------------+                      |
|  |   KickTick UI    |  |   Live Odds Feed |                      |
|  +--------+---------+  +--------+---------+                      |
+-----------+---------------------+--------------------------------+
            |                     |
            v                     v
+------------------------------------------------------------------+
|                   SDK / CLIENT (TypeScript)                      |
|  +------------------+  +------------------+                      |
|  | KickTickManager  |  |  TxOddsClient    |                      |
|  | (create/bet/settle) |  + Merkle proofs  |                     |
|  +------------------+  +------------------+                      |
+-----------+---------------------+--------------------------------+
            |                                              
            v
+------------------------------------------------------------------+
|                    SOLANA (Anchor)                               |
|                                                                  |
|  kicktick program                                                |
|  - create_market                                                 |
|  - place_bet                                                     |
|  - settle_market (TxODDS + proof)                                |
|  - claim_winnings                                                |
|  - cancel / refund                                               |
|                                                                  |
+------------------------------------------------------------------+
                             |
                             v
+------------------------------------------------------------------+
|                  TxODDS ORACLE (txoracle program)                |
|                                                                  |
|   - Merkle roots published on-chain                              |
|   - Cryptographic proof validation for settlement                |
|   - Live odds + scores via SSE                                   |
|   - Free World Cup tier                                          |
|                                                                  |
+------------------------------------------------------------------+
```

## Quick Start

```bash
# 1. Clone and setup (on kicktick-only branch)
git clone https://github.com/Kubo-cmd/kicktick.git
cd kicktick
git checkout kicktick-only
./setup-local.sh

# 2. Configure wallet (devnet)
solana-keygen new --outfile ~/.config/solana/id.json
solana airdrop 2

# 3. (Optional) Deploy program
./deploy.sh devnet

# 4. Start the frontend
cd frontend
npm run dev
```

Open http://localhost:3000 — create markets, place bets (demo), watch live odds.

## TxODDS Integration

| Feature         | Usage                              |
|-----------------|------------------------------------|
| Auth            | Guest JWT via TxODDS API           |
| Subscribe       | On-chain subscribe (free tier)     |
| Odds Stream     | SSE real-time updates              |
| Snapshot        | Current stable (de-margined) prices|
| Settlement      | Merkle proof vs on-chain root      |

**Devnet TxODDS Oracle:** `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`  
**KickTick Program ID (placeholder):** `KTCKiCkTiCkTiCkTiCkTiCkTiCkTiCkTiCkTiCkTiCk`

## Repository Structure

```
kicktick/
├── README.md
├── deploy.sh
├── setup-local.sh
├── simulation.ts              # Settlement & spike detection tests
├── simulation.js
├── frontend/                  # Next.js UI
│   ├── app/
│   ├── components/
│   └── lib/
└── kicktick/                  # Anchor workspace
    ├── Anchor.toml
    ├── programs/kicktick/
    │   └── src/lib.rs         # On-chain program
    ├── client/
    │   ├── src/
    │   │   ├── txodds-oracle.ts   # TxODDS + SpikeDetector
    │   │   └── market-manager.ts  # High-level SDK
    │   └── package.json
    └── tests/kicktick.ts
```

## Market Lifecycle (Sub-60s)

1. Create market (specify type + short duration)
2. Users place YES/NO bets (USDT)
3. Market expires (15s–5m)
4. Settle using TxODDS data + proof → outcome Yes/No
5. Winners claim from vault

`odds_spike` markets use the built-in `SpikeDetector` (15% threshold by default) in the client.

## Running Simulations

```bash
# TypeScript
npx ts-node simulation.ts

# or JS
node simulation.js
```

These demonstrate settlement logic for all market types without requiring a full chain.

## Security Notes

- All settlements reference verifiable TxODDS Merkle data
- PDA-controlled vaults (no privileged withdrawal keys)
- Strict duration + overflow checks in program
- Grace period for settlement calls

## License

MIT
