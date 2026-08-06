import { setTimeout as sleep } from "node:timers/promises";
import { parseFootballEvent, type FootballEvent } from "../market/event-parser.js";
import { createFixtureWatcher, type MatchState, type FixtureSnapshot } from "../market/fixture-watcher.js";
import { createMarketTrigger, type TriggerAction } from "../market/triggers.js";

// Phase 3 — historical match replay.
// Feeds a recorded event tape through watcher + trigger at Nx speed and
// reports every round that would open/settle/confirm. No chain, no network:
// settlement is simulated so the demo lane can prove "15-20 rounds settle
// in 3 minutes" without touching devnet.

export interface TapeEvent {
  /** milliseconds of match time offset from tape start (0 = first event) */
  atMs: number;
  /** raw TxLINE-style payload (object or JSON string) */
  data: string | Record<string, unknown>;
}

export interface ReplayOptions {
  /** speed multiplier: 30 = 30x, 1 = slow lane */
  speed?: number;
  /** cap on real elapsed ms (0 = no cap) */
  maxRealMs?: number;
  /** wall-clock tick for cron windows / timeouts, in simulated ms steps */
  tickMs?: number;
  /** hook fired for every trigger action (open/settle/confirm) */
  onAction?: (a: TriggerAction, s: MatchState, simMs: number) => void;
  /** hook fired for every parsed event */
  onEvent?: (e: FootballEvent, s: MatchState, simMs: number) => void;
}

export interface ReplayStats {
  events: number;
  opened: number;
  settledOnchain: number;
  settledOffchain: number;
  confirmed: number;
  /** actions by type for assertions */
  actions: TriggerAction[];
  finalState: MatchState;
  realMs: number;
  simMs: number;
}

export async function loadTape(path: string): Promise<TapeEvent[]> {
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`Tape ${path} must be a JSON array`);
  return parsed.map((e, i) => {
    if (typeof e?.atMs !== "number" || e.data === undefined)
      throw new Error(`Tape ${path}[${i}] needs {atMs:number, data}`);
    return e as TapeEvent;
  }).sort((a, b) => a.atMs - b.atMs);
}

export async function replayMatch(
  fixture: FixtureSnapshot,
  tape: TapeEvent[],
  opts: ReplayOptions = {},
): Promise<ReplayStats> {
  const speed = opts.speed ?? 30;
  const tickMs = opts.tickMs ?? 1000;
  const watcher = createFixtureWatcher({ loadFixture: async () => fixture });
  const trigger = createMarketTrigger();
  const state0 = await watcher.loadFixture(fixture.fixtureId);

  const stats: ReplayStats = {
    events: 0, opened: 0, settledOnchain: 0, settledOffchain: 0,
    confirmed: 0, actions: [], finalState: state0, realMs: 0, simMs: 0,
  };
  const started = Date.now();
  let simNow = 0;

  const dispatch = (actions: TriggerAction[], s: MatchState) => {
    for (const a of actions) {
      stats.actions.push(a);
      if (a.type === "open_round") stats.opened++;
      else if (a.type === "settle_onchain") stats.settledOnchain++;
      else if (a.type === "settle_offchain") stats.settledOffchain++;
      else if (a.type === "confirm_round") stats.confirmed++;
      opts.onAction?.(a, s, simNow);
    }
  };

  const pace = async (targetSimMs: number) => {
    const realTarget = targetSimMs / speed;
    const realElapsed = Date.now() - started;
    if (realTarget > realElapsed) await sleep(realTarget - realElapsed);
    if (opts.maxRealMs && Date.now() - started > opts.maxRealMs)
      throw new Error(`Replay exceeded maxRealMs=${opts.maxRealMs}`);
  };

  for (const te of tape) {
    // advance clock in ticks so cron windows + timeouts fire between events
    while (simNow + tickMs <= te.atMs) {
      simNow += tickMs;
      const s = watcher.getState(fixture.fixtureId)!;
      s.matchClockMs = simNow;
      dispatch(trigger.checkCronWindows(s, simNow), s);
      dispatch(trigger.checkTimeouts(s, simNow), s);
      await pace(simNow);
    }
    simNow = te.atMs;
    const e = parseFootballEvent(te.data, fixture.fixtureId);
    if (e.fixtureId === undefined) e.fixtureId = fixture.fixtureId;
    const s = watcher.processEvent(fixture.fixtureId, e);
    s.matchClockMs = simNow;
    stats.events++;
    opts.onEvent?.(e, s, simNow);
    dispatch(trigger.processEvent(e, s, simNow), s);
  }

  // drain: tick until everything is settled (or 5 sim-minutes). Rounds with a
  // deadline beyond the last tape event will time out here — that's the correct
  // production behavior (a quiet match voids stale rounds on-chain).
  const drainUntil = simNow + 300000;
  while (simNow < drainUntil) {
    simNow += tickMs;
    const s = watcher.getState(fixture.fixtureId)!;
    s.matchClockMs = simNow;
    dispatch(trigger.checkCronWindows(s, simNow), s);
    dispatch(trigger.checkTimeouts(s, simNow), s);
    if (s.rounds.every(r => r.status === "settled") || s.ended) break;
    await pace(simNow);
  }

  stats.finalState = watcher.getState(fixture.fixtureId)!;
  stats.simMs = simNow;
  stats.realMs = Date.now() - started;
  return stats;
}

// CLI: tsx src/replay/replay.ts <tape.json> [speed]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [tapePath, speedArg] = process.argv.slice(2);
  if (!tapePath) {
    console.error("usage: tsx src/replay/replay.ts <tape.json> [speed=30]");
    process.exit(1);
  }
  const tape = await loadTape(tapePath);
  const fixture: FixtureSnapshot = {
    fixtureId: 0, matchPda: `replay:${tapePath}`,
    statusId: 2, homeScore: 0, awayScore: 0, matchClockMs: 0,
  };
  const stats = await replayMatch(fixture, tape, {
    speed: speedArg ? Number(speedArg) : 30,
    onAction: (a, _s, simMs) =>
      console.log(`[t+${(simMs / 1000).toFixed(0)}s] ${a.type} ${"marketType" in a ? a.marketType : ""} round=${a.roundId}`),
  });
  console.log(JSON.stringify({
    events: stats.events, opened: stats.opened,
    settled: stats.settledOnchain + stats.settledOffchain,
    confirmed: stats.confirmed,
    realMs: stats.realMs, simMs: stats.simMs,
  }));
}
