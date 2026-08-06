// KickTick PDA Helpers

import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID, SEEDS } from './constants';

export function findConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.CONFIG)],
    new PublicKey(PROGRAM_ID)
  );
}

export function findMatchPda(fixtureId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.MATCH), Buffer.from(fixtureId)],
    new PublicKey(PROGRAM_ID)
  );
}

export function findRoundPda(match: PublicKey, roundId: number): [PublicKey, number] {
  const roundIdBuffer = Buffer.alloc(8);
  roundIdBuffer.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.ROUND), match.toBuffer(), roundIdBuffer],
    new PublicKey(PROGRAM_ID)
  );
}

export function findPositionPda(round: PublicKey, owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.POSITION), round.toBuffer(), owner.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
}

export function findSponsorVaultPda(match: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.SPONSOR_VAULT), match.toBuffer()],
    new PublicKey(PROGRAM_ID)
  );
}
