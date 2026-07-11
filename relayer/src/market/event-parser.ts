import { TxLineSseEvent } from "../clients/txline-client";

export enum SoccerAction {
  Goal = "goal",
  Corner = "corner",
  YellowCard = "yellow_card",
  RedCard = "red_card",
  Penalty = "penalty",
  PenaltyOutcome = "penalty_outcome",
  Shot = "shot",
  FreeKick = "free_kick",
  ThrowIn = "throw_in",
  GoalKick = "goal_kick",
  Var = "var",
  VarEnd = "var_end",
  Possible = "possible",
  Status = "status",
  ScoreAdjustment = "score_adjustment",
  AdditionalTime = "additional_time",
  Kickoff = "kickoff",
  Substitution = "substitution",
  Injury = "injury",
  Suspend = "suspend",
}

export enum StatusId {
  NotStarted = 1,
  FirstHalf = 2,
  HalfTime = 3,
  SecondHalf = 4,
  FullTime = 5,
  WaitingExtraTime = 6,
  ExtraTimeFirstHalf = 7,
  ExtraTimeHalfTime = 8,
  ExtraTimeSecondHalf = 9,
  FinishedAfterExtraTime = 10,
  WaitingPenaltyShootout = 11,
  PenaltyShootout = 12,
  FinishedAfterPenaltyShootout = 13,
  Interrupted = 14,
  Abandoned = 15,
  Cancelled = 16,
}

export enum GoalType {
  Shot = "Shot",
  Head = "Head",
  Own = "Own",
  Other = "Other",
}

export enum VarType {
  Goal = "Goal",
  Penalty = "Penalty",
  RedCard = "RedCard",
  SecondYellowCard = "SecondYellowCard",
  CornerKick = "CornerKick",
  Other = "Other",
}

export enum MarketType {
  NextGoalSide = "NextGoalSide",
  GoalInWindow = "GoalInWindow",
  NextCorner = "NextCorner",
  CornerInWindow = "CornerInWindow",
  NextYellowCard = "NextYellowCard",
  YellowCardInWindow = "YellowCardInWindow",
  RedCardInMatch = "RedCardInMatch",
  PenaltyShootoutShot = "PenaltyShootoutShot",
  PenaltyShot = "PenaltyShot",
  VARCheck = "VARCheck",
}

export interface SoccerScorePeriod {
  Goals: number;
  YellowCards: number;
  RedCards: number;
  Corners: number;
}

export interface SoccerTotalScore {
  Total?: SoccerScorePeriod;
  H1?: SoccerScorePeriod;
  H2?: SoccerScorePeriod;
  HT?: SoccerScorePeriod;
  ET1?: SoccerScorePeriod;
  ET2?: SoccerScorePeriod;
  PE?: SoccerScorePeriod;
  ETTotal?: SoccerScorePeriod;
}

export interface SoccerFixtureScore {
  Participant1: SoccerTotalScore;
  Participant2: SoccerTotalScore;
}

export interface SoccerData {
  Participant?: number;
  PlayerId?: number;
  GoalType?: string;
  Outcome?: string;
  FreeKickType?: string;
  ThrowInType?: string;
  Type?: string;
  StatusId?: number;
  Minutes?: number;
  PlayerInId?: number;
  PlayerOutId?: number;
  Goal?: boolean;
  Corner?: boolean;
  Penalty?: boolean;
  RedCard?: boolean;
  YellowCard?: boolean;
  VAR?: boolean;
}

export interface ScoresSseData {
  fixtureId: number;
  action: string;
  participant?: number;
  gameState: string;
  id: number;
  seq: number;
  ts: number;
  confirmed?: boolean;
  clock?: { running: boolean; seconds: number };
  dataSoccer?: SoccerData;
  scoreSoccer?: SoccerFixtureScore;
}

export interface GoalEvent {
  action: SoccerAction.Goal;
  participant?: 1 | 2;
  goalType: GoalType;
  playerId?: number;
  seq?: number;
}

export interface CornerEvent {
  action: SoccerAction.Corner;
  participant?: 1 | 2;
  seq?: number;
}

export interface YellowCardEvent {
  action: SoccerAction.YellowCard;
  participant?: 1 | 2;
  playerId?: number;
  seq?: number;
}

export interface RedCardEvent {
  action: SoccerAction.RedCard;
  participant?: 1 | 2;
  playerId?: number;
  redCardType: "StraightRed" | "SecondYellow";
  seq?: number;
}

export interface PenaltyAwardedEvent {
  action: SoccerAction.Penalty;
  participant?: 1 | 2;
  seq?: number;
}

export interface PenaltyOutcomeEvent {
  action: SoccerAction.PenaltyOutcome;
  participant?: 1 | 2;
  outcome: "Scored" | "Missed" | "Retake";
  followsAction?: unknown;
  seq?: number;
}

export interface ShotEvent {
  action: SoccerAction.Shot;
  participant?: 1 | 2;
  outcome: "OnTarget" | "OffTarget" | "Woodwork" | "Blocked";
  seq?: number;
}

export interface FreeKickEvent {
  action: SoccerAction.FreeKick;
  participant?: 1 | 2;
  freeKickType?: string;
  seq?: number;
}

export interface ThrowInEvent {
  action: SoccerAction.ThrowIn;
  participant?: 1 | 2;
  throwInType?: string;
  seq?: number;
}

export interface GoalKickEvent {
  action: SoccerAction.GoalKick;
  participant?: 1 | 2;
  seq?: number;
}

export interface VarCheckEvent {
  action: SoccerAction.Var;
  participant?: 1 | 2;
  varType: VarType;
  seq?: number;
}

export interface VarEndEvent {
  action: SoccerAction.VarEnd;
  participant?: 1 | 2;
  outcome: "Stands" | "Overturned";
  seq?: number;
}

export interface PossibleEvent {
  action: SoccerAction.Possible;
  participant?: 1 | 2;
  possibleGoal?: boolean;
  possiblePenalty?: boolean;
  possibleCorner?: boolean;
  possibleYellowCard?: boolean;
  possibleRedCard?: boolean;
  possibleVar?: boolean;
  seq?: number;
}

export interface StatusChangeEvent {
  action: SoccerAction.Status;
  participant?: 1 | 2;
  statusId: StatusId;
  seq?: number;
}

export interface ScoreAdjustmentEvent {
  action: SoccerAction.ScoreAdjustment;
  participant?: 1 | 2;
  score: Record<string, unknown>;
  seq?: number;
}

export interface AdditionalTimeEvent {
  action: SoccerAction.AdditionalTime;
  participant?: 1 | 2;
  minutes: number;
  seq?: number;
}

export interface KickoffEvent {
  action: SoccerAction.Kickoff;
  participant?: 1 | 2;
  seq?: number;
}

export interface SubstitutionEvent {
  action: SoccerAction.Substitution;
  participant?: 1 | 2;
  playerInId: number;
  playerOutId: number;
  seq?: number;
}

export interface InjuryEvent {
  action: SoccerAction.Injury;
  participant?: 1 | 2;
  playerId?: number;
  outcome?: "OnPitch" | "OffPitch" | "NotReturning";
  seq?: number;
}

export interface SuspendEvent {
  action: SoccerAction.Suspend;
  participant?: 1 | 2;
  reliable: boolean;
  seq?: number;
}

export type SoccerEvent =
  | GoalEvent
  | CornerEvent
  | YellowCardEvent
  | RedCardEvent
  | PenaltyAwardedEvent
  | PenaltyOutcomeEvent
  | ShotEvent
  | FreeKickEvent
  | ThrowInEvent
  | GoalKickEvent
  | VarCheckEvent
  | VarEndEvent
  | PossibleEvent
  | StatusChangeEvent
  | ScoreAdjustmentEvent
  | AdditionalTimeEvent
  | KickoffEvent
  | SubstitutionEvent
  | InjuryEvent
  | SuspendEvent;

export function isStatusId(value: number): value is StatusId {
  return Number.isInteger(value) && value >= 1 && value <= 16;
}

const GAME_STATE_MAP: Record<string, StatusId> = {
  "NS": StatusId.NotStarted,
  "H1": StatusId.FirstHalf,
  "HT": StatusId.HalfTime,
  "H2": StatusId.SecondHalf,
  "F":  StatusId.FullTime,
  "WET": StatusId.WaitingExtraTime,
  "ET1": StatusId.ExtraTimeFirstHalf,
  "HTET": StatusId.ExtraTimeHalfTime,
  "ET2": StatusId.ExtraTimeSecondHalf,
  "FET": StatusId.FinishedAfterExtraTime,
  "WPE": StatusId.WaitingPenaltyShootout,
  "PE": StatusId.PenaltyShootout,
  "FPE": StatusId.FinishedAfterPenaltyShootout,
  "I":  StatusId.Interrupted,
  "A":  StatusId.Abandoned,
  "C":  StatusId.Cancelled,
};

export function gameStateToStatusId(gameState: string): StatusId | undefined {
  return GAME_STATE_MAP[gameState];
}

export function parseSoccerEvent(event: TxLineSseEvent): SoccerEvent | null {
  let raw: ScoresSseData;
  try {
    raw = JSON.parse(event.data);
  } catch {
    throw new Error(`Invalid JSON in SSE data: ${event.data}`);
  }

  const action = raw.action;
  const participant = parseParticipant(raw.participant ?? raw.dataSoccer?.Participant);

  if (!action) {
    throw new Error("Missing action field in SSE data");
  }

  switch (action) {
    case SoccerAction.Goal:
      return {
        action: SoccerAction.Goal,
        participant,
        goalType: parseGoalType(raw.dataSoccer?.GoalType),
        playerId: raw.dataSoccer?.PlayerId,
        seq: raw.seq,
      };

    case SoccerAction.Corner:
      return {
        action: SoccerAction.Corner,
        participant,
        seq: raw.seq,
      };

    case SoccerAction.YellowCard:
      return { action: SoccerAction.YellowCard, participant, playerId: raw.dataSoccer?.PlayerId, seq: raw.seq };

    case SoccerAction.RedCard:
      return {
        action: SoccerAction.RedCard,
        participant,
        playerId: raw.dataSoccer?.PlayerId,
        redCardType: parseRedCardType(raw.dataSoccer?.Type),
        seq: raw.seq,
      };

    case SoccerAction.Penalty:
      return { action: SoccerAction.Penalty, participant, seq: raw.seq };

    case SoccerAction.PenaltyOutcome:
      return {
        action: SoccerAction.PenaltyOutcome,
        participant,
        outcome: parsePenaltyOutcome(raw.dataSoccer?.Outcome),
        followsAction: undefined,
        seq: raw.seq,
      };

    case SoccerAction.Shot:
      return {
        action: SoccerAction.Shot,
        participant,
        outcome: parseShotOutcome(raw.dataSoccer?.Outcome),
        seq: raw.seq,
      };

    case SoccerAction.FreeKick:
      return {
        action: SoccerAction.FreeKick,
        participant,
        freeKickType: raw.dataSoccer?.FreeKickType,
        seq: raw.seq,
      };

    case SoccerAction.ThrowIn:
      return {
        action: SoccerAction.ThrowIn,
        participant,
        throwInType: raw.dataSoccer?.ThrowInType,
        seq: raw.seq,
      };

    case SoccerAction.GoalKick:
      return { action: SoccerAction.GoalKick, participant, seq: raw.seq };

    case SoccerAction.Var:
      return {
        action: SoccerAction.Var,
        participant,
        varType: parseVarType(raw.dataSoccer?.Type),
        seq: raw.seq,
      };

    case SoccerAction.VarEnd:
      return {
        action: SoccerAction.VarEnd,
        participant,
        outcome: parseVarEndOutcome(raw.dataSoccer?.Outcome),
        seq: raw.seq,
      };

    case SoccerAction.Possible: {
      const d = raw.dataSoccer || {};
      return {
        action: SoccerAction.Possible,
        participant,
        possibleGoal: d.Goal,
        possiblePenalty: d.Penalty,
        possibleCorner: d.Corner,
        possibleYellowCard: d.YellowCard,
        possibleRedCard: d.RedCard,
        possibleVar: d.VAR,
        seq: raw.seq,
      };
    }

    case SoccerAction.Status: {
      const statusId = raw.dataSoccer?.StatusId;
      if (typeof statusId !== "number" || !isStatusId(statusId)) {
        const fromGameState = gameStateToStatusId(raw.gameState);
        if (fromGameState !== undefined) {
          return { action: SoccerAction.Status, participant, statusId: fromGameState, seq: raw.seq };
        }
        throw new Error(`Invalid or missing StatusId: ${statusId}, gameState: ${raw.gameState}`);
      }
      return { action: SoccerAction.Status, participant, statusId, seq: raw.seq };
    }

    case SoccerAction.ScoreAdjustment:
      return {
        action: SoccerAction.ScoreAdjustment,
        participant,
        score: (raw.scoreSoccer as unknown as Record<string, unknown>) || {},
        seq: raw.seq,
      };

    case SoccerAction.AdditionalTime:
      return {
        action: SoccerAction.AdditionalTime,
        participant,
        minutes: raw.dataSoccer?.Minutes ?? 0,
        seq: raw.seq,
      };

    case SoccerAction.Kickoff:
      return { action: SoccerAction.Kickoff, participant, seq: raw.seq };

    case SoccerAction.Substitution:
      return {
        action: SoccerAction.Substitution,
        participant,
        playerInId: raw.dataSoccer?.PlayerInId ?? 0,
        playerOutId: raw.dataSoccer?.PlayerOutId ?? 0,
        seq: raw.seq,
      };

    case SoccerAction.Injury:
      return {
        action: SoccerAction.Injury,
        participant,
        playerId: raw.dataSoccer?.PlayerId,
        outcome: parseInjuryOutcome(raw.dataSoccer?.Outcome),
        seq: raw.seq,
      };

    case SoccerAction.Suspend:
      return {
        action: SoccerAction.Suspend,
        participant,
        reliable: raw.confirmed ?? false,
        seq: raw.seq,
      };

    default:
      console.warn(`Unknown soccer action: ${action}`);
      return null;
  }
}

function extractString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  return fallback;
}

function extractOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function extractNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function extractBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function extractOptionalBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function parseParticipant(val: unknown): 1 | 2 | undefined {
  if (val === 1) return 1;
  if (val === 2) return 2;
  return undefined;
}

function parseGoalType(val: unknown): GoalType {
  if (typeof val === 'string' && Object.values(GoalType).includes(val as GoalType)) {
    return val as GoalType;
  }
  return GoalType.Shot;
}

function parseVarType(val: unknown): VarType {
  if (typeof val === 'string' && Object.values(VarType).includes(val as VarType)) {
    return val as VarType;
  }
  return VarType.Goal;
}

function parseRedCardType(val: unknown): "StraightRed" | "SecondYellow" {
  if (val === "StraightRed") return "StraightRed";
  if (val === "SecondYellow") return "SecondYellow";
  return "StraightRed";
}

function parsePenaltyOutcome(val: unknown): "Scored" | "Missed" | "Retake" {
  if (val === "Scored") return "Scored";
  if (val === "Missed") return "Missed";
  if (val === "Retake") return "Retake";
  return "Scored";
}

function parseShotOutcome(val: unknown): "OnTarget" | "OffTarget" | "Woodwork" | "Blocked" {
  if (val === "OnTarget") return "OnTarget";
  if (val === "OffTarget") return "OffTarget";
  if (val === "Woodwork") return "Woodwork";
  if (val === "Blocked") return "Blocked";
  return "OnTarget";
}

function parseVarEndOutcome(val: unknown): "Stands" | "Overturned" {
  if (val === "Stands") return "Stands";
  if (val === "Overturned") return "Overturned";
  return "Stands";
}

function parseInjuryOutcome(val: unknown): "OnPitch" | "OffPitch" | "NotReturning" | undefined {
  if (val === "OnPitch") return "OnPitch";
  if (val === "OffPitch") return "OffPitch";
  if (val === "NotReturning") return "NotReturning";
  return undefined;
}

export function getTriggeredMarketTypes(event: SoccerEvent): MarketType[] {
  switch (event.action) {
    case SoccerAction.Goal:
      return [MarketType.NextGoalSide];

    case SoccerAction.Corner:
      return [MarketType.NextCorner];

    case SoccerAction.YellowCard:
      return [MarketType.NextYellowCard];

    case SoccerAction.RedCard:
      return [MarketType.RedCardInMatch];

    case SoccerAction.Penalty:
      return [MarketType.PenaltyShot];

    case SoccerAction.PenaltyOutcome:
      return [MarketType.PenaltyShot, MarketType.PenaltyShootoutShot];

    case SoccerAction.Var:
      return [MarketType.VARCheck];

    case SoccerAction.VarEnd:
      return [MarketType.VARCheck];

    case SoccerAction.Status: {
      const { statusId } = event;
      if (
        statusId === StatusId.FullTime ||
        statusId === StatusId.FinishedAfterExtraTime ||
        statusId === StatusId.FinishedAfterPenaltyShootout
      ) {
        return [MarketType.RedCardInMatch];
      }
      if (statusId === StatusId.PenaltyShootout) {
        return [MarketType.PenaltyShootoutShot];
      }
      return [];
    }

    default:
      return [];
  }
}
