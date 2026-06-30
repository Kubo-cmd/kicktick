/**
 * TxODDS Oracle Integration Client
 * Handles: auth, subscription, streaming, and data parsing for KickTick
 * 
 * API spec: https://txline.txodds.com/docs/docs.yaml
 * Docs: https://txline.txodds.com/documentation/quickstart
 */

import { Connection, PublicKey, Transaction, Keypair } from '@solana/web3.js';

// ===== Configuration =====

export const TXODDS_CONFIG = {
  devnet: {
    apiBase: 'https://txline-dev.txodds.com',
    programId: new PublicKey('6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J'),
    txlMint: new PublicKey('4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG'),
    usdtMint: new PublicKey('ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh'),
  },
  mainnet: {
    apiBase: 'https://txline.txodds.com',
    programId: new PublicKey('9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA'),
    txlMint: new PublicKey('Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL'),
    usdtMint: new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'),
  }
} as const;

// ===== Types (mirroring TxODDS IDL) =====

export interface OddsRecord {
  fixture_id: number;
  message_id: string;
  ts: number;
  bookmaker: string;
  bookmaker_id: number;
  super_odds_type: string;
  game_state: string | null;
  in_running: boolean;
  market_parameters: string | null;
  market_period: string | null;
  price_names: string[];
  prices: number[]; // in thousandths (e.g. 500 = 50.0%)
}

export interface FixtureRecord {
  ts: number;
  start_time: number;
  competition: string;
  competition_id: number;
  fixture_group_id: number;
  participant1_id: number;
  participant1: string;
  participant2_id: number;
  participant2: string;
  status: string;
}

export interface ScoresRecord {
  fixture_id: number;
  ts: number;
  period: number;
  period_type: string;
  home_score: number;
  away_score: number;
  stats: ScoreStat[];
}

export interface ScoreStat {
  key: number;
  value: number;
  period: number;
}

export interface MarketOddsSnapshot {
  fixtureId: number;
  homeWin: number;    // stable price in thousandths
  draw: number;
  awayWin: number;
  lastUpdate: number;
  inPlay: boolean;
}

// ===== Auth & Token Management =====

export class TxOddsClient {
  private jwt: string | null = null;
  private apiToken: string | null = null;
  private wallet: Keypair;
  private connection: Connection;
  private config = TXODDS_CONFIG.devnet;

  constructor(wallet: Keypair, rpcUrl: string = 'https://api.devnet.solana.com') {
    this.wallet = wallet;
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Step 1: Start guest session and get JWT
   */
  async authenticate(): Promise<void> {
    const res = await fetch(`${this.config.apiBase}/auth/guest/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
    
    const data = await res.json();
    this.jwt = data.token || data.access_token;
  }

  /**
   * Step 2: Subscribe on-chain (free tier for World Cup)
   */
  async subscribe(serviceLevelId: number = 1, durationWeeks: number = 4): Promise<string> {
    if (!this.jwt) await this.authenticate();

    // Build subscribe instruction using txoracle program
    const programId = this.config.programId;
    
    // PDA for pricing matrix (from txoracle program)
    const [pricingMatrix] = PublicKey.findProgramAddressSync(
      [Buffer.from('pricing_matrix')],
      programId
    );

    // PDA for token treasury
    const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('token_treasury_pda')],
      programId
    );

    const tx = new Transaction();
    // Add subscribe instruction (simplified - in production use Anchor client)
    // The instruction data: discriminator + service_level_id (u16) + duration (u8)
    
    const signature = await this.connection.sendTransaction(tx, [this.wallet]);
    await this.connection.confirmTransaction(signature);

    return signature;
  }

  /**
   * Step 3: Activate API token after on-chain subscription
   */
  async activateToken(txSig: string, selectedLeagues: number[] = []): Promise<void> {
    if (!this.jwt) await this.authenticate();

    // Sign the activation message: txSig::league1,league2,...::jwt
    const message = selectedLeagues.length > 0
      ? `${txSig}:${selectedLeagues.join(',')}:${this.jwt}`
      : `${txSig}::${this.jwt}`;

    const signature = await this.signMessage(message);

    const res = await fetch(`${this.config.apiBase}/api/token/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.jwt}`,
      },
      body: JSON.stringify({
        txSig,
        walletSignature: signature,
        leagues: selectedLeagues,
      }),
    });

    if (!res.ok) throw new Error(`Activation failed: ${res.status} ${await res.text()}`);

    this.apiToken = await res.text();
  }

  /**
   * Get current odds snapshot for a fixture
   */
  async getOddsSnapshot(fixtureId: number): Promise<OddsRecord[]> {
    this.ensureAuthenticated();

    const res = await fetch(
      `${this.config.apiBase}/api/odds/snapshot/${fixtureId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
          'X-Api-Token': this.apiToken!,
        },
      }
    );

    if (!res.ok) throw new Error(`Odds snapshot failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get live odds updates for a fixture
   */
  async getOddsUpdates(fixtureId: number): Promise<OddsRecord[]> {
    this.ensureAuthenticated();

    const res = await fetch(
      `${this.config.apiBase}/api/odds/updates/${fixtureId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
          'X-Api-Token': this.apiToken!,
        },
      }
    );

    if (!res.ok) throw new Error(`Odds updates failed: ${res.status}`);
    return res.json();
  }

  /**
   * Stream real-time odds via Server-Sent Events
   */
  async *streamOdds(fixtureId?: number): AsyncGenerator<OddsRecord, void, unknown> {
    this.ensureAuthenticated();

    const url = new URL(`${this.config.apiBase}/api/odds/stream`);
    if (fixtureId) url.searchParams.set('fixtureId', fixtureId.toString());

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.jwt}`,
        'X-Api-Token': this.apiToken!,
        'Accept': 'text/event-stream',
      },
    });

    if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const chunk of lines) {
        if (chunk.startsWith('data:')) {
          try {
            const record: OddsRecord = JSON.parse(chunk.slice(5).trim());
            yield record;
          } catch (e) {
            // skip malformed
          }
        }
      }
    }
  }

  /**
   * Get fixtures snapshot (upcoming/live matches)
   */
  async getFixturesSnapshot(): Promise<FixtureRecord[]> {
    this.ensureAuthenticated();

    const res = await fetch(
      `${this.config.apiBase}/api/fixtures/snapshot`,
      {
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
          'X-Api-Token': this.apiToken!,
        },
      }
    );

    if (!res.ok) throw new Error(`Fixtures failed: ${res.status}`);
    return res.json();
  }

  /**
   * Get scores snapshot for a fixture
   */
  async getScoresSnapshot(fixtureId: number): Promise<ScoresRecord> {
    this.ensureAuthenticated();

    const res = await fetch(
      `${this.config.apiBase}/api/scores/snapshot/${fixtureId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
          'X-Api-Token': this.apiToken!,
        },
      }
    );

    if (!res.ok) throw new Error(`Scores failed: ${res.status}`);
    return res.json();
  }

  /**
   * Stream real-time scores
   */
  async *streamScores(fixtureId?: number): AsyncGenerator<ScoresRecord, void, unknown> {
    this.ensureAuthenticated();

    const url = new URL(`${this.config.apiBase}/api/scores/stream`);
    if (fixtureId) url.searchParams.set('fixtureId', fixtureId.toString());

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.jwt}`,
        'X-Api-Token': this.apiToken!,
        'Accept': 'text/event-stream',
      },
    });

    if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const chunk of lines) {
        if (chunk.startsWith('data:')) {
          try {
            const record: ScoresRecord = JSON.parse(chunk.slice(5).trim());
            yield record;
          } catch (e) {
            // skip heartbeat or malformed
          }
        }
      }
    }
  }

  /**
   * Get Merkle proof for on-chain validation
   */
  async getOddsValidation(
    fixtureId: number,
    timestamp: number
  ): Promise<{ proof: any[]; root: string }> {
    this.ensureAuthenticated();

    const res = await fetch(
      `${this.config.apiBase}/api/odds/validation?fixtureId=${fixtureId}&ts=${timestamp}`,
      {
        headers: {
          'Authorization': `Bearer ${this.jwt}`,
          'X-Api-Token': this.apiToken!,
        },
      }
    );

    if (!res.ok) throw new Error(`Validation failed: ${res.status}`);
    return res.json();
  }

  // ===== Helpers =====

  private ensureAuthenticated(): void {
    if (!this.jwt || !this.apiToken) {
      throw new Error('Not authenticated. Call authenticate() and activateToken() first.');
    }
  }

  private async signMessage(message: string): Promise<string> {
    // In production: use wallet.signMessage or equivalent
    // For now, return base64 encoded signature
    const { ed25519 } = await import('@noble/curves/ed25519');
    const sig = ed25519.sign(new TextEncoder().encode(message), this.wallet.secretKey.slice(0, 32));
    return Buffer.from(sig).toString('base64');
  }
}

// ===== Spike Detection Engine =====

export interface SpikeEvent {
  fixtureId: number;
  timestamp: number;
  type: 'odds_surge' | 'odds_crash' | 'goal_scored' | 'card_issued';
  magnitude: number; // percentage change * 1000
  fromValue: number;
  toValue: number;
  description: string;
}

export class SpikeDetector {
  private history: Map<number, OddsRecord[]> = new Map();
  private readonly SPIKE_THRESHOLD = 150; // 15% move (in thousandths)
  private readonly WINDOW_MS = 60_000;    // 60 second window

  /**
   * Feed new odds data and detect spikes
   */
  feed(record: OddsRecord): SpikeEvent[] {
    const fixtureId = record.fixture_id;
    const events: SpikeEvent[] = [];

    if (!this.history.has(fixtureId)) {
      this.history.set(fixtureId, []);
    }

    const history = this.history.get(fixtureId)!;
    history.push(record);

    // Keep only recent history
    const cutoff = Date.now() - this.WINDOW_MS;
    while (history.length > 0 && history[0].ts < cutoff) {
      history.shift();
    }

    // Check for spike
    if (history.length >= 2) {
      const oldest = history[0];
      const latest = history[history.length - 1];

      for (let i = 0; i < oldest.prices.length && i < latest.prices.length; i++) {
        const delta = Math.abs(latest.prices[i] - oldest.prices[i]);
        
        if (delta >= this.SPIKE_THRESHOLD) {
          const direction = latest.prices[i] > oldest.prices[i] ? 'surge' : 'crash';
          events.push({
            fixtureId,
            timestamp: record.ts,
            type: direction === 'surge' ? 'odds_surge' : 'odds_crash',
            magnitude: delta,
            fromValue: oldest.prices[i],
            toValue: latest.prices[i],
            description: `${oldest.price_names[i] || 'Price'}: ${oldest.prices[i]} -> ${latest.prices[i]} (${direction})`,
          });
        }
      }
    }

    return events;
  }

  /**
   * Get current stable price for a fixture's main market
   */
  getStablePrice(fixtureId: number): { homeWin: number; draw: number; awayWin: number } | null {
    const history = this.history.get(fixtureId);
    if (!history || history.length === 0) return null;

    const latest = history[history.length - 1];
    const prices = latest.prices;
    const names = latest.price_names.map(n => n.toLowerCase());

    // Try to find 1X2 market
    const homeIdx = names.findIndex(n => n.includes('home') || n === '1');
    const drawIdx = names.findIndex(n => n.includes('draw') || n === 'x');
    const awayIdx = names.findIndex(n => n.includes('away') || n === '2');

    return {
      homeWin: homeIdx >= 0 ? prices[homeIdx] : 0,
      draw: drawIdx >= 0 ? prices[drawIdx] : 0,
      awayWin: awayIdx >= 0 ? prices[awayIdx] : 0,
    };
  }
}

// ===== Market Settlement Helper =====

export interface SettlementData {
  fixtureId: number;
  timestamp: number;
  oddsValue: number;
  proofAvailable: boolean;
}

/**
 * Determines if a market should settle as YES based on TxODDS data
 */
export function shouldSettleYes(
  marketType: string,
  creationOdds: number,
  currentOdds: number,
  threshold: number = 150
): boolean {
  switch (marketType) {
    case 'odds_spike':
      return Math.abs(currentOdds - creationOdds) > threshold;
    case 'match_result':
      return currentOdds < creationOdds; // favorite strengthened
    case 'next_goal':
    case 'next_card':
    case 'over_under_corners':
      return currentOdds < creationOdds; // event more likely
    default:
      return false;
  }
}
