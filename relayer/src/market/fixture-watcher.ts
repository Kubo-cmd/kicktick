import { EventEmitter } from "events";
import { PublicKey } from "@solana/web3.js";
import { TxLineClient } from "../clients/txline-client";
import { Config } from "../config";
import {
  SoccerEvent,
  SoccerAction,
  StatusId,
  gameStateToStatusId,
} from "./event-parser";
import type { FixtureRecord, ScoresRecord } from "@swingkiddo/txodds-client/dist/types";

// ── Interfaces ──

export interface MatchState {
  fixtureId: number;
  matchPda: PublicKey;
  matchPdaBump: number;
  status: StatusId;
  currentPeriod: string;
  homeScore: number;
  awayScore: number;
  matchClockMs: number;
  lastEventAt: number;
  roundCounter: number;
  participants: { home: string; away: string };
  startTime?: number;
}

export interface FixtureWatcherEvents {
  match_start: [state: MatchState];
  match_end: [state: MatchState];
  match_half: [state: MatchState];
  match_interrupted: [state: MatchState];
  match_pe: [state: MatchState];
  match_fpe: [state: MatchState];
  score_changed: [state: MatchState];
}

// ── Helpers ──

function toLeBytes64(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

const STATUS_TO_PERIOD: Record<number, string> = {
  [StatusId.NotStarted]: "NS",
  [StatusId.FirstHalf]: "H1",
  [StatusId.HalfTime]: "HT",
  [StatusId.SecondHalf]: "H2",
  [StatusId.FullTime]: "FT",
  [StatusId.WaitingExtraTime]: "WE",
  [StatusId.ExtraTimeFirstHalf]: "ET1",
  [StatusId.ExtraTimeHalfTime]: "ETHT",
  [StatusId.ExtraTimeSecondHalf]: "ET2",
  [StatusId.FinishedAfterExtraTime]: "FET",
  [StatusId.WaitingPenaltyShootout]: "WP",
  [StatusId.PenaltyShootout]: "PE",
  [StatusId.FinishedAfterPenaltyShootout]: "FPE",
  [StatusId.Interrupted]: "I",
  [StatusId.Abandoned]: "A",
  [StatusId.Cancelled]: "C",
};

function statusEndsMatch(status: StatusId): boolean {
  return (
    status === StatusId.FullTime ||
    status === StatusId.FinishedAfterExtraTime ||
    status === StatusId.FinishedAfterPenaltyShootout
  );
}

function statusInterruptsMatch(status: StatusId): boolean {
  return (
    status === StatusId.Interrupted ||
    status === StatusId.Abandoned ||
    status === StatusId.Cancelled
  );
}

// ── FixtureWatcher ──

export class FixtureWatcher extends EventEmitter {
  private matches: Map<number, MatchState> = new Map();
  private client: TxLineClient;
  private config: Config;

  constructor(client: TxLineClient, config: Config) {
    super();
    this.client = client;
    this.config = config;
  }

  // ── Static PDA derivation ──

  static deriveMatchPda(fixtureId: number, programId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("match"), toLeBytes64(fixtureId)],
      programId,
    );
  }

  static deriveRoundPda(
    matchPda: PublicKey,
    roundId: number,
    programId: PublicKey,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("round"), matchPda.toBuffer(), toLeBytes64(roundId)],
      programId,
    );
  }

  static deriveConfigPda(programId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  }

  // ── Fixture loading ──

  async loadFixture(fixtureId: number): Promise<MatchState> {
    const [matchPda, matchPdaBump] = FixtureWatcher.deriveMatchPda(
      fixtureId,
      this.config.kicktickProgramId,
    );

    const [scores] = await Promise.all([
      this.client.getScoresSnapshot(fixtureId),
    ]);

    let startTime: number | undefined;
    let participants: { home: string; away: string } = { home: "", away: "" };

    try {
      const fixtures = await this.client.getFixtures();
      const fixture = fixtures.find(
        (f: FixtureRecord) => f.FixtureId === fixtureId,
      );
      if (fixture) {
        startTime = fixture.StartTime;
        participants = {
          home: fixture.Participant1IsHome
            ? fixture.Participant1
            : fixture.Participant2,
          away: fixture.Participant1IsHome
            ? fixture.Participant2
            : fixture.Participant1,
        };
      }
    } catch {
      // Non-critical — proceed with empty participant names
    }

    const currentScore: ScoresRecord | null =
      scores.length > 0 ? scores[scores.length - 1] : null;
    const status = currentScore
      ? (typeof currentScore.gameState === "string"
        ? gameStateToStatusId(currentScore.gameState) ?? StatusId.NotStarted
        : (currentScore.gameState as StatusId))
      : StatusId.NotStarted;

    const state: MatchState = {
      fixtureId,
      matchPda,
      matchPdaBump,
      status,
      currentPeriod: STATUS_TO_PERIOD[status] || "NS",
      homeScore: currentScore?.homeScore ?? 0,
      awayScore: currentScore?.awayScore ?? 0,
      matchClockMs: currentScore ? (currentScore.ts || 0) * 1000 : 0,
      lastEventAt: currentScore ? (currentScore.ts || 0) * 1000 : Date.now(),
      roundCounter: 0,
      participants,
      startTime,
    };

    this.matches.set(fixtureId, state);
    return state;
  }

  // ── Event processing ──

  processEvent(event: SoccerEvent, fixtureId: number): MatchState | undefined {
    const state = this.matches.get(fixtureId);
    if (!state) return undefined;

    state.lastEventAt = Date.now();

    switch (event.action) {
      case SoccerAction.Status:
        this.handleStatusChange(event, state);
        break;

      case SoccerAction.Goal:
        this.handleGoal(event, state);
        break;

      case SoccerAction.ScoreAdjustment:
        this.handleScoreAdjustment(event, state);
        break;
    }

    return state;
  }

  removeFixture(fixtureId: number): void {
    this.matches.delete(fixtureId);
  }

  getFixtureState(fixtureId: number): MatchState | undefined {
    return this.matches.get(fixtureId);
  }

  getAllFixtures(): MatchState[] {
    return Array.from(this.matches.values());
  }

  // ── Internal event handlers ──

  private handleStatusChange(
    event: { action: SoccerAction.Status; participant?: 1 | 2; statusId: StatusId },
    state: MatchState,
  ): void {
    const newStatus = event.statusId;
    const prevStatus = state.status;

    if (prevStatus === newStatus) return;

    state.status = newStatus;
    state.currentPeriod = STATUS_TO_PERIOD[newStatus] || "NS";

    if (newStatus === StatusId.FirstHalf) {
      state.roundCounter++;
      this.emit("match_start", state);
    }

    if (newStatus === StatusId.HalfTime) {
      state.roundCounter++;
      this.emit("match_half", state);
    }

    if (newStatus === StatusId.PenaltyShootout) {
      state.roundCounter++;
      this.emit("match_pe", state);
    }

    if (statusEndsMatch(newStatus)) {
      this.emit("match_end", state);
    }

    if (newStatus === StatusId.FinishedAfterPenaltyShootout) {
      this.emit("match_fpe", state);
    }

    if (statusInterruptsMatch(newStatus)) {
      this.emit("match_interrupted", state);
    }
  }

  private handleGoal(
    event: { action: SoccerAction.Goal; participant?: 1 | 2 },
    state: MatchState,
  ): void {
    if (event.participant === 1) {
      state.homeScore++;
    } else if (event.participant === 2) {
      state.awayScore++;
    }
    this.emit("score_changed", state);
  }

  private handleScoreAdjustment(
    event: { action: SoccerAction.ScoreAdjustment; participant?: 1 | 2; score: Record<string, unknown> },
    state: MatchState,
  ): void {
    const score = event.score;
    const p1Goals = (score as any)?.Participant1?.Total?.Goals;
    const p2Goals = (score as any)?.Participant2?.Total?.Goals;
    if (typeof p1Goals === "number") state.homeScore = p1Goals;
    if (typeof p2Goals === "number") state.awayScore = p2Goals;
    this.emit("score_changed", state);
  }
}
