// KickTick Client — high-level API over the audited instruction builders
// (signatures synced 2026-08-06; all ids are numeric fixture/round ids).

import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import { PROGRAM_ID } from './constants';
import { Config, Match_, Round, Position } from './types';
import * as instructions from './instructions';
import * as accounts from './accounts';
import * as pda from './pda';

export class KickTickClient {
  constructor(
    public connection: Connection,
    public programId: PublicKey = new PublicKey(PROGRAM_ID)
  ) {}

  // Reads
  getConfig(): Promise<Config | null> {
    return accounts.fetchConfig(this.connection, this.programId);
  }
  getMatch(fixtureId: bigint | number): Promise<Match_ | null> {
    return accounts.fetchMatch(this.connection, fixtureId, this.programId);
  }
  getRound(fixtureId: bigint | number, roundId: bigint | number): Promise<Round | null> {
    return accounts.fetchRound(this.connection, fixtureId, roundId, this.programId);
  }
  getPosition(fixtureId: bigint | number, roundId: bigint | number, owner: PublicKey): Promise<Position | null> {
    return accounts.fetchPosition(this.connection, fixtureId, roundId, owner, this.programId);
  }

  // Writes
  async initMatch(admin: Keypair, fixtureId: bigint | number, homeTeam: string, awayTeam: string): Promise<string> {
    return this.sendTx(new Transaction().add(
      instructions.buildInitMatch(admin.publicKey, fixtureId, homeTeam, awayTeam, this.programId)), [admin]);
  }
  async openRound(admin: Keypair, fixtureId: bigint | number, roundId: bigint | number, marketType: number, lockSeconds: number, deadlineSeconds: number): Promise<string> {
    return this.sendTx(new Transaction().add(
      instructions.buildOpenRound(admin.publicKey, fixtureId, roundId, marketType, lockSeconds, deadlineSeconds, this.programId)), [admin]);
  }
  async placeBet(bettor: Keypair, fixtureId: bigint | number, roundId: bigint | number, side: number, amount: bigint | number): Promise<string> {
    return this.sendTx(new Transaction().add(
      instructions.buildPlaceBet(bettor.publicKey, fixtureId, roundId, side, amount, this.programId)), [bettor]);
  }
  async settleOffchainRound(caller: Keypair, fixtureId: bigint | number, roundId: bigint | number, outcome: number, winner: number): Promise<string> {
    return this.sendTx(new Transaction().add(
      instructions.buildSettleOffchainRound(caller.publicKey, fixtureId, roundId, outcome, winner, this.programId)), [caller]);
  }
  async confirmRound(caller: Keypair, fixtureId: bigint | number, roundId: bigint | number): Promise<string> {
    return this.sendTx(new Transaction().add(
      instructions.buildConfirmRound(caller.publicKey, fixtureId, roundId, this.programId)), [caller]);
  }
  async claimWinnings(claimer: Keypair, fixtureId: bigint | number, roundId: bigint | number): Promise<string> {
    return this.sendTx(new Transaction().add(
      instructions.buildClaimWinnings(claimer.publicKey, fixtureId, roundId, this.programId)), [claimer]);
  }
  async refundBet(bettor: Keypair, fixtureId: bigint | number, roundId: bigint | number): Promise<string> {
    return this.sendTx(new Transaction().add(
      instructions.buildRefundBet(bettor.publicKey, fixtureId, roundId, this.programId)), [bettor]);
  }
  async cancelRound(authority: Keypair, fixtureId: bigint | number, roundId: bigint | number): Promise<string> {
    return this.sendTx(new Transaction().add(
      instructions.buildCancelRound(authority.publicKey, fixtureId, roundId, this.programId)), [authority]);
  }
  async challengeEquivocation(caller: Keypair, fixtureId: bigint | number, roundId: bigint | number): Promise<string> {
    return this.sendTx(new Transaction().add(
      instructions.buildChallengeEquivocation(caller.publicKey, fixtureId, roundId, this.programId)), [caller]);
  }

  private async sendTx(tx: Transaction, signers: Keypair[]): Promise<string> {
    tx.feePayer = signers[0]!.publicKey;
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.sign(...signers);
    const sig = await this.connection.sendRawTransaction(tx.serialize());
    await this.connection.confirmTransaction(sig);
    return sig;
  }

  // PDA helpers
  static findConfigPda = pda.findConfigPda;
  static findMatchPda = pda.findMatchPda;
  static findMatchVaultPda = pda.findMatchVaultPda;
  static findRoundPda = pda.findRoundPda;
  static findPositionPda = pda.findPositionPda;
  static findSponsorVaultPda = pda.findSponsorVaultPda;
}
