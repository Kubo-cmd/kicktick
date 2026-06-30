/**
 * SPIKES Pipeline: Detects dramatic odds moments and triggers cNFT mints
 * Connects to TxODDS streaming API, detects spikes, and creates moments
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { TxOddsClient, SpikeDetector, OddsRecord, SpikeEvent } from '../../kicktick/client/src/txodds-oracle';

export interface MintRequest {
  fixtureId: number;
  spikeType: 'odds_surge' | 'odds_crash' | 'goal_scored' | 'card_issued' | 'comeback' | 'upset';
  timestamp: number;
  oddsBefore: number;
  oddsAfter: number;
  description: string;
  significance: number; // 0-100 score
}

export interface PipelineConfig {
  minSpikeThreshold: number;    // minimum % move to trigger (default 15% = 150 thousandths)
  cooldownMs: number;           // min time between mints for same fixture
  maxMintsPerFixture: number;   // max moments per fixture
  autoMint: boolean;            // auto-submit mint transactions
}

export class SpikesPipeline {
  private txodds: TxOddsClient;
  private detector: SpikeDetector;
  private config: PipelineConfig;
  private mintHistory: Map<number, number[]> = new Map(); // fixtureId -> timestamps
  private pendingMints: MintRequest[] = [];

  constructor(txodds: TxOddsClient, config?: Partial<PipelineConfig>) {
    this.txodds = txodds;
    this.detector = new SpikeDetector();
    this.config = {
      minSpikeThreshold: 150,
      cooldownMs: 30_000,
      maxMintsPerFixture: 10,
      autoMint: false,
      ...config,
    };
  }

  /**
   * Start monitoring a fixture for spike moments
   */
  async monitorFixture(
    fixtureId: number,
    onMintRequest: (request: MintRequest) => void,
  ): Promise<void> {
    for await (const record of this.txodds.streamOdds(fixtureId)) {
      const events = this.detector.feed(record);

      for (const event of events) {
        if (this.shouldMint(event)) {
          const mintRequest = this.buildMintRequest(event, record);
          this.pendingMints.push(mintRequest);
          onMintRequest(mintRequest);
        }
      }
    }
  }

  /**
   * Start monitoring all live fixtures
   */
  async monitorAll(
    onMintRequest: (request: MintRequest) => void,
  ): Promise<void> {
    const fixtures = await this.txodds.getFixturesSnapshot();
    const liveFixtures = fixtures.filter(f => f.status === 'live' || f.status === 'in_play');

    // Monitor each fixture concurrently
    await Promise.all(
      liveFixtures.map(f => this.monitorFixture(f.ts, onMintRequest))
    );
  }

  /**
   * Get pending mint requests (for batch processing)
   */
  getPendingMints(): MintRequest[] {
    return [...this.pendingMints];
  }

  /**
   * Clear pending mints after processing
   */
  clearPendingMints(): void {
    this.pendingMints = [];
  }

  /**
   * Score a spike moment's significance (0-100)
   */
  scoreSpike(event: SpikeEvent): number {
    const magnitudeScore = Math.min(event.magnitude / 5, 60); // up to 60 pts for magnitude
    const speedBonus = 20; // detected within window = fast
    const rarityBonus = event.type === 'odds_crash' ? 20 : 10; // crashes are rarer
    
    return Math.min(magnitudeScore + speedBonus + rarityBonus, 100);
  }

  // ===== Private =====

  private shouldMint(event: SpikeEvent): boolean {
    // Check significance
    if (event.magnitude < this.config.minSpikeThreshold) return false;

    // Check cooldown
    const history = this.mintHistory.get(event.fixtureId) || [];
    const now = Date.now();
    const recent = history.filter(t => now - t < this.config.cooldownMs);
    if (recent.length > 0) return false;

    // Check max mints per fixture
    if (history.length >= this.config.maxMintsPerFixture) return false;

    // Record this mint
    history.push(now);
    this.mintHistory.set(event.fixtureId, history);

    return true;
  }

  private buildMintRequest(event: SpikeEvent, record: OddsRecord): MintRequest {
    const significance = this.scoreSpike(event);
    
    return {
      fixtureId: event.fixtureId,
      spikeType: event.type,
      timestamp: event.timestamp,
      oddsBefore: event.fromValue,
      oddsAfter: event.toValue,
      description: this.generateDescription(event, record),
      significance,
    };
  }

  private generateDescription(event: SpikeEvent, record: OddsRecord): string {
    const direction = event.type === 'odds_surge' ? 'surged' : 'crashed';
    const pct = ((event.toValue - event.fromValue) / event.fromValue * 100).toFixed(1);
    
    return `SPIKES: ${record.super_odds_type} ${direction} ${pct}% ` +
           `(${event.fromValue} -> ${event.toValue}) at ${new Date(event.timestamp).toISOString()}`;
  }
}
