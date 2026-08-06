// KickTick Program Constants — synced to programs/kicktick/src/constants.rs
// and state/*.rs (audit 2026-08-06, commit dba011e).

export const PROGRAM_ID = 'CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc'; // localnet declare_id
export const DEVNET_PROGRAM_ID = 'a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2';
export const TXORACLE_PROGRAM_ID = '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J';

export const SEEDS = {
  CONFIG: 'config',
  MATCH: 'match',
  MATCH_VAULT: 'match_vault',
  ROUND: 'round',
  POSITION: 'position',
  SPONSOR_VAULT: 'sponsor_vault',
} as const;

// MarketType enum order in state/round.rs (Borsh ordinal = index).
export const MARKET_TYPE = {
  NextGoalSide: 0,
  GoalInWindow: 1,
  NextCorner: 2,
  CornerInWindow: 3,
  NextYellowCard: 4,
  YellowCardInWindow: 5,
  RedCardInMatch: 6,
  PenaltyShootoutShot: 7,
  PenaltyShot: 8,     // off-chain settlement
  VARCheck: 9,        // off-chain settlement
} as const;
export type MarketTypeName = keyof typeof MARKET_TYPE;

// Off-chain settled markets (relayer-set outcomes); rest are CPI (currently fail-closed).
export const OFFCHAIN_MARKETS: readonly number[] = [MARKET_TYPE.PenaltyShot, MARKET_TYPE.VARCheck];

// RoundStatus enum order in state/round.rs.
export const ROUND_STATUS = {
  Open: 0,
  Locked: 1,
  ResolvedPending: 2,
  Settled: 3,
  Voided: 4,
  Cancelled: 5,
} as const;

// RoundOutcome enum order in state/round.rs.
export const ROUND_OUTCOME = {
  None: 0,
  Yes: 1,
  No: 2,
  NoGoal: 3,
  Home: 4,
  Away: 5,
  Cancelled: 6,
} as const;

export const MATCH_STATUS = {
  Pending: 0,
  Live: 1,
  Finished: 2,
  Cancelled: 3,
} as const;

// Position side mapping: 0=YES, 1=NO, 2=abstain (state/position.rs).
export const SIDE = { Yes: 0, No: 1, Abstain: 2 } as const;

// Timing (constants.rs).
export const MIN_MARKET_DURATION = 15;
export const MAX_MARKET_DURATION = 300;
export const FINALITY_DELAY_SECONDS = 60;
export const MIN_ROUND_LIQUIDITY = 10_000_000; // 0.01 SOL
