import { EventEmitter } from "events";
import { PublicKey } from "@solana/web3.js";
import { AnchorClient, SettleProofArgs } from "../clients/anchor-client";
import { ProofGatherer } from "./proof-gatherer";
import { TriggerAction } from "../market/triggers";

export interface CrankStatus {
  fixtureId: number;
  roundId: number;
  action: string;
  status: "pending" | "sent" | "confirmed" | "failed";
  txSig?: string;
  error?: string;
  timestamp: number;
}

export interface CrankOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  confirmCommitment?: string;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function outcomeToWinner(outcome: string): number {
  switch (outcome) {
    case "Home": return 1;
    case "Away": return 2;
    case "NoGoal": return 3;
    case "Yes": return 1;
    case "No": return 2;
    case "Cancelled": return 0;
    default: return 2;
  }
}

export class Crank extends EventEmitter {
  private statuses = new Map<string, CrankStatus>();
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(
    private anchorClient: AnchorClient,
    private proofGatherer: ProofGatherer,
    options?: CrankOptions,
  ) {
    super();
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  private statusKey(fixtureId: number, roundId: number): string {
    return `${fixtureId}:${roundId}`;
  }

  private emitStatus(
    fixtureId: number,
    roundId: number,
    action: string,
    status: CrankStatus["status"],
    txSig?: string,
    error?: string,
  ): void {
    const key = this.statusKey(fixtureId, roundId);
    const prev = this.statuses.get(key);
    const entry: CrankStatus = {
      fixtureId,
      roundId,
      action,
      status,
      txSig: txSig ?? prev?.txSig,
      error: error ?? prev?.error,
      timestamp: Date.now(),
    };
    this.statuses.set(key, entry);
    this.emit("status", entry);
  }

  async executeAction(action: TriggerAction): Promise<void> {
    const { fixtureId, roundId } = action;
    switch (action.type) {
      case "open_round":
        return this.executeOpenRound(fixtureId, roundId, action);
      case "settle_onchain":
        return this.executeSettleOnchain(fixtureId, roundId, action);
      case "settle_offchain":
        return this.executeSettleOffchain(fixtureId, roundId, action);
      case "confirm_round":
        return this.executeConfirmRound(fixtureId, roundId, action);
    }
  }

  async executeActions(actions: TriggerAction[]): Promise<void> {
    for (const action of actions) {
      await this.executeAction(action);
    }
  }

  getStatus(fixtureId: number, roundId: number): CrankStatus | undefined {
    return this.statuses.get(this.statusKey(fixtureId, roundId));
  }

  getPending(): CrankStatus[] {
    return Array.from(this.statuses.values()).filter(
      (s) => s.status === "pending" || s.status === "sent",
    );
  }

  private async executeWithRetry(fn: () => Promise<string>): Promise<string> {
    let lastError: Error;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          await new Promise((r) =>
            setTimeout(r, this.retryDelayMs * Math.pow(2, attempt)),
          );
        }
      }
    }
    throw lastError!;
  }

  private async executeOpenRound(
    fixtureId: number,
    roundId: number,
    action: TriggerAction & { type: "open_round" },
  ): Promise<void> {
    const matchPda = new PublicKey(action.matchPda);
    this.emitStatus(fixtureId, roundId, "open_round", "pending");

    try {
      const txSig = await this.executeWithRetry(() =>
        this.anchorClient.openRound(
          roundId,
          action.marketType,
          action.lockSeconds,
          action.deadlineSeconds,
          matchPda,
        ),
      );
      this.emitStatus(fixtureId, roundId, "open_round", "confirmed", txSig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitStatus(fixtureId, roundId, "open_round", "failed", undefined, msg);
      this.emit("error", err instanceof Error ? err : new Error(String(err)), action);
    }
  }

  private async executeSettleOnchain(
    fixtureId: number,
    roundId: number,
    action: TriggerAction & { type: "settle_onchain" },
  ): Promise<void> {
    const matchPda = new PublicKey(action.matchPda);
    this.emitStatus(fixtureId, roundId, "settle_onchain", "pending");

    try {
      const keys = this.proofGatherer.getStatKeysForMarket(action.marketType);
      if (keys.length === 0) return;

      const firstProof = await this.proofGatherer.gatherProof(
        fixtureId,
        action.settlementSeq,
        keys[0].statKey,
        keys[0].period,
      );

      const predicate = this.proofGatherer.buildPredicate(0);

      const proofArgs: SettleProofArgs = {
        ts: firstProof.ts,
        fixtureSummary: {
          fixtureId: firstProof.fixtureSummary.fixture_id,
          updateStats: {
            updateCount: firstProof.fixtureSummary.update_stats.update_count,
            minTimestamp: firstProof.fixtureSummary.update_stats.min_timestamp,
            maxTimestamp: firstProof.fixtureSummary.update_stats.max_timestamp,
          },
          eventsSubTreeRoot: firstProof.fixtureSummary.events_sub_tree_root,
        },
        fixtureProof: firstProof.fixtureProof.map((n) => ({
          hash: n.hash,
          isRightSibling: n.is_right_sibling,
        })),
        mainTreeProof: firstProof.mainTreeProof.map((n) => ({
          hash: n.hash,
          isRightSibling: n.is_right_sibling,
        })),
        predicate: {
          threshold: predicate.threshold,
          comparison: predicate.comparison as "GreaterThan" | "LessThan" | "EqualTo",
        },
        statA: {
          statToProve: {
            key: firstProof.statA.stat_to_prove.key,
            value: firstProof.statA.stat_to_prove.value,
            period: firstProof.statA.stat_to_prove.period,
          },
          eventStatRoot: firstProof.statA.event_stat_root,
          statProof: firstProof.statA.stat_proof.map((n) => ({
            hash: n.hash,
            isRightSibling: n.is_right_sibling,
          })),
        },
      };

      if (keys.length === 2) {
        const secondProof = await this.proofGatherer.gatherProof(
          fixtureId,
          action.settlementSeq,
          keys[1].statKey,
          keys[1].period,
        );

        proofArgs.statB = {
          statToProve: {
            key: secondProof.statA.stat_to_prove.key,
            value: secondProof.statA.stat_to_prove.value,
            period: secondProof.statA.stat_to_prove.period,
          },
          eventStatRoot: secondProof.statA.event_stat_root,
          statProof: secondProof.statA.stat_proof.map((n) => ({
            hash: n.hash,
            isRightSibling: n.is_right_sibling,
          })),
        };
        proofArgs.op = "Add";
      }

      const txSig = await this.executeWithRetry(() =>
        this.anchorClient.settleRound(roundId, matchPda, proofArgs),
      );

      this.emitStatus(fixtureId, roundId, "settle_onchain", "confirmed", txSig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitStatus(fixtureId, roundId, "settle_onchain", "failed", undefined, msg);
      this.emit("error", err instanceof Error ? err : new Error(String(err)), action);
    }
  }

  private async executeSettleOffchain(
    fixtureId: number,
    roundId: number,
    action: TriggerAction & { type: "settle_offchain" },
  ): Promise<void> {
    const matchPda = new PublicKey(action.matchPda);
    this.emitStatus(fixtureId, roundId, "settle_offchain", "pending");

    try {
      const txSig = await this.executeWithRetry(() =>
        this.anchorClient.settleOffchainRound(
          roundId,
          matchPda,
          action.outcome,
          outcomeToWinner(action.outcome),
        ),
      );

      this.emitStatus(fixtureId, roundId, "settle_offchain", "confirmed", txSig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitStatus(fixtureId, roundId, "settle_offchain", "failed", undefined, msg);
      this.emit("error", err instanceof Error ? err : new Error(String(err)), action);
    }
  }

  private async executeConfirmRound(
    fixtureId: number,
    roundId: number,
    action: TriggerAction & { type: "confirm_round" },
  ): Promise<void> {
    const matchPda = new PublicKey(action.matchPda);
    this.emitStatus(fixtureId, roundId, "confirm_round", "pending");

    try {
      const txSig = await this.executeWithRetry(() =>
        this.anchorClient.confirmRound(roundId, matchPda),
      );

      this.emitStatus(fixtureId, roundId, "confirm_round", "confirmed", txSig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emitStatus(fixtureId, roundId, "confirm_round", "failed", undefined, msg);
      this.emit("error", err instanceof Error ? err : new Error(String(err)), action);
    }
  }
}
