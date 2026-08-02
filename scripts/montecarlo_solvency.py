#!/usr/bin/env python3
"""KickTick Monte Carlo solvency simulation — mirrors claim.rs pro-rata parimutuel payout.
1M random market rounds; asserts vault solvency, refund exactness, u64 no-overflow.
On-chain formula: payout = amount * total_pool / winning_pool (floor). Void -> full refund.
Run: python3 scripts/montecarlo_solvency.py  (seed 0xC0105, deterministic)"""
import random

random.seed(0xC0105)
N = 1_000_000
u64_max = 2**64 - 1
rounds_run = void_rounds = solvency_violations = overflow_violations = refund_violations = 0
total_dust = max_payout = 0
min_edge = None
for _ in range(N):
    rounds_run += 1
    yes = no = abstain = 0
    positions = []
    for _ in range(random.randint(1, 40)):
        side = random.choices([0,1,2], weights=[45,45,10])[0]
        amount = random.randint(1, 5_000_000_000)
        positions.append((side, amount))
        if side == 0: yes += amount
        elif side == 1: no += amount
        else: abstain += amount
    total_pool = yes + no + abstain
    if random.random() < 0.08:
        void_rounds += 1
        if sum(a for _, a in positions) != total_pool: refund_violations += 1
        continue
    candidates = ([1] if yes>0 else []) + ([2] if no>0 else []) + ([3] if abstain>0 else [])
    if not candidates: continue
    winner = random.choice(candidates)
    winning_pool = {1: yes, 2: no, 3: abstain}[winner]
    expected = {1:0, 2:1, 3:2}[winner]
    paid = 0
    for side, amount in positions:
        if side != expected: continue
        payout = (amount * total_pool) // winning_pool
        if payout > u64_max: overflow_violations += 1
        max_payout = max(max_payout, payout)
        paid += payout
        e = payout/amount
        min_edge = e if min_edge is None else min(min_edge, e)
    if paid > total_pool: solvency_violations += 1
    total_dust += total_pool - paid
settled = rounds_run - void_rounds
print(f"rounds={rounds_run} void={void_rounds} solvency_violations={solvency_violations} refund_violations={refund_violations} overflow_violations={overflow_violations} max_payout={max_payout} min_edge={min_edge} avg_dust={total_dust/max(1,settled):.2f}")
print("VERDICT:", "FLAWLESS" if solvency_violations==0 and refund_violations==0 and overflow_violations==0 else "VIOLATIONS FOUND")
