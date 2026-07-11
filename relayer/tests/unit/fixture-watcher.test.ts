import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { FixtureWatcher, MatchState } from "../../src/market/fixture-watcher";
import {
  SoccerAction,
  StatusId,
  GoalType,
} from "../../src/market/event-parser";
import { DEFAULT_KICKTICK_PROGRAM_ID } from "../../src/config";
import type { Config } from "../../src/config";
import type { TxLineClient } from "../../src/clients/txline-client";
import type { FixtureRecord, ScoresRecord } from "@swingkiddo/txodds-client/dist/types";

const PROGRAM_ID = DEFAULT_KICKTICK_PROGRAM_ID;
const FIXTURE_ID = 42;

function makeConfig(): Config {
  return {
    txlineJwt: "",
    txlineApiToken: "",
    txlineApiHost: "https://txline-dev.txodds.com",
    solanaRpcUrl: "https://api.devnet.solana.com",
    solanaKeypairPath: "",
    kicktickProgramId: PROGRAM_ID,
    txoracleProgramId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    usdtMint: new PublicKey("ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh"),
    txlMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
    wsPort: 8080,
    competitionId: 72,
  };
}

function makeMockClient(opts?: {
  scores?: ScoresRecord[];
  fixtures?: FixtureRecord[];
  fixturesThrow?: boolean;
}): TxLineClient {
  const scores = opts?.scores ?? [];
  const fixtures = opts?.fixtures ?? [];
  const fixturesThrow = opts?.fixturesThrow ?? false;

  return {
    getScoresSnapshot: async (_fixtureId: number) => scores,
    getFixtures: async (_competitionId?: number) => {
      if (fixturesThrow) throw new Error("fixtures fetch failed");
      return fixtures;
    },
  } as unknown as TxLineClient;
}

function makeFixtureRecord(overrides?: Partial<FixtureRecord>): FixtureRecord {
  return {
    FixtureId: FIXTURE_ID,
    CompetitionId: 72,
    StartTime: 1700000000,
    Participant1: "Home Team",
    Participant2: "Away Team",
    Participant1IsHome: true,
    ...overrides,
  } as FixtureRecord;
}

function makeScoresRecord(overrides?: Omit<Partial<ScoresRecord>, "gameState"> & { gameState?: number | string }): ScoresRecord {
  return {
    fixtureId: FIXTURE_ID,
    gameState: "NS" as unknown as number,
    homeScore: 0,
    awayScore: 0,
    ts: 1700000,
    ...overrides,
    ...(overrides?.gameState != null ? { gameState: overrides.gameState as unknown as number } : {}),
  } as ScoresRecord;
}

describe("FixtureWatcher", () => {
  let config: Config;

  beforeEach(() => {
    config = makeConfig();
  });

  // ── 1. PDA derivation ──

  describe("PDA derivation", () => {
    it("deriveMatchPda uses seed ['match', fixtureId_le_bytes]", () => {
      const [pda, bump] = FixtureWatcher.deriveMatchPda(FIXTURE_ID, PROGRAM_ID);

      const buf = Buffer.alloc(8);
      buf.writeBigUInt64LE(BigInt(FIXTURE_ID));
      const [expected, expectedBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("match"), buf],
        PROGRAM_ID,
      );

      expect(pda.equals(expected)).to.be.true;
      expect(bump).to.equal(expectedBump);
    });

    it("deriveRoundPda uses seed ['round', matchPda_bytes, roundId_le_bytes]", () => {
      const [matchPda] = FixtureWatcher.deriveMatchPda(FIXTURE_ID, PROGRAM_ID);
      const roundId = 3;

      const [pda, bump] = FixtureWatcher.deriveRoundPda(matchPda, roundId, PROGRAM_ID);

      const roundBuf = Buffer.alloc(8);
      roundBuf.writeBigUInt64LE(BigInt(roundId));
      const [expected, expectedBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("round"), matchPda.toBuffer(), roundBuf],
        PROGRAM_ID,
      );

      expect(pda.equals(expected)).to.be.true;
      expect(bump).to.equal(expectedBump);
    });

    it("deriveConfigPda uses seed ['config']", () => {
      const [pda, bump] = FixtureWatcher.deriveConfigPda(PROGRAM_ID);

      const [expected, expectedBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        PROGRAM_ID,
      );

      expect(pda.equals(expected)).to.be.true;
      expect(bump).to.equal(expectedBump);
    });

    it("different fixtureIds produce different match PDAs", () => {
      const [pda1] = FixtureWatcher.deriveMatchPda(1, PROGRAM_ID);
      const [pda2] = FixtureWatcher.deriveMatchPda(2, PROGRAM_ID);
      expect(pda1.equals(pda2)).to.be.false;
    });

    it("different roundIds produce different round PDAs", () => {
      const [matchPda] = FixtureWatcher.deriveMatchPda(FIXTURE_ID, PROGRAM_ID);
      const [r1] = FixtureWatcher.deriveRoundPda(matchPda, 1, PROGRAM_ID);
      const [r2] = FixtureWatcher.deriveRoundPda(matchPda, 2, PROGRAM_ID);
      expect(r1.equals(r2)).to.be.false;
    });
  });

  // ── 2. Fixture loading ──

  describe("loadFixture", () => {
    it("initializes MatchState from scores and fixtures", async () => {
      const scores = [makeScoresRecord({ gameState: "H1", homeScore: 1, awayScore: 2, ts: 1700000 })];
      const fixtures = [makeFixtureRecord({ StartTime: 1699999 })];
      const client = makeMockClient({ scores, fixtures });
      const watcher = new FixtureWatcher(client, config);

      const state = await watcher.loadFixture(FIXTURE_ID);

      expect(state.fixtureId).to.equal(FIXTURE_ID);
      expect(state.status).to.equal(StatusId.FirstHalf);
      expect(state.currentPeriod).to.equal("H1");
      expect(state.homeScore).to.equal(1);
      expect(state.awayScore).to.equal(2);
      expect(state.matchClockMs).to.equal(1700000 * 1000);
      expect(state.roundCounter).to.equal(0);
      expect(state.participants.home).to.equal("Home Team");
      expect(state.participants.away).to.equal("Away Team");
      expect(state.startTime).to.equal(1699999);
      expect(state.matchPda).to.be.instanceOf(PublicKey);
      expect(state.matchPdaBump).to.be.a("number");
    });

    it("maps gameState string to correct StatusId", async () => {
      const cases: Array<[string, StatusId, string]> = [
        ["NS", StatusId.NotStarted, "NS"],
        ["H1", StatusId.FirstHalf, "H1"],
        ["HT", StatusId.HalfTime, "HT"],
        ["H2", StatusId.SecondHalf, "H2"],
        ["F", StatusId.FullTime, "FT"],
        ["PE", StatusId.PenaltyShootout, "PE"],
        ["FPE", StatusId.FinishedAfterPenaltyShootout, "FPE"],
        ["I", StatusId.Interrupted, "I"],
        ["A", StatusId.Abandoned, "A"],
        ["C", StatusId.Cancelled, "C"],
      ];

      for (const [gameState, expectedStatus, expectedPeriod] of cases) {
        const client = makeMockClient({
          scores: [makeScoresRecord({ gameState })],
          fixtures: [makeFixtureRecord()],
        });
        const watcher = new FixtureWatcher(client, config);
        const state = await watcher.loadFixture(FIXTURE_ID);
        expect(state.status).to.equal(expectedStatus, `gameState=${gameState}`);
        expect(state.currentPeriod).to.equal(expectedPeriod, `gameState=${gameState}`);
      }
    });

    it("assigns participants based on Participant1IsHome=true", async () => {
      const fixtures = [makeFixtureRecord({
        Participant1: "Team A",
        Participant2: "Team B",
        Participant1IsHome: true,
      })];
      const client = makeMockClient({ scores: [makeScoresRecord()], fixtures });
      const watcher = new FixtureWatcher(client, config);

      const state = await watcher.loadFixture(FIXTURE_ID);
      expect(state.participants.home).to.equal("Team A");
      expect(state.participants.away).to.equal("Team B");
    });

    it("assigns participants based on Participant1IsHome=false", async () => {
      const fixtures = [makeFixtureRecord({
        Participant1: "Team A",
        Participant2: "Team B",
        Participant1IsHome: false,
      })];
      const client = makeMockClient({ scores: [makeScoresRecord()], fixtures });
      const watcher = new FixtureWatcher(client, config);

      const state = await watcher.loadFixture(FIXTURE_ID);
      expect(state.participants.home).to.equal("Team B");
      expect(state.participants.away).to.equal("Team A");
    });

    it("defaults to NotStarted when scores array is empty", async () => {
      const client = makeMockClient({ scores: [], fixtures: [makeFixtureRecord()] });
      const watcher = new FixtureWatcher(client, config);

      const state = await watcher.loadFixture(FIXTURE_ID);
      expect(state.status).to.equal(StatusId.NotStarted);
      expect(state.homeScore).to.equal(0);
      expect(state.awayScore).to.equal(0);
    });

    it("uses last score entry when multiple scores returned", async () => {
      const scores = [
        makeScoresRecord({ gameState: "H1", homeScore: 0, awayScore: 0 }),
        makeScoresRecord({ gameState: "H2", homeScore: 2, awayScore: 3 }),
      ];
      const client = makeMockClient({ scores, fixtures: [makeFixtureRecord()] });
      const watcher = new FixtureWatcher(client, config);

      const state = await watcher.loadFixture(FIXTURE_ID);
      expect(state.status).to.equal(StatusId.SecondHalf);
      expect(state.homeScore).to.equal(2);
      expect(state.awayScore).to.equal(3);
    });

    it("handles getFixtures failure gracefully", async () => {
      const client = makeMockClient({
        scores: [makeScoresRecord({ gameState: "H1" })],
        fixturesThrow: true,
      });
      const watcher = new FixtureWatcher(client, config);

      const state = await watcher.loadFixture(FIXTURE_ID);
      expect(state.status).to.equal(StatusId.FirstHalf);
      expect(state.participants.home).to.equal("");
      expect(state.participants.away).to.equal("");
      expect(state.startTime).to.be.undefined;
    });

    it("handles fixture not found in list", async () => {
      const otherFixture = makeFixtureRecord({ FixtureId: 999 });
      const client = makeMockClient({
        scores: [makeScoresRecord()],
        fixtures: [otherFixture],
      });
      const watcher = new FixtureWatcher(client, config);

      const state = await watcher.loadFixture(FIXTURE_ID);
      expect(state.participants.home).to.equal("");
      expect(state.participants.away).to.equal("");
    });

    it("stores fixture state accessible via getFixtureState", async () => {
      const client = makeMockClient({ scores: [makeScoresRecord()], fixtures: [makeFixtureRecord()] });
      const watcher = new FixtureWatcher(client, config);

      await watcher.loadFixture(FIXTURE_ID);
      const state = watcher.getFixtureState(FIXTURE_ID);
      expect(state).to.exist;
      expect(state!.fixtureId).to.equal(FIXTURE_ID);
    });
  });

  // ── 3. Event processing ──

  describe("processEvent", () => {
    let watcher: FixtureWatcher;

    beforeEach(async () => {
      const client = makeMockClient({
        scores: [makeScoresRecord({ gameState: "NS" })],
        fixtures: [makeFixtureRecord()],
      });
      watcher = new FixtureWatcher(client, config);
      await watcher.loadFixture(FIXTURE_ID);
    });

    describe("Status events", () => {
      it("FirstHalf updates status, period, increments roundCounter, emits match_start", (done) => {
        watcher.on("match_start", (state: MatchState) => {
          expect(state.status).to.equal(StatusId.FirstHalf);
          expect(state.currentPeriod).to.equal("H1");
          expect(state.roundCounter).to.equal(1);
          done();
        });

        const result = watcher.processEvent(
          { action: SoccerAction.Status, statusId: StatusId.FirstHalf },
          FIXTURE_ID,
        );
        expect(result).to.exist;
        expect(result!.status).to.equal(StatusId.FirstHalf);
      });

      it("HalfTime emits match_half and increments roundCounter", (done) => {
        watcher.processEvent({ action: SoccerAction.Status, statusId: StatusId.FirstHalf }, FIXTURE_ID);

        watcher.on("match_half", (state: MatchState) => {
          expect(state.status).to.equal(StatusId.HalfTime);
          expect(state.currentPeriod).to.equal("HT");
          expect(state.roundCounter).to.equal(2);
          done();
        });

        watcher.processEvent({ action: SoccerAction.Status, statusId: StatusId.HalfTime }, FIXTURE_ID);
      });

      it("SecondHalf updates status", () => {
        watcher.processEvent({ action: SoccerAction.Status, statusId: StatusId.FirstHalf }, FIXTURE_ID);
        watcher.processEvent({ action: SoccerAction.Status, statusId: StatusId.HalfTime }, FIXTURE_ID);
        const result = watcher.processEvent(
          { action: SoccerAction.Status, statusId: StatusId.SecondHalf },
          FIXTURE_ID,
        );

        expect(result!.status).to.equal(StatusId.SecondHalf);
        expect(result!.currentPeriod).to.equal("H2");
      });

      it("FullTime emits match_end", (done) => {
        watcher.processEvent({ action: SoccerAction.Status, statusId: StatusId.FirstHalf }, FIXTURE_ID);

        watcher.on("match_end", (state: MatchState) => {
          expect(state.status).to.equal(StatusId.FullTime);
          done();
        });

        watcher.processEvent({ action: SoccerAction.Status, statusId: StatusId.FullTime }, FIXTURE_ID);
      });

      it("PenaltyShootout emits match_pe and increments roundCounter", (done) => {
        watcher.on("match_pe", (state: MatchState) => {
          expect(state.status).to.equal(StatusId.PenaltyShootout);
          expect(state.currentPeriod).to.equal("PE");
          expect(state.roundCounter).to.equal(1);
          done();
        });

        watcher.processEvent(
          { action: SoccerAction.Status, statusId: StatusId.PenaltyShootout },
          FIXTURE_ID,
        );
      });

      it("FinishedAfterPenaltyShootout emits match_end and match_fpe", () => {
        const emitted: string[] = [];
        watcher.on("match_end", () => emitted.push("match_end"));
        watcher.on("match_fpe", () => emitted.push("match_fpe"));

        watcher.processEvent(
          { action: SoccerAction.Status, statusId: StatusId.PenaltyShootout },
          FIXTURE_ID,
        );
        watcher.processEvent(
          { action: SoccerAction.Status, statusId: StatusId.FinishedAfterPenaltyShootout },
          FIXTURE_ID,
        );

        expect(emitted).to.include("match_end");
        expect(emitted).to.include("match_fpe");
      });

      it("Interrupted emits match_interrupted", (done) => {
        watcher.on("match_interrupted", (state: MatchState) => {
          expect(state.status).to.equal(StatusId.Interrupted);
          done();
        });

        watcher.processEvent(
          { action: SoccerAction.Status, statusId: StatusId.Interrupted },
          FIXTURE_ID,
        );
      });

      it("Abandoned emits match_interrupted", (done) => {
        watcher.on("match_interrupted", (state: MatchState) => {
          expect(state.status).to.equal(StatusId.Abandoned);
          done();
        });

        watcher.processEvent(
          { action: SoccerAction.Status, statusId: StatusId.Abandoned },
          FIXTURE_ID,
        );
      });

      it("Cancelled emits match_interrupted", (done) => {
        watcher.on("match_interrupted", (state: MatchState) => {
          expect(state.status).to.equal(StatusId.Cancelled);
          done();
        });

        watcher.processEvent(
          { action: SoccerAction.Status, statusId: StatusId.Cancelled },
          FIXTURE_ID,
        );
      });

      it("duplicate status (same as current) does not emit event", () => {
        watcher.processEvent({ action: SoccerAction.Status, statusId: StatusId.FirstHalf }, FIXTURE_ID);

        let emitted = false;
        watcher.on("match_start", () => { emitted = true; });

        watcher.processEvent({ action: SoccerAction.Status, statusId: StatusId.FirstHalf }, FIXTURE_ID);
        expect(emitted).to.be.false;
      });
    });

    describe("Goal events", () => {
      beforeEach(() => {
        watcher.processEvent({ action: SoccerAction.Status, statusId: StatusId.FirstHalf }, FIXTURE_ID);
      });

      it("participant=1 increments homeScore and emits score_changed", (done) => {
        watcher.on("score_changed", (state: MatchState) => {
          expect(state.homeScore).to.equal(1);
          expect(state.awayScore).to.equal(0);
          done();
        });

        watcher.processEvent(
          { action: SoccerAction.Goal, participant: 1, goalType: GoalType.Shot },
          FIXTURE_ID,
        );
      });

      it("participant=2 increments awayScore and emits score_changed", (done) => {
        watcher.on("score_changed", (state: MatchState) => {
          expect(state.homeScore).to.equal(0);
          expect(state.awayScore).to.equal(1);
          done();
        });

        watcher.processEvent(
          { action: SoccerAction.Goal, participant: 2, goalType: GoalType.Shot },
          FIXTURE_ID,
        );
      });

      it("multiple goals accumulate correctly", () => {
        watcher.processEvent(
          { action: SoccerAction.Goal, participant: 1, goalType: GoalType.Shot },
          FIXTURE_ID,
        );
        watcher.processEvent(
          { action: SoccerAction.Goal, participant: 1, goalType: GoalType.Head },
          FIXTURE_ID,
        );
        watcher.processEvent(
          { action: SoccerAction.Goal, participant: 2, goalType: GoalType.Shot },
          FIXTURE_ID,
        );

        const state = watcher.getFixtureState(FIXTURE_ID)!;
        expect(state.homeScore).to.equal(2);
        expect(state.awayScore).to.equal(1);
      });
    });

    describe("ScoreAdjustment events", () => {
      it("sets scores from event data", (done) => {
        watcher.on("score_changed", (state: MatchState) => {
          expect(state.homeScore).to.equal(3);
          expect(state.awayScore).to.equal(2);
          done();
        });

        watcher.processEvent(
          {
            action: SoccerAction.ScoreAdjustment,
            score: {
              Participant1: { Total: { Goals: 3 } },
              Participant2: { Total: { Goals: 2 } },
            },
          },
          FIXTURE_ID,
        );
      });

      it("handles missing participant scores gracefully", () => {
        watcher.processEvent(
          { action: SoccerAction.ScoreAdjustment, score: {} },
          FIXTURE_ID,
        );

        const state = watcher.getFixtureState(FIXTURE_ID)!;
        expect(state.homeScore).to.equal(0);
        expect(state.awayScore).to.equal(0);
      });
    });

    it("returns undefined for unknown fixtureId", () => {
      const result = watcher.processEvent(
        { action: SoccerAction.Status, statusId: StatusId.FirstHalf },
        9999,
      );
      expect(result).to.be.undefined;
    });

    it("updates lastEventAt on each event", () => {
      const before = watcher.getFixtureState(FIXTURE_ID)!.lastEventAt;

      const clock = Date.now();
      watcher.processEvent(
        { action: SoccerAction.Status, statusId: StatusId.FirstHalf },
        FIXTURE_ID,
      );

      const after = watcher.getFixtureState(FIXTURE_ID)!.lastEventAt;
      expect(after).to.be.greaterThanOrEqual(before);
    });
  });

  // ── 4. State management ──

  describe("State management", () => {
    it("getFixtureState returns undefined for unknown fixtureId", () => {
      const client = makeMockClient();
      const watcher = new FixtureWatcher(client, config);
      expect(watcher.getFixtureState(999)).to.be.undefined;
    });

    it("getAllFixtures returns all loaded fixtures", async () => {
      const client1 = makeMockClient({
        scores: [makeScoresRecord()],
        fixtures: [makeFixtureRecord()],
      });
      const watcher1 = new FixtureWatcher(client1, config);
      await watcher1.loadFixture(1);

      const client2 = makeMockClient({
        scores: [makeScoresRecord({ fixtureId: 2 })],
        fixtures: [makeFixtureRecord({ FixtureId: 2 })],
      });
      const watcher2 = new FixtureWatcher(client2, config);
      await watcher2.loadFixture(1);
      await watcher2.loadFixture(2);

      expect(watcher2.getAllFixtures()).to.have.length(2);
    });

    it("getAllFixtures returns empty array when no fixtures loaded", () => {
      const client = makeMockClient();
      const watcher = new FixtureWatcher(client, config);
      expect(watcher.getAllFixtures()).to.have.length(0);
    });

    it("removeFixture removes from map", async () => {
      const client = makeMockClient({
        scores: [makeScoresRecord()],
        fixtures: [makeFixtureRecord()],
      });
      const watcher = new FixtureWatcher(client, config);
      await watcher.loadFixture(FIXTURE_ID);

      expect(watcher.getFixtureState(FIXTURE_ID)).to.exist;
      watcher.removeFixture(FIXTURE_ID);
      expect(watcher.getFixtureState(FIXTURE_ID)).to.be.undefined;
    });

    it("removeFixture is no-op for unknown fixtureId", () => {
      const client = makeMockClient();
      const watcher = new FixtureWatcher(client, config);
      watcher.removeFixture(999);
      expect(watcher.getAllFixtures()).to.have.length(0);
    });
  });
});
