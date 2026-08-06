// KickTick Program Types — layouts verified against programs/kicktick/src/state
// (audit 2026-08-06). Offsets are Borsh/Anchor with the 8-byte discriminator.

export interface Config {
  admin: string;                    // 8..40
  txoracleProgramId: string;        // 40..72
  dailyScoresMerkleRoots: string;   // 72..104
  finalityDelay: bigint;            // 104..112 (i64)
  minLiquidity: bigint;             // 112..120 (u64)
  bump: number;                     // 120
}

export interface Match_ {
  fixtureId: bigint;      // 8..16
  status: number;         // 16
  homeTeam: string;       // 17..  (4-byte len + bytes, max 64)
  awayTeam: string;
  competitionId: number;  // i32
  vaultBump: number;
  roundCounter: bigint;
  totalDeposited: bigint;
  totalSponsored: bigint;
  createdAt: bigint;
}

export interface Round {
  matchPda: string;       // 8..40
  roundId: bigint;        // 40..48
  marketType: number;     // 48
  lockSeconds: bigint;    // 49..57 (params)
  deadlineSeconds: bigint;// 57..65
  settlementModel: number;// 65 (0=OnChain, 1=OffChain)
  status: number;         // 66
  outcome: number;        // 67
  totalYes: bigint;       // 68..76
  totalNo: bigint;        // 76..84
  totalAbstain: bigint;   // 84..92
  expiresAt: bigint;      // 92..100
  settleAt: bigint;       // 100..108
  winner: number | null;  // 108..110 (Option<u8>)
  claimed: boolean;       // 110
  bump: number;           // 111
}

export interface Position {
  owner: string;      // 8..40
  fixtureId: bigint;  // 40..48
  roundId: bigint;    // 48..56
  side: number;       // 56
  amount: bigint;     // 57..65
  claimed: boolean;   // 65
  version: number;    // 66 (2 = current; legacy bump byte tolerated)
}

export interface SponsorVault {
  bump: number;
}

export interface RoundParams {
  lockSeconds: bigint;
  deadlineSeconds: bigint;
}
