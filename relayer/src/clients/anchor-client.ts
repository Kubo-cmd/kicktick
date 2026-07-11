import {
  PublicKey,
  ComputeBudgetProgram,
  Transaction,
  SystemProgram,
  Keypair,
  Connection,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN } from "@anchor-lang/core";
import type { Idl } from "@anchor-lang/core/dist/cjs/idl";
import { Config } from "../config";

// ── IDL ──

const kicktickIdl: Idl = require("../idl/kicktick.json");

// ── Type definitions (mirroring Anchor program types for type-safety) ──

export type MarketType =
  | "NextGoalSide"
  | "GoalInWindow"
  | "NextCorner"
  | "CornerInWindow"
  | "NextYellowCard"
  | "YellowCardInWindow"
  | "RedCardInMatch"
  | "PenaltyShootoutShot"
  | "PenaltyShot"
  | "VARCheck";

export type RoundOutcome =
  | "None"
  | "Yes"
  | "No"
  | "NoGoal"
  | "Home"
  | "Away"
  | "Cancelled";

export type Comparison = "GreaterThan" | "LessThan" | "EqualTo";
export type BinaryExpression = "Add" | "Subtract";

export interface ProofNode {
  hash: number[];
  is_right_sibling: boolean;
}

export interface ScoreStat {
  key: number;
  value: number;
  period: number;
}

export interface StatTerm {
  stat_to_prove: ScoreStat;
  event_stat_root: number[];
  stat_proof: ProofNode[];
}

export interface ScoresUpdateStats {
  update_count: number;
  min_timestamp: number;
  max_timestamp: number;
}

export interface ScoresBatchSummary {
  fixture_id: number;
  update_stats: ScoresUpdateStats;
  events_sub_tree_root: number[];
}

export interface TraderPredicate {
  threshold: number;
  comparison: Comparison;
}

export interface ValidateStatArgs {
  ts: number;
  fixture_summary: ScoresBatchSummary;
  fixture_proof: ProofNode[];
  main_tree_proof: ProofNode[];
  predicate: TraderPredicate;
  stat_a: StatTerm;
  stat_b: StatTerm | null;
  op: BinaryExpression | null;
}

// ── User-facing proof args (flexible input types) ──

export interface SettleProofArgs {
  ts: number;
  fixtureSummary: {
    fixtureId: number;
    updateStats: {
      updateCount: number;
      minTimestamp: number;
      maxTimestamp: number;
    };
    eventsSubTreeRoot: number[];
  };
  fixtureProof: { hash: number[]; isRightSibling: boolean }[];
  mainTreeProof: { hash: number[]; isRightSibling: boolean }[];
  predicate: { threshold: number; comparison: "GreaterThan" | "LessThan" | "EqualTo" };
  statA: {
    statToProve: { key: number; value: number; period: number };
    eventStatRoot: number[];
    statProof: { hash: number[]; isRightSibling: boolean }[];
  };
  statB?: {
    statToProve: { key: number; value: number; period: number };
    eventStatRoot: number[];
    statProof: { hash: number[]; isRightSibling: boolean }[];
  };
  op?: "Add" | "Subtract";
}

// ── Anchor client error ──

export class AnchorClientError extends Error {
  constructor(
    message: string,
    public readonly logs?: string[],
  ) {
    super(message);
    this.name = "AnchorClientError";
  }
}

function camelCase(s: string): string {
  const match = s.match(/^([A-Z]+)([A-Z][a-z])/);
  if (match) {
    return match[1].toLowerCase() + match[2] + s.slice(match[0].length);
  }
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function toLeBytes64(n: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n), 0);
  return buf;
}

// ── AnchorClient ──

// Account namespace shape — keys match Anchor 1.0 camelCase conversion
type Accounts = {
  config: { fetch(address: PublicKey): Promise<any> };
  match: { fetch(address: PublicKey): Promise<any> };
  round: { fetch(address: PublicKey): Promise<any> };
  position: { fetch(address: PublicKey): Promise<any> };
  sponsorVault: { fetch(address: PublicKey): Promise<any> };
};

export class AnchorClient {
  private program: Program;
  private provider: AnchorProvider;
  private config: Config;

  constructor(config: Config) {
    this.config = config;

    // Override IDL address with configured program ID in case they differ
    const idl = { ...kicktickIdl, address: config.kicktickProgramId.toBase58() };

    // Load wallet from SOLANA_PRIVATE_KEY
    const keypair = Keypair.fromSecretKey(Buffer.from(config.solanaPrivateKey, "hex"));
    const wallet = new Wallet(keypair);

    const connection = new Connection(config.solanaRpcUrl, "confirmed");

    this.provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: "confirmed", preflightCommitment: "confirmed" },
    );

    this.program = new Program(idl, this.provider);
  }

  get programId(): PublicKey {
    return this.program.programId;
  }

  get walletPublicKey(): PublicKey {
    return this.provider.wallet.publicKey;
  }

  // ── PDA derivation helpers ──

  static deriveMatchPda(fixtureId: number, programId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("match"), toLeBytes64(fixtureId)], programId);
  }

  static deriveRoundPda(
    matchPda: PublicKey,
    roundId: number,
    programId: PublicKey,
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("round"), matchPda.toBuffer(), toLeBytes64(roundId)], programId);
  }

  static deriveConfigPda(programId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  }

  static deriveDailyScoresRootsPda(txoracleProgramId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("daily_scores_roots")],
      txoracleProgramId,
    );
  }

  // ── Transaction helpers ──

  private async buildAndSend(ix: Promise<Transaction>): Promise<string>;
  private async buildAndSend(ix: Promise<Transaction>, cuLimit: number): Promise<string>;
  private async buildAndSend(ix: Promise<Transaction>, cuLimit: number, signers: Keypair[]): Promise<string>;
  private async buildAndSend(ix: Promise<Transaction>, cuLimit?: number, signers?: Keypair[]): Promise<string> {
    let tx: Transaction;
    try {
      tx = await ix;
    } catch (err) {
      throw new AnchorClientError(
        `Failed to build transaction: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (cuLimit && cuLimit > 0) {
      const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit });
      tx = new Transaction().add(cuIx).add(tx);
    }

    try {
      const sig = await this.provider.sendAndConfirm(tx, signers);
      return sig;
    } catch (err: any) {
      const logs = err?.logs as string[] | undefined;
      let msg = `Transaction failed: ${err instanceof Error ? err.message : String(err)}`;
      if (logs && logs.length > 0) {
        const anchorErr = logs.find(
          (l) => l.includes("Error Code:") || l.includes("failed"),
        );
        if (anchorErr) msg = anchorErr;
      }
      throw new AnchorClientError(msg, logs);
    }
  }

  // ── Instruction builders ──

  async openRound(
    roundId: number,
    marketType: MarketType,
    lockSeconds: number,
    deadlineSeconds: number,
    matchPda: PublicKey,
  ): Promise<string> {
    const [roundPda] = AnchorClient.deriveRoundPda(
      matchPda,
      roundId,
      this.programId,
    );

    return this.buildAndSend(
      this.program.methods
        .openRound(
          new BN(roundId),
          { [camelCase(marketType)]: {} },
          new BN(lockSeconds),
          new BN(deadlineSeconds),
        )
        .accountsStrict({
          authority: this.walletPublicKey,
          matchPda,
          round: roundPda,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
    );
  }

  async settleRound(
    roundId: number,
    matchPda: PublicKey,
    proofArgs: SettleProofArgs,
  ): Promise<string> {
    const [roundPda] = AnchorClient.deriveRoundPda(
      matchPda,
      roundId,
      this.programId,
    );
    const [dailyScoresRootsPda] = AnchorClient.deriveDailyScoresRootsPda(
      this.config.txoracleProgramId,
    );

    // Build ValidateStatArgs struct for Anchor encoding
    const args = {
      ts: new BN(proofArgs.ts),
      fixture_summary: {
        fixture_id: new BN(proofArgs.fixtureSummary.fixtureId),
        update_stats: {
          update_count: new BN(proofArgs.fixtureSummary.updateStats.updateCount),
          min_timestamp: new BN(proofArgs.fixtureSummary.updateStats.minTimestamp),
          max_timestamp: new BN(proofArgs.fixtureSummary.updateStats.maxTimestamp),
        },
        events_sub_tree_root: proofArgs.fixtureSummary.eventsSubTreeRoot,
      },
      fixture_proof: proofArgs.fixtureProof.map((n) => ({
        hash: n.hash,
        is_right_sibling: n.isRightSibling,
      })),
      main_tree_proof: proofArgs.mainTreeProof.map((n) => ({
        hash: n.hash,
        is_right_sibling: n.isRightSibling,
      })),
      predicate: {
        threshold: new BN(proofArgs.predicate.threshold),
        comparison: { [camelCase(proofArgs.predicate.comparison)]: {} },
      },
      stat_a: {
        stat_to_prove: {
          key: new BN(proofArgs.statA.statToProve.key),
          value: new BN(proofArgs.statA.statToProve.value),
          period: new BN(proofArgs.statA.statToProve.period),
        },
        event_stat_root: proofArgs.statA.eventStatRoot,
        stat_proof: proofArgs.statA.statProof.map((n) => ({
          hash: n.hash,
          is_right_sibling: n.isRightSibling,
        })),
      },
      stat_b: proofArgs.statB
        ? {
            stat_to_prove: {
              key: new BN(proofArgs.statB.statToProve.key),
              value: new BN(proofArgs.statB.statToProve.value),
              period: new BN(proofArgs.statB.statToProve.period),
            },
            event_stat_root: proofArgs.statB.eventStatRoot,
            stat_proof: proofArgs.statB.statProof.map((n) => ({
              hash: n.hash,
              is_right_sibling: n.isRightSibling,
            })),
          }
        : null,
      op: proofArgs.op ? { [camelCase(proofArgs.op)]: {} } : null,
    };

    return this.buildAndSend(
      this.program.methods
        .settleRound(args)
        .accountsStrict({
          caller: this.walletPublicKey,
          matchPda,
          round: roundPda,
          dailyScoresMerkleRoots: dailyScoresRootsPda,
          txoracleProgram: this.config.txoracleProgramId,
        })
        .transaction(),
      1_400_000,
    );
  }

  async settleOffchainRound(
    roundId: number,
    matchPda: PublicKey,
    outcome: RoundOutcome,
    winner: number,
  ): Promise<string> {
    const [roundPda] = AnchorClient.deriveRoundPda(
      matchPda,
      roundId,
      this.programId,
    );

    return this.buildAndSend(
      this.program.methods
        .settleOffchainRound({ [camelCase(outcome)]: {} }, new BN(winner))
        .accountsStrict({
          caller: this.walletPublicKey,
          matchPda,
          round: roundPda,
        })
        .transaction(),
    );
  }

  async confirmRound(
    roundId: number,
    matchPda: PublicKey,
  ): Promise<string> {
    const [roundPda] = AnchorClient.deriveRoundPda(
      matchPda,
      roundId,
      this.programId,
    );

    return this.buildAndSend(
      this.program.methods
        .confirmRound()
        .accountsStrict({
          caller: this.walletPublicKey,
          matchPda,
          round: roundPda,
        })
        .transaction(),
    );
  }

  async cancelRound(
    roundId: number,
    matchPda: PublicKey,
  ): Promise<string> {
    const [roundPda] = AnchorClient.deriveRoundPda(
      matchPda,
      roundId,
      this.programId,
    );
    const [configPda] = AnchorClient.deriveConfigPda(this.programId);

    return this.buildAndSend(
      this.program.methods
        .cancelRound()
        .accountsStrict({
          caller: this.walletPublicKey,
          config: configPda,
          matchPda,
          round: roundPda,
        })
        .transaction(),
    );
  }

  async initConfig(): Promise<string> {
    const [configPda] = AnchorClient.deriveConfigPda(this.programId);

    return this.buildAndSend(
      this.program.methods
        .initConfig()
        .accountsStrict({
          admin: this.walletPublicKey,
          config: configPda,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
    );
  }

  async initMatch(
    fixtureId: number,
    homeTeam: string,
    awayTeam: string,
  ): Promise<{ sig: string; matchPda: PublicKey; vaultPda: PublicKey }> {
    const [matchPda] = AnchorClient.deriveMatchPda(fixtureId, this.programId);
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("match_vault"), matchPda.toBuffer()],
      this.programId,
    );

    const sig = await this.buildAndSend(
      this.program.methods
        .initMatch(new BN(fixtureId), homeTeam, awayTeam)
        .accountsStrict({
          creator: this.walletPublicKey,
          config: AnchorClient.deriveConfigPda(this.programId)[0],
          matchPda,
          matchVault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
    );

    return { sig, matchPda, vaultPda };
  }

  async placeBet(
    fixtureId: number,
    roundId: number,
    side: number,
    amount: number,
    matchPda: PublicKey,
    bettor?: Keypair,
  ): Promise<string> {
    const [roundPda] = AnchorClient.deriveRoundPda(
      matchPda,
      roundId,
      this.programId,
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("match_vault"), matchPda.toBuffer()],
      this.programId,
    );
    const bettorPub = bettor ? bettor.publicKey : this.walletPublicKey;
    const [positionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        new BN(fixtureId).toArrayLike(Buffer, "le", 8),
        new BN(roundId).toArrayLike(Buffer, "le", 8),
        bettorPub.toBuffer(),
      ],
      this.programId,
    );

    const signers = bettor ? [bettor] : [];
    return this.buildAndSend(
      this.program.methods
        .placeBet(new BN(fixtureId), new BN(roundId), side, new BN(amount))
        .accountsStrict({
          bettor: bettorPub,
          matchPda,
          matchVault: vaultPda,
          round: roundPda,
          position: positionPda,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
      0,
      signers,
    );
  }

  async claimWinnings(
    fixtureId: number,
    roundId: number,
    matchPda: PublicKey,
    winnerKeypair?: Keypair,
  ): Promise<string> {
    const [roundPda] = AnchorClient.deriveRoundPda(
      matchPda,
      roundId,
      this.programId,
    );
    const winnerPub = winnerKeypair
      ? winnerKeypair.publicKey
      : this.walletPublicKey;
    const [positionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("position"),
        new BN(fixtureId).toArrayLike(Buffer, "le", 8),
        new BN(roundId).toArrayLike(Buffer, "le", 8),
        winnerPub.toBuffer(),
      ],
      this.programId,
    );
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("match_vault"), matchPda.toBuffer()],
      this.programId,
    );

    const signers = winnerKeypair ? [winnerKeypair] : [];
    return this.buildAndSend(
      this.program.methods
        .claimWinnings(new BN(fixtureId), new BN(roundId))
        .accountsStrict({
          winner: winnerPub,
          matchPda,
          round: roundPda,
          position: positionPda,
          matchVault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .transaction(),
      0,
      signers,
    );
  }

  async fetchRound(roundPda: PublicKey): Promise<any> {
    return (this.program.account as Accounts).round.fetch(roundPda);
  }

  async fetchMatch(matchPda: PublicKey): Promise<any> {
    return (this.program.account as Accounts).match.fetch(matchPda);
  }

  async fetchConfig(): Promise<any> {
    const [configPda] = AnchorClient.deriveConfigPda(this.programId);
    return (this.program.account as Accounts).config.fetch(configPda);
  }
}
