# KickTick — Superteam World Cup Submission Pack

**Hackathon:** World Cup (Superteam Earn × TxODDS)  
**Track:** Prediction Markets and Settlement — **$18,000 USDT**  
**Deadline:** 2026-07-19 23:59:59 UTC  
**Repo:** https://github.com/Kubo-cmd/kicktick

## Eligibility fields (Earn form)

1. Link to live & working MVP (public)
2. Link to live demo video (YouTube / Loom — public)
3. Link to public repository → `https://github.com/Kubo-cmd/kicktick`
4. Optional: project X profile / post

## Product one-liner

Sub-minute micro prediction markets on Solana. Create + settle markets in under 60 seconds using live TxODDS odds and on-chain Merkle proof settlement (CPI to `txoracle`).

## What judges should see

| Layer | Proof |
|-------|--------|
| On-chain | Anchor program: open_round → place_bet → settle_round (CPI) → claim |
| Oracle | TxLINE SSE + Merkle validation path via relayer |
| Off-chain | Relayer crank + WebSocket |
| UI | Vite frontend (wallet, market cards, live odds) |
| Tests | `npm run simulation` → 22/22 |

## Local verify (reviewer)

```bash
git clone https://github.com/Kubo-cmd/kicktick.git
cd kicktick
npm run simulation          # 22/22 pure logic
./setup-local.sh            # deps + optional anchor
cd frontend && npm run dev  # UI
```

## Program IDs (devnet)

| Component | Address |
|-----------|---------|
| KickTick | `a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2` |
| TxOracle | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |

## Still open before submit

- [ ] Public live MVP URL (frontend deploy + relayer host)
- [ ] ≤2–3 min demo video (create market → bet → settle → claim)
- [ ] Optional X post
- [ ] Submit on Superteam Earn under **Prediction Markets and Settlement**

## Sister tracks (if multi-entry)

- Trading Tools and Agents ($16k) — agent/relayer angle
- Consumer and Fan Experiences ($16k) — fan UI / match moments

PATTERN PERSISTS.
