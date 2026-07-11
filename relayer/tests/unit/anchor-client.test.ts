import { expect } from "chai";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import {
  DEFAULT_KICKTICK_PROGRAM_ID,
  DEFAULT_TXORACLE_PROGRAM_ID,
} from "../../src/config";
import {
  AnchorClient,
  AnchorClientError,
  MarketType,
  SettleProofArgs,
} from "../../src/clients/anchor-client";

function camelCase(s: string): string {
  const match = s.match(/^([A-Z]+)([A-Z][a-z])/);
  if (match) {
    return match[1].toLowerCase() + match[2] + s.slice(match[0].length);
  }
  return s.charAt(0).toLowerCase() + s.slice(1);
}

const PROGRAM_ID = DEFAULT_KICKTICK_PROGRAM_ID;
const TXORACLE_PROGRAM_ID = DEFAULT_TXORACLE_PROGRAM_ID;

function toLeBytes64(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function makeClient(overrides?: {
  sendAndConfirm?: (tx: any) => Promise<string>;
  methodsOverride?: Record<string, (...args: any[]) => any>;
}): AnchorClient {
  const client = Object.create(AnchorClient.prototype);

  const walletKp = Keypair.generate();
  const walletPubkey = walletKp.publicKey;

  const capturedCalls: any[] = [];

  const defaultMethods: Record<string, (...args: any[]) => any> = {
    openRound: (...args: any[]) => ({
      accountsStrict: (accts: any) => ({
        transaction: () => {
          capturedCalls.push({ method: "openRound", args, accounts: accts });
          return { instructions: [] };
        },
      }),
    }),
    settleOffchainRound: (...args: any[]) => ({
      accountsStrict: (accts: any) => ({
        transaction: () => {
          capturedCalls.push({ method: "settleOffchainRound", args, accounts: accts });
          return { instructions: [] };
        },
      }),
    }),
    settleRound: (...args: any[]) => ({
      accountsStrict: (accts: any) => ({
        transaction: () => {
          capturedCalls.push({ method: "settleRound", args, accounts: accts });
          return { instructions: [] };
        },
      }),
    }),
    confirmRound: (...args: any[]) => ({
      accountsStrict: (accts: any) => ({
        transaction: () => {
          capturedCalls.push({ method: "confirmRound", args, accounts: accts });
          return { instructions: [] };
        },
      }),
    }),
    cancelRound: (...args: any[]) => ({
      accountsStrict: (accts: any) => ({
        transaction: () => {
          capturedCalls.push({ method: "cancelRound", args, accounts: accts });
          return { instructions: [] };
        },
      }),
    }),
  };

  const methods = overrides?.methodsOverride || defaultMethods;

  (client as any).program = {
    programId: PROGRAM_ID,
    methods,
  };

  (client as any).provider = {
    wallet: { publicKey: walletPubkey },
    sendAndConfirm: overrides?.sendAndConfirm || (async () => "mock-tx-sig"),
  };

  (client as any).config = {
    kicktickProgramId: PROGRAM_ID,
    txoracleProgramId: TXORACLE_PROGRAM_ID,
  };

  (client as any)._capturedCalls = capturedCalls;

  return client;
}

// ── PDA Derivation ──

describe("AnchorClient – PDA derivation", () => {
  it("deriveMatchPda uses seed [\"match\", fixtureId_le_bytes]", () => {
    const fixtureId = 12345;
    const [pda, bump] = AnchorClient.deriveMatchPda(fixtureId, PROGRAM_ID);

    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("match"), toLeBytes64(fixtureId)],
      PROGRAM_ID,
    );

    expect(pda.toBase58()).to.equal(expected.toBase58());
    expect(bump).to.equal(expectedBump);
  });

  it("deriveRoundPda uses seed [\"round\", matchPda_bytes, roundId_le_bytes]", () => {
    const fixtureId = 100;
    const [matchPda] = AnchorClient.deriveMatchPda(fixtureId, PROGRAM_ID);
    const roundId = 42;

    const [pda, bump] = AnchorClient.deriveRoundPda(matchPda, roundId, PROGRAM_ID);

    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("round"), matchPda.toBuffer(), toLeBytes64(roundId)],
      PROGRAM_ID,
    );

    expect(pda.toBase58()).to.equal(expected.toBase58());
    expect(bump).to.equal(expectedBump);
  });

  it("deriveConfigPda uses seed [\"config\"]", () => {
    const [pda, bump] = AnchorClient.deriveConfigPda(PROGRAM_ID);

    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      PROGRAM_ID,
    );

    expect(pda.toBase58()).to.equal(expected.toBase58());
    expect(bump).to.equal(expectedBump);
  });

  it("deriveDailyScoresRootsPda uses seed [\"daily_scores_roots\"]", () => {
    const [pda, bump] = AnchorClient.deriveDailyScoresRootsPda(TXORACLE_PROGRAM_ID);

    const [expected, expectedBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("daily_scores_roots")],
      TXORACLE_PROGRAM_ID,
    );

    expect(pda.toBase58()).to.equal(expected.toBase58());
    expect(bump).to.equal(expectedBump);
  });

  it("different fixtureIds produce different match PDAs", () => {
    const [pda1] = AnchorClient.deriveMatchPda(1, PROGRAM_ID);
    const [pda2] = AnchorClient.deriveMatchPda(2, PROGRAM_ID);
    expect(pda1.toBase58()).to.not.equal(pda2.toBase58());
  });

  it("different roundIds produce different round PDAs", () => {
    const [matchPda] = AnchorClient.deriveMatchPda(1, PROGRAM_ID);
    const [r1] = AnchorClient.deriveRoundPda(matchPda, 1, PROGRAM_ID);
    const [r2] = AnchorClient.deriveRoundPda(matchPda, 2, PROGRAM_ID);
    expect(r1.toBase58()).to.not.equal(r2.toBase58());
  });
});

// ── Transaction Building ──

describe("AnchorClient – openRound", () => {
  it("calls program.methods.openRound with correct args and accounts", async () => {
    let capturedArgs: any[] = [];
    let capturedAccounts: any = {};

    const client = makeClient({
      methodsOverride: {
        openRound: (...args: any[]) => {
          capturedArgs = args;
          return {
            accountsStrict: (accts: any) => {
              capturedAccounts = accts;
              return { transaction: () => ({ instructions: [] }) };
            },
          };
        },
      },
    });

    const fixtureId = 999;
    const [matchPda] = AnchorClient.deriveMatchPda(fixtureId, PROGRAM_ID);
    const roundId = 7;
    const marketType: MarketType = "NextGoalSide";

    await client.openRound(roundId, marketType, 60, 120, matchPda);

    expect(capturedArgs).to.have.length(4);
    expect(capturedArgs[0]).to.be.instanceOf(BN);
    expect(capturedArgs[0].toNumber()).to.equal(7);
    expect(capturedArgs[1]).to.deep.equal({ nextGoalSide: {} });
    expect(capturedArgs[2].toNumber()).to.equal(60);
    expect(capturedArgs[3].toNumber()).to.equal(120);

    const [roundPda] = AnchorClient.deriveRoundPda(matchPda, roundId, PROGRAM_ID);
    expect(capturedAccounts.authority.toBase58()).to.equal(
      (client as any).provider.wallet.publicKey.toBase58(),
    );
    expect(capturedAccounts.matchPda.toBase58()).to.equal(matchPda.toBase58());
    expect(capturedAccounts.round.toBase58()).to.equal(roundPda.toBase58());
    expect(capturedAccounts.systemProgram.toBase58()).to.equal(
      SystemProgram.programId.toBase58(),
    );
  });

  it("maps all market type enums correctly", async () => {
    const marketTypes: MarketType[] = [
      "NextGoalSide", "GoalInWindow", "NextCorner", "CornerInWindow",
      "NextYellowCard", "YellowCardInWindow", "RedCardInMatch",
      "PenaltyShootoutShot", "PenaltyShot", "VARCheck",
    ];

    for (const mt of marketTypes) {
      let capturedEnum: any;
      const client = makeClient({
        methodsOverride: {
          openRound: (...args: any[]) => {
            capturedEnum = args[1];
            return {
              accountsStrict: () => ({ transaction: () => ({ instructions: [] }) }),
            };
          },
        },
      });
      const [matchPda] = AnchorClient.deriveMatchPda(1, PROGRAM_ID);
      await client.openRound(1, mt, 60, 120, matchPda);
      expect(capturedEnum).to.deep.equal({ [camelCase(mt)]: {} });
    }
  });
});

describe("AnchorClient – settleOffchainRound", () => {
  it("passes outcome enum and winner BN correctly", async () => {
    let capturedArgs: any[] = [];
    let capturedAccounts: any = {};

    const client = makeClient({
      methodsOverride: {
        settleOffchainRound: (...args: any[]) => {
          capturedArgs = args;
          return {
            accountsStrict: (accts: any) => {
              capturedAccounts = accts;
              return { transaction: () => ({ instructions: [] }) };
            },
          };
        },
      },
    });

    const [matchPda] = AnchorClient.deriveMatchPda(100, PROGRAM_ID);
    await client.settleOffchainRound(5, matchPda, "Yes", 42);

    expect(capturedArgs[0]).to.deep.equal({ yes: {} });
    expect(capturedArgs[1]).to.be.instanceOf(BN);
    expect(capturedArgs[1].toNumber()).to.equal(42);

    const [roundPda] = AnchorClient.deriveRoundPda(matchPda, 5, PROGRAM_ID);
    expect(capturedAccounts.caller.toBase58()).to.equal(
      (client as any).provider.wallet.publicKey.toBase58(),
    );
    expect(capturedAccounts.matchPda.toBase58()).to.equal(matchPda.toBase58());
    expect(capturedAccounts.round.toBase58()).to.equal(roundPda.toBase58());
  });

  it("handles 'No' outcome", async () => {
    let capturedEnum: any;
    const client = makeClient({
      methodsOverride: {
        settleOffchainRound: (...args: any[]) => {
          capturedEnum = args[0];
          return {
            accountsStrict: () => ({ transaction: () => ({ instructions: [] }) }),
          };
        },
      },
    });
    const [matchPda] = AnchorClient.deriveMatchPda(1, PROGRAM_ID);
    await client.settleOffchainRound(1, matchPda, "No", 0);
    expect(capturedEnum).to.deep.equal({ no: {} });
  });
});

describe("AnchorClient – settleRound", () => {
  const makeProofArgs = (): SettleProofArgs => ({
    ts: 1700000000,
    fixtureSummary: {
      fixtureId: 42,
      updateStats: { updateCount: 10, minTimestamp: 100, maxTimestamp: 200 },
      eventsSubTreeRoot: [1, 2, 3, 4],
    },
    fixtureProof: [{ hash: [5, 6], isRightSibling: true }],
    mainTreeProof: [{ hash: [7, 8], isRightSibling: false }],
    predicate: { threshold: 3, comparison: "GreaterThan" },
    statA: {
      statToProve: { key: 1, value: 5, period: 0 },
      eventStatRoot: [9, 10],
      statProof: [{ hash: [11, 12], isRightSibling: true }],
    },
  });

  it("encodes ValidateStatArgs with correct snake_case fields", async () => {
    let capturedArgs: any;

    const client = makeClient({
      methodsOverride: {
        settleRound: (args: any) => {
          capturedArgs = args;
          return {
            accountsStrict: () => ({ transaction: () => ({ instructions: [] }) }),
          };
        },
      },
    });

    const [matchPda] = AnchorClient.deriveMatchPda(42, PROGRAM_ID);
    await client.settleRound(1, matchPda, makeProofArgs());

    expect(capturedArgs.ts).to.be.instanceOf(BN);
    expect(capturedArgs.ts.toNumber()).to.equal(1700000000);

    expect(capturedArgs.fixture_summary.fixture_id.toNumber()).to.equal(42);
    expect(capturedArgs.fixture_summary.update_stats.update_count.toNumber()).to.equal(10);
    expect(capturedArgs.fixture_summary.update_stats.min_timestamp.toNumber()).to.equal(100);
    expect(capturedArgs.fixture_summary.update_stats.max_timestamp.toNumber()).to.equal(200);
    expect(capturedArgs.fixture_summary.events_sub_tree_root).to.deep.equal([1, 2, 3, 4]);

    expect(capturedArgs.fixture_proof).to.deep.equal([
      { hash: [5, 6], is_right_sibling: true },
    ]);
    expect(capturedArgs.main_tree_proof).to.deep.equal([
      { hash: [7, 8], is_right_sibling: false },
    ]);

    expect(capturedArgs.predicate.threshold.toNumber()).to.equal(3);
    expect(capturedArgs.predicate.comparison).to.deep.equal({ greaterThan: {} });

    expect(capturedArgs.stat_a.stat_to_prove.key.toNumber()).to.equal(1);
    expect(capturedArgs.stat_a.stat_to_prove.value.toNumber()).to.equal(5);
    expect(capturedArgs.stat_a.stat_to_prove.period.toNumber()).to.equal(0);
    expect(capturedArgs.stat_a.event_stat_root).to.deep.equal([9, 10]);

    expect(capturedArgs.stat_b).to.be.null;
    expect(capturedArgs.op).to.be.null;
  });

  it("encodes statB and op when provided", async () => {
    let capturedArgs: any;

    const client = makeClient({
      methodsOverride: {
        settleRound: (args: any) => {
          capturedArgs = args;
          return {
            accountsStrict: () => ({ transaction: () => ({ instructions: [] }) }),
          };
        },
      },
    });

    const [matchPda] = AnchorClient.deriveMatchPda(42, PROGRAM_ID);
    const proofArgs = makeProofArgs();
    proofArgs.statB = {
      statToProve: { key: 2, value: 10, period: 1 },
      eventStatRoot: [13, 14],
      statProof: [{ hash: [15, 16], isRightSibling: false }],
    };
    proofArgs.op = "Add";

    await client.settleRound(1, matchPda, proofArgs);

    expect(capturedArgs.stat_b.stat_to_prove.key.toNumber()).to.equal(2);
    expect(capturedArgs.stat_b.stat_to_prove.value.toNumber()).to.equal(10);
    expect(capturedArgs.stat_b.stat_to_prove.period.toNumber()).to.equal(1);
    expect(capturedArgs.stat_b.event_stat_root).to.deep.equal([13, 14]);
    expect(capturedArgs.stat_b.stat_proof).to.deep.equal([
      { hash: [15, 16], is_right_sibling: false },
    ]);

    expect(capturedArgs.op).to.deep.equal({ add: {} });
  });

  it("includes dailyScoresMerkleRoots and txoracleProgram in accounts", async () => {
    let capturedAccounts: any;

    const client = makeClient({
      methodsOverride: {
        settleRound: () => ({
          accountsStrict: (accts: any) => {
            capturedAccounts = accts;
            return { transaction: () => ({ instructions: [] }) };
          },
        }),
      },
    });

    const [matchPda] = AnchorClient.deriveMatchPda(42, PROGRAM_ID);
    await client.settleRound(1, matchPda, makeProofArgs());

    const [dailyScoresPda] = AnchorClient.deriveDailyScoresRootsPda(TXORACLE_PROGRAM_ID);
    expect(capturedAccounts.dailyScoresMerkleRoots.toBase58()).to.equal(
      dailyScoresPda.toBase58(),
    );
    expect(capturedAccounts.txoracleProgram.toBase58()).to.equal(
      TXORACLE_PROGRAM_ID.toBase58(),
    );
  });

  it("maps comparison enums correctly", async () => {
    for (const comp of ["GreaterThan", "LessThan", "EqualTo"] as const) {
      let capturedComparison: any;
      const client = makeClient({
        methodsOverride: {
          settleRound: (args: any) => {
            capturedComparison = args.predicate.comparison;
            return {
              accountsStrict: () => ({ transaction: () => ({ instructions: [] }) }),
            };
          },
        },
      });
      const [matchPda] = AnchorClient.deriveMatchPda(1, PROGRAM_ID);
      const pa = makeProofArgs();
      pa.predicate.comparison = comp;
      await client.settleRound(1, matchPda, pa);

      const expected = comp === "GreaterThan" ? "greaterThan"
        : comp === "LessThan" ? "lessThan" : "equalTo";
      expect(capturedComparison).to.deep.equal({ [expected]: {} });
    }
  });
});

describe("AnchorClient – confirmRound", () => {
  it("passes correct accounts", async () => {
    let capturedAccounts: any;

    const client = makeClient({
      methodsOverride: {
        confirmRound: () => ({
          accountsStrict: (accts: any) => {
            capturedAccounts = accts;
            return { transaction: () => ({ instructions: [] }) };
          },
        }),
      },
    });

    const [matchPda] = AnchorClient.deriveMatchPda(50, PROGRAM_ID);
    await client.confirmRound(3, matchPda);

    const [roundPda] = AnchorClient.deriveRoundPda(matchPda, 3, PROGRAM_ID);
    expect(capturedAccounts.caller.toBase58()).to.equal(
      (client as any).provider.wallet.publicKey.toBase58(),
    );
    expect(capturedAccounts.matchPda.toBase58()).to.equal(matchPda.toBase58());
    expect(capturedAccounts.round.toBase58()).to.equal(roundPda.toBase58());
  });
});

describe("AnchorClient – cancelRound", () => {
  it("passes correct accounts including config PDA", async () => {
    let capturedAccounts: any;

    const client = makeClient({
      methodsOverride: {
        cancelRound: () => ({
          accountsStrict: (accts: any) => {
            capturedAccounts = accts;
            return { transaction: () => ({ instructions: [] }) };
          },
        }),
      },
    });

    const [matchPda] = AnchorClient.deriveMatchPda(50, PROGRAM_ID);
    await client.cancelRound(3, matchPda);

    const [roundPda] = AnchorClient.deriveRoundPda(matchPda, 3, PROGRAM_ID);
    const [configPda] = AnchorClient.deriveConfigPda(PROGRAM_ID);

    expect(capturedAccounts.caller.toBase58()).to.equal(
      (client as any).provider.wallet.publicKey.toBase58(),
    );
    expect(capturedAccounts.config.toBase58()).to.equal(configPda.toBase58());
    expect(capturedAccounts.matchPda.toBase58()).to.equal(matchPda.toBase58());
    expect(capturedAccounts.round.toBase58()).to.equal(roundPda.toBase58());
  });
});

// ── Error Handling ──

describe("AnchorClient – error handling", () => {
  it("throws AnchorClientError on transaction failure", async () => {
    const client = makeClient({
      sendAndConfirm: async () => {
        const err: any = new Error("Tx failed");
        err.logs = ["Program log: Error Code: AccountNotInitialized"];
        throw err;
      },
    });

    const [matchPda] = AnchorClient.deriveMatchPda(1, PROGRAM_ID);

    try {
      await client.confirmRound(1, matchPda);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorClientError);
      expect((err as AnchorClientError).message).to.include("Error Code: AccountNotInitialized");
      expect((err as AnchorClientError).logs).to.be.an("array");
    }
  });

  it("throws AnchorClientError with generic message when no anchor log found", async () => {
    const client = makeClient({
      sendAndConfirm: async () => {
        throw new Error("generic failure");
      },
    });

    const [matchPda] = AnchorClient.deriveMatchPda(1, PROGRAM_ID);

    try {
      await client.confirmRound(1, matchPda);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).to.be.instanceOf(AnchorClientError);
      expect((err as AnchorClientError).message).to.include("Transaction failed");
    }
  });

  it("AnchorClientError has correct name property", () => {
    const err = new AnchorClientError("test", ["log1"]);
    expect(err.name).to.equal("AnchorClientError");
    expect(err.message).to.equal("test");
    expect(err.logs).to.deep.equal(["log1"]);
  });
});
