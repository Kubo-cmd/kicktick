// KickTick Account Fetchers — layouts verified against
// programs/kicktick/src/state/*.rs (audit 2026-08-06).
// All offsets skip the 8-byte Anchor discriminator.

import { Connection, PublicKey } from '@solana/web3.js';
import { Config, Match_, Round, Position } from './types';
import { findConfigPda, findMatchPda, findRoundPda, findPositionPda, findSponsorVaultPda } from './pda';
import { PROGRAM_ID } from './constants';

function readPubkey(data: Buffer, off: number): string {
  return new PublicKey(data.subarray(off, off + 32)).toBase58();
}

function readBorshString(data: Buffer, off: number): [string, number] {
  const len = data.readUInt32LE(off);
  return [data.subarray(off + 4, off + 4 + len).toString('utf8'), off + 4 + len];
}

export async function fetchConfig(connection: Connection, programId: PublicKey = new PublicKey(PROGRAM_ID)): Promise<Config | null> {
  const [pda] = findConfigPda(programId);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  const d = info.data;
  return {
    admin: readPubkey(d, 8),
    txoracleProgramId: readPubkey(d, 40),
    dailyScoresMerkleRoots: readPubkey(d, 72),
    finalityDelay: d.readBigInt64LE(104),
    minLiquidity: d.readBigUInt64LE(112),
    bump: d[120]!,
  };
}

export async function fetchMatch(connection: Connection, fixtureId: bigint | number, programId: PublicKey = new PublicKey(PROGRAM_ID)): Promise<Match_ | null> {
  const [pda] = findMatchPda(fixtureId, programId);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  const d = info.data;
  const [homeTeam, off1] = readBorshString(d, 17);
  const [awayTeam, off2] = readBorshString(d, off1);
  return {
    fixtureId: d.readBigInt64LE(8),
    status: d[16]!,
    homeTeam,
    awayTeam,
    competitionId: d.readInt32LE(off2),
    vaultBump: d[off2 + 4]!,
    roundCounter: d.readBigUInt64LE(off2 + 5),
    totalDeposited: d.readBigUInt64LE(off2 + 13),
    totalSponsored: d.readBigUInt64LE(off2 + 21),
    createdAt: d.readBigInt64LE(off2 + 29),
  };
}

export async function fetchRound(connection: Connection, fixtureId: bigint | number, roundId: bigint | number, programId: PublicKey = new PublicKey(PROGRAM_ID)): Promise<Round | null> {
  const [matchPda] = findMatchPda(fixtureId, programId);
  const [pda] = findRoundPda(matchPda, roundId, programId);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  const d = info.data;
  const winnerTag = d[108]!;
  return {
    matchPda: readPubkey(d, 8),
    roundId: d.readBigUInt64LE(40),
    marketType: d[48]!,
    lockSeconds: d.readBigInt64LE(49),
    deadlineSeconds: d.readBigInt64LE(57),
    settlementModel: d[65]!,
    status: d[66]!,
    outcome: d[67]!,
    totalYes: d.readBigUInt64LE(68),
    totalNo: d.readBigUInt64LE(76),
    totalAbstain: d.readBigUInt64LE(84),
    expiresAt: d.readBigInt64LE(92),
    settleAt: d.readBigInt64LE(100),
    winner: winnerTag === 1 ? d[109]! : null,
    claimed: d[110] === 1,
    bump: d[111]!,
  };
}

export async function fetchPosition(connection: Connection, fixtureId: bigint | number, roundId: bigint | number, owner: PublicKey, programId: PublicKey = new PublicKey(PROGRAM_ID)): Promise<Position | null> {
  const [pda] = findPositionPda(fixtureId, roundId, owner, programId);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;
  const d = info.data;
  return {
    owner: readPubkey(d, 8),
    fixtureId: d.readBigInt64LE(40),
    roundId: d.readBigUInt64LE(48),
    side: d[56]!,
    amount: d.readBigUInt64LE(57),
    claimed: d[65] === 1,
    version: d[66]!,
  };
}

export async function fetchSponsorVault(connection: Connection, programId: PublicKey = new PublicKey(PROGRAM_ID)) {
  const [pda] = findSponsorVaultPda(programId);
  return connection.getAccountInfo(pda);
}
