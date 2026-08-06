// KickTick PDA Helpers — seeds verified against programs/kicktick/src:
//   match:    ["match", fixture_id i64 LE]
//   vault:    ["match_vault", match_pda]
//   round:    ["round", match_pda, round_id u64 LE]
//   position: ["position", fixture_id i64 LE, round_id u64 LE, owner]
//   config:   ["config"]          sponsor_vault: ["sponsor_vault"] (global)

import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, SEEDS } from './constants';

export function i64Le(v: bigint | number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(v));
  return b;
}

export function u64Le(v: bigint | number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(v));
  return b;
}

export function findConfigPda(programId: PublicKey = new PublicKey(PROGRAM_ID)): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(SEEDS.CONFIG)], programId);
}

export function findMatchPda(fixtureId: bigint | number, programId: PublicKey = new PublicKey(PROGRAM_ID)): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.MATCH), i64Le(fixtureId)],
    programId
  );
}

export function findMatchVaultPda(match: PublicKey, programId: PublicKey = new PublicKey(PROGRAM_ID)): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.MATCH_VAULT), match.toBuffer()],
    programId
  );
}

export function findRoundPda(match: PublicKey, roundId: bigint | number, programId: PublicKey = new PublicKey(PROGRAM_ID)): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.ROUND), match.toBuffer(), u64Le(roundId)],
    programId
  );
}

export function findPositionPda(fixtureId: bigint | number, roundId: bigint | number, owner: PublicKey, programId: PublicKey = new PublicKey(PROGRAM_ID)): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.POSITION), i64Le(fixtureId), u64Le(roundId), owner.toBuffer()],
    programId
  );
}

export function findSponsorVaultPda(programId: PublicKey = new PublicKey(PROGRAM_ID)): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(SEEDS.SPONSOR_VAULT)], programId);
}
