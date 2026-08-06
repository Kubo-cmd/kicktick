// KickTick Client — High-level API

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

  // Config
  async getConfig(): Promise<Config | null> {
    return accounts.fetchConfig(this.connection);
  }

  // Matches
  async getMatch(fixtureId: string): Promise<Match_ | null> {
    return accounts.fetchMatch(this.connection, fixtureId);
  }

  async initMatch(
    admin: Keypair,
    fixtureId: string,
    homeTeam: string,
    awayTeam: string
  ): Promise<string> {
    const ix = instructions.buildInitMatch(admin.publicKey, fixtureId, homeTeam, awayTeam);
    const tx = new Transaction().add(ix);
    return this.sendTx(tx, [admin]);
  }

  // Rounds
  async getRound(match: PublicKey, roundId: number): Promise<Round | null> {
    return accounts.fetchRound(this.connection, match, roundId);
  }

  async openRound(
    admin: Keypair,
    match: PublicKey,
    roundId: number,
    marketType: number,
    lockSeconds: number,
    deadlineSeconds: number
  ): Promise<string> {
    const ix = instructions.buildOpenRound(admin.publicKey, match, roundId, marketType, lockSeconds, deadlineSeconds);
    const tx = new Transaction().add(ix);
    return this.sendTx(tx, [admin]);
  }

  async confirmRound(
    admin: Keypair,
    match: PublicKey,
    round: PublicKey,
    outcome: number
  ): Promise<string> {
    const ix = instructions.buildConfirmRound(admin.publicKey, match, round, outcome);
    const tx = new Transaction().add(ix);
    return this.sendTx(tx, [admin]);
  }

  async cancelRound(
    admin: Keypair,
    match: PublicKey,
    round: PublicKey
  ): Promise<string> {
    const ix = instructions.buildCancelRound(admin.publicKey, match, round);
    const tx = new Transaction().add(ix);
    return this.sendTx(tx, [admin]);
  }

  // Betting
  async placeBet(
    bettor: Keypair,
    match: PublicKey,
    round: PublicKey,
    fixtureId: string,
    roundId: number,
    side: number,
    amount: number
  ): Promise<string> {
    const ix = instructions.buildPlaceBet(bettor.publicKey, match, round, fixtureId, roundId, side, amount);
    const tx = new Transaction().add(ix);
    return this.sendTx(tx, [bettor]);
  }

  async claimWinnings(
    claimer: Keypair,
    match: PublicKey,
    round: PublicKey,
    fixtureId: string,
    roundId: number
  ): Promise<string> {
    const ix = instructions.buildClaimWinnings(claimer.publicKey, match, round, fixtureId, roundId);
    const tx = new Transaction().add(ix);
    return this.sendTx(tx, [claimer]);
  }

  async refundBet(
    bettor: Keypair,
    match: PublicKey,
    round: PublicKey,
    fixtureId: string,
    roundId: number
  ): Promise<string> {
    const ix = instructions.buildRefundBet(bettor.publicKey, match, round, fixtureId, roundId);
    const tx = new Transaction().add(ix);
    return this.sendTx(tx, [bettor]);
  }

  // Positions
  async getPosition(round: PublicKey, owner: PublicKey): Promise<Position | null> {
    return accounts.fetchPosition(this.connection, round, owner);
  }

  // Sponsor
  async fundSponsor(
    sponsor: Keypair,
    match: PublicKey,
    amount: number
  ): Promise<string> {
    const ix = instructions.buildFundSponsor(sponsor.publicKey, match, amount);
    const tx = new Transaction().add(ix);
    return this.sendTx(tx, [sponsor]);
  }

  // Utility
  private async sendTx(tx: Transaction, signers: Keypair[]): Promise<string> {
    tx.feePayer = signers[0].publicKey;
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
  static findRoundPda = pda.findRoundPda;
  static findPositionPda = pda.findPositionPda;
  static findSponsorVaultPda = pda.findSponsorVaultPda;
}
