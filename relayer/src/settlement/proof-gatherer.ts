import { TxLineClient } from "../clients/txline-client";
import { SoccerEvent, MarketType } from "../market/event-parser";

// ── Constants (mirrors kicktick/programs/kicktick/src/constants.rs) ──

const PERIOD_H1 = 0;
const PERIOD_H2 = 1000;
const PERIOD_ET1 = 2000;
const PERIOD_ET2 = 3000;
const PERIOD_PE = 5000;

const STATKEY_P1_GOALS = 1;
const STATKEY_P2_GOALS = 2;
const STATKEY_P1_YC = 3;
const STATKEY_P2_YC = 4;
const STATKEY_P1_RC = 5;
const STATKEY_P2_RC = 6;
const STATKEY_P1_CORNERS = 7;
const STATKEY_P2_CORNERS = 8;

// ── Exported types ──

export interface ProofNode {
  hash: number[];
  is_right_sibling: boolean;
}

interface FixtureSummary {
  fixture_id: number;
  update_stats: {
    update_count: number;
    min_timestamp: number;
    max_timestamp: number;
  };
  events_sub_tree_root: number[];
}

export interface StatTermData {
  stat_to_prove: { key: number; value: number; period: number };
  event_stat_root: number[];
  stat_proof: ProofNode[];
}

export interface ProofData {
  ts: number;
  fixtureSummary: FixtureSummary;
  fixtureProof: ProofNode[];
  mainTreeProof: ProofNode[];
  predicate: { threshold: number; comparison: string };
  statA: StatTermData;
  statB: StatTermData | null;
  op: string | null;
}

// ── Mapper helpers ──

function mapProofNodes(
  nodes: { hash: number[]; isRightSibling: boolean }[],
): ProofNode[] {
  return nodes.map((n) => ({
    hash: n.hash,
    is_right_sibling: n.isRightSibling,
  }));
}

function mapFixtureSummary(summary: {
  fixtureId: number;
  updateStats: {
    updateCount: number;
    minTimestamp: number;
    maxTimestamp: number;
  };
  eventStatsSubTreeRoot: number[];
}): FixtureSummary {
  return {
    fixture_id: summary.fixtureId,
    update_stats: {
      update_count: summary.updateStats.updateCount,
      min_timestamp: summary.updateStats.minTimestamp,
      max_timestamp: summary.updateStats.maxTimestamp,
    },
    events_sub_tree_root: summary.eventStatsSubTreeRoot,
  };
}

// ── ProofGatherer ──

export class ProofGatherer {
  constructor(private client: TxLineClient) {}

  /**
   * Fetch stat-validation proof for a specific statKey and SSE sequence.
   * Used for on-chain settlement (binary markets = 1 call, ternary = 2 calls).
   */
  async gatherProof(
    fixtureId: number,
    seq: number,
    statKey: number,
    period: number,
  ): Promise<ProofData> {
    const result = await this.client.getStatValidation(fixtureId, seq, statKey);

    if (!result) {
      throw new Error(
        `StatValidation returned null for fixture=${fixtureId} seq=${seq} statKey=${statKey}`,
      );
    }

    const proofData: ProofData = {
      ts: result.ts,
      fixtureSummary: mapFixtureSummary(result.summary),
      fixtureProof: mapProofNodes(result.subTreeProof),
      mainTreeProof: mapProofNodes(result.mainTreeProof),
      predicate: { threshold: 0, comparison: "GreaterThan" },
      statA: {
        stat_to_prove: {
          key: statKey,
          value: result.statToProve.value,
          period,
        },
        event_stat_root: result.eventStatRoot,
        stat_proof: mapProofNodes(result.statProof),
      },
      statB: null,
      op: null,
    };

    if (result.statToProve2 && result.statProof2) {
      proofData.statB = {
        stat_to_prove: {
          key: statKey,
          value: result.statToProve2.value,
          period,
        },
        event_stat_root: result.eventStatRoot.slice(),
        stat_proof: mapProofNodes(result.statProof2),
      };
    }

    return proofData;
  }

  /**
   * Get the trigger SSE sequence for a given football event.
   *
   * NOTE: SoccerEvent does not currently carry the SSE sequence number.
   * The caller must provide the seq from the scores SSE event id or the
   * ScoresRecord that triggered this event. This method returns 0 as a
   * placeholder until the event type is extended.
   */
  getTriggerSeq(event: SoccerEvent): number {
    return (event as { seq?: number }).seq ?? 0;
  }

  /**
   * Get statKey(s) for a market type.
   * Ternary markets return [p1Key, p2Key]; binary return [key];
   * off-chain markets (PenaltyShot, VARCheck) return [].
   */
  getStatKeysForMarket(
    marketType: MarketType,
  ): { statKey: number; period: number }[] {
    switch (marketType) {
      case MarketType.NextGoalSide:
        return [
          { statKey: STATKEY_P1_GOALS, period: PERIOD_H1 },
          { statKey: STATKEY_P2_GOALS, period: PERIOD_H1 },
        ];
      case MarketType.GoalInWindow:
        return [{ statKey: STATKEY_P1_GOALS, period: PERIOD_H1 }];
      case MarketType.NextCorner:
        return [
          { statKey: STATKEY_P1_CORNERS, period: PERIOD_H1 },
          { statKey: STATKEY_P2_CORNERS, period: PERIOD_H1 },
        ];
      case MarketType.CornerInWindow:
        return [{ statKey: STATKEY_P1_CORNERS, period: PERIOD_H1 }];
      case MarketType.NextYellowCard:
        return [
          { statKey: STATKEY_P1_YC, period: PERIOD_H1 },
          { statKey: STATKEY_P2_YC, period: PERIOD_H1 },
        ];
      case MarketType.YellowCardInWindow:
        return [{ statKey: STATKEY_P1_YC, period: PERIOD_H1 }];
      case MarketType.RedCardInMatch:
        return [{ statKey: STATKEY_P1_RC, period: PERIOD_H1 }];
      case MarketType.PenaltyShootoutShot:
        return [
          { statKey: PERIOD_PE + 1, period: PERIOD_PE },
          { statKey: PERIOD_PE + 2, period: PERIOD_PE },
        ];
      case MarketType.PenaltyShot:
      case MarketType.VARCheck:
        return [];
    }
  }

  /**
   * Build predicate for comparing stat value at settlement.
   * Default comparison is GreaterThan (event happened / baseline exceeded).
   */
  buildPredicate(
    baselineValue: number,
    comparison: "GreaterThan" | "LessThan" | "EqualTo" = "GreaterThan",
  ): { threshold: number; comparison: string } {
    return { threshold: baselineValue, comparison };
  }
}
