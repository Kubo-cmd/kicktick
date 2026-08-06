import { describe, expect, it } from "vitest";
import { createAnchorClient, type AnchorTransactionAdapter } from "../src/clients/anchor-client.js";
import { loadConfig } from "../src/config.js";
import type { SettleProofArgs } from "../src/settlement/proof-gatherer.js";

const cfg = loadConfig({});

function mockAdapter() {
  const calls: { method: string; args: unknown }[] = [];
  const adapter: AnchorTransactionAdapter = {
    loadIdl: async (p: string) => { calls.push({ method: "loadIdl", args: p }); return {}; },
    openRound: async (a) => { calls.push({ method: "openRound", args: a }); return "sig-open"; },
    settleRound: async (a) => { calls.push({ method: "settleRound", args: a }); return "sig-settle"; },
    settleOffchainRound: async (a) => { calls.push({ method: "settleOffchainRound", args: a }); return "sig-offchain"; },
    confirmRound: async (a) => { calls.push({ method: "confirmRound", args: a }); return "sig-confirm"; },
  };
  return { adapter, calls };
}

describe("anchor-client", () => {
  it("loads the IDL from config path at construction", async () => {
    const { adapter, calls } = mockAdapter();
    await createAnchorClient(cfg, adapter);
    expect(calls).toEqual([{ method: "loadIdl", args: cfg.idlPath }]);
  });

  it("exposes program ids from config", async () => {
    const { adapter } = mockAdapter();
    const c = await createAnchorClient(cfg, adapter);
    expect(c.programId).toBe(cfg.kicktickProgramId);
    expect(c.txOracleProgramId).toBe(cfg.txOracleProgramId);
  });

  it("settleRound always pins the 1.4M compute-unit budget", async () => {
    const { adapter, calls } = mockAdapter();
    const c = await createAnchorClient(cfg, adapter);
    const proof = { mock: true } as unknown as SettleProofArgs;
    const sig = await c.settleRound({ matchPda: "m", roundId: 9, proof });
    expect(sig).toBe("sig-settle");
    expect(calls[1]).toMatchObject({
      method: "settleRound",
      args: { matchPda: "m", roundId: 9, computeUnitLimit: 1400000 },
    });
  });

  it("passes open/offchain/confirm through unchanged", async () => {
    const { adapter, calls } = mockAdapter();
    const c = await createAnchorClient(cfg, adapter);
    await c.openRound({ matchPda: "m", roundId: 1, marketType: "VARCheck", lockSeconds: 15, deadlineSeconds: 120 });
    await c.settleOffchainRound({ matchPda: "m", roundId: 1, outcome: "Yes", winner: 1 });
    await c.confirmRound({ matchPda: "m", roundId: 1 });
    expect(calls.slice(1).map(x => x.method)).toEqual(["openRound", "settleOffchainRound", "confirmRound"]);
    expect(calls[2]!.args).toMatchObject({ outcome: "Yes", winner: 1 });
  });

  it("propagates adapter loadIdl failure (fail closed on bad IDL)", async () => {
    const { adapter } = mockAdapter();
    adapter.loadIdl = async () => { throw new Error("IDL missing"); };
    await expect(createAnchorClient(cfg, adapter)).rejects.toThrow("IDL missing");
  });
});
