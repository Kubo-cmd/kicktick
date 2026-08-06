// KickTick Program Constants

export const PROGRAM_ID = 'CCmcpUZttSJqUabxBcyvHp4uC89EkrXce5YSEvRgE7tc';
export const DEVNET_PROGRAM_ID = 'a9G9tTEmeALLBi2zf7zR4adbpR4U1N3r6cgRtZUV3o2';

export const SEEDS = {
  CONFIG: 'config',
  MATCH: 'match',
  ROUND: 'round',
  POSITION: 'position',
  SPONSOR_VAULT: 'sponsor_vault',
} as const;

export const MARKET_TYPES = {
  MATCH_WINNER: 0,
  OVER_UNDER: 1,
  EXACT_SCORE: 2,
} as const;

export const ROUND_STATUS = {
  OPEN: 0,
  LOCKED: 1,
  SETTLED: 2,
  CANCELLED: 3,
} as const;

export const MATCH_STATUS = {
  SCHEDULED: 0,
  LIVE: 1,
  FINISHED: 2,
  CANCELLED: 3,
} as const;
