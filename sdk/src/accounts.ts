// KickTick Account Fetchers

import { Connection, PublicKey } from '@solana/web3.js';
import { Config, Match_, Round, Position, SponsorVault } from './types';
import { findConfigPda, findMatchPda, findRoundPda, findPositionPda, findSponsorVaultPda } from './pda';

export async function fetchConfig(connection: Connection): Promise<Config | null> {
  const [configPda] = findConfigPda();
  const accountInfo = await connection.getAccountInfo(configPda);
  if (!accountInfo) return null;
  // Deserialize with Anchor layout
  return {
    admin: accountInfo.data.slice(8, 40).toString(),
    treasury: accountInfo.data.slice(40, 72).toString(),
    fee_bps: accountInfo.data.readUInt16LE(72),
    min_bet: Number(accountInfo.data.readBigUInt64LE(74)),
    max_bet: Number(accountInfo.data.readBigUInt64LE(82)),
    bump: accountInfo.data[90],
  };
}

export async function fetchMatch(connection: Connection, fixtureId: string): Promise<Match_ | null> {
  const [matchPda] = findMatchPda(fixtureId);
  const accountInfo = await connection.getAccountInfo(matchPda);
  if (!accountInfo) return null;
  return {
    fixture_id: fixtureId,
    home_team: '',
    away_team: '',
    status: accountInfo.data[8],
    start_time: Number(accountInfo.data.readBigInt64LE(9)),
    end_time: Number(accountInfo.data.readBigInt64LE(17)),
    home_score: accountInfo.data[25],
    away_score: accountInfo.data[26],
    bump: accountInfo.data[27],
  };
}

export async function fetchRound(connection: Connection, match: PublicKey, roundId: number): Promise<Round | null> {
  const [roundPda] = findRoundPda(match, roundId);
  const accountInfo = await connection.getAccountInfo(roundPda);
  if (!accountInfo) return null;
  return {
    match: match.toString(),
    round_id: roundId,
    market_type: accountInfo.data[8],
    status: accountInfo.data[9],
    lock_time: Number(accountInfo.data.readBigInt64LE(10)),
    deadline: Number(accountInfo.data.readBigInt64LE(18)),
    total_pool: Number(accountInfo.data.readBigUInt64LE(26)),
    home_pool: Number(accountInfo.data.readBigUInt64LE(34)),
    away_pool: Number(accountInfo.data.readBigUInt64LE(42)),
    draw_pool: Number(accountInfo.data.readBigUInt64LE(50)),
    outcome: accountInfo.data[58],
    bump: accountInfo.data[59],
  };
}

export async function fetchPosition(connection: Connection, round: PublicKey, owner: PublicKey): Promise<Position | null> {
  const [positionPda] = findPositionPda(round, owner);
  const accountInfo = await connection.getAccountInfo(positionPda);
  if (!accountInfo) return null;
  return {
    owner: owner.toString(),
    round: round.toString(),
    side: accountInfo.data[8],
    amount: Number(accountInfo.data.readBigUInt64LE(9)),
    claimed: accountInfo.data[17] === 1,
    bump: accountInfo.data[18],
  };
}

export async function fetchSponsorVault(connection: Connection, match: PublicKey): Promise<SponsorVault | null> {
  const [vaultPda] = findSponsorVaultPda(match);
  const accountInfo = await connection.getAccountInfo(vaultPda);
  if (!accountInfo) return null;
  return {
    match: match.toString(),
    amount: Number(accountInfo.data.readBigUInt64LE(8)),
    bump: accountInfo.data[16],
  };
}
