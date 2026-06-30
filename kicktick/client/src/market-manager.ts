/**
 * KickTick Market Manager
 * High-level SDK for creating, betting, and settling micro prediction markets
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
} from '@solana/web3.js';
import {
  AnchorProvider,
  Program,
  BN,
  Idl,
} from '@coral-xyz/anchor';
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import { TxOddsClient, SpikeDetector, shouldSettleYes } from './txodds-oracle';

// ===== Types =====

export type MarketType = 
  | 'next_goal'
  | 'next_card'
  | 'over_under_corners'
  | 'odds_spike'
  | 'match_result';

export type BetSide = 'yes' | 'no';

export interface MarketInfo {
  address: PublicKey;
  creator: PublicKey;
  fixtureId: number;
  marketType: MarketType;
  description: string;
  endTime: number;
  status: 'open' | 'expired' | 'settled' | 'cancelled';
  outcome: 'none' | 'yes' | 'no' | 'cancelled';
  totalYesAmount: number;
  totalNoAmount: number;
  yesOddsAtCreation: number;
}

export interface CreateMarketParams {
  fixtureId: number;
  marketType: MarketType;
  description: string;
  durationSeconds: number; // 15-300
}

export interface PlaceBetParams {
  marketAddress: PublicKey;
  side: BetSide;
  amount: number; // in lamports/USDT smallest unit
}

// ===== Program IDL (simplified - full IDL from Anchor build) =====

const IDL: Idl = {
  version: '0.1.0',
  name: 'kicktick',
  instructions: [
    {
      name: 'createMarket',
      accounts: [
        { name: 'creator', isMut: true, isSigner: true },
        { name: 'market', isMut: true, isSigner: false },
        { name: 'vault', isMut: true, isSigner: false },
        { name: 'usdtMint', isMut: false, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [
        { name: 'fixtureId', type: 'i64' },
        { name: 'marketType', type: { defined: 'MarketType' } },
        { name: 'description', type: 'string' },
        { name: 'durationSeconds', type: 'i64' },
        { name: 'yesOddsAtCreation', type: 'i32' },
      ],
    },
    {
      name: 'placeBet',
      accounts: [
        { name: 'bettor', isMut: true, isSigner: true },
        { name: 'market', isMut: true, isSigner: false },
        { name: 'position', isMut: true, isSigner: false },
        { name: 'vault', isMut: true, isSigner: false },
        { name: 'bettorTokenAccount', isMut: true, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
        { name: 'systemProgram', isMut: false, isSigner: false },
      ],
      args: [
        { name: 'side', type: { defined: 'Outcome' } },
        { name: 'amount', type: 'u64' },
      ],
    },
    {
      name: 'settleMarket',
      accounts: [
        { name: 'market', isMut: true, isSigner: false },
        { name: 'txoracleProgram', isMut: false, isSigner: false },
        { name: 'dailyOddsMerkleRoots', isMut: false, isSigner: false },
      ],
      args: [
        { name: 'settleOddsValue', type: 'i32' },
        { name: 'txoddsAttestationTs', type: 'i64' },
      ],
    },
    {
      name: 'claimWinnings',
      accounts: [
        { name: 'winner', isMut: true, isSigner: true },
        { name: 'market', isMut: true, isSigner: false },
        { name: 'position', isMut: true, isSigner: false },
        { name: 'vault', isMut: true, isSigner: false },
        { name: 'winnerTokenAccount', isMut: true, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: 'cancelMarket',
      accounts: [
        { name: 'creator', isMut: false, isSigner: true },
        { name: 'market', isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: 'refundCancelled',
      accounts: [
        { name: 'bettor', isMut: true, isSigner: true },
        { name: 'market', isMut: false, isSigner: false },
        { name: 'position', isMut: true, isSigner: false },
        { name: 'vault', isMut: true, isSigner: false },
        { name: 'bettorTokenAccount', isMut: true, isSigner: false },
        { name: 'tokenProgram', isMut: false, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: 'PredictionMarket',
      type: {
        kind: 'struct',
        fields: [
          { name: 'creator', type: 'publicKey' },
          { name: 'fixtureId', type: 'i64' },
          { name: 'marketType', type: { defined: 'MarketType' } },
          { name: 'description', type: 'string' },
          { name: 'endTime', type: 'i64' },
          { name: 'settleTime', type: 'i64' },
          { name: 'status', type: { defined: 'MarketStatus' } },
          { name: 'outcome', type: { defined: 'Outcome' } },
          { name: 'totalYesAmount', type: 'u64' },
          { name: 'totalNoAmount', type: 'u64' },
          { name: 'yesOddsAtCreation', type: 'i32' },
          { name: 'settleOddsValue', type: 'i32' },
          { name: 'txoddsAttestationTs', type: 'i64' },
          { name: 'bump', type: 'u8' },
        ],
      },
    },
  ],
  types: [
    {
      name: 'MarketType',
      type: {
        kind: 'enum',
        variants: [
          { name: 'NextGoal' },
          { name: 'NextCard' },
          { name: 'OverUnderCorners' },
          { name: 'OddsSpike' },
          { name: 'MatchResult' },
        ],
      },
    },
    {
      name: 'Outcome',
      type: {
        kind: 'enum',
        variants: [
          { name: 'None' },
          { name: 'Yes' },
          { name: 'No' },
          { name: 'Cancelled' },
        ],
      },
    },
    {
      name: 'MarketStatus',
      type: {
        kind: 'enum',
        variants: [
          { name: 'Open' },
          { name: 'Expired' },
          { name: 'Settled' },
          { name: 'Cancelled' },
        ],
      },
    },
  ],
  errors: [
    { code: 6000, name: 'InvalidDuration', msg: 'Invalid market duration' },
    { code: 6001, name: 'DescriptionTooLong', msg: 'Description too long' },
    { code: 6002, name: 'MarketNotOpen', msg: 'Market is not open' },
    { code: 6003, name: 'MarketExpired', msg: 'Market has expired' },
    { code: 6004, name: 'MarketStillOpen', msg: 'Market is still open' },
    { code: 6005, name: 'AlreadySettled', msg: 'Market already settled' },
    { code: 6006, name: 'NotSettled', msg: 'Market not yet settled' },
    { code: 6007, name: 'AlreadyClaimed', msg: 'Position already claimed' },
    { code: 6008, name: 'LostBet', msg: 'You lost this bet' },
    { code: 6009, name: 'NotCreator', msg: 'Only creator can do this' },
    { code: 6010, name: 'ZeroAmount', msg: 'Amount must be greater than zero' },
    { code: 6011, name: 'Overflow', msg: 'Math overflow' },
  ],
};

const PROGRAM_ID = new PublicKey('KTCKiCkTiCkTiCkTiCkTiCkTiCkTiCkTiCkTiCkTiCk'); // placeholder

// ===== Market Manager =====

export class KickTickManager {
  private program: Program<Idl>;
  private provider: AnchorProvider;
  private txodds: TxOddsClient;
  private spikeDetector: SpikeDetector;
  private usdtMint: PublicKey;

  constructor(
    connection: Connection,
    wallet: Keypair,
    usdtMint: PublicKey = new PublicKey('ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh')
  ) {
    this.provider = new AnchorProvider(connection, {} as any, { commitment: 'confirmed' });
    this.program = new Program(IDL, PROGRAM_ID, this.provider);
    this.txodds = new TxOddsClient(wallet, connection.rpcEndpoint);
    this.spikeDetector = new SpikeDetector();
    this.usdtMint = usdtMint;
  }

  /**
   * Initialize: authenticate with TxODDS and activate API token
   */
  async initialize(): Promise<void> {
    await this.txodds.authenticate();
    const txSig = await this.txodds.subscribe(1, 4); // free World Cup tier
    await this.txodds.activateToken(txSig);
  }

  /**
   * Create a new micro prediction market
   */
  async createMarket(params: CreateMarketParams): Promise<PublicKey> {
    const { fixtureId, marketType, description, durationSeconds } = params;

    // Get current odds from TxODDS for reference
    const odds = await this.txodds.getOddsSnapshot(fixtureId);
    const yesOddsAtCreation = odds.length > 0 ? odds[0].prices[0] : 500;

    const creator = this.provider.wallet.publicKey;
    const timestamp = Date.now();

    // Derive market PDA
    const [marketPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('market'),
        creator.toBuffer(),
        Buffer.from(new BN(fixtureId).toArrayLike(Buffer, 'le', 8)),
        Buffer.from(new BN(timestamp).toArrayLike(Buffer, 'le', 8)),
      ],
      PROGRAM_ID
    );

    // Derive vault PDA
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), marketPda.toBuffer()],
      PROGRAM_ID
    );

    // Build market type enum for Anchor
    const marketTypeVariant = this.toMarketTypeVariant(marketType);

    const tx = await this.program.methods
      .createMarket(
        new BN(fixtureId),
        marketTypeVariant,
        description,
        new BN(durationSeconds),
        yesOddsAtCreation
      )
      .accounts({
        creator,
        market: marketPda,
        vault: vaultPda,
        usdtMint: this.usdtMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return marketPda;
  }

  /**
   * Place a bet on an open market
   */
  async placeBet(params: PlaceBetParams): Promise<string> {
    const { marketAddress, side, amount } = params;
    const bettor = this.provider.wallet.publicKey;

    // Derive position PDA
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), bettor.toBuffer(), marketAddress.toBuffer()],
      PROGRAM_ID
    );

    // Derive vault PDA
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), marketAddress.toBuffer()],
      PROGRAM_ID
    );

    // Get or create bettor's USDT token account
    const bettorTokenAccount = getAssociatedTokenAddressSync(this.usdtMint, bettor);

    const outcomeVariant = side === 'yes' ? { yes: {} } : { no: {} };

    const tx = await this.program.methods
      .placeBet(outcomeVariant, new BN(amount))
      .accounts({
        bettor,
        market: marketAddress,
        position: positionPda,
        vault: vaultPda,
        bettorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  /**
   * Settle a market using TxODDS oracle data
   * Fetches latest odds and determines outcome
   */
  async settleMarket(marketAddress: PublicKey): Promise<string> {
    // Fetch market account to get fixture ID and creation odds
    const marketAccount = await this.program.account.predictionMarket.fetch(marketAddress);
    const fixtureId = marketAccount.fixtureId.toNumber();

    // Get latest odds from TxODDS
    const latestOdds = await this.txodds.getOddsSnapshot(fixtureId);
    if (latestOdds.length === 0) throw new Error('No odds data available for settlement');

    const currentOddsValue = latestOdds[0].prices[0];
    const attestationTs = latestOdds[0].ts;

    // Derive Merkle roots account (from txoracle program)
    const [dailyOddsMerkleRoots] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('daily_odds_merkle_roots'),
        Buffer.from(new BN(Math.floor(attestationTs / 86400)).toArrayLike(Buffer, 'le', 2)),
      ],
      new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J')
    );

    const tx = await this.program.methods
      .settleMarket(currentOddsValue, new BN(attestationTs))
      .accounts({
        market: marketAddress,
        txoracleProgram: new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J'),
        dailyOddsMerkleRoots,
      })
      .rpc();

    return tx;
  }

  /**
   * Claim winnings after market is settled
   */
  async claimWinnings(marketAddress: PublicKey): Promise<string> {
    const winner = this.provider.wallet.publicKey;

    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('position'), winner.toBuffer(), marketAddress.toBuffer()],
      PROGRAM_ID
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), marketAddress.toBuffer()],
      PROGRAM_ID
    );

    const winnerTokenAccount = getAssociatedTokenAddressSync(this.usdtMint, winner);

    const tx = await this.program.methods
      .claimWinnings()
      .accounts({
        winner,
        market: marketAddress,
        position: positionPda,
        vault: vaultPda,
        winnerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return tx;
  }

  /**
   * Cancel a market (creator only, before expiry)
   */
  async cancelMarket(marketAddress: PublicKey): Promise<string> {
    const tx = await this.program.methods
      .cancelMarket()
      .accounts({
        creator: this.provider.wallet.publicKey,
        market: marketAddress,
      })
      .rpc();

    return tx;
  }

  /**
   * Get market info
   */
  async getMarketInfo(marketAddress: PublicKey): Promise<MarketInfo> {
    const account = await this.program.account.predictionMarket.fetch(marketAddress);

    return {
      address: marketAddress,
      creator: account.creator,
      fixtureId: account.fixtureId.toNumber(),
      marketType: this.fromMarketTypeVariant(account.marketType),
      description: account.description,
      endTime: account.endTime.toNumber(),
      status: this.fromStatusVariant(account.status),
      outcome: this.fromOutcomeVariant(account.outcome),
      totalYesAmount: account.totalYesAmount.toNumber(),
      totalNoAmount: account.totalNoAmount.toNumber(),
      yesOddsAtCreation: account.yesOddsAtCreation,
    };
  }

  /**
   * Auto-settle expired markets (crank function)
   * Can be called by anyone - iterates markets past end_time
   */
  async autoSettleMarkets(marketAddresses: PublicKey[]): Promise<string[]> {
    const results: string[] = [];

    for (const marketAddr of marketAddresses) {
      try {
        const info = await this.getMarketInfo(marketAddr);
        const now = Math.floor(Date.now() / 1000);

        if (info.status === 'open' && now >= info.endTime) {
          const tx = await this.settleMarket(marketAddr);
          results.push(`Settled ${marketAddr.toBase58()}: ${tx}`);
        }
      } catch (err) {
        results.push(`Failed ${marketAddr.toBase58()}: ${err}`);
      }
    }

    return results;
  }

  /**
   * Start spike detection listener for a fixture
   * Emits events when odds move significantly
   */
  async watchSpikes(
    fixtureId: number,
    onSpike: (event: any) => void
  ): Promise<void> {
    for await (const record of this.txodds.streamOdds(fixtureId)) {
      const events = this.spikeDetector.feed(record);
      for (const event of events) {
        onSpike(event);
      }
    }
  }

  // ===== Private Helpers =====

  private toMarketTypeVariant(type: MarketType): any {
    const map: Record<MarketType, any> = {
      next_goal: { nextGoal: {} },
      next_card: { nextCard: {} },
      over_under_corners: { overUnderCorners: {} },
      odds_spike: { oddsSpike: {} },
      match_result: { matchResult: {} },
    };
    return map[type];
  }

  private fromMarketTypeVariant(variant: any): MarketType {
    if (variant.nextGoal) return 'next_goal';
    if (variant.nextCard) return 'next_card';
    if (variant.overUnderCorners) return 'over_under_corners';
    if (variant.oddsSpike) return 'odds_spike';
    if (variant.matchResult) return 'match_result';
    return 'odds_spike';
  }

  private fromStatusVariant(variant: any): MarketInfo['status'] {
    if (variant.open) return 'open';
    if (variant.expired) return 'expired';
    if (variant.settled) return 'settled';
    if (variant.cancelled) return 'cancelled';
    return 'open';
  }

  private fromOutcomeVariant(variant: any): MarketInfo['outcome'] {
    if (variant.yes) return 'yes';
    if (variant.no) return 'no';
    if (variant.cancelled) return 'cancelled';
    return 'none';
  }
}
