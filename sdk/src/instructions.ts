// KickTick Instruction Builders — account layouts verified against
// programs/kicktick/src/instructions/*.rs (audit 2026-08-06).
//
// NOTE: data payloads carry the real Anchor discriminators
// (sha256("global:<ix_name>")[0..8]). Args are Borsh-serialized.

import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { createHash } from 'crypto';
import { PROGRAM_ID, SEEDS } from './constants';
import { findConfigPda, findMatchPda, findMatchVaultPda, findRoundPda, findPositionPda, findSponsorVaultPda, i64Le, u64Le } from './pda';

export function ixDiscriminator(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function borshString(s: string): Buffer {
  const bytes = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length);
  return Buffer.concat([len, bytes]);
}

// init_config(admin=upgrade authority) — accounts: admin, program, program_data, config, system_program
// Note: program/program_data are the BPF-loader accounts; callers usually pass them
// from the chain. This builder takes them explicitly.
export function buildInitConfig(
  admin: PublicKey,
  program: PublicKey,
  programData: PublicKey,
  programId: PublicKey = new PublicKey(PROGRAM_ID),
): TransactionInstruction {
  const [config] = findConfigPda(programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: program, isSigner: false, isWritable: false },
      { pubkey: programData, isSigner: false, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixDiscriminator('init_config'),
  });
}

// init_match(fixture_id, home_team, away_team) — accounts: creator, config, match_pda, match_vault, system_program
export function buildInitMatch(
  creator: PublicKey,
  fixtureId: bigint | number,
  homeTeam: string,
  awayTeam: string,
  programId: PublicKey = new PublicKey(PROGRAM_ID),
): TransactionInstruction {
  const [config] = findConfigPda(programId);
  const [matchPda] = findMatchPda(fixtureId, programId);
  const [matchVault] = findMatchVaultPda(matchPda, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: creator, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: matchPda, isSigner: false, isWritable: true },
      { pubkey: matchVault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([ixDiscriminator('init_match'), i64Le(fixtureId), borshString(homeTeam), borshString(awayTeam)]),
  });
}

// open_round(round_id, market_type, lock_seconds, deadline_seconds)
// accounts: authority, config, match_pda, round, system_program
export function buildOpenRound(
  authority: PublicKey,
  fixtureId: bigint | number,
  roundId: bigint | number,
  marketType: number,
  lockSeconds: bigint | number,
  deadlineSeconds: bigint | number,
  programId: PublicKey = new PublicKey(PROGRAM_ID),
): TransactionInstruction {
  const [config] = findConfigPda(programId);
  const [matchPda] = findMatchPda(fixtureId, programId);
  const [round] = findRoundPda(matchPda, roundId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: matchPda, isSigner: false, isWritable: true },
      { pubkey: round, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      ixDiscriminator('open_round'),
      u64Le(roundId),
      Buffer.from([marketType]), // Borsh enum ordinal
      i64Le(lockSeconds),
      i64Le(deadlineSeconds),
    ]),
  });
}

// place_bet(fixture_id, round_id, side, amount)
// accounts: bettor, match_pda, match_vault, round, position, system_program
export function buildPlaceBet(
  bettor: PublicKey,
  fixtureId: bigint | number,
  roundId: bigint | number,
  side: number,
  amount: bigint | number,
  programId: PublicKey = new PublicKey(PROGRAM_ID),
): TransactionInstruction {
  const [matchPda] = findMatchPda(fixtureId, programId);
  const [matchVault] = findMatchVaultPda(matchPda, programId);
  const [round] = findRoundPda(matchPda, roundId, programId);
  const [position] = findPositionPda(fixtureId, roundId, bettor, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: bettor, isSigner: true, isWritable: true },
      { pubkey: matchPda, isSigner: false, isWritable: true },
      { pubkey: matchVault, isSigner: false, isWritable: true },
      { pubkey: round, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      ixDiscriminator('place_bet'),
      i64Le(fixtureId),
      u64Le(roundId),
      Buffer.from([side]),
      u64Le(amount),
    ]),
  });
}

// settle_offchain_round(outcome, winner)
// accounts: caller, config, match_pda, round
export function buildSettleOffchainRound(
  caller: PublicKey,
  fixtureId: bigint | number,
  roundId: bigint | number,
  outcome: number,
  winner: number,
  programId: PublicKey = new PublicKey(PROGRAM_ID),
): TransactionInstruction {
  const [config] = findConfigPda(programId);
  const [matchPda] = findMatchPda(fixtureId, programId);
  const [round] = findRoundPda(matchPda, roundId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: caller, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: matchPda, isSigner: false, isWritable: true },
      { pubkey: round, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([
      ixDiscriminator('settle_offchain_round'),
      Buffer.from([outcome]),
      Buffer.from([winner]),
    ]),
  });
}

// confirm_round() — accounts: caller, round
export function buildConfirmRound(
  caller: PublicKey,
  fixtureId: bigint | number,
  roundId: bigint | number,
  programId: PublicKey = new PublicKey(PROGRAM_ID),
): TransactionInstruction {
  const [matchPda] = findMatchPda(fixtureId, programId);
  const [round] = findRoundPda(matchPda, roundId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: caller, isSigner: true, isWritable: false },
      { pubkey: round, isSigner: false, isWritable: true },
    ],
    data: ixDiscriminator('confirm_round'),
  });
}

// claim_winnings / refund_bet share the ClaimWinnings accounts:
// winner, match_pda, round, position, match_vault, system_program
function claimLike(
  name: 'claim_winnings' | 'refund_bet',
  winner: PublicKey,
  fixtureId: bigint | number,
  roundId: bigint | number,
  programId: PublicKey,
): TransactionInstruction {
  const [matchPda] = findMatchPda(fixtureId, programId);
  const [matchVault] = findMatchVaultPda(matchPda, programId);
  const [round] = findRoundPda(matchPda, roundId, programId);
  const [position] = findPositionPda(fixtureId, roundId, winner, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: winner, isSigner: true, isWritable: true },
      { pubkey: matchPda, isSigner: false, isWritable: true },
      { pubkey: round, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: matchVault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([ixDiscriminator(name), i64Le(fixtureId), u64Le(roundId)]),
  });
}

export function buildClaimWinnings(winner: PublicKey, fixtureId: bigint | number, roundId: bigint | number, programId: PublicKey = new PublicKey(PROGRAM_ID)): TransactionInstruction {
  return claimLike('claim_winnings', winner, fixtureId, roundId, programId);
}

export function buildRefundBet(bettor: PublicKey, fixtureId: bigint | number, roundId: bigint | number, programId: PublicKey = new PublicKey(PROGRAM_ID)): TransactionInstruction {
  return claimLike('refund_bet', bettor, fixtureId, roundId, programId);
}

// cancel_round() — accounts: authority, config, round
export function buildCancelRound(
  authority: PublicKey,
  fixtureId: bigint | number,
  roundId: bigint | number,
  programId: PublicKey = new PublicKey(PROGRAM_ID),
): TransactionInstruction {
  const [config] = findConfigPda(programId);
  const [matchPda] = findMatchPda(fixtureId, programId);
  const [round] = findRoundPda(matchPda, roundId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: round, isSigner: false, isWritable: true },
    ],
    data: ixDiscriminator('cancel_round'),
  });
}

// challenge_equivocation() — accounts: caller, config, round
export function buildChallengeEquivocation(
  caller: PublicKey,
  fixtureId: bigint | number,
  roundId: bigint | number,
  programId: PublicKey = new PublicKey(PROGRAM_ID),
): TransactionInstruction {
  const [config] = findConfigPda(programId);
  const [matchPda] = findMatchPda(fixtureId, programId);
  const [round] = findRoundPda(matchPda, roundId, programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: caller, isSigner: true, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: round, isSigner: false, isWritable: true },
    ],
    data: ixDiscriminator('challenge_equivocation'),
  });
}

// fund_sponsor / sponsor_round intentionally NOT built: both fail closed
// on-chain (SponsorFlowDisabled). findSponsorVaultPda is exported for
// read-only inspection of the global vault.
export { findSponsorVaultPda };
void SEEDS;
