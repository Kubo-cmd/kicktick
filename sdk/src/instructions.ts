// KickTick Instruction Builders

import { PublicKey, TransactionInstruction } from '@solana/web3.js';
import { PROGRAM_ID } from './constants';
import { findConfigPda, findMatchPda, findRoundPda, findPositionPda, findSponsorVaultPda } from './pda';

export function buildInitConfig(
  admin: PublicKey,
  treasury: PublicKey,
  feeBps: number,
  minBet: number,
  maxBet: number
): TransactionInstruction {
  const [config] = findConfigPda();
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: false },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false }, // system program
    ],
    data: Buffer.from([0]), // discriminator + args serialized by Anchor
  });
}

export function buildInitMatch(
  admin: PublicKey,
  fixtureId: string,
  homeTeam: string,
  awayTeam: string
): TransactionInstruction {
  const [config] = findConfigPda();
  const [match] = findMatchPda(fixtureId);
  const [sponsorVault] = findSponsorVaultPda(match);
  
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: match, isSigner: false, isWritable: true },
      { pubkey: sponsorVault, isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  });
}

export function buildOpenRound(
  admin: PublicKey,
  match: PublicKey,
  roundId: number,
  marketType: number,
  lockSeconds: number,
  deadlineSeconds: number
): TransactionInstruction {
  const [config] = findConfigPda();
  const [round] = findRoundPda(match, roundId);
  
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: match, isSigner: false, isWritable: false },
      { pubkey: round, isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([2]),
  });
}

export function buildPlaceBet(
  bettor: PublicKey,
  match: PublicKey,
  round: PublicKey,
  fixtureId: string,
  roundId: number,
  side: number,
  amount: number
): TransactionInstruction {
  const [config] = findConfigPda();
  const [position] = findPositionPda(round, bettor);
  
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: match, isSigner: false, isWritable: false },
      { pubkey: round, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: bettor, isSigner: true, isWritable: true },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([3]),
  });
}

export function buildClaimWinnings(
  claimer: PublicKey,
  match: PublicKey,
  round: PublicKey,
  fixtureId: string,
  roundId: number
): TransactionInstruction {
  const [config] = findConfigPda();
  const [position] = findPositionPda(round, claimer);
  
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: match, isSigner: false, isWritable: false },
      { pubkey: round, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: claimer, isSigner: true, isWritable: true },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([4]),
  });
}

export function buildConfirmRound(
  admin: PublicKey,
  match: PublicKey,
  round: PublicKey,
  outcome: number
): TransactionInstruction {
  const [config] = findConfigPda();
  
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: match, isSigner: false, isWritable: true },
      { pubkey: round, isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true, isWritable: true },
    ],
    data: Buffer.from([5]),
  });
}

export function buildCancelRound(
  admin: PublicKey,
  match: PublicKey,
  round: PublicKey
): TransactionInstruction {
  const [config] = findConfigPda();
  
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: match, isSigner: false, isWritable: true },
      { pubkey: round, isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true, isWritable: true },
    ],
    data: Buffer.from([6]),
  });
}

export function buildRefundBet(
  bettor: PublicKey,
  match: PublicKey,
  round: PublicKey,
  fixtureId: string,
  roundId: number
): TransactionInstruction {
  const [config] = findConfigPda();
  const [position] = findPositionPda(round, bettor);
  
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: match, isSigner: false, isWritable: false },
      { pubkey: round, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: bettor, isSigner: true, isWritable: true },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([7]),
  });
}

export function buildFundSponsor(
  sponsor: PublicKey,
  match: PublicKey,
  amount: number
): TransactionInstruction {
  const [sponsorVault] = findSponsorVaultPda(match);
  
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: match, isSigner: false, isWritable: false },
      { pubkey: sponsorVault, isSigner: false, isWritable: true },
      { pubkey: sponsor, isSigner: true, isWritable: true },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([8]),
  });
}

export function buildChallengeEquivocation(
  challenger: PublicKey,
  match: PublicKey,
  round: PublicKey
): TransactionInstruction {
  const [config] = findConfigPda();
  
  return new TransactionInstruction({
    programId: new PublicKey(PROGRAM_ID),
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: match, isSigner: false, isWritable: true },
      { pubkey: round, isSigner: false, isWritable: true },
      { pubkey: challenger, isSigner: true, isWritable: true },
    ],
    data: Buffer.from([9]),
  });
}
