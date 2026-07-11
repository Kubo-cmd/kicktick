import { EventEmitter } from "events";
import { TxOddsClient } from "@swingkiddo/txodds-client";
import type {
  FixtureRecord,
  ScoresRecord,
  OddsRecord,
  StatValidationResult,
  SseMessage,
} from "@swingkiddo/txodds-client/dist/types";
import { Config } from "../config";

export interface TxLineSseEvent {
  id?: string;
  event?: string;
  data: string;
}

export interface TxLineClientEvents {
  connect: [];
  disconnect: [];
  reconnect: [attempt: number];
  error: [error: Error];
  event: [event: TxLineSseEvent];
}

export class TxLineClient extends EventEmitter {
  private client: TxOddsClient;
  private _lastEventAt: number = 0;
  private _reconnectAttempts: number = 0;
  private _heartbeatTimer?: ReturnType<typeof setTimeout>;
  private _stopped: boolean = false;

  constructor(config: Config) {
    super();
    this.client = new TxOddsClient(config.txlineApiHost);
    if (config.txlineJwt) {
      this.client.setJwt(config.txlineJwt);
    }
    if (config.txlineApiToken) {
      this.client.setApiToken(config.txlineApiToken);
    }
  }

  get lastEventAt(): number {
    return this._lastEventAt;
  }

  get reconnectAttempts(): number {
    return this._reconnectAttempts;
  }

  async authenticate(): Promise<string> {
    return this.client.authenticate();
  }

  setJwt(jwt: string): void {
    this.client.setJwt(jwt);
  }

  setApiToken(token: string): void {
    this.client.setApiToken(token);
  }

  async *streamScores(): AsyncGenerator<TxLineSseEvent> {
    yield* this._streamWithReconnect(() => this.client.streamScores());
  }

  async *streamOdds(): AsyncGenerator<TxLineSseEvent> {
    yield* this._streamWithReconnect(() => this.client.streamOdds());
  }

  async getFixtures(competitionId?: number): Promise<FixtureRecord[]> {
    return this.client.getFixturesSnapshot(competitionId);
  }

  async getScoresSnapshot(fixtureId: number): Promise<ScoresRecord[]> {
    return this.client.getScoresSnapshot(fixtureId);
  }

  async getScoresUpdates(fixtureId: number): Promise<ScoresRecord[]> {
    return this.client.getScoresUpdates(fixtureId);
  }

  async getOddsSnapshot(fixtureId: number): Promise<OddsRecord[]> {
    return this.client.getOddsSnapshot(fixtureId);
  }

  async getStatValidation(
    fixtureId: number,
    seq: number,
    statKey: number,
    statKey2?: number
  ): Promise<StatValidationResult> {
    return this.client.getStatValidation(fixtureId, seq, statKey, statKey2);
  }

  private async *_streamWithReconnect(
    streamFn: () => AsyncGenerator<SseMessage>
  ): AsyncGenerator<TxLineSseEvent> {
    this._reconnectAttempts = 0;

    while (true) {
      this.emit("connect");

      const sdkStream = streamFn();
      const iterator = sdkStream[Symbol.asyncIterator]();

      try {
        while (true) {
          let result: IteratorResult<SseMessage>;

          try {
            result = await this._withHeartbeat(iterator.next());
          } catch (err) {
            if (err instanceof Error && err.message === "Heartbeat timeout") {
              break;
            }
            throw err;
          }

          if (result.done) break;

          const msg = result.value;
          this._lastEventAt = Date.now();
          this._reconnectAttempts = 0;

          const event: TxLineSseEvent = {
            id: msg.id,
            event: msg.event,
            data: msg.data,
          };

          this.emit("event", event);
          yield event;
        }
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      } finally {
        this._stopped = true;
        if (this._heartbeatTimer) clearTimeout(this._heartbeatTimer);
        await iterator.return?.(undefined);
        this._stopped = false;
      }

      this.emit("disconnect");

      const delay = this._backoff();
      this._reconnectAttempts++;
      this.emit("reconnect", this._reconnectAttempts);
      await this._sleep(delay);
    }
  }

  private _withHeartbeat<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this._heartbeatTimer = setTimeout(() => {
        if (this._stopped) return;
        reject(new Error("Heartbeat timeout"));
      }, 30000);

      promise.then(
        (val) => {
          clearTimeout(this._heartbeatTimer);
          resolve(val);
        },
        (err) => {
          clearTimeout(this._heartbeatTimer);
          reject(err);
        }
      );
    });
  }

  private _backoff(): number {
    const base = 1000;
    const cap = 30000;
    const delay = Math.min(cap, base * Math.pow(2, this._reconnectAttempts));
    const jitter = delay * 0.5 * Math.random();
    return delay + jitter;
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
