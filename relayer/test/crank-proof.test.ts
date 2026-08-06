import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import { createCrank } from "../src/settlement/crank.js";
import { createProofGatherer, getStatKeysForMarket, type SettleProofArgs } from "../src/settlement/proof-gatherer.js";
import type { AnchorClient } from "../src/clients/anchor-client.js";
import type { TriggerAction } from "../src/market/triggers.js";

const base = { fixtureId: 7, matchPda: "m", roundId: 1, marketType: "NextGoalSide" as const };

function mockAnchor(impl: Partial<Record<string, (a: unknown) => Promise<string>>>) {
  const calls: { method: string; args: unknown }[] = [];
  const wrap = (m: string) => async (a: unknown) => {
    calls.push({ method: m, args: a });
    const fn = impl[m];
    if (fn) return fn(a);
    return `sig-${m}-${calls.length}`;
  };
  return {
    client: {
      openRound: wrap("openRound"),
      settleRound: wrap("settleRound"),
      settleOffchainRound: wrap("settleOffchainRound"),
      confirmRound: wrap("confirmRound"),
    } as unknown as AnchorClient,
    calls,
  };
}

const mockProof = { gatherProof: async () => ({ mock: true }) as unknown as SettleProofArgs };
const noSleep = () => Promise.resolve();

describe("crank", () => {
  it("open_round dispatches to anchor.openRound and confirms", async () => {
    const { client, calls } = mockAnchor({});
    const crank = createCrank(client, mockProof, { sleep: noSleep });
    const statuses: string[] = [];
    crank.events.on("status", s => statuses.push(s.status));
    const sig = await crank.executeAction({ ...base, type: "open_round", lockSeconds: 30, deadlineSeconds: 90 });
    expect(sig).toMatch(/^sig-openRound/);
    expect(calls.map(c => c.method)).toEqual(["openRound"]);
    expect(statuses).toEqual(["pending", "confirmed"]);
  });

  it("settle_onchain gathers proof then calls settleRound", async () => {
    const { client, calls } = mockAnchor({});
    let proofMarket: string | undefined;
    const proof = {
      gatherProof: async (_f: number, _q: number, m: string) => {
        proofMarket = m;
        return { mock: true } as unknown as SettleProofArgs;
      },
    };
    const crank = createCrank(client, proof, { sleep: noSleep });
    await crank.executeAction({ ...base, type: "settle_onchain", settlementSeq: 3 });
    expect(proofMarket).toBe("NextGoalSide");
    expect(calls.map(c => c.method)).toEqual(["settleRound"]);
    expect(calls[0]!.args).toMatchObject({ roundId: 1, proof: { mock: true } });
  });

  it("settle_offchain maps outcome Yes->winner 1, No->winner 2", async () => {
    const { client, calls } = mockAnchor({});
    const crank = createCrank(client, mockProof, { sleep: noSleep });
    await crank.executeAction({ ...base, type: "settle_offchain", outcome: "Yes" });
    await crank.executeAction({ ...base, type: "settle_offchain", outcome: "No" });
    expect(calls[0]!.args).toMatchObject({ outcome: "Yes", winner: 1 });
    expect(calls[1]!.args).toMatchObject({ outcome: "No", winner: 2 });
  });

  it("retries on transient failure and eventually succeeds", async () => {
    let attempts = 0;
    const { client } = mockAnchor({
      openRound: async () => {
        attempts++;
        if (attempts < 3) throw new Error("blockhash not found");
        return "sig-ok";
      },
    });
    const crank = createCrank(client, mockProof, { sleep: noSleep, maxRetries: 3 });
    const sig = await crank.executeAction({ ...base, type: "open_round", lockSeconds: 30, deadlineSeconds: 90 });
    expect(sig).toBe("sig-ok");
    expect(attempts).toBe(3);
  });

  it("fails after maxRetries and emits failed status", async () => {
    const { client } = mockAnchor({
      confirmRound: async () => { throw new Error("permanent"); },
    });
    const crank = createCrank(client, mockProof, { sleep: noSleep, maxRetries: 2 });
    const statuses: string[] = [];
    crank.events.on("status", s => statuses.push(s.status));
    await expect(crank.executeAction({ ...base, type: "confirm_round" })).rejects.toThrow("permanent");
    expect(statuses).toEqual(["pending", "failed"]);
  });
});

describe("proof-gatherer", () => {
  it("rejects off-chain market types", () => {
    expect(() => getStatKeysForMarket("PenaltyShot")).toThrow(/off-chain/);
    expect(() => getStatKeysForMarket("VARCheck")).toThrow(/off-chain/);
  });

  it("PenaltyShootoutShot uses period 5000, others period 0", async () => {
    const periods: number[] = [];
    const client = {
      getStatValidation: async (r: { period: number }) => {
        periods.push(r.period);
        return { ts: 0, fixtureSummary: {}, statProof: [], fixtureProof: [], mainTreeProof: [], value: 0 };
      },
    };
    const assembler = { assemble: () => ({} as SettleProofArgs) };
    const g = createProofGatherer(client, assembler);
    await g.gatherProof(1, 0, "PenaltyShootoutShot");
    await g.gatherProof(1, 0, "GoalInWindow");
    expect(periods).toEqual([5000, 5000, 0]); // shootout has 2 stat keys
  });

  it("fetches one validation per stat key, in order", async () => {
    const keys: number[] = [];
    const client = {
      getStatValidation: async (r: { statKey: number }) => {
        keys.push(r.statKey);
        return { ts: 0, fixtureSummary: {}, statProof: [], fixtureProof: [], mainTreeProof: [], value: 0 };
      },
    };
    const assembler = { assemble: () => ({} as SettleProofArgs) };
    const g = createProofGatherer(client, assembler);
    await g.gatherProof(1, 0, "NextGoalSide");
    expect(keys).toEqual([1, 2]);
    await g.gatherProof(1, 0, "NextCorner");
    expect(keys).toEqual([1, 2, 7, 8]);
  });
});
