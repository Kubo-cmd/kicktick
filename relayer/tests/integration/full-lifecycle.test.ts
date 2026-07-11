import { expect } from "chai";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { AnchorClient, MarketType } from "../../src/clients/anchor-client";
import { DEFAULT_KICKTICK_PROGRAM_ID, Config } from "../../src/config";
import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { MarketTrigger, TriggerAction } from "../../src/market/triggers";
import {
  SoccerAction,
  StatusId,
  MarketType as EventMarketType,
  GoalType,
  VarType,
  GoalEvent,
  CornerEvent,
  YellowCardEvent,
  RedCardEvent,
  PenaltyOutcomeEvent,
  VarCheckEvent,
  VarEndEvent,
  StatusChangeEvent,
  SoccerEvent,
} from "../../src/market/event-parser";
import type { MatchState } from "../../src/market/fixture-watcher";

const PROGRAM_ID = DEFAULT_KICKTICK_PROGRAM_ID.toBase58();
const PROGRAM_SO = path.resolve(__dirname, "../../../kicktick/target/deploy/kicktick.so");
const RPC_URL = "http://127.0.0.1:8899";
const FIXTURE_ID = 99999;
const LOCK_SECS = 15;
const DEADLINE_SECS = 16;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function makeTestConfig(keypair: Keypair): Config {
  return {
    txlineJwt: "",
    txlineApiToken: "",
    txlineApiHost: "",
    solanaRpcUrl: RPC_URL,
    solanaPrivateKey: Buffer.from(keypair.secretKey).toString("hex"),
    kicktickProgramId: new PublicKey(PROGRAM_ID),
    txoracleProgramId: new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"),
    usdtMint: new PublicKey("ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh"),
    txlMint: new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG"),
    wsPort: 0,
    competitionId: 72,
  };
}

describe("Full lifecycle (20 bettors)", function () {
  this.timeout(300_000);

  let validator: ChildProcess;
  let adminKeypair: Keypair;
  let client: AnchorClient;
  let connection: Connection;
  let matchPda: PublicKey;
  let vaultPda: PublicKey;
  const roundId = 1;

  const yesBettors: Keypair[] = [];
  const noBettors: Keypair[] = [];
  const abstainBettors: Keypair[] = [];

  const yesAmounts = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6];
  const noAmounts = [0.05, 0.075, 0.1, 0.125, 0.15, 0.175];
  const abstainAmounts = [0.025, 0.05, 0.075, 0.1];

  const totalYes = yesAmounts.reduce((a, b) => a + b, 0);
  const totalNo = noAmounts.reduce((a, b) => a + b, 0);
  const totalAbstain = abstainAmounts.reduce((a, b) => a + b, 0);
  const totalPool = totalYes + totalNo + totalAbstain;

  before(async function () {
    if (!fs.existsSync(PROGRAM_SO)) {
      this.skip();
      return;
    }

    adminKeypair = Keypair.generate();

    const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), "kicktick-ledger-"));
    validator = spawn(
      "solana-test-validator",
      ["--reset", "--quiet", "--ledger", ledgerDir, "--bpf-program", PROGRAM_ID, PROGRAM_SO],
      { stdio: "pipe", detached: false },
    );
    validator.stdout?.on("data", () => {});
    validator.stderr?.on("data", () => {});

    connection = new Connection(RPC_URL, "confirmed");

    let ready = false;
    for (let i = 0; i < 120; i++) {
      try {
        await connection.getVersion();
        ready = true;
        break;
      } catch {
        await sleep(500);
      }
    }
    if (!ready) throw new Error("Validator did not start in time");

    const sig = await connection.requestAirdrop(adminKeypair.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");

    client = new AnchorClient(makeTestConfig(adminKeypair));

    await client.initConfig();
    const result = await client.initMatch(FIXTURE_ID, "Home FC", "Away United");
    matchPda = result.matchPda;
    vaultPda = result.vaultPda;

    for (let i = 0; i < 10; i++) yesBettors.push(Keypair.generate());
    for (let i = 0; i < 6; i++) noBettors.push(Keypair.generate());
    for (let i = 0; i < 4; i++) abstainBettors.push(Keypair.generate());

    const allBettors = [...yesBettors, ...noBettors, ...abstainBettors];
    for (const bettor of allBettors) {
      const sig = await connection.requestAirdrop(bettor.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
    }
  });

  after(async function () {
    if (validator) {
      validator.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 1000));
      if (!validator.killed) validator.kill("SIGKILL");
    }
  });

  it("opens round", async () => {
    await client.openRound(roundId, "VARCheck" as MarketType, LOCK_SECS, DEADLINE_SECS, matchPda);

    const [roundPda] = AnchorClient.deriveRoundPda(matchPda, roundId, client.programId);
    const round = await client.fetchRound(roundPda);

    expect(round.roundId.toNumber()).to.equal(roundId);
    expect(round.status).to.deep.equal({ open: {} });
    expect(round.totalYes.toNumber()).to.equal(0);
    expect(round.totalNo.toNumber()).to.equal(0);
    expect(round.totalAbstain.toNumber()).to.equal(0);
  });

  it("20 bettors place bets", async () => {
    const vaultBefore = await connection.getBalance(vaultPda);

    for (let i = 0; i < yesBettors.length; i++) {
      const amount = Math.floor(yesAmounts[i] * LAMPORTS_PER_SOL);
      await client.placeBet(FIXTURE_ID, roundId, 0, amount, matchPda, yesBettors[i]);
    }

    for (let i = 0; i < noBettors.length; i++) {
      const amount = Math.floor(noAmounts[i] * LAMPORTS_PER_SOL);
      await client.placeBet(FIXTURE_ID, roundId, 1, amount, matchPda, noBettors[i]);
    }

    for (let i = 0; i < abstainBettors.length; i++) {
      const amount = Math.floor(abstainAmounts[i] * LAMPORTS_PER_SOL);
      await client.placeBet(FIXTURE_ID, roundId, 2, amount, matchPda, abstainBettors[i]);
    }

    const [roundPda] = AnchorClient.deriveRoundPda(matchPda, roundId, client.programId);
    const round = await client.fetchRound(roundPda);

    expect(round.totalYes.toNumber()).to.equal(Math.floor(totalYes * LAMPORTS_PER_SOL));
    expect(round.totalNo.toNumber()).to.equal(Math.floor(totalNo * LAMPORTS_PER_SOL));
    expect(round.totalAbstain.toNumber()).to.equal(Math.floor(totalAbstain * LAMPORTS_PER_SOL));

    const vaultAfter = await connection.getBalance(vaultPda);
    expect(vaultAfter - vaultBefore).to.equal(Math.floor(totalPool * LAMPORTS_PER_SOL));
  });

  it("settles round after deadline", async () => {
    await sleep((DEADLINE_SECS + 1) * 1000);

    await client.settleOffchainRound(roundId, matchPda, "Yes", 1);

    const [roundPda] = AnchorClient.deriveRoundPda(matchPda, roundId, client.programId);
    const round = await client.fetchRound(roundPda);

    expect(round.status).to.deep.equal({ resolvedPending: {} });
    expect(round.winner).to.equal(1);
    expect(round.outcome).to.deep.equal({ yes: {} });
  });

  it("confirms round after finality delay", async () => {
    await sleep(61_000);

    await client.confirmRound(roundId, matchPda);

    const [roundPda] = AnchorClient.deriveRoundPda(matchPda, roundId, client.programId);
    const round = await client.fetchRound(roundPda);

    expect(round.status).to.deep.equal({ settled: {} });
  });

  it("YES winners claim payouts, NO/ABSTAIN rejected", async () => {
    const winningPool = Math.floor(totalYes * LAMPORTS_PER_SOL);
    const totalPoolLamports = Math.floor(totalPool * LAMPORTS_PER_SOL);

    for (let i = 0; i < yesBettors.length; i++) {
      const bettor = yesBettors[i];
      const betAmount = Math.floor(yesAmounts[i] * LAMPORTS_PER_SOL);
      const expectedPayout = Math.floor((betAmount / winningPool) * totalPoolLamports);

      const balanceBefore = await connection.getBalance(bettor.publicKey);
      await client.claimWinnings(FIXTURE_ID, roundId, matchPda, bettor);
      const balanceAfter = await connection.getBalance(bettor.publicKey);

      const netGain = balanceAfter - balanceBefore;

      expect(netGain).to.be.greaterThan(0);
      expect(Math.abs(netGain - expectedPayout)).to.be.lessThan(10000);
    }

    for (const bettor of noBettors) {
      try {
        await client.claimWinnings(FIXTURE_ID, roundId, matchPda, bettor);
        throw new Error("NO bettor should not be able to claim");
      } catch (err: any) {
        expect(err.message).to.include("NotWinner");
      }
    }

    for (const bettor of abstainBettors) {
      try {
        await client.claimWinnings(FIXTURE_ID, roundId, matchPda, bettor);
        throw new Error("ABSTAIN bettor should not be able to claim");
      } catch (err: any) {
        expect(err.message).to.include("NotWinner");
      }
    }
  });

  it("vault is drained after all claims", async () => {
    const vaultAfter = await connection.getBalance(vaultPda);
    expect(vaultAfter).to.be.lessThan(1_000_000);
  });
});

const TRIGGER_FIXTURE_ID = 88888;

function makeMatchState(overrides?: Partial<MatchState>): MatchState {
  return {
    fixtureId: TRIGGER_FIXTURE_ID,
    matchPda: PublicKey.findProgramAddressSync(
      [Buffer.from("match"), Buffer.alloc(8)],
      DEFAULT_KICKTICK_PROGRAM_ID,
    )[0],
    matchPdaBump: 255,
    status: StatusId.FirstHalf,
    currentPeriod: "H1",
    homeScore: 0,
    awayScore: 0,
    matchClockMs: 600_000,
    lastEventAt: Date.now(),
    roundCounter: 0,
    participants: { home: "Team A", away: "Team B" },
    ...overrides,
  };
}

describe("Event-driven lifecycle", () => {
  let trigger: MarketTrigger;
  let state: MatchState;
  let emittedActions: TriggerAction[][];

  beforeEach(() => {
    trigger = new MarketTrigger();
    state = makeMatchState();
    emittedActions = [];
    trigger.on("actions", (actions: TriggerAction[]) => {
      emittedActions.push(actions);
    });
  });

  function flat(): TriggerAction[] {
    return emittedActions.flat();
  }

  it("FirstHalf opens NextGoalSide and RedCardInMatch", () => {
    const evt: StatusChangeEvent = { action: SoccerAction.Status, statusId: StatusId.FirstHalf };
    trigger.processEvent(evt, TRIGGER_FIXTURE_ID, state);

    const opens = flat().filter((a) => a.type === "open_round");
    const types = opens.map((a) => (a as any).marketType);
    expect(types).to.include(EventMarketType.NextGoalSide);
    expect(types).to.include(EventMarketType.RedCardInMatch);
  });

  it("Goal settles NextGoalSide as Home and opens new round", () => {
    const startEvt: StatusChangeEvent = { action: SoccerAction.Status, statusId: StatusId.FirstHalf };
    trigger.processEvent(startEvt, TRIGGER_FIXTURE_ID, state);
    emittedActions = [];

    const goal: GoalEvent = { action: SoccerAction.Goal, participant: 1, goalType: GoalType.Shot };
    trigger.processEvent(goal, TRIGGER_FIXTURE_ID, state);

    const all = flat();
    const settle = all.find(
      (a) => a.type === "settle_offchain" && (a as any).marketType === EventMarketType.NextGoalSide,
    );
    expect(settle).to.exist;
    expect((settle as any).outcome).to.equal("Home");

    const opens = all.filter(
      (a) => a.type === "open_round" && (a as any).marketType === EventMarketType.NextGoalSide,
    );
    expect(opens).to.have.length(1);
  });

  it("VAR end settles VARCheck as No on Stands", () => {
    const varEvt: VarCheckEvent = { action: SoccerAction.Var, varType: VarType.Goal };
    trigger.processEvent(varEvt, TRIGGER_FIXTURE_ID, state);
    emittedActions = [];

    const varEnd: VarEndEvent = { action: SoccerAction.VarEnd, outcome: "Stands" };
    trigger.processEvent(varEnd, TRIGGER_FIXTURE_ID, state);

    const settle = flat().find(
      (a) => a.type === "settle_offchain" && (a as any).marketType === EventMarketType.VARCheck,
    );
    expect(settle).to.exist;
    expect((settle as any).outcome).to.equal("No");
  });

  it("Penalty outcome in shootout mode settles PenaltyShootoutShot onchain", () => {
    const soEvt: StatusChangeEvent = { action: SoccerAction.Status, statusId: StatusId.PenaltyShootout };
    trigger.processEvent(soEvt, TRIGGER_FIXTURE_ID, state);

    const penalty: SoccerEvent = { action: SoccerAction.Penalty, participant: 1 } as any;
    trigger.processEvent(penalty, TRIGGER_FIXTURE_ID, state);
    emittedActions = [];

    const outcome: PenaltyOutcomeEvent = {
      action: SoccerAction.PenaltyOutcome,
      participant: 1,
      outcome: "Scored",
    };
    trigger.processEvent(outcome, TRIGGER_FIXTURE_ID, state);

    const all = flat();

    const penSettle = all.find(
      (a) => a.type === "settle_offchain" && (a as any).marketType === EventMarketType.PenaltyShot,
    );
    expect(penSettle).to.exist;
    expect((penSettle as any).outcome).to.equal("Yes");

    const soSettle = all.find(
      (a) => a.type === "settle_onchain" && (a as any).marketType === EventMarketType.PenaltyShootoutShot,
    );
    expect(soSettle).to.exist;

    const soOpen = all.find(
      (a) => a.type === "open_round" && (a as any).marketType === EventMarketType.PenaltyShootoutShot,
    );
    expect(soOpen).to.exist;
  });

  it("FullTime triggers matchEndCleanup with correct settle types", () => {
    const startEvt: StatusChangeEvent = { action: SoccerAction.Status, statusId: StatusId.FirstHalf };
    trigger.processEvent(startEvt, TRIGGER_FIXTURE_ID, state);
    emittedActions = [];

    const endEvt: StatusChangeEvent = { action: SoccerAction.Status, statusId: StatusId.FullTime };
    trigger.processEvent(endEvt, TRIGGER_FIXTURE_ID, state);

    const all = flat();

    const redCardSettle = all.find(
      (a) => a.type === "settle_onchain" && (a as any).marketType === EventMarketType.RedCardInMatch,
    );
    expect(redCardSettle).to.exist;

    const nextGoalSettle = all.find(
      (a) => a.type === "settle_offchain" && (a as any).marketType === EventMarketType.NextGoalSide,
    );
    expect(nextGoalSettle).to.exist;
    expect((nextGoalSettle as any).outcome).to.equal("No");

    const active = trigger.getActiveRounds(TRIGGER_FIXTURE_ID);
    expect(active).to.have.length(0);
  });
});
