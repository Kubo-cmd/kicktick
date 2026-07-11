import { EventEmitter } from "events";
import {
  SoccerEvent,
  SoccerAction,
  MarketType,
  StatusId,
  GoalEvent,
  CornerEvent,
  YellowCardEvent,
  RedCardEvent,
  PenaltyOutcomeEvent,
  VarCheckEvent,
  VarEndEvent,
  StatusChangeEvent,
} from "./event-parser";
import type { MatchState } from "./fixture-watcher";

export enum RoundSide {
  Yes = 1,
  No = 2,
  NoGoal = 3,
  Home = 1,
  Away = 2,
}

export type TriggerAction =
  | { type: "open_round"; fixtureId: number; matchPda: string; roundId: number; marketType: MarketType; lockSeconds: number; deadlineSeconds: number; triggerSseSeq?: number }
  | { type: "settle_onchain"; fixtureId: number; matchPda: string; roundId: number; marketType: MarketType; settlementSeq: number }
  | { type: "settle_offchain"; fixtureId: number; matchPda: string; roundId: number; marketType: MarketType; outcome: "Yes" | "No" | "Home" | "Away" | "NoGoal" | "Cancelled" }
  | { type: "confirm_round"; fixtureId: number; matchPda: string; roundId: number };

export interface RoundTracker {
  roundId: number;
  marketType: MarketType;
  status: "open" | "settling" | "settled";
  openedAt: number;
  expiresAt: number;
  settledAt?: number;
  triggerEvent?: SoccerEvent;
}

export const MIN_MARKET_DURATION = 15;
export const MAX_MARKET_DURATION = 300;
export const DEFAULT_DEADLINE_SECONDS = 120;
export const FINALITY_DELAY_SECONDS = 60;

export const MARKET_TIMINGS: Record<string, { lock: number; deadline: number }> = {
  NextGoalSide:        { lock: 30, deadline: 90 },
  GoalInWindow:        { lock: 15, deadline: 300 },
  NextCorner:          { lock: 30, deadline: 120 },
  CornerInWindow:      { lock: 15, deadline: 180 },
  NextYellowCard:      { lock: 30, deadline: 120 },
  YellowCardInWindow:  { lock: 15, deadline: 300 },
  RedCardInMatch:      { lock: 15, deadline: 99999 },
  PenaltyShootoutShot: { lock: 10, deadline: 30 },
  PenaltyShot:         { lock: 15, deadline: 90 },
  VARCheck:            { lock: 15, deadline: 120 },
};

function statusEndsMatch(status: StatusId): boolean {
  return (
    status === StatusId.FullTime ||
    status === StatusId.FinishedAfterExtraTime ||
    status === StatusId.FinishedAfterPenaltyShootout
  );
}

interface FixtureState {
  roundCounter: number;
  rounds: Map<number, RoundTracker>;
  matchPda: string;
  penaltyShootoutMode: boolean;
  penaltyShootoutRound: number;
  cronWindowsEnabled: boolean;
  lastCronWindow: Map<string, number>;
}

export class MarketTrigger extends EventEmitter {
  private fixtures: Map<number, FixtureState> = new Map();
  private lastSeenSeq: Map<number, number> = new Map();

  constructor() {
    super();
  }

  getNextRoundId(fixtureId: number): number {
    const f = this.getOrCreateFixture(fixtureId);
    const id = f.roundCounter;
    f.roundCounter++;
    return id;
  }

  getActiveRounds(fixtureId: number): RoundTracker[] {
    const f = this.fixtures.get(fixtureId);
    if (!f) return [];
    return Array.from(f.rounds.values()).filter(
      (r) => r.status === "open",
    );
  }

  processEvent(event: SoccerEvent, fixtureId: number, currentMatchState: MatchState): void {
    const f = this.getOrCreateFixture(fixtureId);
    f.matchPda = currentMatchState.matchPda.toBase58();

    const seq = (event as any).seq;
    if (typeof seq === "number") {
      this.lastSeenSeq.set(fixtureId, seq);
    }

    const actions: TriggerAction[] = [];

    switch (event.action) {
      case SoccerAction.Goal:
        this.handleGoal(event as GoalEvent, fixtureId, currentMatchState, actions);
        break;
      case SoccerAction.Corner:
        this.handleCorner(event as CornerEvent, fixtureId, currentMatchState, actions);
        break;
      case SoccerAction.YellowCard:
        this.handleYellowCard(event as YellowCardEvent, fixtureId, currentMatchState, actions);
        break;
      case SoccerAction.RedCard:
        this.handleRedCard(event as RedCardEvent, fixtureId, currentMatchState, actions);
        break;
      case SoccerAction.Penalty:
        this.handlePenalty(fixtureId, currentMatchState, actions);
        break;
      case SoccerAction.PenaltyOutcome:
        this.handlePenaltyOutcome(event as PenaltyOutcomeEvent, fixtureId, currentMatchState, actions);
        break;
      case SoccerAction.Var:
        this.handleVar(event as VarCheckEvent, fixtureId, currentMatchState, actions);
        break;
      case SoccerAction.VarEnd:
        this.handleVarEnd(event as VarEndEvent, fixtureId, currentMatchState, actions);
        break;
      case SoccerAction.Status:
        this.handleStatus(event as StatusChangeEvent, fixtureId, currentMatchState, actions);
        break;
    }

    this.checkCronWindows(fixtureId, currentMatchState, actions);

    if (actions.length > 0) {
      this.emit("actions", actions);
    }
  }

  checkTimeouts(fixtureId: number): TriggerAction[] {
    const f = this.fixtures.get(fixtureId);
    if (!f) return [];

    const actions: TriggerAction[] = [];
    const now = Date.now();

    for (const [, round] of f.rounds) {
      if (round.status !== "open") {
        if (round.status === "settling" && round.settledAt) {
          if (now - round.settledAt >= FINALITY_DELAY_SECONDS * 1000) {
            actions.push({
              type: "confirm_round",
              fixtureId,
              matchPda: f.matchPda,
              roundId: round.roundId,
            });
            round.status = "settled";
          }
        }
        continue;
      }

      if (now <= round.expiresAt) continue;

      round.status = "settling";
      round.settledAt = now;

      switch (round.marketType) {
        case MarketType.NextGoalSide:
        case MarketType.NextCorner:
        case MarketType.NextYellowCard:
          actions.push({
            type: "settle_offchain",
            fixtureId,
            matchPda: f.matchPda,
            roundId: round.roundId,
            marketType: round.marketType,
            outcome: "NoGoal",
          });
          break;

        case MarketType.GoalInWindow:
        case MarketType.CornerInWindow:
        case MarketType.YellowCardInWindow:
        case MarketType.PenaltyShootoutShot:
          actions.push({
            type: "settle_onchain",
            fixtureId,
            matchPda: f.matchPda,
            roundId: round.roundId,
            marketType: round.marketType,
            settlementSeq: 0,
          });
          break;

        case MarketType.PenaltyShot:
        case MarketType.VARCheck:
          actions.push({
            type: "settle_offchain",
            fixtureId,
            matchPda: f.matchPda,
            roundId: round.roundId,
            marketType: round.marketType,
            outcome: "No",
          });
          break;

        default:
          break;
      }
    }

    return actions;
  }

  startCronWindows(fixtureId: number): void {
    const f = this.getOrCreateFixture(fixtureId);
    f.cronWindowsEnabled = true;
  }

  stopCronWindows(fixtureId: number): void {
    const f = this.fixtures.get(fixtureId);
    if (f) f.cronWindowsEnabled = false;
  }

  private getOrCreateFixture(fixtureId: number): FixtureState {
    let f = this.fixtures.get(fixtureId);
    if (!f) {
      f = {
        roundCounter: 1,
        rounds: new Map(),
        matchPda: "",
        penaltyShootoutMode: false,
        penaltyShootoutRound: 0,
        cronWindowsEnabled: false,
        lastCronWindow: new Map(),
      };
      this.fixtures.set(fixtureId, f);
    }
    return f;
  }

  private findOpenRound(f: FixtureState, marketType: MarketType): RoundTracker | undefined {
    for (const [, round] of f.rounds) {
      if (
        round.marketType === marketType &&
        round.status === "open"
      ) {
        return round;
      }
    }
    return undefined;
  }

  private openRound(
    fixtureId: number,
    marketType: MarketType,
    state: MatchState,
    actions: TriggerAction[],
    triggerEvent?: SoccerEvent,
  ): void {
    const f = this.getOrCreateFixture(fixtureId);
    const roundId = this.getNextRoundId(fixtureId);
    const timings = MARKET_TIMINGS[marketType] || {
      lock: 15,
      deadline: DEFAULT_DEADLINE_SECONDS,
    };
    const now = Date.now();
    const deadlineSec = Math.min(timings.deadline, MAX_MARKET_DURATION);

    const tracker: RoundTracker = {
      roundId,
      marketType,
      status: "open",
      openedAt: now,
      expiresAt: now + deadlineSec * 1000,
      triggerEvent,
    };

    f.rounds.set(roundId, tracker);

    actions.push({
      type: "open_round",
      fixtureId,
      matchPda: f.matchPda,
      roundId,
      marketType,
      lockSeconds: timings.lock,
      deadlineSeconds: deadlineSec,
    });
  }

  private handleGoal(
    event: GoalEvent,
    fixtureId: number,
    state: MatchState,
    actions: TriggerAction[],
  ): void {
    const f = this.getOrCreateFixture(fixtureId);

    const current = this.findOpenRound(f, MarketType.NextGoalSide);
    if (current) {
      const outcome = event.participant === 1 ? "Home" : "Away";
      current.status = "settling";
      current.settledAt = Date.now();
      actions.push({
        type: "settle_offchain",
        fixtureId,
        matchPda: f.matchPda,
        roundId: current.roundId,
        marketType: MarketType.NextGoalSide,
        outcome,
      });
    }

    this.openRound(fixtureId, MarketType.NextGoalSide, state, actions, event);
  }

  private handleCorner(
    event: CornerEvent,
    fixtureId: number,
    state: MatchState,
    actions: TriggerAction[],
  ): void {
    const f = this.getOrCreateFixture(fixtureId);

    const current = this.findOpenRound(f, MarketType.NextCorner);
    if (current) {
      const outcome = event.participant === 1 ? "Home" : "Away";
      current.status = "settling";
      current.settledAt = Date.now();
      actions.push({
        type: "settle_offchain",
        fixtureId,
        matchPda: f.matchPda,
        roundId: current.roundId,
        marketType: MarketType.NextCorner,
        outcome,
      });
    }

    this.openRound(fixtureId, MarketType.NextCorner, state, actions, event);
  }

  private handleYellowCard(
    event: YellowCardEvent,
    fixtureId: number,
    state: MatchState,
    actions: TriggerAction[],
  ): void {
    const f = this.getOrCreateFixture(fixtureId);

    const current = this.findOpenRound(f, MarketType.NextYellowCard);
    if (current) {
      const outcome = event.participant === 1 ? "Home" : "Away";
      current.status = "settling";
      current.settledAt = Date.now();
      actions.push({
        type: "settle_offchain",
        fixtureId,
        matchPda: f.matchPda,
        roundId: current.roundId,
        marketType: MarketType.NextYellowCard,
        outcome,
      });
    }

    this.openRound(fixtureId, MarketType.NextYellowCard, state, actions, event);
  }

  private handleRedCard(
    _event: RedCardEvent,
    fixtureId: number,
    state: MatchState,
    actions: TriggerAction[],
  ): void {
    const f = this.getOrCreateFixture(fixtureId);

    const current = this.findOpenRound(f, MarketType.RedCardInMatch);
    if (current) {
      current.status = "settling";
      current.settledAt = Date.now();
      actions.push({
        type: "settle_offchain",
        fixtureId,
        matchPda: f.matchPda,
        roundId: current.roundId,
        marketType: MarketType.RedCardInMatch,
        outcome: "Yes",
      });
    }
  }

  private handlePenalty(
    fixtureId: number,
    state: MatchState,
    actions: TriggerAction[],
  ): void {
    this.openRound(fixtureId, MarketType.PenaltyShot, state, actions);
  }

  private handlePenaltyOutcome(
    event: PenaltyOutcomeEvent,
    fixtureId: number,
    state: MatchState,
    actions: TriggerAction[],
  ): void {
    const f = this.getOrCreateFixture(fixtureId);

    if (event.outcome === "Retake") {
      const current = this.findOpenRound(f, MarketType.PenaltyShot);
      if (current) {
        current.expiresAt += 60_000;
      }
      return;
    }

    const current = this.findOpenRound(f, MarketType.PenaltyShot);
    if (current) {
      const outcome = event.outcome === "Scored" ? "Yes" : "No";
      current.status = "settling";
      current.settledAt = Date.now();
      actions.push({
        type: "settle_offchain",
        fixtureId,
        matchPda: f.matchPda,
        roundId: current.roundId,
        marketType: MarketType.PenaltyShot,
        outcome,
      });
    }

    if (f.penaltyShootoutMode) {
      const soRound = this.findOpenRound(f, MarketType.PenaltyShootoutShot);
      if (soRound) {
        soRound.status = "settling";
        soRound.settledAt = Date.now();
        actions.push({
          type: "settle_onchain",
          fixtureId,
          matchPda: f.matchPda,
          roundId: soRound.roundId,
          marketType: MarketType.PenaltyShootoutShot,
          settlementSeq: (event as any).seq ?? 0,
        });
      }
      this.openRound(fixtureId, MarketType.PenaltyShootoutShot, state, actions);
      f.penaltyShootoutRound++;
    }
  }

  private handleVar(
    event: VarCheckEvent,
    fixtureId: number,
    state: MatchState,
    actions: TriggerAction[],
  ): void {
    this.openRound(fixtureId, MarketType.VARCheck, state, actions, event);
  }

  private handleVarEnd(
    event: VarEndEvent,
    fixtureId: number,
    state: MatchState,
    actions: TriggerAction[],
  ): void {
    const f = this.getOrCreateFixture(fixtureId);

    const current = this.findOpenRound(f, MarketType.VARCheck);
    if (current) {
      const outcome = event.outcome === "Overturned" ? "Yes" : "No";
      current.status = "settling";
      current.settledAt = Date.now();
      actions.push({
        type: "settle_offchain",
        fixtureId,
        matchPda: f.matchPda,
        roundId: current.roundId,
        marketType: MarketType.VARCheck,
        outcome,
      });
    }
  }

  private handleStatus(
    event: StatusChangeEvent,
    fixtureId: number,
    state: MatchState,
    actions: TriggerAction[],
  ): void {
    const f = this.getOrCreateFixture(fixtureId);

    switch (event.statusId) {
      case StatusId.FirstHalf:
        this.openRound(fixtureId, MarketType.NextGoalSide, state, actions);
        this.openRound(fixtureId, MarketType.RedCardInMatch, state, actions);
        break;

      case StatusId.PenaltyShootout:
        f.penaltyShootoutMode = true;
        f.penaltyShootoutRound = 0;
        this.openRound(fixtureId, MarketType.PenaltyShootoutShot, state, actions);
        f.penaltyShootoutRound++;
        break;

      case StatusId.FinishedAfterPenaltyShootout:
        this.cleanupPenaltyShootout(fixtureId, actions);
        this.matchEndCleanup(fixtureId, actions);
        break;

      case StatusId.FullTime:
      case StatusId.FinishedAfterExtraTime:
        this.matchEndCleanup(fixtureId, actions);
        break;
    }
  }

  private matchEndCleanup(fixtureId: number, actions: TriggerAction[]): void {
    const f = this.fixtures.get(fixtureId);
    if (!f) return;

    const onChainMarkets = new Set<MarketType>([
      MarketType.GoalInWindow,
      MarketType.CornerInWindow,
      MarketType.YellowCardInWindow,
      MarketType.RedCardInMatch,
      MarketType.PenaltyShootoutShot,
    ]);

    const seq = this.lastSeenSeq.get(fixtureId) ?? 0;

    for (const [, round] of f.rounds) {
      if (round.status !== "open") continue;
      round.status = "settling";
      round.settledAt = Date.now();

      if (onChainMarkets.has(round.marketType)) {
        actions.push({
          type: "settle_onchain",
          fixtureId,
          matchPda: f.matchPda,
          roundId: round.roundId,
          marketType: round.marketType,
          settlementSeq: seq,
        });
      } else {
        actions.push({
          type: "settle_offchain",
          fixtureId,
          matchPda: f.matchPda,
          roundId: round.roundId,
          marketType: round.marketType,
          outcome: "No",
        });
      }
    }
  }

  private cleanupPenaltyShootout(fixtureId: number, actions: TriggerAction[]): void {
    const f = this.fixtures.get(fixtureId);
    if (!f) return;

    const soRound = this.findOpenRound(f, MarketType.PenaltyShootoutShot);
    if (soRound) {
      soRound.status = "settling";
      soRound.settledAt = Date.now();
      const seq = this.lastSeenSeq.get(fixtureId) ?? 0;
      actions.push({
        type: "settle_onchain",
        fixtureId,
        matchPda: f.matchPda,
        roundId: soRound.roundId,
        marketType: MarketType.PenaltyShootoutShot,
        settlementSeq: seq,
      });
    }

    f.penaltyShootoutMode = false;
    f.penaltyShootoutRound = 0;
  }

  private checkCronWindows(
    fixtureId: number,
    state: MatchState,
    actions: TriggerAction[],
  ): void {
    const f = this.fixtures.get(fixtureId);
    if (!f || !f.cronWindowsEnabled) return;

    const matchTimeSec = Math.floor(state.matchClockMs / 1000);
    if (matchTimeSec <= 0) return;

    if (statusEndsMatch(state.status)) return;

    const windows: { marketType: MarketType; intervalSec: number }[] = [
      { marketType: MarketType.GoalInWindow, intervalSec: 300 },
      { marketType: MarketType.CornerInWindow, intervalSec: 180 },
      { marketType: MarketType.YellowCardInWindow, intervalSec: 300 },
    ];

    for (const w of windows) {
      const lastOpened = f.lastCronWindow.get(w.marketType) ?? 0;
      if (matchTimeSec - lastOpened >= w.intervalSec) {
        this.openRound(fixtureId, w.marketType, state, actions);
        f.lastCronWindow.set(w.marketType, matchTimeSec);
      }
    }
  }

  public runCronCheck(fixtureId: number, state: MatchState): void {
    const actions: TriggerAction[] = [];
    this.checkCronWindows(fixtureId, state, actions);
    if (actions.length > 0) {
      this.emit("actions", actions);
    }
  }
}
