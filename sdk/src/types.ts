// KickTick Program Types

export interface Config {
  admin: string;
  treasury: string;
  fee_bps: number;
  min_bet: number;
  max_bet: number;
  bump: number;
}

export interface Match_ {
  fixture_id: string;
  home_team: string;
  away_team: string;
  status: number;
  start_time: number;
  end_time: number;
  home_score: number;
  away_score: number;
  bump: number;
}

export interface Round {
  match: string;
  round_id: number;
  market_type: number;
  status: number;
  lock_time: number;
  deadline: number;
  total_pool: number;
  home_pool: number;
  away_pool: number;
  draw_pool: number;
  outcome: number;
  bump: number;
}

export interface Position {
  owner: string;
  round: string;
  side: number;
  amount: number;
  claimed: boolean;
  bump: number;
}

export interface SponsorVault {
  match: string;
  amount: number;
  bump: number;
}

export interface RoundParams {
  round_id: number;
  market_type: number;
  lock_seconds: number;
  deadline_seconds: number;
}

export type MarketType = 0 | 1 | 2;
export type RoundStatus = 0 | 1 | 2 | 3;
export type MatchStatus = 0 | 1 | 2 | 3;
export type RoundOutcome = 0 | 1 | 2; // 0=Home, 1=Away, 2=Draw
