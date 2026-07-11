---
id: program-deploy
type: howto
title: "Deploy to Solana"
service: program
depends_on:
  - program-readme
  - program-build
related_to:
  - program-architecture
  - operations-workflows
tags: [deploy, devnet, mainnet, docker, priority-fee]
---

# Deploy to Solana

## Prerequisites

| Requirement | Purpose |
|-------------|---------|
| Docker | Build and run deployment environment |
| SOL on deployer wallet | Pay for program account + tx fees |
| `kicktick/kicktick-deployer.json` | Deployer keypair |

Get devnet SOL: `solana airdrop 2 --url devnet`

---

## Quick Start

```bash
# Deploy to devnet (default)
./scripts/deploy.sh

# Deploy to mainnet
./scripts/deploy.sh mainnet

# Custom priority fee (micro-lamports/CU)
./scripts/deploy.sh devnet 15000
```

---

## Priority Fee

**Parameter:** `--with-compute-unit-price <value>`

**Why needed:** Devnet can be congested. Without priority fee, deploy transactions may hang.

**Default:** 10000 micro-lamports/CU

**How to choose:**
- Monitor network: `solana fees --url devnet`
- Higher value = faster inclusion, higher cost
- Typical range: 5000–50000 micro-lamports/CU

---

## Idempotency Checks

The deploy script performs two checks to avoid redundant operations:

| Check | Location | Behavior |
|-------|----------|----------|
| Program exists | `solana program show <ID>` | Skip deploy if already exists |
| Config PDA initialized | `init-kicktick.ts:60-64` | Skip init if PDA exists |

---

## What Happens

1. **Build Docker image** (if not exists) via `scripts/build.sh contracts`
2. **Get program ID** from `target/deploy/kicktick-keypair.json`
3. **Check program status** on target network
4. **Build & deploy** inside Docker container:
   - `anchor build`
   - `anchor deploy --provider.cluster <network> -- --with-compute-unit-price <fee>`
5. **Initialize Config PDA** via `scripts/init-kicktick.ts` (idempotent)
6. **Save deployment info** to `deployment-<network>.json`

---

## Artifacts

After deploy:

| File | Purpose |
|------|---------|
| `deployment-devnet.json` | Network, program IDs, timestamp |
| `target/deploy/kicktick.so` | Compiled program binary |
| `target/deploy/kicktick-keypair.json` | Program keypair |

---

## Update Program ID

After first deploy, update program ID in 4 places:

| File | Line | Field |
|------|------|-------|
| `programs/kicktick/src/lib.rs` | 8 | `declare_id!("...")` |
| `frontend/lib/constants.ts` | 10 | `kicktickProgramId` |
| `relayer/.env` | — | `KICKTICK_PROGRAM_ID` |
| `kicktick/Anchor.toml` | 8 | `kicktick = "..."` |

---

## Troubleshooting

### Deploy hangs

**Cause:** Network congestion, no priority fee.

**Fix:** Increase priority fee:
```bash
./scripts/deploy.sh devnet 20000
```

### Insufficient SOL

**Error:** `Account not found` or `Insufficient funds`

**Fix:** Airdrop devnet SOL:
```bash
solana airdrop 2 --url devnet
```

### Docker image not found

**Error:** `No such image: kicktick-contracts:dev`

**Fix:** Build contracts image:
```bash
./scripts/build.sh contracts
```

### Config PDA already initialized

**Message:** `Config already initialized. Skipping.`

**Normal:** This is expected on re-deploy. The init script is idempotent.

---

## Related Docs

- `program/BUILD.md` — build and test locally
- `operations/WORKFLOWS.md` — full deploy cycle
- `operations/TROUBLESHOOTING.md` — error codes and fixes
