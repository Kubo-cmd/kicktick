import { describe, expect, it } from "vitest";
import { replayMatch, type TapeEvent } from "../src/replay/replay.js";
import type { FixtureSnapshot } from "../src/market/fixture-watcher.js";

const FIXTURE: FixtureSnapshot = {
  fixtureId: 42, matchPda: "replay:test",
  statusId: 1, homeScore: 0, awayScore: 0, matchClockMs: 0,
};

const FAST = { speed: 100000, tickMs: 1000 }; // run as fast as CPU allows

function tape(...events: [number, Record<string, unknown>][]): TapeEvent[] {
  return events.map(([atMs, data]) => ({ atMs, data }));
}

describe("replayMatch", () => {
  it("settles NextGoalSide on goal and reopens", async () => {
    const t = tape(
      [0, { Action: "status", StatusId: 2 }],                    // kickoff h1 -> opens NextGoalSide + RedCardInMatch
      [60000, { Action: "goal", Participant: 1 }],               // home scores
    );
    const s = await replayMatch(FIXTURE, t, FAST);
    expect(s.events).toBe(2);
    const goalActions = s.actions.filter(a => "marketType" in a && a.marketType === "NextGoalSide");
    const opens = goalActions.filter(a => a.type === "open_round");
    const settles = goalActions.filter(a => a.type === "settle_onchain");
    expect(opens.length).toBeGreaterThanOrEqual(2); // initial + re-open after goal
    // goal settles round 1; the re-opened round legitimately times out during
    // drain (quiet match voids stale rounds on-chain). Both settles on-chain,
    // never duplicated:
    expect(settles.length).toBe(2);
    expect(new Set(settles.map(a => a.roundId)).size).toBe(2); // no round settled twice
    expect(s.finalState.homeScore).toBe(1);
  });

  it("handles penalty retake then score, off-chain settle", async () => {
    const t = tape(
      [0, { Action: "status", StatusId: 2 }],
      [10000, { Action: "penalty", Participant: 2 }],
      [20000, { Action: "penalty_outcome", Participant: 2, Outcome: "Retake" }],
      [30000, { Action: "penalty_outcome", Participant: 2, Outcome: "Scored" }],
    );
    const s = await replayMatch(FIXTURE, t, FAST);
    const pen = s.actions.filter(a => "marketType" in a && a.marketType === "PenaltyShot");
    expect(pen.filter(a => a.type === "open_round").length).toBe(1);
    const settled = pen.filter(a => a.type === "settle_offchain");
    expect(settled.length).toBe(1);
    expect(settled[0]).toMatchObject({ outcome: "Yes" });
  });

  it("VAR check opens on var and settles on var_end overturn", async () => {
    const t = tape(
      [0, { Action: "status", StatusId: 2 }],
      [5000, { Action: "var", Participant: 1, VarType: "Goal" }],
      [15000, { Action: "var_end", Participant: 1, Outcome: "Overturned" }],
    );
    const s = await replayMatch(FIXTURE, t, FAST);
    const v = s.actions.filter(a => "marketType" in a && a.marketType === "VARCheck");
    expect(v.filter(a => a.type === "open_round").length).toBe(1);
    expect(v.filter(a => a.type === "settle_offchain")[0]).toMatchObject({ outcome: "Yes" });
  });

  it("penalty shootout mode: each shot settles and reopens", async () => {
    const t = tape(
      [0, { Action: "status", StatusId: 12 }], // shootout starts
      [10000, { Action: "penalty_outcome", Participant: 1, Outcome: "Scored" }],
      [20000, { Action: "penalty_outcome", Participant: 2, Outcome: "Missed" }],
      [30000, { Action: "penalty_outcome", Participant: 1, Outcome: "Scored" }],
    );
    const s = await replayMatch(FIXTURE, t, FAST);
    expect(s.finalState.penaltyShootoutMode).toBe(true);
    const so = s.actions.filter(a => "marketType" in a && a.marketType === "PenaltyShootoutShot");
    expect(so.filter(a => a.type === "open_round").length).toBe(4); // initial + 3 re-opens
    // 3 scored/missed settle on-chain; the 4th open round is drained after tape end
    expect(so.filter(a => a.type === "settle_onchain").length).toBe(4);
  });

  it("cron windows open GoalInWindow while clock advances", async () => {
    const t = tape(
      [0, { Action: "status", StatusId: 2 }],
      [301000, { Action: "corner", Participant: 1 }], // forces clock past 5min window
    );
    const s = await replayMatch(FIXTURE, t, { ...FAST, tickMs: 10000 });
    const gw = s.actions.filter(a => "marketType" in a && a.marketType === "GoalInWindow");
    expect(gw.filter(a => a.type === "open_round").length).toBeGreaterThanOrEqual(1);
  });

  it("match end voids open rounds and drains", async () => {
    const t = tape(
      [0, { Action: "status", StatusId: 2 }],
      [60000, { Action: "corner", Participant: 1 }],  // opens NextCorner
      [120000, { Action: "status", StatusId: 5 }],    // ended
    );
    const s = await replayMatch(FIXTURE, t, FAST);
    expect(s.finalState.ended).toBe(true);
    // no round left open after end + drain
    expect(s.finalState.rounds.every(r => r.status !== "open")).toBe(true);
  });

  it("full-match tape: 15-20+ rounds settle (final gate shape)", async () => {
    // synthetic 90-min match, run at max speed (pacing verified separately)
    const ev: [number, Record<string, unknown>][] = [[0, { Action: "status", StatusId: 2 }]];
    for (let i = 1; i <= 10; i++) ev.push([i * 400000, { Action: "corner", Participant: (i % 2) + 1 }]);
    for (let i = 1; i <= 4; i++) ev.push([i * 1000000, { Action: "goal", Participant: (i % 2) + 1 }]);
    for (let i = 1; i <= 6; i++) ev.push([i * 700000, { Action: "yellow_card", Participant: (i % 2) + 1 }]);
    ev.push([5400000, { Action: "status", StatusId: 5 }]);
    ev.sort((a, b) => a[0] - b[0]);
    const s = await replayMatch(FIXTURE, tape(...ev), FAST);
    expect(s.opened).toBeGreaterThanOrEqual(15);
    expect(s.settledOnchain + s.settledOffchain).toBeGreaterThanOrEqual(15);
  });
});
